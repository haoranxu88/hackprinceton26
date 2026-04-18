import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useMockToggle } from "@/hooks/useMockToggle";
import { listKnotMerchants, linkKnotAccount, syncKnotTransactions } from "@/lib/api";
import { mockTransactions, type Transaction } from "@/data/mock-transactions";
import { ShoppingBag, Store, Pill, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

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

  const handleUseDemoData = () => onNext(mockTransactions);

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
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.08 }}
      className="max-w-xl mx-auto px-6 pt-12 pb-12"
    >
      <motion.div variants={item} className="mb-2">
        <span className="text-eyebrow">Step 01</span>
      </motion.div>

      <motion.h2 variants={item} className="font-display text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-3">
        Link your accounts
      </motion.h2>

      <motion.p variants={item} className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-md">
        Connect your retail accounts so we can scan your purchase history for hazardous products. Powered by KnotAPI TransactionLink.
      </motion.p>

      {/* Merchant list */}
      <motion.div variants={item} className="mb-8">
        {loadingMerchants ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading merchants...</span>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {merchants.map((merchant) => {
              const isLinked = linkedMerchants.includes(merchant.id);
              const Icon = getIcon(merchant);
              return (
                <div
                  key={merchant.id}
                  className="flex items-center justify-between py-4 gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {merchant.logo ? (
                      <img
                        src={merchant.logo}
                        alt={merchant.name}
                        className="w-8 h-8 rounded object-contain bg-muted p-1 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{merchant.name}</p>
                      <p className="text-xs text-muted-foreground">{merchant.category || "Transaction history"}</p>
                    </div>
                  </div>

                  {isLinked ? (
                    <div className="flex items-center gap-1.5 text-xs font-medium shrink-0" style={{ color: "hsl(142, 65%, 38%)" }}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Connected
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLinkMerchant(merchant.id)}
                      disabled={loading}
                      className="shrink-0 text-xs"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Connect"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {status && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-muted-foreground mb-6 flex items-center gap-2"
        >
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          {status}
        </motion.p>
      )}

      {/* Demo shortcut */}
      <motion.div variants={item} className="surface p-5 mb-8">
        <p className="text-xs font-semibold text-foreground mb-0.5">Quick demo</p>
        <p className="text-xs text-muted-foreground mb-4">
          Skip account linking and use pre-loaded data with known hazardous products — 14 items across 5 orders.
        </p>
        <Button variant="hero" size="sm" onClick={handleUseDemoData} className="w-full font-body">
          Use demo data
        </Button>
      </motion.div>

      <motion.div variants={item} className="flex gap-3">
        <Button variant="ghost" onClick={onBack} className="flex-1 font-body">
          Back
        </Button>
        {linkedMerchants.length > 0 && (
          <Button variant="default" onClick={handleProceed} className={cn("flex-1 font-body")}>
            Continue with {linkedMerchants.length} account{linkedMerchants.length > 1 ? "s" : ""}
          </Button>
        )}
      </motion.div>
    </motion.div>
  );
}
