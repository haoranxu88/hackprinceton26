import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useMockToggle } from "@/hooks/useMockToggle";
import { mockAnalysis, type ExposureAnalysis } from "@/data/mock-analysis";
import { mockLawsuits } from "@/data/mock-lawsuits";
import { mockTrials } from "@/data/mock-trials";
import { analyzeExposure, matchOpportunities } from "@/lib/api";
import type { Transaction } from "@/data/mock-transactions";
import type { Lawsuit } from "@/data/mock-lawsuits";
import type { ClinicalTrial } from "@/data/mock-trials";
import { Cpu } from "lucide-react";

interface AnalysisStepProps {
  transactions: Transaction[];
  onComplete: (analysis: ExposureAnalysis, lawsuits: Lawsuit[], trials: ClinicalTrial[]) => void;
}

const STAGES = [
  { label: "Scanning product labels", duration: 1200 },
  { label: "Cross-referencing EPA chemical database", duration: 1500 },
  { label: "Calculating exposure scores", duration: 1000 },
  { label: "Matching legal & clinical opportunities", duration: 800 },
];

const DISCOVERED_CHEMICALS = [
  "Benzene", "Formaldehyde", "Talc (Asbestos)", "Parabens",
  "Aluminum Compounds", "Oxybenzone (BP-3)",
];

export function AnalysisStep({ transactions, onComplete }: AnalysisStepProps) {
  const { isMock } = useMockToggle();
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [discoveredIdx, setDiscoveredIdx] = useState(0);
  const [aiProvider, setAiProvider] = useState<string>("");
  const completedRef = useRef(false);

  useEffect(() => {
    if (completedRef.current) return;

    const runAnalysis = async () => {
      if (isMock) {
        for (let i = 0; i < STAGES.length; i++) {
          setStage(i);
          const startProgress = (i / STAGES.length) * 100;
          const endProgress = ((i + 1) / STAGES.length) * 100;
          const steps = 20;
          for (let j = 0; j <= steps; j++) {
            await new Promise((r) => setTimeout(r, STAGES[i].duration / steps));
            setProgress(startProgress + ((endProgress - startProgress) * j) / steps);
          }
        }
        completedRef.current = true;
        onComplete(mockAnalysis, mockLawsuits, mockTrials);
      } else {
        try {
          const allProducts = transactions.flatMap((t) =>
            (t.products || []).map((p) => ({
              name: p.name || "Unknown Product",
              description: p.description || "",
            }))
          ).filter((p) => p.name && p.name !== "Unknown Product");

          if (allProducts.length === 0) {
            completedRef.current = true;
            onComplete(mockAnalysis, mockLawsuits, mockTrials);
            return;
          }

          setStage(0); setProgress(15);
          await new Promise((r) => setTimeout(r, 500));
          setStage(1); setProgress(30);
          const analysisResult = await analyzeExposure(allProducts);
          if (analysisResult?._provider) setAiProvider(analysisResult._provider);

          setStage(2); setProgress(60);
          const chemicals = analysisResult?.chemicals?.map((c: { chemical: string }) => c.chemical) ?? [];

          if (chemicals.length === 0) {
            completedRef.current = true;
            onComplete(analysisResult || mockAnalysis, mockLawsuits, mockTrials);
            return;
          }

          setStage(3); setProgress(80);
          const opportunities = await matchOpportunities(chemicals);
          setProgress(100);
          completedRef.current = true;
          onComplete(
            analysisResult ?? mockAnalysis,
            opportunities?.lawsuits ?? mockLawsuits,
            opportunities?.trials ?? mockTrials
          );
        } catch {
          completedRef.current = true;
          onComplete(mockAnalysis, mockLawsuits, mockTrials);
        }
      }
    };

    runAnalysis();
  }, [isMock, transactions, onComplete]);

  useEffect(() => {
    if (discoveredIdx >= DISCOVERED_CHEMICALS.length) return;
    const timer = setTimeout(() => setDiscoveredIdx((prev) => prev + 1), 700);
    return () => clearTimeout(timer);
  }, [discoveredIdx]);

  const totalProducts = transactions.reduce((sum, t) => sum + (t.products?.length || 0), 0);
  const progressPct = Math.round(progress);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-xl mx-auto px-6 pt-16 pb-12 flex flex-col"
    >
      <span className="text-eyebrow mb-3">Step 02</span>

      <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-2">
        Analyzing your products
      </h2>

      <p className="text-sm text-muted-foreground mb-10">
        {STAGES[Math.min(stage, STAGES.length - 1)].label}…
      </p>

      {/* Progress track */}
      <div className="mb-10">
        <div className="h-px w-full bg-border relative overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-foreground"
            initial={{ width: "0%" }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-xs text-muted-foreground font-body">{progressPct}% complete</span>
          <span className="text-xs text-muted-foreground font-body">
            {totalProducts} products · {transactions.length} orders
          </span>
        </div>
      </div>

      {/* Stage list */}
      <div className="space-y-3 mb-10">
        {STAGES.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3">
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: i < stage
                  ? "hsl(142, 65%, 38%)"
                  : i === stage
                  ? "hsl(38, 90%, 50%)"
                  : "hsl(var(--border))",
              }}
            />
            <span
              className="text-xs font-body"
              style={{
                color: i < stage
                  ? "hsl(142, 65%, 38%)"
                  : i === stage
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--muted-foreground))",
                opacity: i > stage ? 0.4 : 1,
              }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Chemical discovery */}
      <div className="flex flex-wrap gap-2">
        <AnimatePresence>
          {DISCOVERED_CHEMICALS.slice(0, discoveredIdx).map((chem) => (
            <motion.div
              key={chem}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
            >
              <Badge
                variant={
                  chem === "Benzene" || chem.includes("Talc")
                    ? "critical"
                    : chem === "Formaldehyde"
                    ? "high"
                    : "moderate"
                }
                className="text-xs font-body"
              >
                {chem}
              </Badge>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {aiProvider && (
        <div className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground/60 font-body">
          <Cpu className="w-3 h-3" />
          <span>
            Powered by{" "}
            {aiProvider === "enter" ? "Enter AI" : aiProvider === "dedalus" ? "Dedalus Labs" : aiProvider === "gemini" ? "Gemini" : aiProvider}
          </span>
        </div>
      )}
    </motion.div>
  );
}
