export interface Lawsuit {
  id: string;
  title: string;
  defendant: string;
  settlementAmount: string;
  deadline: string;
  status: "active" | "pending" | "closed";
  matchConfidence: number;
  matchedChemicals: string[];
  matchedProducts: string[];
  description: string;
  payoutTiers: { tier: string; amount: string; requirement: string }[];
}

export const mockLawsuits: Lawsuit[] = [
  {
    id: "law-001",
    title: "Unilever Dry Shampoo Benzene Recall Settlement",
    defendant: "Unilever / TRESemme",
    settlementAmount: "$3,600,000",
    deadline: "2026-08-15",
    status: "active",
    matchConfidence: 94,
    matchedChemicals: ["Benzene"],
    matchedProducts: ["TRESemme Dry Shampoo Fresh & Clean"],
    description: "Class action settlement for dry shampoo products found to contain elevated levels of benzene, a known carcinogen. Affects products manufactured between 2020-2023.",
    payoutTiers: [
      { tier: "Proof of Purchase", amount: "Up to $30.00", requirement: "Provide receipt or transaction record" },
      { tier: "Personal Injury", amount: "Up to $12,500", requirement: "Medical documentation of harm" },
      { tier: "No Proof", amount: "Up to $6.00", requirement: "Sworn statement of purchase" },
    ],
  },
  {
    id: "law-002",
    title: "Johnson & Johnson Talc Powder Litigation",
    defendant: "Johnson & Johnson",
    settlementAmount: "$8,900,000,000",
    deadline: "2026-10-30",
    status: "active",
    matchConfidence: 89,
    matchedChemicals: ["Talc (Asbestos-contaminated)"],
    matchedProducts: ["Johnson's Baby Powder Original"],
    description: "Multidistrict litigation alleging that J&J talc-based baby powder contained asbestos and caused ovarian cancer and mesothelioma in users.",
    payoutTiers: [
      { tier: "Category A - Cancer Diagnosis", amount: "Up to $750,000", requirement: "Medical records + proof of regular use" },
      { tier: "Category B - Other Illness", amount: "Up to $50,000", requirement: "Medical records of related illness" },
      { tier: "Category C - Purchaser", amount: "Up to $100", requirement: "Proof of purchase" },
    ],
  },
  {
    id: "law-003",
    title: "Neutrogena/Banana Boat Sunscreen Benzene Settlement",
    defendant: "Johnson & Johnson / Energizer",
    settlementAmount: "$45,000,000",
    deadline: "2026-06-01",
    status: "active",
    matchConfidence: 91,
    matchedChemicals: ["Benzene", "Oxybenzone (BP-3)"],
    matchedProducts: [
      "Neutrogena Beach Defense Sunscreen Spray",
      "Banana Boat Sport Ultra SPF 50",
    ],
    description: "Settlement for aerosol sunscreen products found to contain benzene contamination above FDA limits. Independent lab testing by Valisure confirmed presence.",
    payoutTiers: [
      { tier: "Proof of Purchase", amount: "Up to $25.00", requirement: "Transaction record or receipt" },
      { tier: "Injury Claim", amount: "Up to $10,000", requirement: "Medical documentation" },
      { tier: "No Receipt", amount: "Up to $4.00", requirement: "Sworn declaration" },
    ],
  },
  {
    id: "law-004",
    title: "Hair Straightener Formaldehyde Exposure MDL",
    defendant: "L'Oreal / Revlon / Multiple",
    settlementAmount: "Pending",
    deadline: "TBD",
    status: "pending",
    matchConfidence: 72,
    matchedChemicals: ["Formaldehyde"],
    matchedProducts: ["OGX Biotin & Collagen Shampoo", "Garnier Fructis Style Full Control Hairspray"],
    description: "Emerging litigation for hair care products containing formaldehyde-releasing preservatives linked to cancer risk, particularly among frequent users.",
    payoutTiers: [
      { tier: "Registration", amount: "TBD", requirement: "Register interest and document exposure" },
    ],
  },
];
