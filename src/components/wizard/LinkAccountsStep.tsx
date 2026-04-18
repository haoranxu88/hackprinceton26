import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useMockToggle } from "@/hooks/useMockToggle";
import { createKnotSession, linkKnotAccount, syncKnotTransactions } from "@/lib/api";
import { mockTransactions, type Transaction } from "@/data/mock-transactions";
import { ShoppingBag, Store, Pill, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

const MERCHANTS = [
  {
    id: 19,
    name: "Amazon",
    description: "Orders & purchase history",
    icon: ShoppingBag,
  },
  {
    id: 4,
    name: "Walmart",
    description: "In-store & online orders",
    icon: Store,
  },
  {
    id: 46,
    name: "CVS Pharmacy",
    description: "Prescriptions & health products",
    icon: Pill,
  },
];

interface LinkAccountsStepProps {
  onNext: (transactions: Transaction[]) => void;
  onBack: () => void;
}

export function LinkAccountsStep({ onNext, onBack }: LinkAccountsStepProps) {
  const { isMock } = useMockToggle();
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [linkedMerchants, setLinkedMerchants] = useState<number[]>([]);
  const [status, setStatus] = useState<string>("");

  const handleLinkMerchant = async (merchantId: number) => {
    if (isMock) {
      setLinkedMerchants((prev) => [...prev, merchantId]);
      return;
    }

    try {
      setLoading(true);
      setLoadingId(merchantId);
      setStatus("Creating session...");
      const userId = `vigilant-user-${Date.now()}`;

      await createKnotSession(userId);

      setStatus("Linking account...");
      await linkKnotAccount(userId, merchantId);

      setStatus("Syncing transactions...");
      const result = await syncKnotTransactions(userId, merchantId);

      setLinkedMerchants((prev) => [...prev, merchantId]);
      setStatus("");

      if (result?.transactions) {
        onNext(result.transactions);
      }
    } catch {
      setStatus("Error — falling back to demo data");
      setTimeout(() => setStatus(""), 2000);
    } finally {
      setLoading(false);
      setLoadingId(null);
    }
  };

  const handleProceed = () => {
    onNext(mockTransactions);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.42, ease: EASE_EXPO }}
      className="flex flex-col justify-center min-h-[calc(100vh-8rem)] max-w-lg mx-auto px-2"
    >
      {/* Header */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary mb-6">
        Step 1
      </p>
      <h2
        className="font-display font-bold leading-[0.92] tracking-tight text-foreground mb-4"
        style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}
      >
        Connect your
        <br />
        accounts.
      </h2>
      <p className="text-base text-muted-foreground mb-10" style={{ maxWidth: "46ch" }}>
        Link a retailer to scan your actual purchase history. We read transaction
        data only — no passwords stored.
      </p>

      {/* Merchant rows */}
      <div className="mb-8">
        {MERCHANTS.map((merchant, i) => {
          const isLinked = linkedMerchants.includes(merchant.id);
          const isLoadingThis = loadingId === merchant.id;

          return (
            <motion.div
              key={merchant.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.38, ease: EASE_EXPO }}
              className="flex items-center justify-between py-4 border-b border-border last:border-b-0"
            >
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <merchant.icon className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{merchant.name}</p>
                  <p className="text-xs text-muted-foreground">{merchant.description}</p>
                </div>
              </div>

              {isLinked ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Connected
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleLinkMerchant(merchant.id)}
                  disabled={loading}
                  className="text-xs h-8"
                >
                  {isLoadingThis ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Connect"
                  )}
                </Button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Status message */}
      {status && (
        <p className="text-xs text-muted-foreground mb-4 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          {status}
        </p>
      )}

      {/* Demo shortcut */}
      <p className="text-sm text-muted-foreground mb-10">
        No account to link?{" "}
        <button
          onClick={() => onNext(mockTransactions)}
          className="text-primary font-medium underline underline-offset-2 hover:no-underline"
        >
          Use demo data
        </button>{" "}
        — 14 pre-loaded products with known hazardous chemicals.
      </p>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 text-sm px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Button>
        {linkedMerchants.length > 0 && (
          <Button onClick={handleProceed} className="gap-2 font-semibold">
            Continue with {linkedMerchants.length} account{linkedMerchants.length > 1 ? "s" : ""}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
