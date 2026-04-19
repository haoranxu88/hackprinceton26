import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { LawsuitCard } from "@/components/claims/LawsuitCard";
import type { Lawsuit } from "@/data/mock-lawsuits";
import type { Transaction } from "@/data/mock-transactions";
import { RotateCcw } from "lucide-react";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

interface TakeActionStepProps {
  lawsuits: Lawsuit[];
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

function isDeadlineStillOpen(deadline: string | undefined): boolean {
  if (!deadline) return true;
  const trimmed = deadline.trim();
  if (!trimmed || trimmed.toUpperCase() === "TBD") return true;
  const ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return ts >= today.getTime();
}

export function TakeActionStep({ lawsuits, transactions, onRestart }: TakeActionStepProps) {
  const visibleLawsuits = lawsuits.filter((l) => isDeadlineStillOpen(l.deadline));
  const sortedLawsuits = [...visibleLawsuits].sort((a, b) => {
    if (a.matchType === b.matchType) return 0;
    return a.matchType === "product" ? -1 : 1;
  });
  const activeLawsuits = sortedLawsuits.filter((l) => l.status === "active");

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
          Based on your purchase records and chemical exposure profile.
        </p>
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-6">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Settlements
          </span>
          <span className="text-xs text-muted-foreground">
            ({sortedLawsuits.length})
          </span>
        </div>

        <div className="divide-y divide-border">
          {sortedLawsuits.map((lawsuit) => (
            <LawsuitCard key={lawsuit.id} lawsuit={lawsuit} transactions={transactions} />
          ))}
        </div>
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
