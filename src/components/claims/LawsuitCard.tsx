import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Lawsuit } from "@/data/mock-lawsuits";
import { FileText, ChevronDown, ChevronUp, Clock } from "lucide-react";

interface LawsuitCardProps {
  lawsuit: Lawsuit;
}

export function LawsuitCard({ lawsuit }: LawsuitCardProps) {
  const [expanded, setExpanded] = useState(false);

  const daysUntilDeadline =
    lawsuit.deadline !== "TBD"
      ? Math.max(
          0,
          Math.ceil((new Date(lawsuit.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        )
      : null;

  return (
    <div className="py-6">
      <div className="flex items-start justify-between gap-6">
        {/* Left: main info */}
        <div className="flex-1 min-w-0">
          {/* Settlement amount as hero */}
          <div className="flex flex-wrap items-baseline gap-3 mb-2">
            <span className="font-display font-bold text-2xl text-foreground leading-none">
              {lawsuit.settlementAmount}
            </span>
            <Badge
              variant={lawsuit.status === "active" ? "default" : "secondary"}
              className="text-[10px]"
            >
              {lawsuit.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {lawsuit.matchConfidence}% match
            </span>
          </div>

          <p className="font-semibold text-foreground text-sm mb-0.5">{lawsuit.title}</p>
          <p className="text-sm text-muted-foreground mb-3">vs. {lawsuit.defendant}</p>

          {/* Chemical tags */}
          <div className="flex flex-wrap gap-1.5">
            {lawsuit.matchedChemicals.map((c) => (
              <Badge key={c} variant="critical" className="text-[10px]">
                {c}
              </Badge>
            ))}
            {lawsuit.matchedProducts.map((p) => (
              <Badge key={p} variant="outline" className="text-[10px] text-muted-foreground">
                {p}
              </Badge>
            ))}
          </div>
        </div>

        {/* Right: deadline + actions */}
        <div className="flex flex-col items-end gap-3 shrink-0">
          {daysUntilDeadline !== null && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {daysUntilDeadline > 0 ? `${daysUntilDeadline}d left` : "Deadline passed"}
            </p>
          )}
          <Button size="sm" className="gap-1.5 text-xs font-semibold">
            <FileText className="w-3 h-3" />
            File Claim
          </Button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground hover:no-underline transition-colors flex items-center gap-1"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : "Payout tiers"}
          </button>
        </div>
      </div>

      {/* Expanded: description + payout tiers */}
      {expanded && (
        <div className="mt-5 pt-5 border-t border-border space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{lawsuit.description}</p>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Payout Tiers
            </p>
            <div className="space-y-0 divide-y divide-border">
              {lawsuit.payoutTiers.map((tier) => (
                <div key={tier.tier} className="flex items-start justify-between py-3 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{tier.tier}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tier.requirement}</p>
                  </div>
                  <span className="font-display font-bold text-primary text-sm shrink-0">
                    {tier.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
