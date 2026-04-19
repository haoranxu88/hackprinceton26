import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMockToggle } from "@/hooks/useMockToggle";
import { scrapeSettlements } from "@/lib/api";
import { Loader2, RefreshCw } from "lucide-react";

export function SettlementSyncButton() {
  const { isMock } = useMockToggle();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (isMock) return null;

  const handleClick = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await scrapeSettlements() as { totalUpserted?: number; results?: { source: string; upserted: number }[] };
      const n = res?.totalUpserted ?? 0;
      setMessage(`Synced ${n} settlement(s)`);
    } catch {
      setMessage("Sync failed — check Edge Function logs");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1.5"
        disabled={loading}
        onClick={handleClick}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        Settlements
      </Button>
      {message && <span className="text-[10px] text-muted-foreground max-w-[140px] leading-tight">{message}</span>}
    </div>
  );
}
