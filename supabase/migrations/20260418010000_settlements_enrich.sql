-- Hybrid pipeline: discovery stubs + enrichment queue; dedupe by detail_url
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS detail_url TEXT,
  ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enrichment_attempts INT DEFAULT 0;

COMMENT ON COLUMN public.settlements.detail_url IS 'Canonical settlement detail page URL; unique dedupe key for discovery.';
COMMENT ON COLUMN public.settlements.enrichment_status IS 'pending | enriched | failed | stale';

CREATE UNIQUE INDEX IF NOT EXISTS settlements_detail_url_key
  ON public.settlements (detail_url)
  WHERE detail_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS settlements_enrichment_queue_idx
  ON public.settlements (enrichment_status, discovered_at);

-- Pre-pipeline rows: treat entire existing catalog as enriched (detail_url may be null)
UPDATE public.settlements
SET
  enrichment_status = 'enriched',
  last_enriched_at = COALESCE(last_enriched_at, scraped_at, now()),
  discovered_at = COALESCE(discovered_at, scraped_at, now());

ALTER TABLE public.settlements
  ALTER COLUMN enrichment_status SET DEFAULT 'pending';

COMMENT ON TABLE public.settlements IS 'Class action settlements: discover-settlements inserts stubs; enrich-settlements fills fields; match uses enrichment_status=enriched only.';
