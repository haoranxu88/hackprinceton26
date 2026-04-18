import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToxicLoadGauge } from "@/components/exposure/ToxicLoadGauge";
import { ChemicalBreakdown } from "@/components/exposure/ChemicalBreakdown";
import { ProductTimeline } from "@/components/exposure/ProductTimeline";
import { RiskCategories } from "@/components/exposure/RiskCategories";
import type { ExposureAnalysis } from "@/data/mock-analysis";
import type { Transaction } from "@/data/mock-transactions";
import { AlertTriangle, ArrowRight, FlaskConical, Package } from "lucide-react";

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

export function ExposureDashboard({ analysis, transactions, onNext, onBack }: ExposureDashboardProps) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.1 }}
      className="max-w-4xl mx-auto px-4 py-4 space-y-6"
    >
      {/* Header stats */}
      <motion.div variants={item} className="text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
          Exposure Report
        </h2>
        <p className="text-muted-foreground text-sm">
          Based on {analysis.totalProductsScanned} products scanned from your purchase history
        </p>
      </motion.div>

      {/* Alert banner */}
      {analysis.riskLevel !== "safe" && (
        <motion.div variants={item}>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {analysis.flaggedProducts} of {analysis.totalProductsScanned} products flagged
              </p>
              <p className="text-xs text-muted-foreground">
                {analysis.chemicals.length} hazardous chemicals detected across your purchase history
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Gauge + Risk Categories */}
        <motion.div variants={item} className="space-y-5">
          <Card>
            <CardContent className="p-6 flex justify-center">
              <ToxicLoadGauge score={analysis.overallScore} percentile={analysis.percentile} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-primary" />
                Exposure Routes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <RiskCategories chemicals={analysis.chemicals} />
            </CardContent>
          </Card>
        </motion.div>

        {/* Center: Chemical Breakdown Chart */}
        <motion.div variants={item} className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-primary" />
                Chemical Concentration Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <ChemicalBreakdown chemicals={analysis.chemicals} />
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-2">
                {analysis.chemicals.map((c) => (
                  <Badge
                    key={c.chemical}
                    variant={c.riskLevel as "safe" | "moderate" | "high" | "critical"}
                    className="text-[10px]"
                  >
                    {c.chemical}: {c.category.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                Flagged Products Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <ProductTimeline transactions={transactions} chemicals={analysis.chemicals} />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Navigation */}
      <motion.div variants={item} className="flex gap-3 pt-2">
        <Button variant="ghost" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button variant="hero" size="lg" onClick={onNext} className="flex-1 gap-2">
          See Your Opportunities
          <ArrowRight className="w-4 h-4" />
        </Button>
      </motion.div>
    </motion.div>
  );
}
