import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useMockToggle } from "@/hooks/useMockToggle";
import { linkKnotAccount, syncKnotTransactions } from "@/lib/api";
import { mockTransactions, type Transaction } from "@/data/mock-transactions";
import { Link2, ShoppingBag, Store, Pill, ChevronRight, Database, Loader2, CheckCircle2 } from "lucide-react";

const MERCHANTS = [
  { id: 19, name: "Amazon", icon: ShoppingBag, color: "bg-accent/10 text-accent" },
  { id: 4, name: "Walmart", icon: Store, color: "bg-primary/10 text-primary" },
  { id: 46, name: "CVS", icon: Pill, color: "bg-destructive/10 text-destructive" },
];

interface LinkAccountsStepProps {
  onNext: (transactions: Transaction[]) => void;
  onBack: () => void;
}

export function LinkAccountsStep({ onNext, onBack }: LinkAccountsStepProps) {
  const { isMock } = useMockToggle();
  const [loading, setLoading] = useState(false);
  const [linkedMerchants, setLinkedMerchants] = useState<number[]>([]);
  const [status, setStatus] = useState<string>("");
  const collectedTransactions = useRef<Transaction[]>([]);

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
      // Use a stable user ID so we can sync across merchants
      const userId = `vigilant-demo-user`;

      // Step 1: Link account + generate sample transactions
      setStatus("Linking account...");
      console.log("[link] Linking merchant", merchantId, "for user", userId);
      const linkResult = await linkKnotAccount(userId, merchantId);
      console.log("[link] Link result:", linkResult);

      // Step 2: Sync transactions
      setStatus("Syncing transactions...");
      const syncResult = await syncKnotTransactions(userId, merchantId);
      console.log("[link] Sync result:", JSON.stringify(syncResult).slice(0, 500));

      setLinkedMerchants((prev) => [...prev, merchantId]);

      // Map Knot transactions to our format
      if (syncResult?.transactions && syncResult.transactions.length > 0) {
        const mapped: Transaction[] = syncResult.transactions.map((t: Record<string, unknown>) => ({
          id: (t.id as string) || `knot-${Date.now()}`,
          date: (t.datetime as string) || new Date().toISOString(),
          merchant: syncResult.merchant?.name || "Unknown",
          total: parseFloat((t.price as Record<string, string>)?.total || "0"),
          products: ((t.products as Array<Record<string, unknown>>) || []).map((p) => ({
            name: (p.name as string) || "Unknown Product",
            description: (p.description as string) || "",
            price: parseFloat((p.price as Record<string, string>)?.total || "0"),
            quantity: (p.quantity as number) || 1,
            imageUrl: (p.image_url as string) || undefined,
          })),
        }));
        collectedTransactions.current = [...collectedTransactions.current, ...mapped];
        setStatus(`Synced ${mapped.length} orders with ${mapped.reduce((s, t) => s + t.products.length, 0)} products`);
      } else {
        setStatus("Account linked (no transactions yet - try syncing again or use demo data)");
      }
    } catch (err) {
      console.error("Error linking merchant:", err);
      setStatus("Error connecting - try demo data instead");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 4000);
    }
  };

  const handleProceed = () => {
    if (collectedTransactions.current.length > 0) {
      onNext(collectedTransactions.current);
    } else {
      // Fallback to mock if no real transactions
      onNext(mockTransactions);
    }
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
        {MERCHANTS.map((merchant) => {
          const isLinked = linkedMerchants.includes(merchant.id);
          return (
            <Card
              key={merchant.id}
              className={`transition-all duration-300 ${isLinked ? "border-primary/30 bg-primary/5" : "hover:shadow-elegant cursor-pointer"}`}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${merchant.color}`}>
                    <merchant.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{merchant.name}</p>
                    <p className="text-xs text-muted-foreground">Transaction history</p>
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
        })}
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
