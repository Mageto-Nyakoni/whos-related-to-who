import type { APIRoute } from 'astro';
import { readPublicFamilyDataset, writeFamilyPeople } from '../../../lib/familyStore';
import type { Person, PersonRelationships } from '../../../types/family';

export const prerender = false;

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers
    }
  });

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sanitizeRelationships(value: unknown): PersonRelationships | null {
  if (!value || typeof value !== 'object') return null;

  const relationships = value as Partial<PersonRelationships>;
  if (
    !isStringArray(relationships.parents) ||
    !isStringArray(relationships.children) ||
    !isStringArray(relationships.partners)
  ) {
    return null;
  }

  return {
    parents: relationships.parents,
    children: relationships.children,
    partners: relationships.partners
  };
}

function sanitizePeople(value: unknown): Person[] | null {
  if (!Array.isArray(value)) return null;

  const people = value.map((person) => {
    if (!person || typeof person !== 'object') return null;

    const candidate = person as Partial<Person>;
    const relationships = sanitizeRelationships(candidate.relationships);

    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.nuclearFamilyId !== 'string' ||
      typeof candidate.phone !== 'string' ||
      !relationships
    ) {
      return null;
    }

    const sanitized: Person = {
      id: candidate.id.trim(),
      name: candidate.name.trim(),
      nuclearFamilyId: candidate.nuclearFamilyId.trim(),
      phone: candidate.phone.trim(),
      relationships
    };

    if (typeof candidate.dob === 'string' && candidate.dob.trim()) {
      sanitized.dob = candidate.dob.trim();
    }

    if (typeof candidate.color === 'string' && candidate.color.trim()) {
      sanitized.color = candidate.color.trim();
    }

    return sanitized;
  });

  if (people.some((person) => !person)) return null;

  const sanitizedPeople = people as Person[];
  const personIds = new Set(sanitizedPeople.map((person) => person.id));
  if (personIds.size !== sanitizedPeople.length) return null;

  const hasInvalidPerson = sanitizedPeople.some((person) => !person.id || !person.name || !person.nuclearFamilyId);
  if (hasInvalidPerson) return null;

  const hasInvalidRelationship = sanitizedPeople.some((person) => {
    const references = [
      ...person.relationships.parents,
      ...person.relationships.children,
      ...person.relationships.partners
    ];

    return references.some((personId) => personId === person.id || !personIds.has(personId));
  });

  if (hasInvalidRelationship) return null;

  return sanitizedPeople;
}

export const GET: APIRoute = async ({ params }) => {
  const familyId = params.familyId;
  if (!familyId) return json({ error: 'Missing family ID.' }, { status: 400 });

  const family = await readPublicFamilyDataset(familyId);
  if (!family) return json({ error: 'Family not found.' }, { status: 404 });

  return json(family);
};

export const PUT: APIRoute = async ({ params, request }) => {
  const familyId = params.familyId;
  if (!familyId) return json({ error: 'Missing family ID.' }, { status: 400 });

  const payload = await request.json().catch(() => null);
  const people = sanitizePeople((payload as { people?: unknown } | null)?.people);

  if (!people) {
    return json({ error: 'Request body must contain a valid people array.' }, { status: 400 });
  }

  const family = await writeFamilyPeople(familyId, people);
  if (!family) return json({ error: 'Family not found.' }, { status: 404 });

  return json(family);
};
