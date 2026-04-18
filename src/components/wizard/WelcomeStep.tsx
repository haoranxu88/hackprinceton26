import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Shield, Search, Scale } from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Detect Hidden Chemicals",
    description: "We scan your purchase history for products containing hazardous chemicals like benzene, formaldehyde, and PFAS.",
  },
  {
    icon: Shield,
    title: "Quantify Your Exposure",
    description: "Using EPA models, we calculate your personalized Toxic Load Score and rank your exposure against the population.",
  },
  {
    icon: Scale,
    title: "Claim Your Redress",
    description: "Automatically match to class action lawsuits and clinical trials. File claims with digital proof of purchase.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-[70vh] px-4"
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-10"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 tracking-wide">
          <Shield className="w-3.5 h-3.5" />
          HEALTH EXPOSURE INTELLIGENCE
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-4">
          Your purchases tell
          <br />
          <span className="text-gradient-primary">a story.</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Vigilant reads your retail history to uncover hidden chemical exposures,
          match you to active lawsuits, and connect you with life-saving clinical trials.
        </p>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl w-full mb-10"
      >
        {features.map((feature) => (
          <motion.div key={feature.title} variants={item}>
            <Card className="group h-full hover:shadow-card-hover transition-all duration-300 border-border/50 bg-card/80 backdrop-blur-sm">
              <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground text-sm">{feature.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <Button variant="hero" size="xl" onClick={onNext}>
          Get Started
        </Button>
      </motion.div>
    </motion.div>
  );
}
