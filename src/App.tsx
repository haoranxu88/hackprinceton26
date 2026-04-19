import { useEffect, useState } from "react";
import { MockToggleProvider } from "@/hooks/useMockToggle";
import { MockToggle } from "@/components/layout/MockToggle";
import { SettlementSyncButton } from "@/components/layout/SettlementSyncButton";
import { WizardContainer } from "@/components/wizard/WizardContainer";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./index.css";

function App() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await supabase.auth.signInAnonymously();
      }
      setAuthReady(true);
    };
    initAuth();
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <MockToggleProvider>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/50">
          <div className="container flex items-center justify-between h-14 px-6">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-sm bg-primary flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1L10 3.5V8.5L6 11L2 8.5V3.5L6 1Z" stroke="hsl(38,22%,97%)" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="font-display font-semibold text-foreground tracking-tight text-sm">Vigilant</span>
            </div>
            <div className="flex items-center gap-3">
              <SettlementSyncButton />
              <MockToggle />
            </div>
          </div>
        </header>

        <main className="container pb-16">
          <WizardContainer />
        </main>
      </div>
    </MockToggleProvider>
  );
}

export default App;
