import { Badge } from "@/components/ui/badge";
import type { Transaction } from "@/data/mock-transactions";
import type { ChemicalExposure } from "@/data/mock-analysis";
import { AlertTriangle, ShoppingBag } from "lucide-react";

interface ProductTimelineProps {
  transactions: Transaction[];
  chemicals: ChemicalExposure[];
}

export function ProductTimeline({ transactions, chemicals }: ProductTimelineProps) {
  const flaggedProductNames = new Set(chemicals.flatMap((c) => c.products));

  const flaggedItems = transactions.flatMap((txn) =>
    txn.products
      .filter((p) => flaggedProductNames.has(p.name))
      .map((p) => ({
        ...p,
        merchant: txn.merchant,
        date: txn.datetime,
        matchedChemicals: chemicals
          .filter((c) => c.products.includes(p.name))
          .map((c) => ({ name: c.chemical, level: c.riskLevel })),
      }))
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
      {flaggedItems.map((item, idx) => (
        <div key={idx} className="flex gap-3 relative">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            {idx < flaggedItems.length - 1 && (
              <div className="w-px h-full bg-border mt-1" />
            )}
          </div>
          <div className="pb-4 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {item.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ShoppingBag className="w-3 h-3" />
                {item.merchant}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(item.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.matchedChemicals.map((chem) => (
                <Badge
                  key={chem.name}
                  variant={chem.level as "safe" | "moderate" | "high" | "critical"}
                  className="text-[10px] py-0"
                >
                  {chem.name}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
