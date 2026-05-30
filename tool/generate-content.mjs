// Generates a new content batch for Best Friend Energy using Claude Haiku.
//
// Flow:
//   1. Read all existing batches in best-friend-energy/content/ (dedup context).
//   2. For each category, ask Claude for N new items, providing a sample of
//      what already exists so it doesn't repeat.
//   3. Safety review: hard denylist of show-associated terms + an LLM-as-judge
//      second pass. Flagged items are dropped (with reasons logged).
//   4. Write batch-{n}.json + update manifest.json.
//
// Env: ANTHROPIC_API_KEY must be set (GitHub Secret in CI, ~/.zshenv locally).
// Run: `node tool/generate-content.mjs` (or `npm run generate`)

import Anthropic from '@anthropic-ai/sdk';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'best-friend-energy', 'content');
const MANIFEST_PATH = join(CONTENT_DIR, 'manifest.json');

const MODEL = process.env.BFE_MODEL || 'claude-haiku-4-5';

const TARGETS = {
  openers: 30,
  nicknameAdjectives: 90,
  creatures: 90,
  pepTalks: 48,
  wisdom: 48,
};

const DESCRIPTIONS = {
  openers:
    'Short opener phrases that start an over-the-top compliment, like "You absolute", "You magnificent", "You wonderfully", "You perfect little", "You federally recognized". 2-4 words each, always starting with "You" or "You ___".',
  nicknameAdjectives:
    'Flattering, whimsical adjectives used between the opener and the creature. Single word or short multi-word OK. E.g. "luminous", "ferociously kind", "galaxy-brained", "devastatingly competent", "stupendously thoughtful".',
  creatures:
    'Whimsical creature/nature nouns and original whimsical compounds that close out a compliment. E.g. "meadow phoenix", "cloud-forest fox", "thunder-crowned elk", "teacup griffin", "lantern jellyfish". 1-4 words. Mix animals, mythical beings, cosmic, botanical, weather themes.',
  pepTalks:
    'Second-person hype one-liners (4-22 words) in the voice of a relentlessly supportive, slightly intense best friend / optimistic local-government type. Warm, witty, over-the-top but adult. E.g. "You are a lighthouse that learned to walk, and the whole coast feels safer already."',
  wisdom:
    'First-person aphorisms (5-25 words) in the voice of an earnest, idealistic small-town public servant who loves their town, hard work, ambitious binders, their friends, and breakfast food. Witty, optimistic, quotable, adult. E.g. "Optimism is a renewable resource, and I refuse to be the reason this town runs low."',
};

const LEGAL_NOTE = `CRITICAL LEGAL CONSTRAINT — this is the most important rule:

The app is built in the comedic STYLE/genre of a well-known optimistic-local-government TV sitcom, but the content must be 100% ORIGINAL to avoid any cease-and-desist, copyright, or trademark exposure.

Do NOT:
- reproduce any verbatim quote, catchphrase, or signature line from any TV show / film / book
- use any real character names, actor names, place names, or show titles
- reproduce the show-associated signature compliment phrases such as "beautiful tropical fish", "poetic noble land-mermaid", "musk ox", "sunfish", "sea otter", "perfect sunflower", "land mermaid"
- use the names "Leslie", "Ann Perkins", "Ron Swanson", "Tom Haverford", "Pawnee", "Eagleton", "Knope", "Galentine"
- use "Parks and Recreation" or any show title

Invent FRESH, ORIGINAL combinations.`;

// Hard denylist applied AFTER generation (defense in depth).
const DENYLIST = [
  // Character names
  'leslie',
  'ann perkins',
  'ron swanson',
  'tom haverford',
  'ben wyatt',
  'chris traeger',
  'donna meagle',
  'jerry gergich',
  'mark brendanawicz',
  'knope',
  'andy dwyer',
  'april ludgate',
  'jean-ralphio',
  // Places
  'pawnee',
  'eagleton',
  // Show terms
  'parks and recreation',
  'parks & rec',
  'galentine',
  // Signature compliment phrases
  'beautiful tropical fish',
  'poetic noble land-mermaid',
  'noble land-mermaid',
  'land mermaid',
  'musk ox',
  'sunfish',
  'sea otter',
  'perfect sunflower',
];

const client = new Anthropic();

// ---------------- batch I/O ----------------

function listBatchFiles() {
  if (!existsSync(CONTENT_DIR)) return [];
  return readdirSync(CONTENT_DIR)
    .filter((f) => /^batch-\d+\.json$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
}

function loadAllExisting() {
  const merged = {};
  for (const key of Object.keys(TARGETS)) merged[key] = new Set();
  for (const file of listBatchFiles()) {
    const batch = JSON.parse(readFileSync(join(CONTENT_DIR, file), 'utf8'));
    for (const key of Object.keys(TARGETS)) {
      for (const item of batch[key] || []) merged[key].add(item);
    }
  }
  return Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [k, [...v]]),
  );
}

function nextBatchVersion() {
  const files = listBatchFiles();
  if (files.length === 0) return 1;
  const last = files[files.length - 1];
  return parseInt(last.match(/\d+/)[0]) + 10 - 9; // = +1, just being explicit
}

// ---------------- generation ----------------

function sampleArray(arr, n) {
  if (arr.length <= n) return arr;
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function buildPrompt(category, existing, n) {
  const examples = sampleArray(existing, 60);
  return `${LEGAL_NOTE}

We're generating content for a phone app called "Best Friend Energy" — a generator of affectionate over-the-top nicknames, pep talks, and gentle civic wisdom.

CATEGORY: ${category}
DESCRIPTION: ${DESCRIPTIONS[category]}

Generate EXACTLY ${n} new original items in this category.

Items that already exist in the app (do NOT repeat or near-repeat these, but match this VOICE):
${examples.map((s) => `- ${s}`).join('\n')}${existing.length > 60 ? `\n(... ${existing.length - 60} more items also exist)` : ''}

Output ONLY a valid JSON array of exactly ${n} strings. No preamble, no commentary, no markdown fences — just the raw JSON array starting with [ and ending with ].`;
}

async function generateCategory(category, existing, n) {
  const prompt = buildPrompt(category, existing, n);
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = resp.content[0].text.trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error(
      `Model didn't return a JSON array for ${category}:\n${text.slice(0, 400)}`,
    );
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error(`Not an array for ${category}`);
  return parsed.filter((s) => typeof s === 'string' && s.trim().length > 0);
}

// ---------------- safety review ----------------

function denylistFilter(batch) {
  const flagged = {};
  for (const key of Object.keys(TARGETS)) {
    const kept = [];
    const dropped = [];
    for (const item of batch[key] || []) {
      const lower = item.toLowerCase();
      const hit = DENYLIST.find((d) => lower.includes(d));
      if (hit) dropped.push({ item, hit });
      else kept.push(item);
    }
    batch[key] = kept;
    if (dropped.length) flagged[key] = dropped;
  }
  return flagged;
}

async function llmJudge(batch) {
  const summarised = Object.fromEntries(
    Object.entries(batch)
      .filter(([k]) => k in TARGETS)
      .map(([k, v]) => [k, v]),
  );
  const prompt = `You are a strict legal-safety reviewer for an app built in the STYLE of a TV sitcom but intended to be 100% original to avoid any C&D/IP exposure.

Review the JSON content below. Flag for REMOVAL any item that:
1) reproduces a recognizable verbatim quote or signature catchphrase from an existing TV show / film / book;
2) contains a real character name, actor name, place name, or show title;
3) is a signature compliment phrase strongly associated with existing media (e.g. "beautiful tropical fish", "noble land-mermaid", "musk ox").

Be STRICT on (1) and (2); reasonable on (3). Return ONLY a JSON object with this exact shape:
{
  "flagged": {
    "openers": [{"item": "...", "reason": "..."}],
    "nicknameAdjectives": [...],
    "creatures": [...],
    "pepTalks": [...],
    "wisdom": [...]
  },
  "notes": "brief overall assessment"
}

If a category has nothing flagged, use an empty array. Return ONLY the JSON, no preamble.

CONTENT:
${JSON.stringify(summarised, null, 2)}`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = resp.content[0].text.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    console.warn('LLM judge returned no JSON object; skipping its filter.');
    return { flagged: {}, notes: 'judge failed' };
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    console.warn(`LLM judge JSON parse failed: ${e.message}`);
    return { flagged: {}, notes: 'judge parse failed' };
  }
}

function applyJudgeFlags(batch, judge) {
  const judgeFlagged = {};
  for (const [key, items] of Object.entries(judge.flagged || {})) {
    if (!Array.isArray(items) || items.length === 0) continue;
    const flaggedItems = items.map((f) => f.item).filter(Boolean);
    if (flaggedItems.length === 0) continue;
    const flagSet = new Set(flaggedItems);
    const dropped = (batch[key] || []).filter((s) => flagSet.has(s));
    batch[key] = (batch[key] || []).filter((s) => !flagSet.has(s));
    if (dropped.length) judgeFlagged[key] = items;
  }
  return judgeFlagged;
}

// ---------------- manifest ----------------

function rebuildManifest() {
  const files = listBatchFiles();
  const batches = files.map((f) => {
    const data = JSON.parse(readFileSync(join(CONTENT_DIR, f), 'utf8'));
    const items = Object.keys(TARGETS).reduce(
      (sum, k) => sum + (data[k] || []).length,
      0,
    );
    return { version: data.version, url: f, items };
  });
  const manifest = {
    schema_version: 1,
    updated_at: '2026-05-30T00:00:00Z', // updated by CI commit, not at generate time
    batches,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

// ---------------- main ----------------

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set. Aborting.');
    process.exit(1);
  }
  if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });

  console.log(`Model: ${MODEL}`);
  console.log('Loading existing batches for dedup context...');
  const existing = loadAllExisting();
  for (const k of Object.keys(TARGETS)) {
    console.log(`  existing ${k}: ${existing[k].length}`);
  }

  const version = nextBatchVersion();
  console.log(`\nGenerating batch ${version}...`);
  const batch = { version };
  for (const [category, n] of Object.entries(TARGETS)) {
    process.stdout.write(`  ${category} (target ${n})... `);
    batch[category] = await generateCategory(category, existing[category], n);
    console.log(`got ${batch[category].length}`);
  }

  console.log('\nDenylist filter...');
  const denyDropped = denylistFilter(batch);
  for (const [k, drops] of Object.entries(denyDropped)) {
    console.log(`  ${k}: dropped ${drops.length}`);
    for (const d of drops) console.log(`    - "${d.item}" (matched: ${d.hit})`);
  }

  console.log('\nLLM-judge safety review...');
  const judge = await llmJudge(batch);
  const judgeDropped = applyJudgeFlags(batch, judge);
  for (const [k, drops] of Object.entries(judgeDropped)) {
    console.log(`  ${k}: judge dropped ${drops.length}`);
    for (const d of drops) console.log(`    - "${d.item}" — ${d.reason}`);
  }
  if (judge.notes) console.log(`  judge notes: ${judge.notes}`);

  const outPath = join(CONTENT_DIR, `batch-${version}.json`);
  writeFileSync(outPath, JSON.stringify(batch, null, 2) + '\n');
  console.log(`\nWrote ${outPath}`);
  for (const k of Object.keys(TARGETS)) {
    console.log(`  final ${k}: ${batch[k].length}`);
  }

  console.log('\nRebuilding manifest...');
  const manifest = rebuildManifest();
  console.log(`  ${manifest.batches.length} batch(es) in manifest`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
