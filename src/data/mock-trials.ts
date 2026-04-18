export interface ClinicalTrial {
  id: string;
  title: string;
  sponsor: string;
  molecule: string;
  phase: string;
  condition: string;
  linkedChemicals: string[];
  eligibilityMatch: number;
  locations: string[];
  status: "recruiting" | "upcoming" | "active";
  description: string;
  nctId: string;
  compensation: string;
}

export const mockTrials: ClinicalTrial[] = [
  {
    id: "trial-001",
    title: "Linvoseltamab for Relapsed/Refractory Multiple Myeloma",
    sponsor: "Regeneron Pharmaceuticals",
    molecule: "Linvoseltamab (REGN5458)",
    phase: "Phase 3",
    condition: "Multiple Myeloma",
    linkedChemicals: ["Benzene"],
    eligibilityMatch: 82,
    locations: ["Princeton, NJ", "New York, NY", "Philadelphia, PA", "Boston, MA"],
    status: "recruiting",
    description: "Evaluating linvoseltamab, a BCMAxCD3 bispecific antibody, in patients with relapsed or refractory multiple myeloma. Benzene exposure is a documented risk factor for this blood cancer.",
    nctId: "NCT05108623",
    compensation: "Travel reimbursement + study drug at no cost",
  },
  {
    id: "trial-002",
    title: "Ubamatamab in Advanced Ovarian Cancer",
    sponsor: "Regeneron Pharmaceuticals",
    molecule: "Ubamatamab (REGN4018)",
    phase: "Phase 2/3",
    condition: "Ovarian Cancer",
    linkedChemicals: ["Talc (Asbestos-contaminated)"],
    eligibilityMatch: 68,
    locations: ["Princeton, NJ", "Houston, TX", "Chicago, IL"],
    status: "recruiting",
    description: "Investigating ubamatamab, a MUC16xCD3 bispecific antibody, for platinum-resistant ovarian cancer. Talc/asbestos exposure has been linked to increased ovarian cancer risk.",
    nctId: "NCT05739292",
    compensation: "Full medical monitoring + travel stipend",
  },
  {
    id: "trial-003",
    title: "Dupixent for Chemical-Induced Severe Atopic Dermatitis",
    sponsor: "Regeneron Pharmaceuticals / Sanofi",
    molecule: "Dupilumab (Dupixent)",
    phase: "Phase 4 (Post-Market)",
    condition: "Severe Atopic Dermatitis / Eczema",
    linkedChemicals: ["Formaldehyde", "Parabens (Methylparaben)"],
    eligibilityMatch: 76,
    locations: ["Princeton, NJ", "Los Angeles, CA", "Atlanta, GA", "Miami, FL"],
    status: "recruiting",
    description: "Post-market study evaluating Dupixent in patients with severe eczema potentially triggered or exacerbated by chemical irritant exposure from personal care products.",
    nctId: "NCT04984278",
    compensation: "Study drug provided + quarterly check-ups",
  },
  {
    id: "trial-004",
    title: "REGN-EB3 for Chemotherapy-Induced Immune Suppression",
    sponsor: "Regeneron Pharmaceuticals",
    molecule: "REGN-EB3 Antibody Cocktail",
    phase: "Phase 2",
    condition: "Immune Dysfunction / Prevention",
    linkedChemicals: ["Benzene", "Formaldehyde"],
    eligibilityMatch: 55,
    locations: ["New York, NY", "Baltimore, MD"],
    status: "upcoming",
    description: "Novel antibody therapy studying immune system restoration in patients with documented chronic chemical exposure affecting immune function.",
    nctId: "NCT05892301",
    compensation: "Full compensation for time + travel",
  },
];
