import { cn } from "@/lib/utils";
import { STEP_LABELS, type WizardStep } from "@/hooks/useWizard";

interface StepIndicatorProps {
  currentStep: WizardStep;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="py-6">
      <div className="flex items-start gap-1">
        {STEP_LABELS.map((label, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <div key={label} className="flex-1 flex flex-col gap-2">
              <div
                className={cn(
                  "h-0.5 rounded-full transition-all duration-500",
                  isCompleted ? "bg-primary" : isCurrent ? "bg-primary/50" : "bg-border"
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide transition-colors hidden sm:block",
                  isCurrent ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
