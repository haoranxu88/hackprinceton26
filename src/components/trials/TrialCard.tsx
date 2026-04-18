import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ClinicalTrial } from "@/data/mock-trials";
import { Heart, ChevronDown, ChevronUp, MapPin } from "lucide-react";

interface TrialCardProps {
  trial: ClinicalTrial;
}

export function TrialCard({ trial }: TrialCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="py-6">
      <div className="flex items-start justify-between gap-6">
        {/* Left: main info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-3 mb-2">
            <span className="font-display font-bold text-xl text-foreground leading-none">
              {trial.phase}
            </span>
            <Badge
              variant={trial.status === "recruiting" ? "default" : "secondary"}
              className="text-[10px]"
            >
              {trial.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {trial.eligibilityMatch}% eligibility match
            </span>
          </div>

          <p className="font-semibold text-foreground text-sm mb-0.5">{trial.title}</p>
          <p className="text-sm text-muted-foreground mb-3">
            {trial.sponsor} &middot; {trial.condition}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {trial.linkedChemicals.map((c) => (
              <Badge key={c} variant="high" className="text-[10px]">
                {c} exposure
              </Badge>
            ))}
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {trial.molecule.split(" ")[0]}
            </Badge>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex flex-col items-end gap-3 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs font-semibold">
            <Heart className="w-3 h-3" />
            Express Interest
          </Button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground hover:no-underline transition-colors flex items-center gap-1"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="mt-5 pt-5 border-t border-border space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{trial.description}</p>

          <div className="flex flex-wrap items-center gap-2">
            <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
            {trial.locations.map((loc) => (
              <Badge key={loc} variant="secondary" className="text-[10px]">
                {loc}
              </Badge>
            ))}
          </div>

          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Compensation
              </p>
              <p className="text-sm text-foreground">{trial.compensation}</p>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">{trial.nctId}</p>
          </div>
        </div>
      )}
    </div>
  );
}
