import { MockToggleProvider } from "@/hooks/useMockToggle";
import { MockToggle } from "@/components/layout/MockToggle";
import { WizardContainer } from "@/components/wizard/WizardContainer";
import { Shield } from "lucide-react";
import "./index.css";

function App() {
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
