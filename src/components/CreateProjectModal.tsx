import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { toast } from "sonner";

export function CreateProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [lp, setLp] = useState("");
  const [desc, setDesc] = useState("");
  const [plotCount, setPlotCount] = useState(20);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const project = await db.projects.create({
        name,
        lp_number: lp,
        description: desc || undefined,
      });

      if (plotCount > 0) {
        await db.plots.bulkCreate(project.id, plotCount);
      }

      toast.success("Project created");
      setName("");
      setLp("");
      setDesc("");
      setPlotCount(20);
      onCreated(project.id);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed");
    }
    setBusy(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Create project</h2>
              <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <Field label="Project name" value={name} onChange={setName} required />
              <Field label="LP number" value={lp} onChange={setLp} required />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Initial plots</span>
                <input
                  type="text" inputMode="decimal"
                  min={0}
                  max={1000}
                  value={plotCount}
                  onChange={(e) => setPlotCount(Number(e.target.value))}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  We'll auto-generate plot numbers (001, 002, …). You can add more later.
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Description (optional)</span>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                />
              </label>
              <button
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create project
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}
