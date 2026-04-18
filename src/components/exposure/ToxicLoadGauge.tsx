import { useEffect, useState } from "react";
import { getRiskLevel, getRiskColor } from "@/lib/exposure-calculator";

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
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(score * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const circumference = 2 * Math.PI * 72;
  const offset = circumference - (animatedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-48">
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
          {/* Background circle */}
          <circle
            cx="80" cy="80" r="72"
            fill="none"
            strokeWidth="8"
            className="stroke-muted"
          />
          {/* Progress circle */}
          <circle
            cx="80" cy="80" r="72"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            stroke={riskColor}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.1s ease-out" }}
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-4xl font-bold"
            style={{ color: riskColor }}
          >
            {animatedScore}
          </span>
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
            Toxic Load
          </span>
        </div>
      </div>
      <div className="mt-3 text-center">
        <p className="text-sm font-semibold capitalize" style={{ color: riskColor }}>
          {riskLevel} Risk
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {percentile}th percentile of population
        </p>
      </div>
    </div>
  );
}
