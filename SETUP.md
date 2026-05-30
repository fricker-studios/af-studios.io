# One-time Cloudflare setup for the BFE content pipeline

You only do this once. After it's done: pushing the "Run workflow" button in
the GitHub Actions tab is everything.

There are four moving pieces:

1. A **private R2 bucket** (`bfe-content`) holding the JSON.
2. **R2 API tokens** so GitHub Actions can write to the bucket.
3. A **Cloudflare Worker** (`bfe-content`) that serves the bucket behind a
   shared-secret check.
4. A **shared secret** that lives in both the Worker (as a secret) and the
   Flutter app (as a constant). The app sends it on every request.

---

## 1. Cloudflare account + R2

If you don't have one: sign up at <https://dash.cloudflare.com/sign-up>. Free
tier is plenty for this workload.

### Enable R2

In the Cloudflare dashboard sidebar → **R2 Object Storage** → click **Purchase
R2 Plan** if prompted (no card required for free tier, but it'll ask you to
acknowledge the pricing — under 10 GB storage and reasonable request volume is
free).

### Create the bucket

Still in R2 → **Create bucket**.

- Name: **`bfe-content`**
- Location: leave on default
- **Object lifecycle**: skip
- Click **Create bucket**.

### Create R2 API credentials

R2 dashboard → **Manage API Tokens** → **Create API Token**.

- Token name: **"BFE GitHub Actions"**
- Permissions: **Object Read & Write**
- Specify bucket(s): **Apply to specific buckets only** → select `bfe-content`
- TTL: leave default (forever)
- Click **Create API Token**.

You'll see three values once — copy all three to a safe place:

- **Account ID** (under "Use the following credentials...")
- **Access Key ID**
- **Secret Access Key**

You won't see the Secret Access Key again. If you lose it, delete the token
and create a new one.

---

## 2. Generate the app shared secret

This is the secret the Flutter app sends in the `Authorization` header. Any
sufficiently random string works. Generate one:

```bash
openssl rand -base64 32
```

Save the output somewhere safe. We'll use it in three places:

- Cloudflare Worker secret (step 4)
- Flutter app constant (step 6)
- GitHub Secrets (only if you want it in CI; not strictly needed)

---

## 3. Deploy the Worker

Install Wrangler (Cloudflare's CLI):

```bash
cd worker
npm install
npx wrangler login
```

That opens a browser for OAuth. Authorize.

Deploy:

```bash
npx wrangler deploy
```

Wrangler reads `wrangler.toml`, links the R2 bucket binding, and deploys. It
prints a URL like:

```
https://bfe-content.<your-subdomain>.workers.dev
```

Copy that URL. It's the base URL the Flutter app will fetch from.

### Set the shared secret on the Worker

```bash
npx wrangler secret put APP_SECRET
```

When prompted, paste the secret you generated in step 2. It uploads as an
encrypted env var; you can't read it back through the CLI, but the Worker can.

---

## 4. Wire GitHub Actions secrets

In the `af-studios.io` repo on GitHub → **Settings → Secrets and variables →
Actions → New repository secret**. Add these four:

| Secret name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Get one at <https://console.anthropic.com> → API Keys |
| `R2_ACCOUNT_ID` | From step 1 |
| `R2_ACCESS_KEY_ID` | From step 1 |
| `R2_SECRET_ACCESS_KEY` | From step 1 |

(You don't need `APP_SECRET` here — only the Worker and the Flutter app need it.)

---

## 5. Seed the bucket

The generator script requires at least one existing batch for dedup context.
Run the bootstrap **once** locally:

```bash
# from af-studios.io root
npm install
export R2_ACCOUNT_ID=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...

npm run extract-baseline
npm run seed-r2
```

You should see:

```
Wrote .../tmp/baseline.json
  openers: 30
  nicknameAdjectives: 167
  ...
Seeding bucket "bfe-content"...
  uploaded batch-0.json
  uploaded manifest.json
Seeded 462 items.
```

You can verify in the Cloudflare R2 dashboard — the bucket should now contain
`batch-0.json` and `manifest.json`.

---

## 6. Test it

In a terminal:

```bash
SECRET="...the secret from step 2..."
WORKER="https://bfe-content.<your-subdomain>.workers.dev"

curl -s -H "Authorization: Bearer $SECRET" "$WORKER/bfe/manifest.json"
```

You should get the manifest JSON back. Without the header, you get `401 Unauthorized`.

---

## 7. Wire the Flutter app

In `/Users/africker/git/github/knopisms/lib/constants.dart`, add:

```dart
const String kContentBaseUrl = 'https://bfe-content.<your-subdomain>.workers.dev/bfe';
const String kContentApiKey = '...the secret from step 2...';
```

(Phase 2B will reference these constants when the app starts fetching new
batches.)

---

## 8. Trigger your first generated batch

GitHub → Actions tab → **Generate BFE content batch** → **Run workflow** →
fill the reason field if you want → **Run workflow** (green button).

The workflow takes ~30-60 seconds. When it's done, your R2 bucket should have
`batch-1.json` and an updated `manifest.json`. Test again:

```bash
curl -s -H "Authorization: Bearer $SECRET" "$WORKER/bfe/manifest.json"
```

You should see `batch-0` AND `batch-1` listed.

---

## Costs (recap)

- R2 storage: ~free (10 GB free tier; we're using kilobytes).
- R2 egress: free (Cloudflare doesn't charge egress on R2).
- Workers requests: free up to 100K/day; you're nowhere near that.
- Anthropic per batch: ~$0.02–0.05 worth of Claude Haiku tokens.

Total ongoing: effectively $0 unless you're running generation many times a
week.
