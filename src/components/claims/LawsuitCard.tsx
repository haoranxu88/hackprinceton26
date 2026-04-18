import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Lawsuit } from "@/data/mock-lawsuits";
import { Scale, Clock, ChevronDown, ChevronUp, FileText } from "lucide-react";

interface LawsuitCardProps {
  lawsuit: Lawsuit;
}

export function LawsuitCard({ lawsuit }: LawsuitCardProps) {
  const [expanded, setExpanded] = useState(false);

  const daysUntilDeadline = lawsuit.deadline !== "TBD"
    ? Math.max(0, Math.ceil((new Date(lawsuit.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <Card className="overflow-hidden hover:shadow-elegant transition-all duration-300">
      <CardHeader className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm leading-tight">{lawsuit.title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">vs. {lawsuit.defendant}</p>
            </div>
          </div>
          <Badge variant={lawsuit.status === "active" ? "default" : "secondary"} className="shrink-0 text-[10px]">
            {lawsuit.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Settlement</p>
            <p className="text-sm font-bold text-foreground">{lawsuit.settlementAmount}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Match</p>
            <p className="text-sm font-bold text-primary">{lawsuit.matchConfidence}%</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Deadline</p>
            <p className="text-sm font-bold text-foreground flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" />
              {daysUntilDeadline !== null ? `${daysUntilDeadline}d` : "TBD"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {lawsuit.matchedChemicals.map((c) => (
            <Badge key={c} variant="critical" className="text-[10px]">{c}</Badge>
          ))}
          {lawsuit.matchedProducts.map((p) => (
            <Badge key={p} variant="outline" className="text-[10px] text-foreground">{p}</Badge>
          ))}
        </div>

        {expanded && (
          <>
            <Separator />
            <p className="text-xs text-muted-foreground leading-relaxed">{lawsuit.description}</p>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Payout Tiers:</p>
              {lawsuit.payoutTiers.map((tier) => (
                <div key={tier.tier} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{tier.tier}</p>
                    <p className="text-muted-foreground">{tier.requirement}</p>
                  </div>
                  <span className="font-bold text-primary">{tier.amount}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="px-4 pb-4 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-xs gap-1"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Less" : "Details"}
        </Button>
        <Button variant="default" size="sm" className="ml-auto gap-1 text-xs">
          <FileText className="w-3 h-3" />
          File Claim
        </Button>
      </CardFooter>
    </Card>
  );
}
