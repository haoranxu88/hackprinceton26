import { Switch } from "@/components/ui/switch";
import { useMockToggle } from "@/hooks/useMockToggle";
import { Database, Wifi } from "lucide-react";

export function MockToggle() {
  const { isMock, setIsMock } = useMockToggle();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {isMock ? (
          <>
            <Database className="w-3 h-3" />
            <span className="hidden sm:inline">Demo</span>
          </>
        ) : (
          <>
            <Wifi className="w-3 h-3" />
            <span className="hidden sm:inline">Live</span>
          </>
        )}
      </span>
      <Switch
        checked={!isMock}
        onCheckedChange={(checked) => setIsMock(!checked)}
      />
    </div>
  );
}
