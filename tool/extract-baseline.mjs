// One-time script: reads the BFE Flutter app's lib/data/content_data.dart and
// emits batch-0.json — the shipped v1 baseline that future generation passes
// will dedupe against. Re-run if you ever hand-edit content_data.dart and want
// the pipeline to know about the changes.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'best-friend-energy', 'content');

const DART_PATH =
  process.env.BFE_CONTENT_PATH ||
  '/Users/africker/git/github/knopisms/lib/data/content_data.dart';

const FIELDS = [
  'openers',
  'nicknameAdjectives',
  'creatures',
  'pepTalks',
  'wisdom',
];

function extractList(dart, name) {
  // Matches: name: <String>[\n   "item",\n   "item",\n  ],
  const re = new RegExp(
    `${name}:\\s*<String>\\[\\s*([\\s\\S]*?)\\s*\\]`,
    'm',
  );
  const match = dart.match(re);
  if (!match) throw new Error(`Could not find field "${name}" in ${DART_PATH}`);
  const body = match[1];
  const items = [];
  const itemRe = /"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = itemRe.exec(body)) !== null) {
    items.push(
      m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\\$/g, '$'),
    );
  }
  return items;
}

if (!existsSync(DART_PATH)) {
  console.error(`content_data.dart not found at ${DART_PATH}`);
  console.error('Set BFE_CONTENT_PATH env var to override.');
  process.exit(1);
}

const dart = readFileSync(DART_PATH, 'utf8');
const baseline = { version: 0 };
for (const f of FIELDS) baseline[f] = extractList(dart, f);

if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });

const outPath = join(CONTENT_DIR, 'batch-0.json');
writeFileSync(outPath, JSON.stringify(baseline, null, 2) + '\n');

console.log(`Wrote ${outPath}`);
for (const f of FIELDS) console.log(`  ${f}: ${baseline[f].length}`);
