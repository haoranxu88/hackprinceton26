import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LawsuitCard } from "@/components/claims/LawsuitCard";
import { TrialCard } from "@/components/trials/TrialCard";
import type { Lawsuit } from "@/data/mock-lawsuits";
import type { ClinicalTrial } from "@/data/mock-trials";
import type { Transaction } from "@/data/mock-transactions";
import { RotateCcw } from "lucide-react";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

interface TakeActionStepProps {
  lawsuits: Lawsuit[];
  trials: ClinicalTrial[];
  transactions: Transaction[];
  onRestart: () => void;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_EXPO } },
};

export function TakeActionStep({ lawsuits, trials, transactions, onRestart }: TakeActionStepProps) {
  const activeLawsuits = lawsuits.filter((l) => l.status === "active");
  const recruitingTrials = trials.filter((t) => t.status === "recruiting");

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="max-w-3xl mx-auto px-2 py-8"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-12">
        <p className="text-eyebrow mb-6">Your Opportunities</p>
        <h2
          className="font-display font-bold leading-[0.92] tracking-tight text-foreground mb-4"
          style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
        >
          {activeLawsuits.length} active lawsuit{activeLawsuits.length !== 1 ? "s" : ""}
          <br />
          matched to your history.
        </h2>
        <p className="text-base text-muted-foreground" style={{ maxWidth: "52ch" }}>
          Based on your purchase records and chemical exposure profile.{" "}
          {recruitingTrials.length > 0 && (
            <>{recruitingTrials.length} clinical trial{recruitingTrials.length !== 1 ? "s" : ""} also matched.</>
          )}
        </p>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Tabs defaultValue="lawsuits" className="w-full">
          <TabsList className="bg-secondary border border-border/50 h-9 p-0.5 w-auto inline-flex mb-6">
            <TabsTrigger value="lawsuits" className="text-xs h-8 px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Settlements ({lawsuits.length})
            </TabsTrigger>
            <TabsTrigger value="trials" className="text-xs h-8 px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Clinical Trials ({trials.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lawsuits">
            <div className="divide-y divide-border">
              {lawsuits.map((lawsuit) => (
                <LawsuitCard
                  key={lawsuit.id}
                  lawsuit={lawsuit}
                  transactions={transactions}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="trials">
            <div className="divide-y divide-border">
              {trials.map((trial) => (
                <TrialCard key={trial.id} trial={trial} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      <motion.div variants={fadeUp} className="pt-8 border-t border-border flex justify-center">
        <Button
          variant="ghost"
          onClick={onRestart}
          className="gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Start over with different accounts
        </Button>
      </motion.div>
    </motion.div>
  );
}
