import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useMockToggle } from "@/hooks/useMockToggle";
import { listKnotMerchants, linkKnotAccount, syncKnotTransactions } from "@/lib/api";
import { mockTransactions, type Transaction } from "@/data/mock-transactions";
import { Link2, ShoppingBag, Store, Pill, ChevronRight, Database, Loader2, CheckCircle2 } from "lucide-react";

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

  // Fetch real merchant list on mount (live mode)
  useEffect(() => {
    if (isMock) return;
    setLoadingMerchants(true);
    listKnotMerchants()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          // Show first 6 merchants max
          setMerchants(data.slice(0, 6));
          console.log("[link] Loaded", data.length, "merchants from Knot");
        }
      })
      .catch((err) => {
        console.warn("[link] Failed to load merchants, using fallbacks:", err);
      })
      .finally(() => setLoadingMerchants(false));
  }, [isMock]);

  const handleUseDemoData = () => {
    onNext(mockTransactions);
  };

  const handleLinkMerchant = async (merchantId: number) => {
    if (isMock) {
      setLinkedMerchants((prev) => [...prev, merchantId]);
      return;
    }

    try {
      setLoading(true);
      const userId = `vigilant-${Date.now()}`;

      // Step 1: Link account + trigger transaction generation
      setStatus("Linking account...");
      console.log("[link] Linking merchant", merchantId, "for user", userId);
      const linkResult = await linkKnotAccount(userId, merchantId);
      console.log("[link] Link result:", linkResult);

      // Step 2: Sync transactions (edge function polls with retries)
      setStatus("Syncing transactions (may take a few seconds)...");
      const syncResult = await syncKnotTransactions(userId, merchantId);
      console.log("[link] Sync result:", JSON.stringify(syncResult).slice(0, 500));

      setLinkedMerchants((prev) => [...prev, merchantId]);

      // Map Knot transactions to our format
      if (syncResult?.transactions && syncResult.transactions.length > 0) {
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
        setStatus(`Synced ${mapped.length} orders with ${productCount} products`);
      } else {
        setStatus("Linked (no transactions yet -- try demo data for testing)");
      }
    } catch (err) {
      console.error("[link] Error:", err);
      setStatus("Error connecting -- try demo data instead");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 5000);
    }
  };

  const handleProceed = () => {
    if (collectedTransactions.current.length > 0) {
      onNext(collectedTransactions.current);
    } else {
      onNext(mockTransactions);
    }
  };

  const getIcon = (merchant: KnotMerchant) => {
    return ICON_MAP[merchant.category || ""] || ShoppingBag;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col items-center justify-center min-h-[70vh] px-4 max-w-2xl mx-auto"
    >
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
          <Link2 className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
          Link Your Accounts
        </h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Connect your retail accounts to scan your purchase history for hazardous products.
          Powered by KnotAPI TransactionLink.
        </p>
      </div>

      <div className="w-full space-y-3 mb-6">
        {loadingMerchants ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Loading merchants...</span>
          </div>
        ) : (
          merchants.map((merchant) => {
            const isLinked = linkedMerchants.includes(merchant.id);
            const Icon = getIcon(merchant);
            return (
              <Card
                key={merchant.id}
                className={`transition-all duration-300 ${isLinked ? "border-primary/30 bg-primary/5" : "hover:shadow-elegant cursor-pointer"}`}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {merchant.logo ? (
                      <img
                        src={merchant.logo}
                        alt={merchant.name}
                        className="w-10 h-10 rounded-xl object-contain bg-muted p-1"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
                        <Icon className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-foreground text-sm">{merchant.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {merchant.category || "Transaction history"} &middot; ID: {merchant.id}
                      </p>
                    </div>
                  </div>
                  {isLinked ? (
                    <Badge variant="safe" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Linked
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLinkMerchant(merchant.id)}
                      disabled={loading}
                      className="gap-1"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                      Connect
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {status && (
        <p className="text-xs text-muted-foreground mb-4 flex items-center gap-2">
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          {status}
        </p>
      )}

      <Card className="w-full border-dashed border-2 border-primary/20 bg-primary/5 mb-6">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Quick Demo
          </CardTitle>
          <CardDescription className="text-xs">
            Skip account linking and use pre-loaded demo data with known hazardous products.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Button variant="hero" size="sm" onClick={handleUseDemoData} className="w-full">
            Use Demo Data (14 products from 5 orders)
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-3 w-full">
        <Button variant="ghost" onClick={onBack} className="flex-1">
          Back
        </Button>
        {linkedMerchants.length > 0 && (
          <Button variant="default" onClick={handleProceed} className="flex-1">
            Continue with {linkedMerchants.length} account{linkedMerchants.length > 1 ? "s" : ""}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
