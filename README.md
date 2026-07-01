# Who's Related to Who?

An Astro and Solid family tree MVP with a 3D force graph visualization, editable family members, dynamic family routes, and a small writable API layer for persistence.

## Features

- Searchable 3D family graph powered by `3d-force-graph`
- Dynamic family pages at `/family/[familyId]`
- Editable person nodes with parent, child, and partner relationships
- Optional birthdays and upcoming birthday summary
- Family-specific JSON data files
- Astro server API for reading and writing family data

## Tech Stack

- Astro 7
- SolidJS client component
- `3d-force-graph`
- Astro Node adapter for server hosting
- JSON file storage for the current MVP

## Project Structure

```text
src/
  components/
    FamilyGraph.astro
    FamilyGraphClient.tsx
  data/
    families/
      smith.json
      jones.json
  lib/
    familyStore.ts
  pages/
    api/
      families/
        [familyId].json.ts
    family/
      [familyId].astro
    index.astro
  types/
    family.ts
```

Each family lives in its own JSON file under `src/data/families/` by default. The filename becomes the family code, so `smith.json` is available at `/family/smith`.

## Local Development

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:4321
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Persistence

The app uses a writable API route:

```text
GET /api/families/[familyId].json
PUT /api/families/[familyId].json
```

The API reads and writes JSON files through `src/lib/familyStore.ts`. By default, files are stored in:

```text
src/data/families/
```

For production, set `FAMILIES_DATA_DIR` to a writable directory. If that directory is empty, the app seeds it from the committed files in `src/data/families/` the first time a family is requested.

```bash
FAMILIES_DATA_DIR=/var/data/families node ./dist/server/entry.mjs
```

The API preserves each file's metadata and only updates the `people` array when users edit the graph. Writes are performed through a temporary file and rename so a failed write is less likely to leave a half-written JSON file.

## Family Data Shape

```json
{
  "metadata": {
    "familyName": "Smith",
    "accessPasswords": {
      "viewer": "smith-view-2026",
      "editor": "smith-edit-2026"
    }
  },
  "people": [
    {
      "id": "smith-p001",
      "name": "Walter Smith",
      "nuclearFamilyId": "smith-f001",
      "dob": "1951-02-13",
      "phone": "555-1101",
      "relationships": {
        "parents": [],
        "children": ["smith-p003"],
        "partners": ["smith-p002"]
      }
    }
  ]
}
```

`dob` is optional. Relationship arrays store person IDs internally, while the UI displays full names.

## Render Deployment

Create a Render **Web Service**, not a Static Site.

Use these settings:

```text
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm run start
```

The `start` script runs the built Astro server and binds it to `0.0.0.0`, which Render requires for port detection.

For persistent JSON storage on a paid Render service, add a persistent disk and set:

```text
FAMILIES_DATA_DIR=/var/data/families
```

Render's free web services have an ephemeral filesystem, so JSON edits can persist while the instance is running but are not durable across restarts, redeploys, or instance replacement. For free durable persistence, move the data layer to an external database such as Supabase or Neon and keep Render as the web/API host.

## Notes

- This is an MVP and does not yet enforce authentication around the edit API.
- Sample family JSON files include mock passwords and should be replaced before real use.
- The 3D graph bundle is large enough to trigger a Vite chunk-size warning during production builds.
