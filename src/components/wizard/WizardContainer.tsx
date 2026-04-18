import { useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { useWizard, type WizardStep } from "@/hooks/useWizard";
import { StepIndicator } from "./StepIndicator";
import { WelcomeStep } from "./WelcomeStep";
import { LinkAccountsStep } from "./LinkAccountsStep";
import { AnalysisStep } from "./AnalysisStep";
import { ExposureDashboard } from "./ExposureDashboard";
import { TakeActionStep } from "./TakeActionStep";
import type { Transaction } from "@/data/mock-transactions";
import type { ExposureAnalysis } from "@/data/mock-analysis";
import type { Lawsuit } from "@/data/mock-lawsuits";
import type { ClinicalTrial } from "@/data/mock-trials";

export function WizardContainer() {
  const { step, nextStep, prevStep, goToStep, data, updateData } = useWizard();

  const handleTransactionsLoaded = useCallback(
    (transactions: Transaction[]) => {
      updateData({ transactions });
      nextStep();
    },
    [updateData, nextStep]
  );

  const handleAnalysisComplete = useCallback(
    (analysis: ExposureAnalysis, lawsuits: Lawsuit[], trials: ClinicalTrial[]) => {
      updateData({ analysis, lawsuits, trials });
      nextStep();
    },
    [updateData, nextStep]
  );

  const handleRestart = useCallback(() => {
    updateData({ transactions: [], analysis: null, lawsuits: [], trials: [] });
    goToStep(0 as WizardStep);
  }, [updateData, goToStep]);

  return (
    <div className="w-full">
      {step > 0 && (
        <div className="border-b border-border/40 mb-2">
          <StepIndicator currentStep={step} />
        </div>
      )}

      {/* Step content */}
      <AnimatePresence mode="wait">
        {step === 0 && <WelcomeStep key="welcome" onNext={nextStep} />}
        {step === 1 && (
          <LinkAccountsStep
            key="link"
            onNext={handleTransactionsLoaded}
            onBack={prevStep}
          />
        )}
        {step === 2 && (
          <AnalysisStep
            key="analysis"
            transactions={data.transactions}
            onComplete={handleAnalysisComplete}
          />
        )}
        {step === 3 && data.analysis && (
          <ExposureDashboard
            key="dashboard"
            analysis={data.analysis}
            transactions={data.transactions}
            onNext={nextStep}
            onBack={prevStep}
          />
        )}
        {step === 4 && (
          <TakeActionStep
            key="action"
            lawsuits={data.lawsuits}
            trials={data.trials}
            onRestart={handleRestart}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
