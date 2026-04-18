import { Card, CardContent } from "@/components/ui/card";
import { Droplets, Wind, Cookie } from "lucide-react";
import type { ChemicalExposure } from "@/data/mock-analysis";

interface RiskCategoriesProps {
  chemicals: ChemicalExposure[];
}

export function RiskCategories({ chemicals }: RiskCategoriesProps) {
  const routes = [
    {
      label: "Dermal",
      icon: Droplets,
      count: chemicals.filter((c) => c.exposureRoute === "dermal").length,
      percentage: Math.round(
        (chemicals.filter((c) => c.exposureRoute === "dermal").length / chemicals.length) * 100
      ),
      description: "Absorbed through skin contact",
    },
    {
      label: "Inhalation",
      icon: Wind,
      count: chemicals.filter((c) => c.exposureRoute === "inhalation").length,
      percentage: Math.round(
        (chemicals.filter((c) => c.exposureRoute === "inhalation").length / chemicals.length) * 100
      ),
      description: "Breathed in as vapors/particles",
    },
    {
      label: "Ingestion",
      icon: Cookie,
      count: chemicals.filter((c) => c.exposureRoute === "ingestion").length,
      percentage: Math.round(
        (chemicals.filter((c) => c.exposureRoute === "ingestion").length / chemicals.length) * 100
      ),
      description: "Consumed orally",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {routes.map((route) => (
        <Card key={route.label} className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <route.icon className="w-4 h-4 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground">{route.percentage}%</p>
            <p className="text-xs font-medium text-foreground">{route.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{route.count} chemicals</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
