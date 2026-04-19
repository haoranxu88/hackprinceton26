import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileClaimDialog } from "@/components/claims/FileClaimDialog";
import type { Lawsuit } from "@/data/mock-lawsuits";
import { FileText, Clock } from "lucide-react";

interface LawsuitCardProps {
  lawsuit: Lawsuit;
}

export function LawsuitCard({ lawsuit }: LawsuitCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

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
            {(() => {
              const matchedOn = Array.isArray(lawsuit.matchedOn) ? lawsuit.matchedOn : [];
              const isProduct = lawsuit.matchType === "product";
              return (
                <Badge
                  variant={isProduct ? "safe" : "moderate"}
                  className="text-[10px]"
                  title={matchedOn.length > 0 ? `Matched on: ${matchedOn.join(", ")}` : undefined}
                >
                  {isProduct ? "Product matched" : "Chemical matched"}
                </Badge>
              );
            })()}
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
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="gap-1.5 text-xs font-semibold"
          >
            <FileText className="w-3 h-3" />
            Help Me File a Claim
          </Button>
        </div>
      </div>

      <FileClaimDialog
        lawsuit={lawsuit}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
