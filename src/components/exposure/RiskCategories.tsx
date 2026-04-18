import type { ChemicalExposure } from "@/data/mock-analysis";
import { Droplets, Wind, Cookie } from "lucide-react";

interface RiskCategoriesProps {
  chemicals: ChemicalExposure[];
}

export function RiskCategories({ chemicals }: RiskCategoriesProps) {
  const routes = [
    {
      label: "Dermal",
      icon: Droplets,
      count: chemicals.filter((c) => c.exposureRoute === "dermal").length,
      percentage: chemicals.length
        ? Math.round((chemicals.filter((c) => c.exposureRoute === "dermal").length / chemicals.length) * 100)
        : 0,
      description: "Absorbed through skin contact",
    },
    {
      label: "Inhalation",
      icon: Wind,
      count: chemicals.filter((c) => c.exposureRoute === "inhalation").length,
      percentage: chemicals.length
        ? Math.round((chemicals.filter((c) => c.exposureRoute === "inhalation").length / chemicals.length) * 100)
        : 0,
      description: "Breathed in as vapors",
    },
    {
      label: "Ingestion",
      icon: Cookie,
      count: chemicals.filter((c) => c.exposureRoute === "ingestion").length,
      percentage: chemicals.length
        ? Math.round((chemicals.filter((c) => c.exposureRoute === "ingestion").length / chemicals.length) * 100)
        : 0,
      description: "Consumed orally",
    },
  ];

  return (
    <div className="space-y-4">
      {routes.map((route) => (
        <div key={route.label}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <route.icon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground font-body">{route.label}</span>
            </div>
            <span className="text-xs text-muted-foreground font-body">
              {route.count} chemical{route.count !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground/60"
              style={{ width: `${route.percentage}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 font-body">{route.description}</p>
        </div>
      ))}
    </div>
  );
}
