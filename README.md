# hackprinceton26 (Vigilant / LegalRedress AI)

## Autonomous settlement pipeline

Settlements are stored in `public.settlements`. Two Edge Functions run the hybrid crawler:

| Function | Role |
|----------|------|
| `discover-settlements` | Paginates ClassAction.org + TopClassActions index pages, uses Gemini to extract `{ title, defendant, detail_url }`, inserts **pending** stubs (deduped by `detail_url`). |
| `enrich-settlements` | Pulls pending (and stale enriched) rows, fetches each `detail_url`, uses Gemini to fill payout/chemicals/etc., marks **`enrichment_status = enriched`**. |
| `scrape-settlements` | **Manual kick**: calls `discover-settlements` then `enrich-settlements` once (same as the header **Settlements** button). |

`match-opportunities` only reads rows with `enrichment_status = 'enriched'` so half-built stubs never reach users.

### 1. One-time Vault secret (required for cron)

Cron jobs call Edge Functions with the **service role** key. Store it in Vault (SQL Editor → do **not** commit the key):

```sql
select vault.create_secret('<YOUR_SUPABASE_SERVICE_ROLE_KEY>', 'edge_fn_key');
```

If you apply the cron migration before creating this secret, jobs will run with an empty Bearer token until you add the secret.

### 2. Apply migrations

Creates `settlements` (if missing), enrichment columns, and `pg_cron` schedules (every 4h discover, hourly enrich at :15).

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

On **Windows PowerShell 5**, use `;` instead of `&&` (e.g. `Set-Location path; echo y | npx supabase db push --include-all`). `&&` works in **PowerShell 7+** and **cmd**.

Or run the SQL files under `supabase/migrations/` in the Supabase SQL editor.

### 3. Deploy Edge Functions

```bash
npx supabase functions deploy discover-settlements --no-verify-jwt
npx supabase functions deploy enrich-settlements --no-verify-jwt
npx supabase functions deploy scrape-settlements --no-verify-jwt
npx supabase functions deploy match-opportunities --no-verify-jwt
```

### 4. Secrets

| Function | Secrets |
|----------|---------|
| `discover-settlements`, `enrich-settlements` | `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (last two auto-injected on hosted Supabase) |
| `scrape-settlements` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (invokes the other two over HTTP) |
| `match-opportunities` | `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

### 5. Cron inspection (SQL Editor)

```sql
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 20;
```

To change the project URL in schedules, edit and re-apply [`supabase/migrations/20260418020000_cron_schedule.sql`](supabase/migrations/20260418020000_cron_schedule.sql) (or unschedule jobs in the dashboard) if you use a different Supabase project ref.

### 6. Manual refresh from the app

Switch to **Live** mode and click **Settlements** in the header to run `scrape-settlements` once.

## Local dev

```bash
pnpm install
pnpm dev
```
