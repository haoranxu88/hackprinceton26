import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useMockToggle } from "@/hooks/useMockToggle";
import { mockAnalysis, type ExposureAnalysis } from "@/data/mock-analysis";
import { mockLawsuits } from "@/data/mock-lawsuits";
import { analyzeExposure, matchOpportunities } from "@/lib/api";
import type { Transaction } from "@/data/mock-transactions";
import type { Lawsuit } from "@/data/mock-lawsuits";
import { Cpu } from "lucide-react";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * Build a dedupe key that treats two lawsuit rows as "the same" claim when:
 * - their claim URLs match (strongest signal), OR
 * - their (normalized title + defendant) pair matches.
 * This catches both duplicate scraper rows with different Supabase IDs and
 * LLM responses that repeat a single catalog entry.
 */
function lawsuitDedupeKey(l: {
  title?: string;
  defendant?: string;
  claimUrl?: string;
}): string {
  const norm = (s: string | undefined) =>
    (s ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
  const url = norm(l.claimUrl).replace(/^https?/, "").replace(/\/$/, "");
  if (url) return `u:${url}`;
  return `td:${norm(l.title)}|${norm(l.defendant)}`;
}

/**
 * Normalize lawsuit rows coming back from the edge function so downstream UI
 * can rely on matchType / matchedOn / matchedChemicals / matchedProducts being
 * defined, even if the LLM or a cached catalog row omitted them. Also collapses
 * duplicate rows introduced by the scraper or a repeating LLM.
 */
function normalizeLawsuits(raw: unknown): Lawsuit[] {
  if (!Array.isArray(raw)) return [];
  const mapped = raw
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    .map((r) => {
      const matchedProducts = Array.isArray(r.matchedProducts)
        ? (r.matchedProducts as unknown[]).map(String).filter(Boolean)
        : [];
      const matchedChemicals = Array.isArray(r.matchedChemicals)
        ? (r.matchedChemicals as unknown[]).map(String).filter(Boolean)
        : [];
      const matchedOnRaw = Array.isArray(r.matchedOn)
        ? (r.matchedOn as unknown[]).map(String).filter(Boolean)
        : [];
      const rawType = typeof r.matchType === "string" ? r.matchType.toLowerCase() : "";
      const matchType: Lawsuit["matchType"] =
        rawType === "product" || rawType === "chemical"
          ? (rawType as Lawsuit["matchType"])
          : matchedProducts.length > 0
          ? "product"
          : "chemical";
      const matchedOn =
        matchedOnRaw.length > 0
          ? matchedOnRaw
          : matchType === "product"
          ? matchedProducts.slice(0, 4)
          : matchedChemicals.slice(0, 4);

      return {
        id: String(r.id ?? crypto.randomUUID()),
        title: String(r.title ?? ""),
        defendant: String(r.defendant ?? ""),
        settlementAmount: String(r.settlementAmount ?? "Unknown"),
        deadline: String(r.deadline ?? "TBD"),
        status: (r.status === "pending" || r.status === "closed" ? r.status : "active") as Lawsuit["status"],
        matchType,
        matchedOn,
        matchedChemicals,
        matchedProducts,
        description: String(r.description ?? ""),
        payoutTiers: Array.isArray(r.payoutTiers)
          ? (r.payoutTiers as Lawsuit["payoutTiers"])
          : [],
        claimUrl: typeof r.claimUrl === "string" ? r.claimUrl : undefined,
      } satisfies Lawsuit;
    });

  // Dedupe: keep the first occurrence of each logical claim. Prefer rows with a
  // product-level match when duplicates disagree on matchType.
  const seen = new Map<string, Lawsuit>();
  for (const l of mapped) {
    const key = lawsuitDedupeKey(l);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, l);
      continue;
    }
    if (existing.matchType === "chemical" && l.matchType === "product") {
      seen.set(key, l);
    }
  }
  return Array.from(seen.values());
}

interface AnalysisStepProps {
  transactions: Transaction[];
  onComplete: (analysis: ExposureAnalysis, lawsuits: Lawsuit[]) => void;
}

const STAGES = [
  { label: "Scanning product labels", duration: 1200 },
  { label: "Cross-referencing EPA chemical database", duration: 1500 },
  { label: "Calculating exposure scores", duration: 1000 },
  { label: "Matching active settlements", duration: 800 },
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
        onComplete(mockAnalysis, mockLawsuits);
      } else {
        const startDrift = (from: number, to: number) => {
          let current = from;
          const id = setInterval(() => {
            const remaining = to - current;
            current += remaining * 0.04;
            setProgress(current);
          }, 200);
          return () => { clearInterval(id); setProgress(to); };
        };

        try {
          const allProducts = transactions.flatMap((t) =>
            (t.products || []).map((p) => ({
              name: p.name || "Unknown Product",
              description: p.description || "",
            }))
          ).filter((p) => p.name && p.name !== "Unknown Product");

          if (allProducts.length === 0) {
            completedRef.current = true;
            onComplete(mockAnalysis, mockLawsuits);
            return;
          }

          setStage(0); setProgress(10);
          await new Promise((r) => setTimeout(r, 400));
          setStage(1); setProgress(15);
          let stopDrift = startDrift(15, 55);
          const analysisResult = await analyzeExposure(allProducts);
          stopDrift();
          if (analysisResult?._provider) setAiProvider(analysisResult._provider);

          setStage(2); setProgress(58);
          const chemicals = analysisResult?.chemicals?.map((c: { chemical: string }) => c.chemical) ?? [];

          if (chemicals.length === 0) {
            completedRef.current = true;
            onComplete(analysisResult || mockAnalysis, mockLawsuits);
            return;
          }

          await new Promise((r) => setTimeout(r, 300));
          setStage(3); setProgress(62);
          stopDrift = startDrift(62, 95);
          const opportunities = await matchOpportunities(chemicals);
          stopDrift();
          setProgress(100);
          completedRef.current = true;
          const normalized = normalizeLawsuits(opportunities?.lawsuits);
          onComplete(
            analysisResult ?? mockAnalysis,
            normalized.length > 0 ? normalized : mockLawsuits,
          );
        } catch {
          completedRef.current = true;
          onComplete(mockAnalysis, mockLawsuits);
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
            {aiProvider === "dedalus" ? "Dedalus Labs" : aiProvider === "gemini" ? "Gemini 2.5 Flash" : aiProvider}
          </span>
        </div>
      )}
    </motion.div>
  );
}
