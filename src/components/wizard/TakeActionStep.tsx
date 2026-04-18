import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LawsuitCard } from "@/components/claims/LawsuitCard";
import { TrialCard } from "@/components/trials/TrialCard";
import type { Lawsuit } from "@/data/mock-lawsuits";
import type { ClinicalTrial } from "@/data/mock-trials";
import { RotateCcw } from "lucide-react";

interface TakeActionStepProps {
  lawsuits: Lawsuit[];
  trials: ClinicalTrial[];
  onRestart: () => void;
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export function TakeActionStep({ lawsuits, trials, onRestart }: TakeActionStepProps) {
  const activeLawsuits = lawsuits.filter((l) => l.status === "active");
  const recruitingTrials = trials.filter((t) => t.status === "recruiting");

  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.08 }}
      className="max-w-3xl mx-auto px-6 pt-10 pb-12"
    >
      <motion.div variants={item} className="mb-2">
        <span className="text-eyebrow">Your opportunities</span>
      </motion.div>

      <motion.h2 variants={item} className="font-display text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-2">
        You qualify for {activeLawsuits.length + recruitingTrials.length} opportunities
      </motion.h2>

      <motion.p variants={item} className="text-sm text-muted-foreground mb-8 max-w-lg">
        {activeLawsuits.length} active lawsuits and {recruitingTrials.length} clinical trials matched to your exposure profile.
      </motion.p>

      <motion.div variants={item} className="rule-top mb-8" />

      <motion.div variants={item}>
        <Tabs defaultValue="lawsuits" className="w-full">
          <TabsList className="bg-secondary border border-border/50 h-9 p-0.5 w-auto inline-flex mb-6">
            <TabsTrigger value="lawsuits" className="text-xs h-8 px-4 font-body data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Lawsuits ({lawsuits.length})
            </TabsTrigger>
            <TabsTrigger value="trials" className="text-xs h-8 px-4 font-body data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Trials ({trials.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lawsuits">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lawsuits.map((lawsuit) => (
                <LawsuitCard key={lawsuit.id} lawsuit={lawsuit} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="trials">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trials.map((trial) => (
                <TrialCard key={trial.id} trial={trial} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      <motion.div variants={item} className="flex justify-start pt-6">
        <Button variant="ghost" onClick={onRestart} className="gap-2 font-body text-muted-foreground hover:text-foreground">
          <RotateCcw className="w-3.5 h-3.5" />
          Start over
        </Button>
      </motion.div>
    </motion.div>
  );
}
