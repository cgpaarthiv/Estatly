import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Lock, Loader2, ShieldAlert } from "lucide-react";
import { usePinLock } from "@/lib/pin-context";
import logoImg from "@/assets/logo.png";

export function PinLock() {
  const { hasPin, setupPins, verifyPin } = usePinLock();
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [duressPin, setDuressPin] = useState("");
  const [duressConfirm, setDuressConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    if (!hasPin) {
      if (pin.length < 4) {
        setError("PIN must be at least 4 characters");
        setBusy(false);
        return;
      }
      if (pin !== confirm) {
        setError("PINs do not match");
        setBusy(false);
        return;
      }
      if (duressPin.length < 4) {
        setError("Duress PIN must be at least 4 characters");
        setBusy(false);
        return;
      }
      if (duressPin !== duressConfirm) {
        setError("Duress PINs do not match");
        setBusy(false);
        return;
      }
      if (pin === duressPin) {
        setError("Main PIN and duress PIN must be different");
        setBusy(false);
        return;
      }
      await setupPins(pin, duressPin);
    } else {
      const ok = await verifyPin(pin);
      if (!ok) {
        setError("Incorrect PIN");
        setPinValue("");
      }
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center">
          <img src={logoImg} alt="Estatly" className="mx-auto h-14 w-14" />
          <h1 className="mt-6 font-display text-3xl font-bold">Estatly</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasPin
              ? "Enter your PIN to unlock"
              : "Set up your security PINs"}
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1 text-sm font-medium">
              <Lock className="h-3.5 w-3.5" />
              {hasPin ? "PIN" : "Main PIN"}
            </span>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPinValue(e.target.value)}
              placeholder={hasPin ? "Enter PIN" : "Your real PIN"}
              required
              autoFocus
              className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          {!hasPin && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  Confirm main PIN
                </span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm your real PIN"
                  required
                  className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <div className="border-t border-border pt-4">
                <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  Duress PIN opens a decoy account with fake data
                </p>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1 text-sm font-medium">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Duress PIN
                  </span>
                  <input
                    type="password"
                    value={duressPin}
                    onChange={(e) => setDuressPin(e.target.value)}
                    placeholder="PIN for decoy mode"
                    required
                    className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  Confirm duress PIN
                </span>
                <input
                  type="password"
                  value={duressConfirm}
                  onChange={(e) => setDuressConfirm(e.target.value)}
                  placeholder="Confirm duress PIN"
                  required
                  className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {hasPin ? "Unlock" : "Set up PINs"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Your data is stored locally and never leaves this device.
        </p>
      </motion.div>
    </div>
  );
}
