# Vigilant MVP - Final Build Plan

## Context
Vigilant turns retail purchase data into health exposure insights, clinical trial matches, and class action lawsuit opportunities. Single-page wizard flow for HackPrinceton demo. All API keys provided. Real + mock data with a toggle (default: mock ON).

---

## Regeneron Trials - How They Fit (Answering Q3)

Regeneron is a biopharmaceutical company running clinical trials for drugs that treat conditions **caused by chemical exposure**. Here's the end-to-end flow:

```
User links Amazon/Walmart account via KnotAPI
  -> SKU-level products retrieved (e.g., "TRESemme Dry Shampoo", "Neutrogena Sunscreen")
    -> Products mapped to chemicals (Benzene in dry shampoo, Formaldehyde in hair straightener)
      -> Chemicals mapped to health risks (Benzene -> blood cancers like Multiple Myeloma)
        -> Health risks matched to Regeneron trials treating those conditions:
           - Linvoseltamab: treats Multiple Myeloma (linked to Benzene exposure)
           - Ubamatamab: treats Ovarian Cancer (linked to PFAS/talc exposure)
           - Dupixent: treats severe eczema/dermatitis (linked to irritant chemical exposure in skincare)
```

**The pitch to Regeneron**: Instead of waiting for patients to show up sick at a hospital, Vigilant identifies people with *documented, quantified chemical exposure* from their purchase history -- before they get sick. These are the highest-fidelity pre-symptomatic candidates for preventive trials. This reduces their 80% enrollment failure rate by catching eligible people earlier.

---

## API Keys & Secrets

| Service | Key | Storage |
|---------|-----|---------|
| KnotAPI | `client_id: dda0778d-9486-47f8-bd80-6f2512f9bcdb` / `secret: ff5e51b6dcf84a829898d37449cbc47a` | Enter Cloud Edge Function secrets |
| Dedalus | `dsk-test-1e6c9c50feb6-2af6b7195f79ea53143a88619e90d20b` | Enter Cloud Edge Function secrets |
| Gemini | `AIzaSyDERnmr62iCChYjNB-vHLXBzhWNMTFV2WE` | Enter Cloud Edge Function secrets |

**Base64 encoded KnotAPI auth**: `base64("dda0778d-9486-47f8-bd80-6f2512f9bcdb:ff5e51b6dcf84a829898d37449cbc47a")`

---

## Architecture

### Frontend (React/Vite/Tailwind)
Single-page wizard with 5 steps, animated transitions, and a global **"Use Mock Data" toggle** (default ON) in the header.

### Backend (Enter Cloud Edge Functions)
3 Edge Functions that proxy to external APIs:

1. **`knot-proxy`** -- Creates KnotAPI sessions + syncs transactions
   - `POST /knot-proxy` with `action: "create-session" | "sync-transactions" | "link-account"`
   - Handles base64 auth header construction server-side
   - Calls `https://development.knotapi.com/session/create` and `/transactions/sync`

2. **`analyze-exposure`** -- Uses Gemini to analyze products for chemical exposure
   - Receives product list from KnotAPI transactions
   - Calls Gemini API to identify hazardous chemicals in each product
   - Returns chemical profiles + calculated exposure scores (using EPA DAevent formula)

3. **`match-opportunities`** -- Uses Gemini to match exposure to lawsuits + trials
   - Takes chemical exposure profile
   - Returns matching class action lawsuits and clinical trials

### Data Flow

```
[KnotAPI SDK] -> User links merchant account
  -> [knot-proxy Edge Fn] -> Create session, link account, sync transactions
    -> [analyze-exposure Edge Fn] -> Gemini analyzes product names for chemicals
      -> [Frontend] -> Calculates Toxic Load Score using EPA formulas
        -> [match-opportunities Edge Fn] -> Gemini matches to lawsuits + trials
          -> [Frontend] -> Displays results in dashboard
```

### Mock Data Toggle
- Toggle switch in app header, defaults to ON
- When ON: skips all API calls, loads curated mock data
- When OFF: calls real Edge Functions (KnotAPI -> Gemini pipeline)
- Mock data includes realistic products with known chemical hazards

---

## Component Architecture

```
src/
├── App.tsx                          # Toggle + wizard controller
├── index.css                        # Design system tokens
├── lib/
│   ├── utils.ts                     # shadcn cn() utility
│   ├── exposure-calculator.ts       # EPA DA_event + ADD math
│   ├── knot.ts                      # KnotAPI client helpers
│   └── api.ts                       # Edge function callers
├── data/
│   ├── mock-transactions.ts         # Curated hazardous product purchases
│   ├── mock-analysis.ts             # Pre-computed chemical profiles
│   ├── mock-lawsuits.ts             # Real active class action settlements
│   └── mock-trials.ts              # Regeneron pipeline trials
├── hooks/
│   ├── useWizard.ts                 # Step state management
│   └── useMockToggle.ts            # Mock data context
├── components/
│   ├── ui/                          # shadcn primitives
│   ├── layout/
│   │   └── MockToggle.tsx           # Header toggle component
│   ├── wizard/
│   │   ├── WizardContainer.tsx      # Step management + framer-motion transitions
│   │   ├── StepIndicator.tsx        # Progress bar with step labels
│   │   ├── WelcomeStep.tsx          # Hero + 3 value prop cards
│   │   ├── LinkAccountsStep.tsx     # KnotAPI SDK embed + "Use Demo Data" fallback
│   │   ├── AnalysisStep.tsx         # Animated processing with chemical discovery
│   │   ├── ExposureDashboard.tsx    # Charts + scores (Step 4)
│   │   └── TakeActionStep.tsx       # Lawsuits + trials (Step 5)
│   ├── exposure/
│   │   ├── ToxicLoadGauge.tsx       # Circular SVG gauge (0-100)
│   │   ├── ChemicalBreakdown.tsx    # Recharts bar chart
│   │   ├── ProductTimeline.tsx      # Flagged purchases timeline
│   │   └── RiskCategories.tsx       # Dermal/Inhalation/Ingestion cards
│   ├── claims/
│   │   ├── LawsuitCard.tsx          # Settlement card with match confidence
│   │   └── ClaimForm.tsx            # Pre-filled form + PDF export
│   └── trials/
│       └── TrialCard.tsx            # Clinical trial match card
```

---

## KnotAPI Integration Details

### Session Creation (Edge Function)
```
POST https://development.knotapi.com/session/create
Headers: Authorization: Basic <base64(client_id:secret)>
Body: { type: "transaction_link", external_user_id: "<user_id>" }
Returns: { session: "uuid" }
```

### Frontend SDK Usage
```typescript
import KnotapiJS from "knotapi-js";
const knotapi = new KnotapiJS();
knotapi.open({
  sessionId: sessionFromEdgeFunction,
  clientId: "dda0778d-9486-47f8-bd80-6f2512f9bcdb",  // client_id is public
  environment: "development",
  entryPoint: "vigilant-onboarding",
  onSuccess: (details) => { /* proceed to analysis */ },
  onEvent: (event, merchant, merchantId) => { /* track progress */ },
  onExit: () => { /* handle close */ }
});
```

### Development Testing (no SDK needed)
```
POST https://development.knotapi.com/development/accounts/link
Body: { external_user_id: "test-user", merchant_id: 19 }
-> Generates 205 sample transactions
-> Then call POST /transactions/sync to retrieve them
```

### Transaction Object (what we get back)
Each transaction contains `products[]` with:
- `name`: "Band-Aid Adhesive Bandages Variety Pack"
- `description`: full product description
- `quantity`, `price`, `image_url`, `url`

These product names + descriptions are what we feed into Gemini for chemical analysis.

---

## Design System

### Color Palette
- **Primary**: Deep teal (#0F766E / hsl(175, 78%, 26%)) -- medical trust
- **Accent**: Amber (#F59E0B) -- alerts and warnings
- **Exposure scale**: Green -> Yellow -> Orange -> Red -> Purple (safe to critical)
- **Background**: Slate-based neutrals with subtle gradients
- **Cards**: Glass-morphism with subtle borders

### Typography
- Headers: Inter/system with tight tracking
- Body: System font stack, clean and clinical

---

## Implementation Order

1. Enable Enter Cloud + store API secrets
2. Scaffold project (Vite + React + Tailwind + shadcn)
3. Design system tokens in index.css + tailwind.config.ts
4. Install deps: `knotapi-js@next`, `recharts`, `framer-motion`
5. Create mock data files (transactions, chemicals, lawsuits, trials)
6. Build exposure-calculator.ts (EPA math)
7. Build wizard container + step indicator
8. Build all 5 wizard steps (Welcome -> Link -> Analysis -> Dashboard -> Action)
9. Create Edge Functions (knot-proxy, analyze-exposure, match-opportunities)
10. Wire up real API calls with mock toggle
11. Polish animations, responsiveness, dark mode
12. Lint + verify

---

## Verification
- [ ] Mock toggle defaults ON, wizard works end-to-end with mock data
- [ ] Toggling mock OFF triggers real KnotAPI session creation
- [ ] KnotAPI SDK opens and allows merchant account linking
- [ ] Exposure dashboard shows gauge, charts, product timeline
- [ ] Take Action shows lawsuit cards + Regeneron trial cards
- [ ] Claim form can be filled and exported
- [ ] Responsive on mobile + desktop
- [ ] All semantic tokens, no hardcoded colors
- [ ] Lint passes clean
