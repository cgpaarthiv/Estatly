import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { db, type GeneralPayment, type WorkPayment } from "@/lib/db";
import { fmtMoney } from "@/lib/data";
import {
  Plus, Trash2, Pencil, X, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Download, Loader2, Eye,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx-js-style";
import { styledSheet } from "@/lib/xlsx-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/projects/$projectId/general-payments")({
  component: GeneralPaymentsPage,
});

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Tab = "info" | "entry";

const PAGE_SIZE = 10;

/* Unified row type for the Info tab table */
type UnifiedRow = {
  id: string;
  date: string;
  particular: string;
  name: string | null;
  amount: number;
  method: "cash" | "bank";
  source: "general" | "work";
  notes: string | null;
};

function GeneralPaymentsPage() {
  const { projectId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("info");
  const [entries, setEntries] = useState<GeneralPayment[]>([]);
  const [workPayments, setWorkPayments] = useState<WorkPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [gp, wp] = await Promise.all([
      db.generalPayments.list(projectId),
      db.workPayments.list(projectId),
    ]);
    setEntries(gp);
    setWorkPayments(wp);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  /* merge both into unified rows for the Info tab */
  const allRows: UnifiedRow[] = useMemo(() => {
    const general: UnifiedRow[] = entries.map((e) => ({
      id: e.id,
      date: e.date,
      particular: e.particular,
      name: e.name,
      amount: e.amount,
      method: e.method,
      source: "general" as const,
      notes: e.notes,
    }));
    const work: UnifiedRow[] = workPayments.map((wp) => ({
      id: wp.id,
      date: wp.date,
      particular: wp.particular_key,
      name: wp.vendor,
      amount: wp.amount,
      method: wp.notes === "check" ? "bank" as const : "cash" as const,
      source: "work" as const,
      notes: wp.description,
    }));
    return [...general, ...work].sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, workPayments]);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-bold">General Payments</h1>
      <p className="text-sm text-muted-foreground">Track miscellaneous project payments.</p>

      <div className="mt-4 flex gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => setTab("info")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "info"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Info
        </button>
        <button
          onClick={() => setTab("entry")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "entry"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Entry
        </button>
      </div>

      {loading ? (
        <div className="mt-12 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
        </div>
      ) : tab === "info" ? (
        <InfoTab rows={allRows} />
      ) : (
        <EntryTab projectId={projectId} entries={entries} onRefresh={load} />
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   INFO TAB — table view of all entries
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function InfoTab({ rows }: { rows: UnifiedRow[] }) {
  const [q, setQ] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [showTotals, setShowTotals] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (q) {
        const query = q.toLowerCase();
        if (
          !r.particular.toLowerCase().includes(query) &&
          !(r.name ?? "").toLowerCase().includes(query)
        )
          return false;
      }
      if (methodFilter !== "all" && r.method !== methodFilter) return false;
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      return true;
    });
  }, [rows, q, methodFilter, sourceFilter]);

  const numbered = filtered.map((r, i) => ({ ...r, serial: i + 1 }));
  const totalPages = Math.max(1, Math.ceil(numbered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = numbered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const totalCash = filtered.filter((r) => r.method === "cash").reduce((s, r) => s + r.amount, 0);
  const totalBank = filtered.filter((r) => r.method === "bank").reduce((s, r) => s + r.amount, 0);
  const grandTotal = totalCash + totalBank;

  useEffect(() => { setPage(0); }, [q, methodFilter, sourceFilter]);

  function downloadPDF() {
    const doc = new jsPDF({ orientation: "portrait" });
    doc.setFontSize(16);
    doc.text("General Payments", 14, 18);
    doc.setFontSize(10);
    doc.text(`${numbered.length} payments`, 14, 25);

    const headers = ["S.No", "Date", "Particulars", "Name", "Amount", "Method"];
    const body = numbered.map((r) => [
      r.serial,
      new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      r.particular,
      r.name ?? "—",
      fmtMoney(r.amount),
      r.method === "bank" ? "Bank" : "Cash",
    ]);

    autoTable(doc, {
      head: [headers],
      body,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 101, 52] },
    });

    doc.save("General_Payments.pdf");
  }

  function downloadExcel() {
    const ws = styledSheet(
      numbered.map((r) => ({
        "S.No": r.serial,
        Date: r.date,
        Particulars: r.particular,
        Name: r.name ?? "—",
        Amount: r.amount,
        Method: r.method === "bank" ? "Bank" : "Cash",
        Source: r.source === "work" ? "Work Management" : "General",
      })),
      "General Payments",
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "General Payments");
    XLSX.writeFile(wb, "General_Payments.xlsx");
  }

  return (
    <div className="mt-6 space-y-4">
      {/* summary toggle */}
      <button
        onClick={() => setShowTotals((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm font-medium hover:bg-muted/50 transition"
      >
        <span>Payment Summary</span>
        {showTotals ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {showTotals && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Cash</div>
            <div className="mt-1 text-lg font-bold text-amber-600">{fmtMoney(totalCash)}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Bank</div>
            <div className="mt-1 text-lg font-bold text-blue-600">{fmtMoney(totalBank)}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Grand Total</div>
            <div className="mt-1 text-lg font-bold">{fmtMoney(grandTotal)}</div>
          </div>
        </div>
      )}

      {/* filters + download */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by particulars or name..."
            className="w-full rounded-lg border border-input bg-card pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All methods</option>
          <option value="cash">Cash</option>
          <option value="bank">Bank</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All sources</option>
          <option value="general">General</option>
          <option value="work">Work Management</option>
        </select>
        <button
          onClick={downloadPDF}
          disabled={numbered.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-primary bg-card px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> PDF
        </button>
        <button
          onClick={downloadExcel}
          disabled={numbered.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Excel
        </button>
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        {numbered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No payments found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">S.No</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Particulars</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Method</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={`${r.source}-${r.id}`} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground">{r.serial}</td>
                  <td className="px-4 py-3">
                    {new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium capitalize">{r.particular}</span>
                    {r.source === "work" && (
                      <span className="ml-2 inline-flex rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[9px] font-medium">
                        Work
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{r.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtMoney(r.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      r.method === "bank" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {r.method === "bank" ? "Bank" : "Cash"}
                    </span>
                  </td>
                </tr>
              ))}
              {/* totals row */}
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td colSpan={4} className="px-4 py-3 text-right">Total</td>
                <td className="px-4 py-3 text-right">{fmtMoney(grandTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ENTRY TAB — add/edit form + list
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

type FormData = {
  date: string;
  particular: string;
  name: string;
  amount: string;
  method: "cash" | "bank";
  notes: string;
};

const emptyForm: FormData = {
  date: today(),
  particular: "",
  name: "",
  amount: "",
  method: "cash",
  notes: "",
};

function EntryTab({
  projectId,
  entries,
  onRefresh,
}: {
  projectId: string;
  entries: GeneralPayment[];
  onRefresh: () => void;
}) {
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showParticularsDropdown, setShowParticularsDropdown] = useState(false);
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditId(null);
  };

  const existingParticulars = [...new Set(entries.map((e) => e.particular))];
  const existingNames = [...new Set(entries.map((e) => e.name).filter(Boolean) as string[])];

  const filteredParticulars = existingParticulars.filter(
    (p) => p.toLowerCase().includes(form.particular.toLowerCase()) && p.toLowerCase() !== form.particular.toLowerCase(),
  );
  const filteredNames = existingNames.filter(
    (n) => n.toLowerCase().includes(form.name.toLowerCase()) && n.toLowerCase() !== form.name.toLowerCase(),
  );

  const startEdit = (e: GeneralPayment) => {
    setEditId(e.id);
    setForm({
      date: e.date,
      particular: e.particular,
      name: e.name ?? "",
      amount: e.amount.toString(),
      method: e.method,
      notes: e.notes ?? "",
    });
  };

  const handleSave = async () => {
    if (!form.particular.trim()) {
      toast.error("Please enter particulars");
      return;
    }
    const amt = parseFloat(form.amount) || 0;
    if (amt <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await db.generalPayments.update({
          id: editId,
          date: form.date,
          particular: form.particular.trim(),
          name: form.name.trim() || undefined,
          amount: amt,
          method: form.method,
          notes: form.notes.trim() || undefined,
        });
        toast.success("Entry updated");
      } else {
        await db.generalPayments.create({
          projectId,
          date: form.date,
          particular: form.particular.trim(),
          name: form.name.trim() || undefined,
          amount: amt,
          method: form.method,
          notes: form.notes.trim() || undefined,
        });
        toast.success("Entry added");
      }
      resetForm();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    await db.generalPayments.delete(confirmDeleteId);
    toast.success("Entry deleted");
    if (editId === confirmDeleteId) resetForm();
    setConfirmDeleteId(null);
    onRefresh();
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Form */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{editId ? "Edit Entry" : "Add Entry"}</h2>
          {editId && (
            <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="h-3 w-3" /> Cancel edit
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground">Particulars</label>
            <input
              type="text"
              value={form.particular}
              onChange={(e) => { set("particular", e.target.value); setShowParticularsDropdown(true); }}
              onFocus={() => setShowParticularsDropdown(true)}
              onBlur={() => setTimeout(() => setShowParticularsDropdown(false), 150)}
              placeholder="e.g. Office rent, Transport, Misc..."
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
            {showParticularsDropdown && filteredParticulars.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border bg-background shadow-lg max-h-40 overflow-y-auto">
                {filteredParticulars.map((p) => (
                  <button
                    key={p}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { set("particular", p); setShowParticularsDropdown(false); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition capitalize"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => { set("name", e.target.value); setShowNameDropdown(true); }}
              onFocus={() => setShowNameDropdown(true)}
              onBlur={() => setTimeout(() => setShowNameDropdown(false), 150)}
              placeholder="e.g. Person or vendor name..."
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
            {showNameDropdown && filteredNames.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border bg-background shadow-lg max-h-40 overflow-y-auto">
                {filteredNames.map((n) => (
                  <button
                    key={n}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { set("name", n); setShowNameDropdown(false); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition capitalize"
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text" inputMode="decimal"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="0"
                min="0"
                className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <div className="flex shrink-0 rounded-lg border bg-muted p-0.5">
                <button
                  onClick={() => set("method", "cash")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    form.method === "cash" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Cash
                </button>
                <button
                  onClick={() => set("method", "bank")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    form.method === "bank" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Bank
                </button>
              </div>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any additional notes..."
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {editId ? "Update Entry" : "Add Entry"}
          </button>
        </div>
      </div>

      {/* Entry list */}
      {entries.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-semibold">All Entries ({entries.length})</h3>
          </div>
          <div className="divide-y">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{e.particular}</span>
                    {e.name && (
                      <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[10px] font-medium">
                        {e.name}
                      </span>
                    )}
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      e.method === "bank" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {e.method === "bank" ? "Bank" : "Cash"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    {e.notes ? ` · ${e.notes}` : ""}
                  </div>
                </div>
                <div className="text-right font-semibold text-sm">{fmtMoney(e.amount)}</div>
                <div className="flex gap-1">
                  <button
                    onClick={() => startEdit(e)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(e.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Confirm Delete</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this entry? This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

