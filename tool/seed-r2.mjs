// One-time bootstrap: uploads tmp/baseline.json to R2 as batch-0.json plus an
// initial manifest.json. Run after `npm run extract-baseline`.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { r2Client, putJson, BUCKET } from './lib/r2.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, '..', 'tmp', 'baseline.json');

if (!existsSync(BASELINE_PATH)) {
  console.error(
    `${BASELINE_PATH} not found. Run \`npm run extract-baseline\` first.`,
  );
  process.exit(1);
}

const FIELDS = [
  'openers',
  'nicknameAdjectives',
  'creatures',
  'pepTalks',
  'wisdom',
];

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const items = FIELDS.reduce((sum, k) => sum + (baseline[k] || []).length, 0);

const manifest = {
  schema_version: 1,
  updated_at: new Date().toISOString(),
  batches: [{ version: 0, url: 'batch-0.json', items }],
};

const client = r2Client();

console.log(`Seeding bucket "${BUCKET}"...`);
await putJson(client, 'batch-0.json', baseline);
console.log('  uploaded batch-0.json');
await putJson(client, 'manifest.json', manifest);
console.log('  uploaded manifest.json');
console.log(`Seeded ${items} items.`);
