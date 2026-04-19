import { createContext, useContext, useState, type ReactNode } from "react";

interface MockToggleContextType {
  isMock: boolean;
  setIsMock: (value: boolean) => void;
}

const MockToggleContext = createContext<MockToggleContextType | undefined>(undefined);

export function MockToggleProvider({ children }: { children: ReactNode }) {
  const [isMock, setIsMock] = useState(false);

  return (
    <MockToggleContext.Provider value={{ isMock, setIsMock }}>
      {children}
    </MockToggleContext.Provider>
  );
}

export function useMockToggle() {
  const context = useContext(MockToggleContext);
  if (!context) throw new Error("useMockToggle must be used within MockToggleProvider");
  return context;
}
