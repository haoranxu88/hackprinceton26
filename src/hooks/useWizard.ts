import { useState, useCallback } from "react";
import type { Transaction } from "@/data/mock-transactions";
import type { ExposureAnalysis } from "@/data/mock-analysis";
import type { Lawsuit } from "@/data/mock-lawsuits";
import type { ClinicalTrial } from "@/data/mock-trials";

export type WizardStep = 0 | 1 | 2 | 3 | 4;

export const STEP_LABELS = [
  "Welcome",
  "Link Accounts",
  "Analyzing",
  "Exposure Report",
  "Take Action",
];

export interface WizardData {
  transactions: Transaction[];
  analysis: ExposureAnalysis | null;
  lawsuits: Lawsuit[];
  trials: ClinicalTrial[];
}

export function useWizard() {
  const [step, setStep] = useState<WizardStep>(0);
  const [data, setData] = useState<WizardData>({
    transactions: [],
    analysis: null,
    lawsuits: [],
    trials: [],
  });

  const nextStep = useCallback(() => {
    setStep((prev) => Math.min(prev + 1, 4) as WizardStep);
  }, []);

  const prevStep = useCallback(() => {
    setStep((prev) => Math.max(prev - 1, 0) as WizardStep);
  }, []);

  const goToStep = useCallback((s: WizardStep) => {
    setStep(s);
  }, []);

  const updateData = useCallback((update: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...update }));
  }, []);

  return { step, nextStep, prevStep, goToStep, data, updateData };
}
