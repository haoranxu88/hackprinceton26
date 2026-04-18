import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { Lawsuit } from "@/data/mock-lawsuits";

interface ClaimFormProps {
  lawsuit: Lawsuit;
  onClose: () => void;
}

interface DemoClaimSubmission {
  id: string;
  submittedAt: string;
  lawsuitId: string;
  lawsuitTitle: string;
  defendant: string;
  product: string;
  deadline: string;
  estimatedEligibility: "High" | "Medium";
  estimatedPayoutRange: string;
  fullName: string;
  email: string;
  confirmation: boolean;
  notes: string;
}

function readDemoClaims(): DemoClaimSubmission[] {
  try {
    const raw = localStorage.getItem("demo-claims");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function ClaimForm({ lawsuit, onClose }: ClaimFormProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmedPurchase, setConfirmedPurchase] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const primaryProduct = lawsuit.matchedProducts[0] || "Product from your purchase history";

  const claimDeadline = "June 2026";
  const estimatedEligibility = useMemo<"High" | "Medium">(() => {
    if ((lawsuit.matchConfidence ?? 0) >= 85) return "High";
    return "Medium";
  }, [lawsuit.matchConfidence]);
  const estimatedPayoutRange = useMemo(() => {
    const ranges = lawsuit.payoutTiers
      ?.map((t) => t.amount)
      ?.filter(Boolean)
      ?.slice(0, 2);
    if (ranges?.length) return ranges.join(" • ");
    return "Up to $30 (with proof) • Up to $6 (no proof)";
  }, [lawsuit.payoutTiers]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    const entry: DemoClaimSubmission = {
      id: `claim-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      lawsuitId: lawsuit.id,
      lawsuitTitle: lawsuit.title,
      defendant: lawsuit.defendant,
      product: primaryProduct,
      deadline: claimDeadline,
      estimatedEligibility,
      estimatedPayoutRange,
      fullName: fullName.trim(),
      email: email.trim(),
      confirmation: confirmedPurchase,
      notes: notes.trim(),
    };

    const existingClaims = readDemoClaims();
    localStorage.setItem("demo-claims", JSON.stringify([entry, ...existingClaims]));

    setSubmitted(true);
    setSubmitting(false);
  };

  const downloadClaimSummary = () => {
    const summary = {
      submittedAt: new Date().toISOString(),
      claimant: { fullName: fullName.trim(), email: email.trim() },
      lawsuit: {
        id: lawsuit.id,
        title: lawsuit.title,
        defendant: lawsuit.defendant,
        matchedProduct: primaryProduct,
        matchConfidence: lawsuit.matchConfidence,
        deadline: claimDeadline,
        estimatedEligibility,
        estimatedPayoutRange,
      },
      attestation: {
        confirmedPurchase: confirmedPurchase,
        notes: notes.trim(),
      },
    };

    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claim-summary-${lawsuit.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close claim form"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
        {!submitted ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">File claim</p>
              <h3 className="text-lg font-semibold text-foreground">{lawsuit.title}</h3>
              <p className="text-sm text-muted-foreground">vs. {lawsuit.defendant}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Matched product: <span className="text-foreground">{primaryProduct}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">Claim deadline: {claimDeadline}</p>
            </div>

            <div className="rounded-lg border border-border bg-secondary/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Why you qualify
              </p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0" />
                  <span>
                    Your purchase history matches <span className="text-foreground">{primaryProduct}</span>.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0" />
                  <span>Eligible purchases: 2020–2023 (demo range).</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0" />
                  <span>
                    Linked to the chemicals flagged in your exposure report and the active settlement program.
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    Claim summary
                  </p>
                  <p className="text-sm font-medium text-foreground">{primaryProduct}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Defendant: {lawsuit.defendant}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Eligibility</p>
                  <p className="text-sm font-semibold text-foreground">{estimatedEligibility}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/60">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Estimated payout range</p>
                <p className="text-sm text-foreground">{estimatedPayoutRange}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor={`name-${lawsuit.id}`} className="text-xs font-medium text-foreground">
                Full Name
              </label>
              <input
                id={`name-${lawsuit.id}`}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Jane Doe"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor={`email-${lawsuit.id}`} className="text-xs font-medium text-foreground">
                Email
              </label>
              <input
                id={`email-${lawsuit.id}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="jane@domain.com"
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={confirmedPurchase}
                onChange={(e) => setConfirmedPurchase(e.target.checked)}
                required
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span>I confirm I purchased this product and wish to proceed with a legal claim.</span>
            </label>

            <div className="space-y-2">
              <label htmlFor={`notes-${lawsuit.id}`} className="text-xs font-medium text-foreground">
                Notes (optional)
              </label>
              <textarea
                id={`notes-${lawsuit.id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Add anything relevant (symptoms, purchase date, receipt details)..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Claim"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Success</p>
            <h3 className="text-lg font-semibold text-foreground">✅ Claim Submitted</h3>
            <p className="text-sm text-muted-foreground">
              We generated a demo claim packet and saved it locally. In a real flow, this would be routed to the
              settlement administrator for review.
            </p>
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              Saved to localStorage key: <span className="text-foreground">demo-claims</span>
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={downloadClaimSummary}>
                Download Claim Summary
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
