import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FamilyDataset, Person } from '../types/family';

export type PublicFamilyDataset = {
  metadata: {
    familyName: string;
  };
  people: Person[];
};

const FAMILY_ID_PATTERN = /^[a-z0-9-]+$/i;
const FAMILIES_DIR = process.env.FAMILIES_DATA_DIR ?? path.join(process.cwd(), 'src', 'data', 'families');

export function isValidFamilyId(familyId: string) {
  return FAMILY_ID_PATTERN.test(familyId);
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

function toPublicFamilyDataset(family: FamilyDataset): PublicFamilyDataset {
  return {
    metadata: {
      familyName: family.metadata.familyName
    },
    people: family.people
  };
}

export async function readFamilyDataset(familyId: string): Promise<FamilyDataset | null> {
  if (!isValidFamilyId(familyId)) return null;

  try {
    const file = await readFile(getFamilyFilePath(familyId), 'utf8');
    return JSON.parse(file) as FamilyDataset;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function readPublicFamilyDataset(familyId: string): Promise<PublicFamilyDataset | null> {
  const family = await readFamilyDataset(familyId);
  return family ? toPublicFamilyDataset(family) : null;
}

export async function writeFamilyPeople(familyId: string, people: Person[]): Promise<PublicFamilyDataset | null> {
  if (!isValidFamilyId(familyId)) return null;

  const currentFamily = await readFamilyDataset(familyId);
  if (!currentFamily) return null;

  const nextFamily: FamilyDataset = {
    ...currentFamily,
    people
  };

  await mkdir(FAMILIES_DIR, { recursive: true });
  await writeFile(getFamilyFilePath(familyId), `${JSON.stringify(nextFamily, null, 2)}\n`, 'utf8');

  return toPublicFamilyDataset(nextFamily);
}
