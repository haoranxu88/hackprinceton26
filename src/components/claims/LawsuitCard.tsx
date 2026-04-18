import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Lawsuit } from "@/data/mock-lawsuits";
import { Clock, ChevronDown, ChevronUp, FileText } from "lucide-react";

interface LawsuitCardProps {
  lawsuit: Lawsuit;
}

export function LawsuitCard({ lawsuit }: LawsuitCardProps) {
  const [expanded, setExpanded] = useState(false);

  const daysUntilDeadline =
    lawsuit.deadline !== "TBD"
      ? Math.max(0, Math.ceil((new Date(lawsuit.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

  const isActive = lawsuit.status === "active";

  return (
    <div className="surface p-5 flex flex-col gap-4 transition-shadow duration-200 hover:shadow-card-hover">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug mb-0.5">{lawsuit.title}</p>
          <p className="text-xs text-muted-foreground">vs. {lawsuit.defendant}</p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-sm font-body ${
            isActive ? "bg-accent/15 text-accent-foreground" : "bg-secondary text-muted-foreground"
          }`}
        >
          {lawsuit.status}
        </span>
      </div>

      {/* Settlement — typographically prominent */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-body mb-1">Settlement</p>
        <p className="font-display text-2xl font-bold text-foreground">{lawsuit.settlementAmount}</p>
      </div>

      {/* Match confidence bar */}
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-body">Match confidence</span>
          <span className="text-xs font-semibold text-foreground font-body">{lawsuit.matchConfidence}%</span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-foreground/80"
            style={{ width: `${lawsuit.matchConfidence}%` }}
          />
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {lawsuit.matchedChemicals.map((c) => (
          <Badge key={c} variant="critical" className="text-[10px] font-body">{c}</Badge>
        ))}
        {lawsuit.matchedProducts.map((p) => (
          <Badge key={p} variant="outline" className="text-[10px] font-body text-foreground">{p}</Badge>
        ))}
      </div>

      {/* Deadline */}
      {daysUntilDeadline !== null && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-body">
          <Clock className="w-3 h-3" />
          <span>
            {daysUntilDeadline > 0 ? `${daysUntilDeadline} days until deadline` : "Deadline passed"}
          </span>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="pt-1 border-t border-border/50 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed font-body">{lawsuit.description}</p>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Payout tiers</p>
            <div className="space-y-1.5">
              {lawsuit.payoutTiers.map((tier) => (
                <div key={tier.tier} className="flex items-center justify-between text-xs py-2 border-t border-border/30 first:border-t-0">
                  <div>
                    <p className="font-medium text-foreground font-body">{tier.tier}</p>
                    <p className="text-muted-foreground font-body">{tier.requirement}</p>
                  </div>
                  <span className="font-semibold text-foreground font-body">{tier.amount}</span>
                </div>
              ))}
            </div>
          </div>
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
          <FileText className="w-3 h-3" />
          File claim
        </Button>
      </div>
    </div>
  );
}
