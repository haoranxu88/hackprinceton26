# Vigilant MVP Plan - HackPrinceton

## Context
Building "Vigilant" -- an AI-native platform that converts retail purchase data into health exposure insights, clinical trial matches, and class action lawsuit opportunities. This is a hackathon project targeting Healthcare, Business/Enterprise, and Regeneron tracks, with sponsor alignment for Dedalus Labs, KnotAPI, Enter.pro, and Gemini.

The user selected a **single-page wizard flow** with priorities: Exposure Dashboard (F-03), Claim Automator (F-05), and Knot Sync + Dedalus Logic (F-01/F-02).

---

## Phase 0: Accounts & Keys You Need

Before we build, you need to sign up for these services:

| Service | What to Get | Sign-up URL | Purpose |
|---------|------------|-------------|---------|
| **KnotAPI** | `client_id` + `api_secret` | https://dashboard.knotapi.com | SKU-level transaction data from Amazon, Walmart, CVS |
| **Dedalus Labs** | `api_key` | https://dedalus.dev | AI agent orchestration (MCP servers for medical/legal DBs) |
| **Google AI Studio** | Gemini API key (if not routed through Dedalus) | https://aistudio.google.com | Gemini 2.0 Flash for analysis |

> **Note**: KnotAPI provides a sandbox mode with test merchants -- perfect for the hackathon demo. Dedalus provides hackathon-tier access. Both should be free for HackPrinceton participants.

All secrets will be stored securely in Enter Cloud (Edge Function secrets), never in frontend code.

---

## Phase 1: Project Scaffolding & Design System

### 1.1 Initialize React/Vite/Tailwind project
- Standard Enter.pro stack: React 18 + TypeScript + Vite + Tailwind CSS
- Install dependencies: `lucide-react`, `recharts` (for exposure charts), `framer-motion` (for wizard transitions)
- Install shadcn/ui components: `button`, `card`, `progress`, `badge`, `dialog`, `separator`, `tabs`

### 1.2 Design System (index.css + tailwind.config.ts)
- **Primary palette**: Deep medical blue/teal (`--primary`) with alert red accents for hazard indicators
- **Semantic tokens**: `--exposure-safe`, `--exposure-moderate`, `--exposure-high`, `--exposure-critical`
- **Gradients**: Subtle background gradients for dashboard sections
- **Typography**: Clean, clinical feel -- system font stack with tight letter-spacing for headers
- Dark mode support from the start

---

## Phase 2: Single-Page Wizard Architecture

### Flow: 5 Steps

```
[1. Welcome/Hero] -> [2. Link Accounts] -> [3. Exposure Analysis] -> [4. Results Dashboard] -> [5. Take Action]
```

### Step 1: Welcome / Hero
- Brand intro: "Your purchases tell a story. Vigilant reads it."
- Brief explainer cards: What Vigilant does (3 value props)
- CTA: "Get Started" button

### Step 2: Link Accounts (KnotAPI Integration)
- KnotAPI CardSwitcher/TransactionLink widget embed
- For demo: also provide a "Use Demo Data" button that loads curated mock transactions
- Visual feedback: animated account connection status
- Shows merchant logos (Amazon, Walmart, CVS, Target)

### Step 3: Exposure Analysis (Loading/Processing State)
- Animated "analyzing" state with progress indicators
- Shows chemical names being identified in real-time
- Brief educational tooltips about chemicals found
- This is where Dedalus agent orchestration runs (or mock data loads)

### Step 4: Results Dashboard (F-03: Exposure Dashboard)
- **Toxic Load Score**: Large circular gauge (0-100) with color coding
- **Percentile ranking**: "You're in the 87th percentile for benzene exposure"
- **Chemical breakdown**: Bar chart of top chemicals found (Benzene, Formaldehyde, PFAS, etc.)
- **Product timeline**: Which purchases contributed, when
- **Risk categories**: Dermal, Inhalation, Ingestion breakdown

### Step 5: Take Action (F-05: Claim Automator + Trial Matching)
- **Active Lawsuits**: Cards showing matching class action settlements
  - Settlement name, amount, deadline, match confidence
  - "File Claim" button -> pre-filled form / PDF generation
- **Clinical Trials**: Cards for matching Regeneron trials
  - Trial name, phase, location, eligibility match score
  - "Learn More" / "Express Interest" buttons
- **Download Report**: PDF summary of exposure analysis

---

## Phase 3: Component Architecture

```
src/
├── App.tsx                          # Main wizard controller
├── index.css                        # Design system tokens
├── components/
│   ├── ui/                          # shadcn primitives (button, card, etc.)
│   ├── wizard/
│   │   ├── WizardContainer.tsx      # Step management + transitions
│   │   ├── StepIndicator.tsx        # Progress dots/bar
│   │   ├── WelcomeStep.tsx          # Step 1
│   │   ├── LinkAccountsStep.tsx     # Step 2 (KnotAPI)
│   │   ├── AnalysisStep.tsx         # Step 3 (loading)
│   │   ├── ExposureDashboard.tsx    # Step 4 (charts + scores)
│   │   └── TakeActionStep.tsx       # Step 5 (lawsuits + trials)
│   ├── exposure/
│   │   ├── ToxicLoadGauge.tsx       # Circular score visualization
│   │   ├── ChemicalBreakdown.tsx    # Bar chart of chemicals
│   │   ├── ProductTimeline.tsx      # Timeline of hazardous purchases
│   │   └── RiskCategories.tsx       # Dermal/Inhalation/Ingestion
│   ├── claims/
│   │   ├── LawsuitCard.tsx          # Individual settlement card
│   │   └── ClaimForm.tsx            # Pre-filled claim form
│   └── trials/
│       └── TrialCard.tsx            # Clinical trial match card
├── data/
│   ├── mock-transactions.ts         # Demo transaction data
│   ├── mock-chemicals.ts            # Chemical profiles (CPDat-based)
│   ├── mock-lawsuits.ts             # Active class action settlements
│   └── mock-trials.ts              # Regeneron pipeline trials
├── lib/
│   ├── exposure-calculator.ts       # DA_event and ADD formulas
│   └── utils.ts                     # shadcn utils
└── hooks/
    └── useWizard.ts                 # Wizard state management
```

---

## Phase 4: Backend (Enter Cloud Edge Functions) -- After Keys Are Ready

### Edge Functions to create:
1. **`knot-sync`**: Proxy to KnotAPI TransactionLink for SKU retrieval
2. **`analyze-exposure`**: Runs Dedalus agent (or direct Gemini call) to map SKUs -> chemicals -> exposure scores
3. **`match-claims`**: Queries legal databases for matching settlements
4. **`match-trials`**: Queries ClinicalTrials.gov for matching trials

> **For MVP/demo**: We build the full frontend with mock data first. Edge Functions are wired up once you have your API keys.

---

## Phase 5: Implementation Order

1. **Scaffold project** + design system + shadcn components
2. **Mock data files** (transactions, chemicals, lawsuits, trials)
3. **Wizard container** + step indicator + navigation
4. **Welcome step** (hero + value props)
5. **Link Accounts step** (demo data button + KnotAPI placeholder)
6. **Analysis step** (animated loading with chemical discovery)
7. **Exposure Dashboard** (gauge + charts + timeline)
8. **Take Action step** (lawsuit cards + trial cards)
9. **Exposure calculator** (real DA_event / ADD math)
10. **Polish**: animations, responsiveness, dark mode

---

## Verification

- [ ] Wizard flows smoothly through all 5 steps with transitions
- [ ] "Use Demo Data" loads mock transactions and proceeds to analysis
- [ ] Exposure Dashboard shows Toxic Load gauge, chemical bar chart, product timeline
- [ ] Take Action shows matched lawsuits and trials with CTAs
- [ ] Responsive on mobile and desktop
- [ ] Design system uses semantic tokens throughout (no hardcoded colors)
- [ ] Lint passes with no errors

---

## Open Questions for You

1. Do you want the exposure math to be fully real (using actual EPA coefficients from CPDat) or simplified for the demo?
2. Should the "File Claim" button actually generate a PDF, or just show a pre-filled form UI?
3. Any specific Regeneron trial molecules you want featured (Linvoseltamab, Ubamatamab, Dupixent)?
