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

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

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

const DISCOVERED_CHEMICALS: Array<{
  name: string;
  variant: "safe" | "moderate" | "high" | "critical";
}> = [
  { name: "Benzene", variant: "critical" },
  { name: "Formaldehyde", variant: "high" },
  { name: "Talc (Asbestos)", variant: "high" },
  { name: "Parabens", variant: "moderate" },
  { name: "Aluminum Compounds", variant: "moderate" },
  { name: "Oxybenzone (BP-3)", variant: "moderate" },
];

export function AnalysisStep({ transactions, onComplete }: AnalysisStepProps) {
  const { isMock } = useMockToggle();
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [discoveredIdx, setDiscoveredIdx] = useState(0);
  const [aiProvider, setAiProvider] = useState<string>("");
  const completedRef = useRef(false);
  const totalProducts = transactions.reduce((s, t) => s + (t.products?.length || 0), 0);

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
    const timer = setTimeout(() => setDiscoveredIdx((p) => p + 1), 750);
    return () => clearTimeout(timer);
  }, [discoveredIdx]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] px-6 text-center"
    >
      {/* Large percentage counter */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE_EXPO }}
        className="font-display font-bold text-primary font-tabular leading-none mb-2"
        style={{ fontSize: "clamp(5rem, 20vw, 12rem)" }}
      >
        {Math.round(progress)}
        <span className="text-[0.35em] text-muted-foreground">%</span>
      </motion.div>

      {/* Thin progress bar */}
      <div className="w-full max-w-xs h-px bg-border mb-8 relative overflow-hidden rounded-full">
        <motion.div
          className="absolute inset-y-0 left-0 bg-primary rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>

      {/* Stage label */}
      <AnimatePresence mode="wait">
        <motion.p
          key={stage}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="text-sm font-medium text-foreground mb-2"
        >
          {STAGES[Math.min(stage, STAGES.length - 1)].label}
        </motion.p>
      </AnimatePresence>

      <p className="text-xs text-muted-foreground mb-12">
        {totalProducts} products across {transactions.length} orders
      </p>

      {/* Discovered chemicals */}
      <div className="flex flex-wrap justify-center gap-2 max-w-sm">
        <AnimatePresence>
          {DISCOVERED_CHEMICALS.slice(0, discoveredIdx).map(({ name, variant }) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: EASE_EXPO }}
            >
              <Badge variant={variant} className="text-xs">
                {name}
              </Badge>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {aiProvider && (
        <div className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground/60">
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
