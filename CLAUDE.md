# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm run dev        # Start Vite dev server on localhost:8080
pnpm run build      # Production build (vite build)
pnpm run preview    # Preview production build
pnpm run ci         # Install deps (pnpm install --frozen-lockfile)
```

Use `pnpm` (not npm) — the repo has a `pnpm-lock.yaml`.

## What This App Does

**Vigilant** is a health-exposure intelligence platform. Users link retail accounts (Amazon, Walmart, CVS) via KnotAPI, the app analyzes purchase history for hazardous chemicals using Gemini 2.0 Flash, scores toxic load via an EPA dermal-absorption framework, then surfaces relevant class action lawsuits and clinical trials.

## Architecture

**Stack**: React 19 + TypeScript + Vite (SWC) / shadcn/ui + Radix UI + Tailwind + Framer Motion / Supabase Edge Functions (Deno) + Gemini API + KnotAPI

**Core data flow**:
```
Link accounts (KnotAPI) → sync transactions → analyzeExposure() [Gemini]
→ exposure-calculator.ts (EPA math) → matchOpportunities() [Gemini]
→ ExposureDashboard + TakeActionStep
```

**Mock mode** (toggled via `MockToggle` in the header) short-circuits all API calls and uses pre-built data in `src/data/mock-*.ts`. This is the default for demos.

### Key directories

- `src/components/wizard/` — 5-step linear flow orchestrated by `WizardContainer.tsx`. Steps: Welcome → LinkAccounts → Analysis → ExposureDashboard → TakeAction.
- `src/components/exposure/` — Visualization components (gauge, Recharts breakdowns, timeline).
- `src/lib/api.ts` — All calls to Supabase Edge Functions.
- `src/lib/exposure-calculator.ts` — EPA dermal absorption math: DA_event = Kp × C × t, ADD normalized to 0–100 score.
- `src/data/` — Mock transactions, analysis, lawsuits, and trials used in demo mode.
- `supabase/functions/` — Edge functions: `knot-proxy/{create-session,link-account,sync-transactions}`, `analyze-exposure/`, `match-opportunities/`.

### Path alias

`@/` maps to `src/` (configured in `vite.config.ts` and `tsconfig.app.json`).

## Environment Variables

Required for real (non-mock) mode — set in Supabase dashboard or `.env.local`:
- `KNOT_CLIENT_ID`, `KNOT_SECRET` — KnotAPI credentials (used by `knot-proxy` edge function)
- `GEMINI_API_KEY` — Used by `analyze-exposure` and `match-opportunities` edge functions
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are hardcoded in `src/integrations/supabase/client.ts`
