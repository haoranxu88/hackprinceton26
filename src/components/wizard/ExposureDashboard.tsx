import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChemicalBreakdown } from "@/components/exposure/ChemicalBreakdown";
import { ProductTimeline } from "@/components/exposure/ProductTimeline";
import { RiskCategories } from "@/components/exposure/RiskCategories";
import type { ExposureAnalysis } from "@/data/mock-analysis";
import type { Transaction } from "@/data/mock-transactions";
import { ArrowRight, ArrowLeft, AlertTriangle } from "lucide-react";
import { getChemicalHealthEffects } from "@/lib/api";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

interface ExposureDashboardProps {
  analysis: ExposureAnalysis;
  transactions: Transaction[];
  onNext: () => void;
  onBack: () => void;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_EXPO } },
};

type HealthEffect = { chemical: string; conditions: string[] };

export function ExposureDashboard({ analysis, transactions, onNext, onBack }: ExposureDashboardProps) {
  const [healthEffects, setHealthEffects] = useState<HealthEffect[] | null>(null);
  const [healthEffectsError, setHealthEffectsError] = useState(false);
  const [healthEffectsLoading, setHealthEffectsLoading] = useState(true);

  useEffect(() => {
    const chemicals = analysis.chemicals.map((c) => c.chemical);
    if (!chemicals.length) {
      setHealthEffectsLoading(false);
      return;
    }
    getChemicalHealthEffects(chemicals)
      .then((data) => {
        setHealthEffects(data.effects ?? []);
      })
      .catch(() => {
        setHealthEffectsError(true);
      })
      .finally(() => {
        setHealthEffectsLoading(false);
      });
  }, [analysis.chemicals]);

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -12 }}
      className="max-w-4xl mx-auto px-2 py-8"
    >
      {/* Hero section */}
      <motion.div variants={fadeUp} className="mb-12">
        <p className="text-eyebrow mb-6">Exposure Report</p>

        <h2
          className="font-display font-bold leading-[0.92] tracking-tight text-foreground mb-6"
          style={{ fontSize: "clamp(2rem, 5vw, 3.75rem)" }}
        >
          {analysis.flaggedProducts} of your {analysis.totalProductsScanned} scanned
          <br />
          products contain hazardous chemicals.
        </h2>

        <p className="text-lg text-muted-foreground leading-relaxed mb-8" style={{ maxWidth: "58ch" }}>
          {analysis.chemicals.length} substances identified — including carcinogens and
          endocrine disruptors. You may have grounds for legal recourse.
        </p>

        {/* Four-stat row */}
        <div className="flex flex-wrap gap-8 pt-8 border-t border-border">
          <div>
            <p className="font-display font-bold text-foreground text-3xl leading-none mb-1.5">
              {analysis.chemicals.length}
            </p>
            <p className="text-xs text-muted-foreground">Chemicals detected</p>
          </div>
          <div>
            <p className="font-display font-bold text-foreground text-3xl leading-none mb-1.5">
              {analysis.flaggedProducts}
            </p>
            <p className="text-xs text-muted-foreground">Products flagged</p>
          </div>
        </div>
      </motion.div>

      {/* Chemical badges */}
      <motion.div variants={fadeUp} className="flex flex-wrap gap-2 mb-10">
        {analysis.chemicals.map((c) => (
          <Badge
            key={c.chemical}
            variant={c.riskLevel as "safe" | "moderate" | "high" | "critical"}
            className="text-xs"
          >
            {c.chemical} — {c.category.replace("_", " ")}
          </Badge>
        ))}
      </motion.div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        <motion.div variants={fadeUp} className="space-y-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Exposure Routes
            </p>
            <RiskCategories chemicals={analysis.chemicals} />
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="lg:col-span-2 space-y-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Chemical Concentration Analysis
            </p>
            <ChemicalBreakdown chemicals={analysis.chemicals} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Flagged Products Timeline
            </p>
            <ProductTimeline transactions={transactions} chemicals={analysis.chemicals} />
          </div>
        </motion.div>
      </div>

      {/* What these chemicals can cause */}
      <motion.div variants={fadeUp} className="mb-10">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          What These Chemicals Can Cause
        </p>
        {healthEffectsLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <span className="inline-block w-3 h-3 rounded-full bg-muted-foreground/30 animate-pulse" />
            Retrieving health risk data…
          </div>
        )}
        {!healthEffectsLoading && healthEffectsError && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-orange-400" />
            <span>We were unable to retrieve the health conditions associated with these chemicals. Please consult a medical professional for guidance on exposure risks.</span>
          </div>
        )}
        {!healthEffectsLoading && !healthEffectsError && healthEffects && (
          <div className="space-y-4">
            {healthEffects.map(({ chemical, conditions }) => (
              <div key={chemical} className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                <p className="text-sm font-semibold text-foreground mb-2">{chemical}</p>
                <div className="flex flex-wrap gap-1.5">
                  {conditions.map((condition) => (
                    <span
                      key={condition}
                      className="inline-block rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs text-destructive font-medium"
                    >
                      {condition}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Navigation */}
      <motion.div variants={fadeUp} className="flex items-center gap-4 pt-4 border-t border-border">
        <Button
          variant="ghost"
          onClick={onBack}
          className="gap-1.5 text-sm px-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Button>
        <Button size="lg" onClick={onNext} className="group gap-2 font-semibold ml-auto">
          See What You're Owed
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </motion.div>
    </motion.div>
  );
}
