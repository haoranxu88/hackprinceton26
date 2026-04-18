import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LawsuitCard } from "@/components/claims/LawsuitCard";
import { TrialCard } from "@/components/trials/TrialCard";
import type { Lawsuit } from "@/data/mock-lawsuits";
import type { ClinicalTrial } from "@/data/mock-trials";
import { Scale, Microscope, RotateCcw } from "lucide-react";

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
      transition={{ staggerChildren: 0.1 }}
      className="max-w-4xl mx-auto px-4 py-4 space-y-6"
    >
      <motion.div variants={item} className="text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
          Your Opportunities
        </h2>
        <p className="text-muted-foreground text-sm">
          {activeLawsuits.length} active lawsuits and {recruitingTrials.length} clinical trials matched to your exposure profile
        </p>
      </motion.div>

      <motion.div variants={item}>
        <Tabs defaultValue="lawsuits" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-sm mx-auto">
            <TabsTrigger value="lawsuits" className="gap-1.5 text-sm">
              <Scale className="w-4 h-4" />
              Lawsuits ({lawsuits.length})
            </TabsTrigger>
            <TabsTrigger value="trials" className="gap-1.5 text-sm">
              <Microscope className="w-4 h-4" />
              Trials ({trials.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lawsuits" className="mt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lawsuits.map((lawsuit) => (
                <LawsuitCard key={lawsuit.id} lawsuit={lawsuit} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="trials" className="mt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trials.map((trial) => (
                <TrialCard key={trial.id} trial={trial} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      <motion.div variants={item} className="flex justify-center pt-4">
        <Button variant="outline" onClick={onRestart} className="gap-2">
          <RotateCcw className="w-4 h-4" />
          Start Over
        </Button>
      </motion.div>
    </motion.div>
  );
}
