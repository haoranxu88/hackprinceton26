export interface ChemicalExposure {
  chemical: string;
  casNumber: string;
  category: "carcinogen" | "endocrine_disruptor" | "irritant" | "neurotoxin";
  exposureRoute: "dermal" | "inhalation" | "ingestion";
  concentrationPpm: number;
  kp: number; // permeability coefficient (cm/hr)
  contactTimeHrs: number;
  frequency: number; // times per month
  riskLevel: "safe" | "moderate" | "high" | "critical";
  products: string[];
  healthEffects: string[];
}

export interface ExposureAnalysis {
  overallScore: number; // 0-100
  percentile: number;
  riskLevel: "safe" | "moderate" | "high" | "critical";
  chemicals: ChemicalExposure[];
  totalProductsScanned: number;
  flaggedProducts: number;
}

export const mockAnalysis: ExposureAnalysis = {
  overallScore: 73,
  percentile: 87,
  riskLevel: "high",
  totalProductsScanned: 14,
  flaggedProducts: 9,
  chemicals: [
    {
      chemical: "Benzene",
      casNumber: "71-43-2",
      category: "carcinogen",
      exposureRoute: "inhalation",
      concentrationPpm: 4.2,
      kp: 0.0015,
      contactTimeHrs: 0.5,
      frequency: 12,
      riskLevel: "critical",
      products: [
        "TRESemme Dry Shampoo Fresh & Clean",
        "Batiste Dry Shampoo Original",
        "Neutrogena Beach Defense Sunscreen Spray",
      ],
      healthEffects: [
        "Leukemia",
        "Multiple Myeloma",
        "Non-Hodgkin Lymphoma",
        "Aplastic Anemia",
      ],
    },
    {
      chemical: "Formaldehyde",
      casNumber: "50-00-0",
      category: "carcinogen",
      exposureRoute: "dermal",
      concentrationPpm: 1.8,
      kp: 0.0012,
      contactTimeHrs: 2.0,
      frequency: 8,
      riskLevel: "high",
      products: [
        "OGX Biotin & Collagen Shampoo",
        "Garnier Fructis Style Full Control Hairspray",
      ],
      healthEffects: [
        "Nasopharyngeal Cancer",
        "Skin Sensitization",
        "Respiratory Irritation",
      ],
    },
    {
      chemical: "Talc (Asbestos-contaminated)",
      casNumber: "14807-96-6",
      category: "carcinogen",
      exposureRoute: "inhalation",
      concentrationPpm: 0.8,
      kp: 0.0001,
      contactTimeHrs: 0.25,
      frequency: 15,
      riskLevel: "high",
      products: ["Johnson's Baby Powder Original"],
      healthEffects: [
        "Ovarian Cancer",
        "Mesothelioma",
        "Respiratory Disease",
      ],
    },
    {
      chemical: "Parabens (Methylparaben)",
      casNumber: "99-76-3",
      category: "endocrine_disruptor",
      exposureRoute: "dermal",
      concentrationPpm: 3.5,
      kp: 0.0008,
      contactTimeHrs: 12.0,
      frequency: 30,
      riskLevel: "moderate",
      products: [
        "Dove Body Wash Deep Moisture",
        "Pantene Pro-V Daily Moisture Renewal",
      ],
      healthEffects: [
        "Endocrine Disruption",
        "Reproductive Issues",
        "Breast Cancer Risk",
      ],
    },
    {
      chemical: "Aluminum Compounds",
      casNumber: "7429-90-5",
      category: "neurotoxin",
      exposureRoute: "dermal",
      concentrationPpm: 15.0,
      kp: 0.0003,
      contactTimeHrs: 16.0,
      frequency: 30,
      riskLevel: "moderate",
      products: [
        "Suave Antiperspirant Deodorant Powder",
        "Secret Invisible Solid Antiperspirant",
      ],
      healthEffects: [
        "Neurotoxicity",
        "Breast Cancer Risk",
        "Alzheimer's Disease Risk",
      ],
    },
    {
      chemical: "Oxybenzone (BP-3)",
      casNumber: "131-57-7",
      category: "endocrine_disruptor",
      exposureRoute: "dermal",
      concentrationPpm: 6.0,
      kp: 0.0025,
      contactTimeHrs: 4.0,
      frequency: 6,
      riskLevel: "moderate",
      products: [
        "Neutrogena Beach Defense Sunscreen Spray",
        "Banana Boat Sport Ultra SPF 50",
      ],
      healthEffects: [
        "Hormonal Disruption",
        "Coral Reef Damage",
        "Thyroid Dysfunction",
      ],
    },
  ],
};

export const exposureCategoryData = [
  { name: "Dermal", value: 45, color: "hsl(174, 62%, 28%)" },
  { name: "Inhalation", value: 35, color: "hsl(38, 92%, 50%)" },
  { name: "Ingestion", value: 20, color: "hsl(0, 84%, 60%)" },
];
