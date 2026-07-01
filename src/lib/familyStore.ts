import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FamilyDataset, Person } from '../types/family';

export type PublicFamilyDataset = {
  metadata: {
    familyName: string;
  };
  people: Person[];
};

export type CreateFamilyInput = {
  familyId: string;
  familyName: string;
};

const FAMILY_ID_PATTERN = /^[a-z0-9-]+$/i;
const SEED_FAMILIES_DIR = path.join(process.cwd(), 'src', 'data', 'families');
const FAMILIES_DIR = process.env.FAMILIES_DATA_DIR ?? SEED_FAMILIES_DIR;

export function isValidFamilyId(familyId: string) {
  return FAMILY_ID_PATTERN.test(familyId);
}

export function normalizeFamilyId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function assertValidFamilyId(familyId: string) {
  if (!isValidFamilyId(familyId)) {
    throw new Error('Invalid family ID.');
  }
}

function getFamilyFilePath(familyId: string) {
  assertValidFamilyId(familyId);
  return path.join(FAMILIES_DIR, `${familyId}.json`);
}

function getSeedFamilyFilePath(familyId: string) {
  assertValidFamilyId(familyId);
  return path.join(SEED_FAMILIES_DIR, `${familyId}.json`);
}

function toPublicFamilyDataset(family: FamilyDataset): PublicFamilyDataset {
  return {
    metadata: {
      familyName: family.metadata.familyName
    },
    people: family.people
  };
}

async function readJsonFamilyFile(filePath: string): Promise<FamilyDataset | null> {
  try {
    const file = await readFile(filePath, 'utf8');
    return JSON.parse(file) as FamilyDataset;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function writeJsonFamilyFile(filePath: string, family: FamilyDataset) {
  await mkdir(path.dirname(filePath), { recursive: true });

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempFilePath, `${JSON.stringify(family, null, 2)}\n`, 'utf8');
  await rename(tempFilePath, filePath);
}

async function createJsonFamilyFile(filePath: string, family: FamilyDataset) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(family, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

export async function readFamilyDataset(familyId: string): Promise<FamilyDataset | null> {
  if (!isValidFamilyId(familyId)) return null;

  const familyFilePath = getFamilyFilePath(familyId);
  const family = await readJsonFamilyFile(familyFilePath);
  if (family) return family;

  if (FAMILIES_DIR !== SEED_FAMILIES_DIR) {
    const seedFamily = await readJsonFamilyFile(getSeedFamilyFilePath(familyId));
    if (!seedFamily) return null;

    await writeJsonFamilyFile(familyFilePath, seedFamily);
    return seedFamily;
  }

  return null;
}

export async function readPublicFamilyDataset(familyId: string): Promise<PublicFamilyDataset | null> {
  const family = await readFamilyDataset(familyId);
  return family ? toPublicFamilyDataset(family) : null;
}

export async function createFamilyDataset(input: CreateFamilyInput): Promise<PublicFamilyDataset | null> {
  const familyId = normalizeFamilyId(input.familyId);
  const familyName = input.familyName.trim();

  if (!familyId || !isValidFamilyId(familyId) || !familyName) return null;

  const existingFamily = await readFamilyDataset(familyId);
  if (existingFamily) return null;

  const nextFamily: FamilyDataset = {
    metadata: {
      familyName,
      accessPasswords: {}
    },
    people: []
  };

  try {
    await createJsonFamilyFile(getFamilyFilePath(familyId), nextFamily);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return null;
    }

    throw error;
  }

  return toPublicFamilyDataset(nextFamily);
}

export async function writeFamilyPeople(familyId: string, people: Person[]): Promise<PublicFamilyDataset | null> {
  if (!isValidFamilyId(familyId)) return null;

  const currentFamily = await readFamilyDataset(familyId);
  if (!currentFamily) return null;

  const nextFamily: FamilyDataset = {
    ...currentFamily,
    people
  };

  await writeJsonFamilyFile(getFamilyFilePath(familyId), nextFamily);

  return toPublicFamilyDataset(nextFamily);
}
