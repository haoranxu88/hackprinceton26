import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ClinicalTrial } from "@/data/mock-trials";
import { MapPin, ChevronDown, ChevronUp, Heart } from "lucide-react";

interface TrialCardProps {
  trial: ClinicalTrial;
}

export function TrialCard({ trial }: TrialCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isRecruiting = trial.status === "recruiting";

  return (
    <div className="surface p-5 flex flex-col gap-4 transition-shadow duration-200 hover:shadow-card-hover">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug mb-0.5">{trial.title}</p>
          <p className="text-xs text-muted-foreground">{trial.sponsor}</p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-sm font-body ${
            isRecruiting ? "bg-accent/15 text-accent-foreground" : "bg-secondary text-muted-foreground"
          }`}
        >
          {trial.status}
        </span>
      </div>

      {/* Phase + molecule inline */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground font-body">
        <span className="font-semibold text-foreground">{trial.phase}</span>
        <span>·</span>
        <span>{trial.molecule.split(" ")[0]}</span>
        <span>·</span>
        <span>{trial.condition}</span>
      </div>

      {/* Eligibility match bar */}
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-body">Eligibility match</span>
          <span className="text-xs font-semibold text-foreground font-body">{trial.eligibilityMatch}%</span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-foreground/80"
            style={{ width: `${trial.eligibilityMatch}%` }}
          />
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {trial.linkedChemicals.map((c) => (
          <Badge key={c} variant="high" className="text-[10px] font-body">{c} exposure</Badge>
        ))}
      </div>

      {/* Locations */}
      {trial.locations.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-body">
          <MapPin className="w-3 h-3 shrink-0" />
          <span>{trial.locations.slice(0, 2).join(" · ")}{trial.locations.length > 2 ? ` +${trial.locations.length - 2}` : ""}</span>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="pt-1 border-t border-border/50 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed font-body">{trial.description}</p>
          <div className="text-xs font-body">
            <p className="font-semibold text-foreground mb-1">Compensation</p>
            <p className="text-muted-foreground">{trial.compensation}</p>
          </div>
          <p className="text-[10px] text-muted-foreground font-body">NCT ID: {trial.nctId}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-body"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Less" : "Details"}
        </button>
        <Button variant="hero" size="sm" className="ml-auto gap-1.5 text-xs font-body">
          <Heart className="w-3 h-3" />
          Express interest
        </Button>
      </div>
    </div>
  );
}
