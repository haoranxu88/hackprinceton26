import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChemicalBreakdown } from "@/components/exposure/ChemicalBreakdown";
import { ProductTimeline } from "@/components/exposure/ProductTimeline";
import { RiskCategories } from "@/components/exposure/RiskCategories";
import type { ExposureAnalysis } from "@/data/mock-analysis";
import type { Transaction } from "@/data/mock-transactions";
import { getRiskColor } from "@/lib/exposure-calculator";
import { ArrowRight } from "lucide-react";

interface ExposureDashboardProps {
  analysis: ExposureAnalysis;
  transactions: Transaction[];
  onNext: () => void;
  onBack: () => void;
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const riskLabels: Record<string, string> = {
  safe: "Low Risk",
  moderate: "Moderate Risk",
  high: "High Risk",
  critical: "Critical Risk",
};

export function ExposureDashboard({ analysis, transactions, onNext, onBack }: ExposureDashboardProps) {
  const riskColor = getRiskColor(analysis.riskLevel);

  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.08 }}
      className="max-w-3xl mx-auto px-6 pt-10 pb-12"
    >
      <motion.div variants={item} className="mb-2">
        <span className="text-eyebrow">Exposure Report</span>
      </motion.div>

      {/* Hero score section */}
      <motion.div variants={item} className="mb-10 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-8">
          <div>
            <div
              className="font-display font-bold leading-none tracking-tight"
              style={{ fontSize: "clamp(5rem, 18vw, 9rem)", color: riskColor }}
            >
              {analysis.overallScore}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span
                className="text-xs font-semibold font-body px-2 py-0.5 rounded-sm"
                style={{
                  color: riskColor,
                  background: `color-mix(in srgb, ${riskColor} 12%, transparent)`,
                }}
              >
                {riskLabels[analysis.riskLevel] ?? analysis.riskLevel}
              </span>
              <span className="text-xs text-muted-foreground font-body">
                {analysis.percentile}th percentile
              </span>
            </div>
          </div>

          <div className="sm:ml-auto sm:text-right pb-1">
            <p className="text-sm font-semibold text-foreground">
              {analysis.flaggedProducts} of {analysis.totalProductsScanned} products flagged
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {analysis.chemicals.length} hazardous chemicals detected
            </p>
          </div>
        </div>

        {/* Score bar */}
        <div className="mt-6 h-1.5 w-full rounded-full overflow-hidden bg-muted">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${analysis.overallScore}%` }}
            transition={{ duration: 1.2, delay: 0.3 }}
            style={{ background: `linear-gradient(90deg, hsl(142,65%,38%), hsl(36,90%,50%), hsl(25,88%,52%), hsl(0,78%,54%))` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground font-body">
          <span>0 — Safe</span>
          <span>100 — Critical</span>
        </div>
      </motion.div>

      <motion.div variants={item} className="rule-top mb-8" />

      {/* Chemical badges */}
      <motion.div variants={item} className="mb-8">
        <p className="text-xs font-semibold text-foreground mb-3">Detected chemicals</p>
        <div className="flex flex-wrap gap-2">
          {analysis.chemicals.map((c) => (
            <Badge
              key={c.chemical}
              variant={c.riskLevel as "safe" | "moderate" | "high" | "critical"}
              className="text-xs font-body"
            >
              {c.chemical}
            </Badge>
          ))}
        </div>
      </motion.div>

      {/* Chemical concentration chart */}
      <motion.div variants={item} className="surface p-5 mb-5">
        <p className="text-xs font-semibold text-foreground mb-4">Chemical concentration (ppm)</p>
        <ChemicalBreakdown chemicals={analysis.chemicals} />
      </motion.div>

      {/* Two-column: exposure routes + flagged products */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        <div className="surface p-5">
          <p className="text-xs font-semibold text-foreground mb-4">Exposure routes</p>
          <RiskCategories chemicals={analysis.chemicals} />
        </div>
        <div className="surface p-5">
          <p className="text-xs font-semibold text-foreground mb-4">Flagged products</p>
          <ProductTimeline transactions={transactions} chemicals={analysis.chemicals} />
        </div>
      </motion.div>

      {/* Navigation */}
      <motion.div variants={item} className="flex gap-3">
        <Button variant="ghost" onClick={onBack} className="font-body">
          Back
        </Button>
        <Button variant="hero" size="lg" onClick={onNext} className="ml-auto gap-2 font-body">
          See your opportunities
          <ArrowRight className="w-4 h-4" />
        </Button>
      </motion.div>
    </motion.div>
  );
}
