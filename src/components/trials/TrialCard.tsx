import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ClinicalTrial } from "@/data/mock-trials";
import { Microscope, MapPin, ChevronDown, ChevronUp, Heart } from "lucide-react";

interface TrialCardProps {
  trial: ClinicalTrial;
}

export function TrialCard({ trial }: TrialCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden hover:shadow-elegant transition-all duration-300 border-primary/10">
      <CardHeader className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Microscope className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm leading-tight">{trial.title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{trial.sponsor}</p>
            </div>
          </div>
          <Badge
            variant={trial.status === "recruiting" ? "default" : "secondary"}
            className="shrink-0 text-[10px]"
          >
            {trial.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Phase</p>
            <p className="text-sm font-bold text-foreground">{trial.phase}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Match</p>
            <p className="text-sm font-bold text-primary">{trial.eligibilityMatch}%</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Molecule</p>
            <p className="text-xs font-bold text-foreground truncate">{trial.molecule.split(" ")[0]}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {trial.linkedChemicals.map((c) => (
            <Badge key={c} variant="high" className="text-[10px]">{c} exposure</Badge>
          ))}
          <Badge variant="outline" className="text-[10px] text-foreground">{trial.condition}</Badge>
        </div>

        {expanded && (
          <>
            <Separator />
            <p className="text-xs text-muted-foreground leading-relaxed">{trial.description}</p>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Locations
              </p>
              <div className="flex flex-wrap gap-1">
                {trial.locations.map((loc) => (
                  <Badge key={loc} variant="secondary" className="text-[10px]">{loc}</Badge>
                ))}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-primary/5 text-xs">
              <p className="font-medium text-foreground">Compensation</p>
              <p className="text-muted-foreground">{trial.compensation}</p>
            </div>
            <p className="text-[10px] text-muted-foreground">NCT ID: {trial.nctId}</p>
          </>
        )}
      </CardContent>

      <CardFooter className="px-4 pb-4 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-xs gap-1"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Less" : "Details"}
        </Button>
        <Button variant="hero" size="sm" className="ml-auto gap-1 text-xs">
          <Heart className="w-3 h-3" />
          Express Interest
        </Button>
      </CardFooter>
    </Card>
  );
}
