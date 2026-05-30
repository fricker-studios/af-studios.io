# af-studios.io

The AF Studios landing page + per-app legal pages. Plain HTML, no build step.
Hosted on **GitHub Pages**, free, with `af-studios.io` as a custom domain.

## Structure

```
.
├── index.html                          # AF Studios landing
├── style.css                           # shared styles (light + dark)
├── CNAME                               # tells GitHub Pages the custom domain
└── best-friend-energy/
    ├── privacy.html
    └── terms.html
```

When you add another app, drop an `index.html` (optional) plus `privacy.html`
and `terms.html` into a new folder named for the app.

## First-time deploy

### 1. Create the GitHub repo

On github.com → **New repository**:

- Name: **`af-studios.io`** (recommended — matches the domain)
- Public
- No README / .gitignore / license (we already have files)

Copy the suggested remote URL.

### 2. Push from this folder

```bash
cd /Users/africker/git/github/af-studios.io
git init
git add .
git commit -m "Initial site"
git branch -M main
git remote add origin git@github.com:africker/af-studios.io.git   # or https URL
git push -u origin main
```

### 3. Enable GitHub Pages

In the new repo on github.com → **Settings → Pages**:

- **Source:** Deploy from a branch
- **Branch:** `main` / `/ (root)` → **Save**
- **Custom domain:** enter `af-studios.io` → **Save**
- Wait for GitHub to verify; once verified, check **Enforce HTTPS**.

### 4. Point DNS at GitHub

At your domain registrar (wherever you bought `af-studios.io`), add these
records:

**For the apex (`af-studios.io`):**

| Type | Name | Value           |
|------|------|-----------------|
| A    | @    | 185.199.108.153 |
| A    | @    | 185.199.109.153 |
| A    | @    | 185.199.110.153 |
| A    | @    | 185.199.111.153 |

**For `www.af-studios.io` (optional but recommended):**

| Type  | Name | Value                       |
|-------|------|-----------------------------|
| CNAME | www  | `africker.github.io.`       |

Replace `africker` with your GitHub username if different.

DNS propagation usually takes 5–30 minutes. When it's done, visiting
`https://af-studios.io` will serve `index.html`.

## Updating

Edit files locally, commit, push. GitHub Pages redeploys in under a minute.

## Keeping legal pages in sync with the BFE app

The canonical Markdown lives in the BFE repo
(`/Users/africker/git/github/knopisms/PRIVACY.md` and `TERMS.md`). When you
edit those, mirror the changes into the matching HTML files here. The HTML
content largely follows the Markdown 1:1.

## BFE content pipeline (Phase 2A)

Generated content batches for Best Friend Energy are **not** hosted on this
public site. They live in a private Cloudflare R2 bucket and are served by a
small Cloudflare Worker that validates a shared-secret `Authorization` header.
The Flutter app holds the secret and is the only client that can fetch.

This file describes the moving parts; one-time Cloudflare setup steps live in
[`SETUP.md`](./SETUP.md).

### Layout

```
af-studios.io/
├── tool/
│   ├── lib/r2.mjs              # S3 client pointed at R2
│   ├── extract-baseline.mjs    # reads BFE app → tmp/baseline.json
│   ├── seed-r2.mjs              # one-time: uploads tmp/baseline.json as batch-0
│   └── generate-content.mjs    # generates + safety-reviews + uploads new batches
├── worker/
│   ├── wrangler.toml           # Cloudflare Worker config (binds R2 bucket "bfe-content")
│   └── src/index.js             # Worker code: auth check + R2 fetch
└── .github/workflows/
    └── generate-content.yml     # workflow_dispatch trigger; runs the generator
```

Nothing in `best-friend-energy/content/` — the directory is gone. The R2 bucket
holds `batch-0.json`, `batch-1.json`, …, plus `manifest.json`.

### How a generation run works

1. GitHub Actions workflow `Generate BFE content batch` runs on manual dispatch.
2. `tool/generate-content.mjs`:
   - lists existing `batch-N.json` objects in R2 (dedup context),
   - downloads them and asks Claude Haiku for new items per category,
   - filters through a hardcoded denylist of show-associated terms,
   - runs an LLM-as-judge second pass,
   - uploads `batch-{n}.json` and an updated `manifest.json` to R2.
3. Within seconds, the Worker can serve them to the app.

### Generating a new batch

Push **Run workflow** in the Actions tab. That's it. No code change, no
commit; the new batch lives in R2.

To run locally instead (handy when iterating on prompts):

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
export R2_ACCOUNT_ID=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
node tool/generate-content.mjs
```

### Refreshing the baseline (rare)

If you hand-edit `lib/data/content_data.dart` in the BFE app and want the
generation pipeline to consider the new items:

```bash
npm run extract-baseline   # writes tmp/baseline.json
npm run seed-r2            # uploads tmp/baseline.json to R2 as batch-0
```

This overwrites batch-0 in R2. Subsequent generations will dedupe against the
new baseline.
