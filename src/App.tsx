import { useEffect, useState } from "react";
import { MockToggleProvider } from "@/hooks/useMockToggle";
import { MockToggle } from "@/components/layout/MockToggle";
import { WizardContainer } from "@/components/wizard/WizardContainer";
import { Shield, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./index.css";

function App() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Sign in anonymously so Edge Function calls pass auth
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
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <MockToggleProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 glass-strong">
          <div className="container flex items-center justify-between h-14 px-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <span className="font-bold text-foreground tracking-tight">Vigilant</span>
            </div>
            <MockToggle />
          </div>
        </header>

        {/* Main content */}
        <main className="container pb-8">
          <WizardContainer />
        </main>
      </div>
    </MockToggleProvider>
  );
}

export default App;
