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

This repo also hosts generated content batches for Best Friend Energy under
`best-friend-energy/content/`. The Flutter app fetches `manifest.json` on
launch and downloads any new batches it doesn't have.

### Layout

```
best-friend-energy/content/
├── manifest.json        # versions + URLs + item counts
├── batch-0.json         # v1 baseline (extracted from the app's bundled content)
├── batch-1.json         # generated batch
└── batch-N.json         # …
```

### Generating a new batch

1. Set the `ANTHROPIC_API_KEY` repository secret on GitHub
   (Settings → Secrets and variables → Actions).
2. Go to **Actions → Generate BFE content batch → Run workflow**.
3. The job runs `tool/generate-content.mjs`, which:
   - reads every existing batch for dedup context
   - asks Claude Haiku for the v1-baseline-sized set of new items per category
   - filters through a hardcoded denylist of show-associated terms
   - runs an LLM-as-judge second pass
   - writes `batch-{n}.json` + rebuilds `manifest.json`
   - commits and pushes

### Running locally

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
node tool/generate-content.mjs
```

### Refreshing the baseline (rare)

If you hand-edit `lib/data/content_data.dart` in the BFE app and want the
generation pipeline to know about it:

```bash
node tool/extract-baseline.mjs
```

This rewrites `batch-0.json` from the current Dart source. Defaults to
`/Users/africker/git/github/knopisms/lib/data/content_data.dart`; override with
`BFE_CONTENT_PATH=...`.
