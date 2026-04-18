import { MockToggleProvider } from "@/hooks/useMockToggle";
import { MockToggle } from "@/components/layout/MockToggle";
import { WizardContainer } from "@/components/wizard/WizardContainer";
import "./index.css";

function App() {
  return (
    <MockToggleProvider>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="container flex items-center justify-between h-12 px-6">
            <span className="font-display font-bold text-foreground tracking-tight text-xl">
              Vigilant
            </span>
            <MockToggle />
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
