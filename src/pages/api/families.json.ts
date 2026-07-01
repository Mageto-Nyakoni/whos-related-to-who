import type { APIRoute } from 'astro';
import { createFamilyDataset, normalizeFamilyId, readPublicFamilyDataset } from '../../lib/familyStore';

export const prerender = false;

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers
    }
  });

export const POST: APIRoute = async ({ request }) => {
  const payload = (await request.json().catch(() => null)) as
    | {
        familyId?: unknown;
        familyName?: unknown;
      }
    | null;

  const rawFamilyName = typeof payload?.familyName === 'string' ? payload.familyName.trim() : '';
  const rawFamilyId =
    typeof payload?.familyId === 'string' && payload.familyId.trim() ? payload.familyId : rawFamilyName;
  const familyId = normalizeFamilyId(rawFamilyId);

  if (!rawFamilyName || !familyId) {
    return json({ error: 'Family name and family code are required.' }, { status: 400 });
  }

  const existingFamily = await readPublicFamilyDataset(familyId);
  if (existingFamily) {
    return json({ error: 'That family code is already in use.' }, { status: 409 });
  }

  const family = await createFamilyDataset({
    familyId,
    familyName: rawFamilyName
  });

  if (!family) {
    return json({ error: 'The family graph could not be created.' }, { status: 400 });
  }

  return json({ familyId, family }, { status: 201 });
};
