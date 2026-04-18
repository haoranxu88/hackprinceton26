import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useMockToggle } from "@/hooks/useMockToggle";
import { createKnotSession, linkKnotAccount, syncKnotTransactions } from "@/lib/api";
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
      setStatus("Creating session...");
      const userId = `vigilant-user-${Date.now()}`;

      // Create session for TransactionLink
      await createKnotSession(userId);

      // In development, link account server-side
      setStatus("Linking account...");
      await linkKnotAccount(userId, merchantId);

      // Sync transactions
      setStatus("Syncing transactions...");
      const result = await syncKnotTransactions(userId, merchantId);

      setLinkedMerchants((prev) => [...prev, merchantId]);
      setStatus("");

      if (result?.transactions) {
        onNext(result.transactions);
      }
    } catch (err) {
      console.error("Error linking merchant:", err);
      setStatus("Error - falling back to demo data");
      setTimeout(() => {
        setStatus("");
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleProceed = () => {
    if (isMock || linkedMerchants.length > 0) {
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
          <Loader2 className="w-3 h-3 animate-spin" />
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
