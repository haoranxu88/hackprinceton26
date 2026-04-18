import { cn } from "@/lib/utils";
import { STEP_LABELS, type WizardStep } from "@/hooks/useWizard";
import { Check } from "lucide-react";

interface StepIndicatorProps {
  currentStep: WizardStep;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const steps = STEP_LABELS.slice(1); // skip Welcome

  return (
    <div className="flex items-center justify-center gap-0 px-4 py-2">
      {steps.map((label, idx) => {
        const stepNum = idx + 1;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;

        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-1.5 px-2">
              <span
                className={cn(
                  "text-[10px] font-semibold font-body transition-colors",
                  isCurrent ? "text-accent" : isCompleted ? "text-muted-foreground" : "text-muted-foreground/30"
                )}
              >
                {isCompleted ? (
                  <Check className="w-3 h-3" strokeWidth={2.5} />
                ) : (
                  `0${stepNum}`
                )}
              </span>
              <span
                className={cn(
                  "text-xs transition-colors hidden sm:inline",
                  isCurrent
                    ? "text-foreground font-semibold"
                    : isCompleted
                    ? "text-muted-foreground"
                    : "text-muted-foreground/30"
                )}
              >
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "w-8 h-px shrink-0 transition-colors",
                  stepNum < currentStep ? "bg-muted-foreground/30" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
