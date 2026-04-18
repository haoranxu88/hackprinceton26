import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useMockToggle } from "@/hooks/useMockToggle";
import { mockAnalysis, type ExposureAnalysis } from "@/data/mock-analysis";
import { mockLawsuits } from "@/data/mock-lawsuits";
import { mockTrials } from "@/data/mock-trials";
import { analyzeExposure, matchOpportunities } from "@/lib/api";
import type { Transaction } from "@/data/mock-transactions";
import type { Lawsuit } from "@/data/mock-lawsuits";
import type { ClinicalTrial } from "@/data/mock-trials";
import { Scan, FlaskConical, AlertTriangle, CheckCircle2 } from "lucide-react";

interface AnalysisStepProps {
  transactions: Transaction[];
  onComplete: (analysis: ExposureAnalysis, lawsuits: Lawsuit[], trials: ClinicalTrial[]) => void;
}

const STAGES = [
  { label: "Scanning product labels", icon: Scan, duration: 1200 },
  { label: "Cross-referencing EPA chemical database", icon: FlaskConical, duration: 1500 },
  { label: "Calculating exposure scores", icon: AlertTriangle, duration: 1000 },
  { label: "Matching legal & clinical opportunities", icon: CheckCircle2, duration: 800 },
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
  const completedRef = useRef(false);

  useEffect(() => {
    if (completedRef.current) return;

    const runAnalysis = async () => {
      if (isMock) {
        // Animate through stages with mock data
        for (let i = 0; i < STAGES.length; i++) {
          setStage(i);
          const startProgress = (i / STAGES.length) * 100;
          const endProgress = ((i + 1) / STAGES.length) * 100;

          // Animate progress within stage
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
          // Real API flow
          setStage(0);
          setProgress(10);
          const allProducts = transactions.flatMap((t) =>
            t.products.map((p) => ({ name: p.name, description: p.description }))
          );

          setStage(1);
          setProgress(30);
          const analysisResult = await analyzeExposure(allProducts);

          setStage(2);
          setProgress(60);
          const chemicals = analysisResult?.chemicals?.map(
            (c: { chemical: string }) => c.chemical
          ) ?? [];

          setStage(3);
          setProgress(80);
          const opportunities = await matchOpportunities(chemicals);

          setProgress(100);
          completedRef.current = true;
          onComplete(
            analysisResult ?? mockAnalysis,
            opportunities?.lawsuits ?? mockLawsuits,
            opportunities?.trials ?? mockTrials
          );
        } catch (err) {
          console.error("Analysis error, falling back to mock:", err);
          completedRef.current = true;
          onComplete(mockAnalysis, mockLawsuits, mockTrials);
        }
      }
    };

    runAnalysis();
  }, [isMock, transactions, onComplete]);

  // Discover chemicals one by one
  useEffect(() => {
    if (discoveredIdx >= DISCOVERED_CHEMICALS.length) return;
    const timer = setTimeout(() => {
      setDiscoveredIdx((prev) => prev + 1);
    }, 700);
    return () => clearTimeout(timer);
  }, [discoveredIdx]);

  const currentStage = STAGES[Math.min(stage, STAGES.length - 1)];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-[70vh] px-4"
    >
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <currentStage.icon className="w-9 h-9 text-primary" />
        </div>
        <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-primary/30 animate-pulse-ring" />
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2 text-center">
        Analyzing Your Products
      </h2>
      <p className="text-muted-foreground text-sm mb-6 text-center max-w-md">
        {currentStage.label}...
      </p>

      <div className="w-full max-w-sm mb-8">
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {Math.round(progress)}% complete
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-lg">
        <AnimatePresence>
          {DISCOVERED_CHEMICALS.slice(0, discoveredIdx).map((chem) => (
            <motion.div
              key={chem}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <Badge
                variant={
                  chem === "Benzene" || chem.includes("Talc")
                    ? "critical"
                    : chem === "Formaldehyde"
                      ? "high"
                      : "moderate"
                }
                className="text-xs"
              >
                {chem}
              </Badge>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <p className="text-xs text-muted-foreground mt-6">
        Scanning {transactions.reduce((sum, t) => sum + t.products.length, 0)} products across {transactions.length} orders
      </p>
    </motion.div>
  );
}
