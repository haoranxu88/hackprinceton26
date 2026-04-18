import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { ChemicalExposure } from "@/data/mock-analysis";
import { getRiskColor } from "@/lib/exposure-calculator";

interface ChemicalBreakdownProps {
  chemicals: ChemicalExposure[];
}

export function ChemicalBreakdown({ chemicals }: ChemicalBreakdownProps) {
  const chartData = chemicals.map((c) => ({
    name: c.chemical.length > 12 ? c.chemical.slice(0, 12) + "..." : c.chemical,
    fullName: c.chemical,
    concentration: c.concentrationPpm,
    frequency: c.frequency,
    riskLevel: c.riskLevel,
    color: getRiskColor(c.riskLevel),
  }));

  return (
    <div className="w-full h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "hsl(222, 8%, 46%)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(222, 8%, 46%)" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "ppm", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(222, 8%, 46%)" }}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: number, _name: string, props: { payload: typeof chartData[number] }) => [
              `${value} ppm (${props.payload.frequency}x/mo)`,
              props.payload.fullName,
            ]}
          />
          <Bar dataKey="concentration" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
