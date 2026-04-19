import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Lawsuit } from "@/data/mock-lawsuits";
import { mockTransactions } from "@/data/mock-transactions";
import {
  findMatchingTransactions,
  generateClaimReceiptPdf,
} from "@/lib/claim-receipt-pdf";
import {
  ExternalLink,
  UserSquare,
  FileDown,
  CreditCard,
  Mail,
  CheckCircle2,
} from "lucide-react";

interface FileClaimDialogProps {
  lawsuit: Lawsuit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function StepHeader({
  number,
  title,
  description,
  icon,
}: {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display font-bold text-sm">
          {number}
        </div>
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Step {number}
          </span>
          <span className="text-muted-foreground/40">{icon}</span>
        </div>
        <p className="font-display font-semibold text-foreground text-base leading-tight mb-1">
          {title}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

export function FileClaimDialog({
  lawsuit,
  open,
  onOpenChange,
}: FileClaimDialogProps) {
  const matchingTxns = useMemo(
    () => findMatchingTransactions(mockTransactions, lawsuit),
    [lawsuit]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            Claim Filing Guide
          </p>
          <DialogTitle>{lawsuit.title}</DialogTitle>
          <DialogDescription>
            vs. {lawsuit.defendant} &middot; Settlement pool {lawsuit.settlementAmount}
          </DialogDescription>
        </DialogHeader>

        <div className="relative py-2">
          {/* Vertical connector line */}
          <div
            className="absolute left-[18px] top-4 bottom-4 w-px bg-border"
            aria-hidden="true"
          />

          <div className="relative space-y-7">
            {/* Step 1 */}
            <div>
              <StepHeader
                number={1}
                title="Visit the Settlement Website"
                description="Open the official settlement page to review eligibility, deadlines, and claim categories before filing."
                icon={<ExternalLink className="w-3.5 h-3.5" />}
              />
              <div className="pl-[52px] mt-3">
                <a
                  href={lawsuit.claimUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                    <ExternalLink className="w-3 h-3" />
                    Open Settlement Site
                  </Button>
                </a>
                {lawsuit.deadline !== "TBD" && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Claim deadline: {formatDate(lawsuit.deadline)}
                  </p>
                )}
              </div>
            </div>

            {/* Step 2 */}
            <div>
              <StepHeader
                number={2}
                title="Fill Out Personal Information"
                description="The settlement form will ask for the standard claimant details. Have these ready before you start."
                icon={<UserSquare className="w-3.5 h-3.5" />}
              />
              <div className="pl-[52px] mt-3">
                <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
                  <ul className="text-xs text-muted-foreground space-y-1.5">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-muted-foreground/60" />
                      Full legal name
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-muted-foreground/60" />
                      Mailing address
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-muted-foreground/60" />
                      Email and phone number
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-muted-foreground/60" />
                      Date of birth
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div>
              <StepHeader
                number={3}
                title="Download Your Proof of Purchase"
                description="Generate a verified transaction record for each eligible purchase and upload it as supporting evidence on the settlement site."
                icon={<FileDown className="w-3.5 h-3.5" />}
              />
              <div className="pl-[52px] mt-3 space-y-2">
                {matchingTxns.length === 0 ? (
                  <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
                    No matching transactions found in your linked accounts.
                  </div>
                ) : (
                  matchingTxns.map(({ txn, matched }) => (
                    <div
                      key={txn.id}
                      className="rounded-lg border border-border bg-card px-4 py-3 flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground">
                            {txn.merchant}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDate(txn.datetime)}
                          </span>
                          <Badge variant="critical" className="text-[9px]">
                            Eligible
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {matched.map((p) => p.name).join(", ")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateClaimReceiptPdf(txn, matched, lawsuit)}
                        className="gap-1.5 text-xs shrink-0"
                      >
                        <FileDown className="w-3 h-3" />
                        Download PDF
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Step 4 */}
            <div>
              <StepHeader
                number={4}
                title="Connect Your Payment Platform"
                description="Link a card or account so the settlement administrator can deposit your payout directly once your claim is approved."
                icon={<CreditCard className="w-3.5 h-3.5" />}
              />
              <div className="pl-[52px] mt-3">
                <p className="text-[11px] text-muted-foreground">
                  Payouts are typically issued 90-180 days after claim approval.
                </p>
              </div>
            </div>

            {/* Step 5 */}
            <div>
              <StepHeader
                number={5}
                title="Check Your Email for Confirmation"
                description="After submitting, the settlement administrator will send a confirmation email with your claim ID. Save it for your records."
                icon={<Mail className="w-3.5 h-3.5" />}
              />
              <div className="pl-[52px] mt-3">
                <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Allow up to 24 hours for the confirmation email to arrive. Check your
                    spam folder if you don't see it.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Close
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="gap-1.5 text-xs font-semibold"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
