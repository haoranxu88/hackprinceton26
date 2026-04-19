import { motion } from "framer-motion";
import { AlertOctagon, Flame } from "lucide-react";
import type { ChemicalExposure } from "@/data/mock-analysis";
import {
  getRiskColor,
  rankConditionsByExposure,
  type ConditionRisk,
} from "@/lib/exposure-calculator";

interface TopRiskConditionsProps {
  chemicals: ChemicalExposure[];
  healthEffects: { chemical: string; conditions: string[] }[];
}

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

function formatConcentration(ppm: number): string {
  if (ppm >= 1) return `${ppm.toFixed(1)} ppm`;
  if (ppm >= 0.01) return `${ppm.toFixed(2)} ppm`;
  return `${ppm.toFixed(3)} ppm`;
}

function contextLine(driver: ChemicalExposure): string {
  const freq = driver.frequency >= 30 ? "daily" : `${driver.frequency}×/month`;
  return `${formatConcentration(driver.concentrationPpm)} · ${freq} · ${driver.contactTimeHrs}h contact`;
}

function RankCard({
  rank,
  risk,
  relativeScore,
}: {
  rank: number;
  risk: ConditionRisk;
  relativeScore: number;
}) {
  const color = getRiskColor(risk.riskLevel);
  const otherContributors = risk.contributors.slice(1, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_EXPO, delay: rank * 0.08 }}
      className="relative rounded-xl border border-border bg-card/60 px-5 py-4 overflow-hidden"
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold font-tabular"
              style={{ backgroundColor: color, color: "white" }}
            >
              {rank + 1}
            </span>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              {risk.riskLevel} risk
            </p>
          </div>
          <p className="text-base font-semibold text-foreground leading-snug mb-1.5">
            {risk.condition}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Driven by{" "}
            <span className="font-medium text-foreground">{risk.driver.chemical}</span>{" "}
            — {contextLine(risk.driver)}
          </p>
          {otherContributors.length > 0 && (
            <p className="text-[11px] text-muted-foreground/80 mt-1">
              Also contributing: {otherContributors.map((c) => c.chemical).join(", ")}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end shrink-0">
          <div className="flex items-baseline gap-0.5">
            <span
              className="font-display font-bold text-2xl font-tabular leading-none"
              style={{ color }}
            >
              {Math.round(relativeScore)}
            </span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
            exposure
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export function TopRiskConditions({ chemicals, healthEffects }: TopRiskConditionsProps) {
  const ranked = rankConditionsByExposure(chemicals, healthEffects, 3);

  if (ranked.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Not enough exposure signal to rank individual conditions yet.
      </div>
    );
  }

  // Normalize against the top score so the user sees relative severity.
  const topScore = ranked[0].score || 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Flame className="w-3.5 h-3.5 text-orange-500" />
        <span>
          Ranked by dose — ppm × skin permeability × contact time × frequency, weighted by
          chemical class.
        </span>
      </div>
      <div className="grid gap-3">
        {ranked.map((risk, i) => (
          <RankCard
            key={risk.condition}
            rank={i}
            risk={risk}
            relativeScore={(risk.score / topScore) * 100}
          />
        ))}
      </div>
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80">
        <AlertOctagon className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          Scores are a relative ranking across your cart, not a clinical diagnosis. Consult a
          medical professional for individualized risk assessment.
        </span>
      </p>
    </div>
  );
}
