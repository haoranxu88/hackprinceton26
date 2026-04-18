import { cn } from "@/lib/utils";
import { STEP_LABELS, type WizardStep } from "@/hooks/useWizard";
import { Check } from "lucide-react";

interface StepIndicatorProps {
  currentStep: WizardStep;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 px-4">
      {STEP_LABELS.map((label, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <div key={label} className="flex items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all duration-500",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent && "bg-primary text-primary-foreground shadow-glow ring-2 ring-primary/30",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : index + 1}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden sm:inline transition-colors",
                  isCurrent ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
            {index < STEP_LABELS.length - 1 && (
              <div
                className={cn(
                  "w-6 sm:w-10 h-0.5 rounded-full transition-all duration-500",
                  isCompleted ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
