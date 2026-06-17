import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { db } from "./db";

type PinCtx = {
  hasPin: boolean;
  verified: boolean;
  loading: boolean;
  setupPins: (realPin: string, duressPin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  lock: () => void;
};

const Ctx = createContext<PinCtx | null>(null);

export function PinProvider({ children }: { children: ReactNode }) {
  const [hasPin, setHasPin] = useState(false);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.hasPin().then((has) => {
      setHasPin(has);
      setLoading(false);
    });
  }, []);

  return (
    <Ctx.Provider
      value={{
        hasPin,
        verified,
        loading,
        setupPins: async (realPin, duressPin) => {
          await db.setupPins(realPin, duressPin);
          setHasPin(true);
          setVerified(true);
        },
        verifyPin: async (pin) => {
          const result = await db.verifyPin(pin);
          if (result.ok) setVerified(true);
          return result.ok;
        },
        lock: () => setVerified(false),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePinLock() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePinLock must be used within PinProvider");
  return ctx;
}
