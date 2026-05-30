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
