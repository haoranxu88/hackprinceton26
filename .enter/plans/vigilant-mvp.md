# Plan: Fix Knot Transactions + Add Dedalus Integration

## Context
Two integrations need fixing/adding:
1. **Knot transactions return empty** -- we're using wrong request params and not waiting for async generation
2. **Dedalus integration** -- key is stored but no edge function uses it yet

---

## Part 1: Fix Knot Transactions

### Root Cause (from Knot docs)
The `/development/accounts/link` endpoint generates transactions **asynchronously**. After calling link-account, Knot fires a `NEW_TRANSACTIONS_AVAILABLE` webhook, and THEN `/transactions/sync` returns data. Our current code calls sync **immediately** after link, before transactions are generated.

Additionally, our `transactions` param is wrong: we send `{ count: 10 }` but the API expects `{ new: true }`.

### Fix Strategy

**A. Fix `knot-proxy` edge function** (`supabase/functions/knot-proxy/index.ts`):
- Fix `link-account` body: change `transactions: { count: 10 }` to `transactions: { new: true }`
- Add a new `list-merchants` action that calls `POST /merchant/list` with `type: "transaction_link"` so we can discover real merchant IDs
- Add **polling logic** to `sync-transactions`: after linking, retry sync up to 5 times with 3-second delays (since dev environment generates 205 transactions "within a few seconds" per docs)

**B. Fix `LinkAccountsStep.tsx`** (`src/components/wizard/LinkAccountsStep.tsx`):
- Replace hardcoded merchant list with dynamic fetch from `list-merchants` on mount (show real merchant names/IDs from Knot)
- Keep current 3 merchants as fallback if API fails
- After linking, use polling sync (edge function handles retries) to wait for transactions
- Use a unique `external_user_id` per session as docs recommend (e.g. `vigilant-{timestamp}`)

**C. Fix `api.ts`** (`src/lib/api.ts`):
- Add `listKnotMerchants()` function
- Keep existing `linkKnotAccount` and `syncKnotTransactions` unchanged (edge function handles the retry)

### Files Modified
- `supabase/functions/knot-proxy/index.ts` -- fix link body, add list-merchants, add sync polling
- `src/components/wizard/LinkAccountsStep.tsx` -- dynamic merchants, better sync flow
- `src/lib/api.ts` -- add listKnotMerchants

---

## Part 2: Add Dedalus Integration

### What Dedalus Offers
Dedalus provides an **OpenAI-compatible API** (`chat.completions.create`) that routes to any model from any provider. It also has a **Runner SDK** for agentic tool-calling loops, and **MCP server deployment**. Their DCS (machines) API is for cloud compute.

For our hackathon, the most impactful Dedalus integration is using their **OpenAI-compatible chat API** as an alternative AI provider in our edge functions -- showing sponsor track usage. We can also use the **Runner** pattern if we want agent-style orchestration.

### Integration Plan

**A. Create `dedalus-agent` edge function** (`supabase/functions/dedalus-agent/index.ts`):
- A new edge function that uses the Dedalus API key (`DEDALUS_API_KEY` already stored) 
- OpenAI-compatible endpoint: `https://api.dedaluslabs.ai/v1/chat/completions`
- Uses `X-API-Key` header with the Dedalus key
- Accepts a `task` param: `"analyze"` or `"match"` to handle both use cases
- Acts as a "Dedalus Agent" that the UI can invoke as an alternative to the current analyze-exposure/match-opportunities functions
- Can be called with `model: "openai/gpt-5-nano"` or any model available on Dedalus

**B. Add Dedalus as AI provider option** in existing edge functions:
- Add `AI_PROVIDER = "dedalus"` option alongside `"enter"` and `"gemini"` in both `analyze-exposure` and `match-opportunities`
- Dedalus uses OpenAI-compatible format: `POST /v1/chat/completions` with standard `messages` array
- This lets judges see we integrated Dedalus as a real AI provider

**C. Frontend: Show "Powered by" badge** in AnalysisStep:
- Small badge showing which AI provider is being used
- Demonstrates to hackathon judges that multiple providers are integrated

### Files Modified
- `supabase/functions/dedalus-agent/index.ts` -- new edge function (standalone Dedalus endpoint)
- `supabase/functions/analyze-exposure/index.ts` -- add Dedalus as AI_PROVIDER option
- `supabase/functions/match-opportunities/index.ts` -- add Dedalus as AI_PROVIDER option
- `src/components/wizard/AnalysisStep.tsx` -- "Powered by" badge

---

## Part 3: Cleanup
- Remove `debug-secrets` edge function and KEY CHECK code from `App.tsx`
- Remove stale console.logs

### Files Modified
- `src/App.tsx` -- remove debug code
- `supabase/functions/debug-secrets/index.ts` -- delete

---

## Verification
1. **Knot**: Turn off demo mode, click Connect on a merchant -> should see real merchant names from Knot's list API -> after linking, sync should return transactions (205 in dev) after brief polling
2. **Dedalus**: Switch AI_PROVIDER to "dedalus" and run analysis -> should get toxicology results via Dedalus API
3. **Enter AI**: Default provider still works as before
4. **Demo mode**: Still works with mock data, no regressions
