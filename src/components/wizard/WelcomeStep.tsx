import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const features = [
  {
    num: "01",
    title: "Detect Hidden Chemicals",
    description:
      "We scan your purchase history for products containing hazardous chemicals like benzene, formaldehyde, and PFAS.",
  },
  {
    num: "02",
    title: "Quantify Your Exposure",
    description:
      "Using EPA dermal absorption models, we calculate your personalized Toxic Load Score and rank your exposure against the population.",
  },
  {
    num: "03",
    title: "Claim Your Redress",
    description:
      "Automatically match to active class action lawsuits and clinical trials. File claims with digital proof of purchase.",
  },
];

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.1 }}
      className="max-w-2xl mx-auto px-6 pt-16 pb-12"
    >
      <motion.div variants={item} className="mb-3">
        <span className="text-eyebrow">Health Exposure Intelligence</span>
      </motion.div>

      <motion.h1
        variants={item}
        className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.05] mb-6"
      >
        Your purchases
        <br />
        tell a story.
      </motion.h1>

      <motion.p
        variants={item}
        className="text-base text-muted-foreground leading-relaxed max-w-lg mb-12"
      >
        Vigilant reads your retail history to uncover hidden chemical exposures,
        match you to active lawsuits, and connect you with life-saving clinical
        trials.
      </motion.p>

      <motion.div variants={item} className="rule-top mb-10" />

      <motion.div
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
        className="space-y-8 mb-12"
      >
        {features.map((f) => (
          <motion.div key={f.num} variants={item} className="flex gap-6">
            <span className="font-display text-xs font-bold text-accent shrink-0 mt-1 w-5">
              {f.num}
            </span>
            <div>
              <p className="font-semibold text-foreground text-sm mb-1">{f.title}</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                {f.description}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={item} className="rule-top mb-10" />

      <motion.div variants={item} className="flex justify-start">
        <Button variant="hero" size="lg" onClick={onNext} className="font-body font-medium">
          Get started →
        </Button>
      </motion.div>
    </motion.div>
  );
}
