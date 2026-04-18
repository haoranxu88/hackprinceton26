import { useEffect, useState } from "react";
import { getRiskColor, getRiskLevel } from "@/lib/exposure-calculator";

interface ToxicLoadGaugeProps {
  score: number;
  percentile: number;
}

export function ToxicLoadGauge({ score, percentile }: ToxicLoadGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const riskLevel = getRiskLevel(score);
  const riskColor = getRiskColor(riskLevel);

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1500;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(score * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const circumference = 2 * Math.PI * 60;
  const offset = circumference - (animatedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle cx="70" cy="70" r="60" fill="none" strokeWidth="6" className="stroke-muted" />
          <circle
            cx="70" cy="70" r="60"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke={riskColor}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.08s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-bold" style={{ color: riskColor }}>
            {animatedScore}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-body mt-0.5">
            Toxic Load
          </span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <p className="text-xs font-semibold capitalize font-body" style={{ color: riskColor }}>
          {riskLevel} risk
        </p>
        <p className="text-[10px] text-muted-foreground font-body mt-0.5">
          {percentile}th percentile
        </p>
      </div>
    </div>
  );
}
