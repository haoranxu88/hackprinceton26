import type { ChemicalExposure } from "@/data/mock-analysis";

/**
 * EPA Dermal Absorption Framework
 *
 * DA_event = Kp * C * t
 * Where:
 *   Kp = permeability coefficient (cm/hr)
 *   C  = chemical concentration (mg/cm³)
 *   t  = contact time (hours)
 *
 * ADD_abs = (DA_event * SA * EF * ED) / (BW * AT)
 * Where:
 *   SA  = skin surface area exposed (cm²)
 *   EF  = exposure frequency (events/year)
 *   ED  = exposure duration (years)
 *   BW  = body weight (kg)
 *   AT  = averaging time (days)
 */

// Default human parameters
const BODY_WEIGHT_KG = 70;
const SKIN_SURFACE_AREA_CM2 = 1800; // typical head/hands/arms
const EXPOSURE_DURATION_YEARS = 3; // assumed from purchase history
const AVERAGING_TIME_DAYS = 365 * EXPOSURE_DURATION_YEARS;

export function calculateDAEvent(
  kp: number,
  concentrationPpm: number,
  contactTimeHrs: number
): number {
  // Convert ppm to mg/cm³ (rough conversion for liquids: ppm ≈ mg/L, 1L = 1000cm³)
  const concentrationMgCm3 = concentrationPpm / 1000;
  return kp * concentrationMgCm3 * contactTimeHrs;
}

export function calculateADD(
  daEvent: number,
  frequencyPerMonth: number
): number {
  const eventsPerYear = frequencyPerMonth * 12;
  const numerator = daEvent * SKIN_SURFACE_AREA_CM2 * eventsPerYear * EXPOSURE_DURATION_YEARS;
  const denominator = BODY_WEIGHT_KG * AVERAGING_TIME_DAYS;
  return numerator / denominator;
}

export function calculateToxicLoadScore(chemicals: ChemicalExposure[]): number {
  if (chemicals.length === 0) return 0;

  let totalRisk = 0;
  const weights: Record<string, number> = {
    carcinogen: 4.0,
    endocrine_disruptor: 2.5,
    neurotoxin: 2.0,
    irritant: 1.0,
  };

  for (const chem of chemicals) {
    const daEvent = calculateDAEvent(
      chem.kp,
      chem.concentrationPpm,
      chem.contactTimeHrs
    );
    const add = calculateADD(daEvent, chem.frequency);
    const categoryWeight = weights[chem.category] ?? 1.0;
    totalRisk += add * categoryWeight * 1000000; // Scale up for readable numbers
  }

  // Normalize to 0-100 using a sigmoid-like function
  const normalized = (totalRisk / (totalRisk + 50)) * 100;
  return Math.min(Math.round(normalized), 100);
}

export function getRiskLevel(score: number): "safe" | "moderate" | "high" | "critical" {
  if (score < 25) return "safe";
  if (score < 50) return "moderate";
  if (score < 75) return "high";
  return "critical";
}

export function getRiskColor(level: string): string {
  switch (level) {
    case "safe": return "hsl(142, 65%, 38%)";
    case "moderate": return "hsl(36, 90%, 50%)";
    case "high": return "hsl(25, 88%, 52%)";
    case "critical": return "hsl(0, 78%, 54%)";
    default: return "hsl(222, 8%, 46%)";
  }
}
