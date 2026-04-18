import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useMockToggle } from "@/hooks/useMockToggle";
import { listKnotMerchants, linkKnotAccount, syncKnotTransactions } from "@/lib/api";
import { mockTransactions, type Transaction } from "@/data/mock-transactions";
import { ShoppingBag, Store, Pill, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

interface KnotMerchant {
  id: number;
  name: string;
  category?: string;
  logo?: string;
}

const FALLBACK_MERCHANTS: KnotMerchant[] = [
  { id: 19, name: "DoorDash", category: "Food Delivery" },
  { id: 45, name: "Walmart", category: "Online Shopping" },
  { id: 46, name: "Wayfair", category: "Furniture" },
];

const ICON_MAP: Record<string, typeof ShoppingBag> = {
  "Online Shopping": ShoppingBag,
  "Food Delivery": Store,
  Pharmacy: Pill,
};

interface LinkAccountsStepProps {
  onNext: (transactions: Transaction[]) => void;
  onBack: () => void;
}

export function LinkAccountsStep({ onNext, onBack }: LinkAccountsStepProps) {
  const { isMock } = useMockToggle();
  const [loading, setLoading] = useState(false);
  const [linkedMerchants, setLinkedMerchants] = useState<number[]>([]);
  const [status, setStatus] = useState<string>("");
  const [merchants, setMerchants] = useState<KnotMerchant[]>(FALLBACK_MERCHANTS);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const collectedTransactions = useRef<Transaction[]>([]);

  useEffect(() => {
    if (isMock) return;
    setLoadingMerchants(true);
    listKnotMerchants()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setMerchants(data.slice(0, 6));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMerchants(false));
  }, [isMock]);

  const handleLinkMerchant = async (merchantId: number) => {
    if (isMock) {
      setLinkedMerchants((prev) => [...prev, merchantId]);
      return;
    }
    try {
      setLoading(true);
      const userId = `vigilant-${Date.now()}`;
      setStatus("Linking account...");
      const linkResult = await linkKnotAccount(userId, merchantId);
      console.log("[link] Link result:", linkResult);
      setStatus("Syncing transactions...");
      const syncResult = await syncKnotTransactions(userId, merchantId);
      setLinkedMerchants((prev) => [...prev, merchantId]);
      if (syncResult?.transactions?.length > 0) {
        const mapped: Transaction[] = syncResult.transactions.map((t: Record<string, unknown>) => ({
          id: (t.id as string) || `knot-${Date.now()}-${Math.random()}`,
          datetime: (t.datetime as string) || new Date().toISOString(),
          merchant: syncResult.merchant?.name || "Unknown",
          order_status: (t.order_status as string) || "COMPLETED",
          total: (t.price as Record<string, string>)?.total || "0",
          products: ((t.products as Array<Record<string, unknown>>) || []).map((p) => ({
            external_id: (p.external_id as string) || "",
            name: (p.name as string) || "Unknown Product",
            description: (p.description as string) || "",
            image_url: (p.image_url as string) || "",
            quantity: (p.quantity as number) || 1,
            price: (p.price as { total: string; unit_price: string }) || { total: "0", unit_price: "0" },
          })),
        }));
        collectedTransactions.current = [...collectedTransactions.current, ...mapped];
        const productCount = mapped.reduce((s, t) => s + t.products.length, 0);
        setStatus(`Synced ${mapped.length} orders · ${productCount} products`);
      } else {
        setStatus("Linked — no transactions yet");
      }
    } catch {
      setStatus("Connection failed — try demo data");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 5000);
    }
  };

  const handleProceed = () => {
    onNext(collectedTransactions.current.length > 0 ? collectedTransactions.current : mockTransactions);
  };

  const getIcon = (merchant: KnotMerchant) => ICON_MAP[merchant.category || ""] || ShoppingBag;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.42, ease: EASE_EXPO }}
      className="flex flex-col justify-center min-h-[calc(100vh-8rem)] max-w-lg mx-auto px-2"
    >
      {/* Header */}
      <p className="text-eyebrow mb-6">Step 1</p>
      <h2
        className="font-display font-bold leading-[0.92] tracking-tight text-foreground mb-4"
        style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}
      >
        Connect your
        <br />
        accounts.
      </h2>
      <p className="text-base text-muted-foreground mb-10" style={{ maxWidth: "46ch" }}>
        Link a retailer to scan your actual purchase history. Powered by KnotAPI TransactionLink — we read transaction data only.
      </p>

      {/* Merchant rows */}
      <div className="mb-8">
        {loadingMerchants ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading merchants...</span>
          </div>
        ) : (
          merchants.map((merchant, i) => {
            const isLinked = linkedMerchants.includes(merchant.id);
            const isLoadingThis = loading;
            const Icon = getIcon(merchant);

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
                    {merchant.logo ? (
                      <img src={merchant.logo} alt={merchant.name} className="w-5 h-5 object-contain" />
                    ) : (
                      <Icon className="w-4 h-4 text-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{merchant.name}</p>
                    <p className="text-xs text-muted-foreground">{merchant.category || "Transaction history"}</p>
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
          })
        )}
      </div>

      {/* Status message */}
      {status && (
        <p className="text-xs text-muted-foreground mb-4 flex items-center gap-2">
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
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
        <Button
          variant="ghost"
          onClick={onBack}
          className="gap-1.5 text-sm px-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
        >
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
