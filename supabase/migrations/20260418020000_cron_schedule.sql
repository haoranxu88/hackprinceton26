-- Schedule settlement discovery + enrichment (no secrets in-repo: use Vault).
-- Before first successful run, create the secret in SQL Editor:
--   select vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'edge_fn_key');
--
-- Requires: pg_cron, pg_net, Vault (supabase_vault). Project ref must match supabase/config.toml if you fork.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT jobid FROM cron.job WHERE jobname IN ('discover-settlements-4h', 'enrich-settlements-1h'))
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'discover-settlements-4h',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lshvzcfhzdpludpwprjv.supabase.co/functions/v1/discover-settlements',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_fn_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'enrich-settlements-1h',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lshvzcfhzdpludpwprjv.supabase.co/functions/v1/enrich-settlements',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_fn_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
