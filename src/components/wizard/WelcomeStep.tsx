import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

const stats = [
  { value: "$230B", label: "in class action settlements over the last 4 years" },
  { value: "4,500+", label: "chemicals screened against EPA database" },
  { value: "3 min", label: "average time to find your match" },
];

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.42, ease: EASE_EXPO }}
      className="flex flex-col justify-center min-h-[calc(100vh-3rem)] px-2 max-w-3xl mx-auto"
    >
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.08, duration: 0.4 }}
        className="text-eyebrow mb-8"
      >
        Health Exposure Intelligence
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.5, ease: EASE_EXPO }}
        className="font-display font-bold leading-[0.9] tracking-tight text-foreground mb-8"
        style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)" }}
      >
        Your receipts
        <br />
        are evidence.
      </motion.h1>

      <motion.div
        initial={{ scaleX: 0, originX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.28, duration: 0.5, ease: EASE_EXPO }}
        className="w-10 h-px bg-border mb-8"
      />

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22, duration: 0.5, ease: EASE_EXPO }}
        className="text-lg text-muted-foreground leading-relaxed mb-12"
        style={{ maxWidth: "52ch" }}
      >
        Aletheia scans your purchase history for products tied to class action
        lawsuits — then tells you exactly what you may be owed.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32, duration: 0.45, ease: EASE_EXPO }}
        className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 mb-16"
      >
        <Button
          size="lg"
          onClick={onNext}
          className="group gap-2 font-semibold h-12 px-8 text-base"
        >
          Get Started
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
        <p className="text-sm text-muted-foreground">
          Free &middot; No account required &middot; 3 minutes
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.44, duration: 0.5 }}
        className="flex flex-col sm:flex-row gap-6 sm:gap-12 pt-8 border-t border-border"
      >
        {stats.map(({ value, label }) => (
          <div key={value}>
            <p className="font-display font-bold text-foreground text-2xl leading-none mb-1.5">
              {value}
            </p>
            <p className="text-xs text-muted-foreground leading-snug">{label}</p>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
