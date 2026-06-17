import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { db, type WorkEntry, type WorkDoneEntry, type WorkPayment, type WorkBill } from "@/lib/db";
import { fmtMoney } from "@/lib/data";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Clock, Package, Pencil, X,
  ClipboardList, ListChecks, IndianRupee, Search, Eye, User, Ruler,
  Upload, FileText, Receipt, ImageIcon, UserCircle, CalendarDays, Download,
} from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { styledSheet } from "@/lib/xlsx-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

export const Route = createFileRoute("/projects/$projectId/work")({
  component: WorkManagement,
});

/* â"€â"€ helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type AnyEntry = WorkEntry | WorkDoneEntry;

function calcTotal(e: AnyEntry): number {
  if (e.pricing_type === "iron") {
    return e.price_per_quantity ?? 0;
  }
  if (e.pricing_type === "daily") {
    return (e.total_quantity ?? 0) * (e.price_per_quantity ?? 0);
  }
  if (e.pricing_type === "quantity") {
    return (e.total_quantity ?? 0) * (e.price_per_quantity ?? 0);
  }
  return ((e.time_worked_minutes ?? 0) / 60) * (e.price_per_hour ?? 0);
}

function fmtTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/* â"€â"€ types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */

type Tab = "dashboard" | "details" | "info";
type SubTab = "materials" | "done";

type FormData = {
  date: string;
  particular: string;
  name: string;
  pricingType: "quantity" | "time" | "iron" | "daily";
  totalQuantity: string;
  pricePerQuantity: string;
  ironTotalPrice: string;
  pricePerHour: string;
  timeHours: string;
  timeMinutes: string;
  totalDays: string;
  pricePerDay: string;
  notes: string;
};

const emptyForm: FormData = {
  date: today(),
  particular: "",
  name: "",
  pricingType: "quantity",
  totalQuantity: "",
  pricePerQuantity: "",
  ironTotalPrice: "",
  pricePerHour: "",
  timeHours: "",
  timeMinutes: "",
  totalDays: "",
  pricePerDay: "",
  notes: "",
};

/* â"€â"€ main component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */

function WorkManagement() {
  const { projectId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [materialEntries, setMaterialEntries] = useState<WorkEntry[]>([]);
  const [workDoneEntries, setWorkDoneEntries] = useState<WorkDoneEntry[]>([]);
  const [payments, setPayments] = useState<WorkPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [m, w, p] = await Promise.all([
      db.workEntries.list(projectId),
      db.workDone.list(projectId),
      db.workPayments.list(projectId),
    ]);
    setMaterialEntries(m);
    setWorkDoneEntries(w);
    setPayments(p);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-bold">Work Management</h1>

      <div className="mt-4 flex gap-1 rounded-lg bg-muted p-1">
        {([
          { key: "dashboard" as Tab, label: "Dashboard" },
          { key: "details" as Tab, label: "Work Details" },
          { key: "info" as Tab, label: "Info" },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : tab === "dashboard" ? (
        <Dashboard
          projectId={projectId}
          materialEntries={materialEntries}
          workDoneEntries={workDoneEntries}
          payments={payments}
          onRefresh={load}
        />
      ) : tab === "details" ? (
        <WorkDetailsTab projectId={projectId} materialEntries={materialEntries} workDoneEntries={workDoneEntries} onRefresh={load} />
      ) : (
        <InfoPage projectId={projectId} materialEntries={materialEntries} workDoneEntries={workDoneEntries} payments={payments} />
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DASHBOARD
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

type GroupData = {
  key: string;
  label: string;
  source: "material" | "work_done";
  items: AnyEntry[];
  totalCost: number;
  totalPaid: number;
  balance: number;
  payments: WorkPayment[];
};

type DashboardView = "materials" | "work_done";

function Dashboard({
  projectId,
  materialEntries,
  workDoneEntries,
  payments,
  onRefresh,
}: {
  projectId: string;
  materialEntries: WorkEntry[];
  workDoneEntries: WorkDoneEntry[];
  payments: WorkPayment[];
  onRefresh: () => void;
}) {
  const [view, setView] = useState<DashboardView>("materials");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payingGroup, setPayingGroup] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [payMethod, setPayMethod] = useState<"cash" | "check">("cash");
  const [payVendor, setPayVendor] = useState("");
  const [payDescription, setPayDescription] = useState("");

  const materialGroups = useMemo(() => buildGroups(materialEntries, "material", payments), [materialEntries, payments]);
  const workDoneGroups = useMemo(() => buildGroups(workDoneEntries, "work_done", payments), [workDoneEntries, payments]);

  const hasEntries = materialEntries.length > 0 || workDoneEntries.length > 0;

  if (!hasEntries) {
    return (
      <div className="mt-16 text-center text-sm text-muted-foreground">
        No entries yet. Go to <span className="font-medium">Work Details</span> to add entries.
      </div>
    );
  }

  const handleAddPayment = async (g: GroupData) => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    await db.workPayments.create({
      projectId,
      source: g.source,
      particularKey: g.key,
      amount: amt,
      date: payDate,
      notes: payMethod,
      vendor: payVendor || undefined,
      description: payDescription || undefined,
    });
    toast.success("Payment added");
    setPayingGroup(null);
    setPayAmount("");
    setPayDate(today());
    setPayMethod("cash");
    setPayVendor("");
    setPayDescription("");
    onRefresh();
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<{ type: "payment" | "entry"; id: string } | null>(null);

  const handleDeletePayment = (id: string) => {
    setConfirmDeleteId({ type: "payment", id });
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    if (confirmDeleteId.type === "payment") {
      await db.workPayments.delete(confirmDeleteId.id);
      toast.success("Payment deleted");
    }
    setConfirmDeleteId(null);
    onRefresh();
  };

  const activeGroups = view === "materials" ? materialGroups : workDoneGroups;
  const activeColor = view === "materials" ? "emerald" : "blue";

  return (
    <div className="mt-6 space-y-5">
      {/* toggle between materials / work done */}
      <div className="flex gap-1 rounded-lg border bg-card p-1">
        <button
          onClick={() => { setView("materials"); setExpanded(null); setPayingGroup(null); }}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
            view === "materials"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Package className="h-4 w-4" />
          Materials
          <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            view === "materials" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
          }`}>
            {materialEntries.length}
          </span>
        </button>
        <button
          onClick={() => { setView("work_done"); setExpanded(null); setPayingGroup(null); }}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
            view === "work_done"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <ListChecks className="h-4 w-4" />
          Work Done
          <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            view === "work_done" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
          }`}>
            {workDoneEntries.length}
          </span>
        </button>
      </div>

      {/* group cards */}
      {activeGroups.length === 0 ? (
        <div className="mt-12 text-center text-sm text-muted-foreground">
          No {view === "materials" ? "material" : "work done"} entries yet.
        </div>
      ) : (
        <div className="space-y-3">
          {activeGroups.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              expanded={expanded}
              setExpanded={setExpanded}
              payingGroup={payingGroup}
              setPayingGroup={setPayingGroup}
              payAmount={payAmount}
              setPayAmount={setPayAmount}
              payDate={payDate}
              setPayDate={setPayDate}
              payMethod={payMethod}
              setPayMethod={setPayMethod}
              payVendor={payVendor}
              setPayVendor={setPayVendor}
              payDescription={payDescription}
              setPayDescription={setPayDescription}
              onAddPayment={() => handleAddPayment(g)}
              onDeletePayment={handleDeletePayment}
              color={activeColor}
            />
          ))}
        </div>
      )}

      {/* delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Confirm Delete</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this payment? This action cannot be undone.
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

function buildGroups(entries: AnyEntry[], source: "material" | "work_done", payments: WorkPayment[]): GroupData[] {
  const map = new Map<string, AnyEntry[]>();
  for (const e of entries) {
    const key = e.particular.trim().toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => {
      const totalCost = items.reduce((s, e) => s + calcTotal(e), 0);
      const groupPayments = payments.filter((p) => p.source === source && p.particular_key === key);
      const totalPaid = groupPayments.reduce((s, p) => s + p.amount, 0);
      return {
        key,
        label: items[0].particular,
        source,
        items: items.sort((a, b) => a.date.localeCompare(b.date)),
        totalCost,
        totalPaid,
        balance: totalCost - totalPaid,
        payments: groupPayments,
      };
    });
}

/* â"€â"€ GROUP CARD â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */

function GroupCard({
  group: g,
  expanded,
  setExpanded,
  payingGroup,
  setPayingGroup,
  payAmount,
  setPayAmount,
  payDate,
  setPayDate,
  payMethod,
  setPayMethod,
  payVendor,
  setPayVendor,
  payDescription,
  setPayDescription,
  onAddPayment,
  onDeletePayment,
  color,
}: {
  group: GroupData;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  payingGroup: string | null;
  setPayingGroup: (v: string | null) => void;
  payAmount: string;
  setPayAmount: (v: string) => void;
  payDate: string;
  setPayDate: (v: string) => void;
  payMethod: "cash" | "check";
  setPayMethod: (v: "cash" | "check") => void;
  payVendor: string;
  setPayVendor: (v: string) => void;
  payDescription: string;
  setPayDescription: (v: string) => void;
  onAddPayment: () => void;
  onDeletePayment: (id: string) => void;
  color: "emerald" | "blue";
}) {
  const isOpen = expanded === `${g.source}:${g.key}`;
  const isTime = g.items[0]?.pricing_type === "time";
  const isIron = g.items[0]?.pricing_type === "iron";
  const isDaily = g.items[0]?.pricing_type === "daily";
  const totalQty = g.items.reduce((s, e) => s + (e.total_quantity ?? 0), 0);
  const totalMins = g.items.reduce((s, e) => s + (e.time_worked_minutes ?? 0), 0);
  const cardKey = `${g.source}:${g.key}`;

  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  /* build per-vendor data */
  const vendorData = useMemo(() => {
    const vendorCosts: Record<string, number> = {};
    const vendorEntries: Record<string, AnyEntry[]> = {};
    const vendorPayments: Record<string, WorkPayment[]> = {};

    g.items.forEach((e) => {
      const vn = ("name" in e ? (e as WorkEntry).name : null) || "No vendor";
      vendorCosts[vn] = (vendorCosts[vn] || 0) + calcTotal(e);
      if (!vendorEntries[vn]) vendorEntries[vn] = [];
      vendorEntries[vn].push(e);
    });
    g.payments.forEach((p) => {
      const vn = p.vendor || "No vendor";
      if (!vendorPayments[vn]) vendorPayments[vn] = [];
      vendorPayments[vn].push(p);
    });

    const allKeys = [...new Set([...Object.keys(vendorCosts), ...Object.keys(vendorPayments)])];
    // named vendors first, "No vendor" last
    const sorted = allKeys.filter((v) => v !== "No vendor").sort((a, b) => a.localeCompare(b));
    if (allKeys.includes("No vendor")) sorted.push("No vendor");

    return sorted.map((vendor) => {
      const cost = vendorCosts[vendor] || 0;
      const entries = vendorEntries[vendor] || [];
      const pmts = vendorPayments[vendor] || [];
      const paid = pmts.reduce((s, p) => s + p.amount, 0);
      return { vendor, cost, paid, balance: cost - paid, entries, payments: pmts };
    });
  }, [g.items, g.payments]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* header */}
      <button
        onClick={() => { setExpanded(isOpen ? null : cardKey); setExpandedVendor(null); }}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/50 transition"
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            color === "emerald" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
          }`}>
            {isIron ? <Ruler className="h-4 w-4" /> : isDaily ? <CalendarDays className="h-4 w-4" /> : isTime ? <Clock className="h-4 w-4" /> : <Package className="h-4 w-4" />}
          </div>
          <div>
            <div className="font-semibold capitalize">{g.label}</div>
            <div className="text-xs text-muted-foreground">
              {g.items.length} {g.items.length === 1 ? "entry" : "entries"}
              {isIron ? ` · ${totalQty} ${g.source === "work_done" ? "units" : "qty"}` : isDaily ? ` · ${totalQty} days` : isTime ? ` · ${fmtTime(totalMins)}` : ` · ${totalQty} ${g.source === "work_done" ? "units" : "qty"}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-muted-foreground">Balance</div>
            <div className={`text-sm font-bold ${g.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {g.balance > 0 ? fmtMoney(g.balance) : g.balance < 0 ? `${fmtMoney(Math.abs(g.balance))} extra` : "Settled"}
            </div>
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t">
              {/* overall summary */}
              <div className="px-5 py-3 bg-muted/20 flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Total Cost</span>
                  <span className="text-sm font-bold">{fmtMoney(g.totalCost)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Paid</span>
                  <span className="text-sm font-bold text-emerald-600">{fmtMoney(g.totalPaid)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Balance</span>
                  <span className={`text-sm font-bold ${g.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {fmtMoney(Math.abs(g.balance))}
                    {g.balance < 0 && <span className="text-[10px] ml-1">(overpaid)</span>}
                  </span>
                </div>
              </div>

              {/* vendor list */}
              <div className="divide-y">
                {vendorData.map((v) => {
                  const isVendorOpen = expandedVendor === v.vendor;
                  const isPaying = payingGroup === `${cardKey}::${v.vendor}`;
                  const paidPct = v.cost > 0 ? Math.min(100, (v.paid / v.cost) * 100) : (v.paid > 0 ? 100 : 0);
                  const isNoVendor = v.vendor === "No vendor";

                  return (
                    <div key={v.vendor}>
                      {/* vendor row — clickable */}
                      <button
                        onClick={() => setExpandedVendor(isVendorOpen ? null : v.vendor)}
                        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-muted/30 transition"
                      >
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                          isNoVendor ? "bg-muted text-muted-foreground" : "bg-blue-50 text-blue-600"
                        }`}>
                          <UserCircle className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-sm ${isNoVendor ? "text-muted-foreground" : ""}`}>{v.vendor}</div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${paidPct >= 100 ? "bg-emerald-500" : "bg-amber-500"}`}
                                style={{ width: `${paidPct}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-muted-foreground">{v.entries.length} entries</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-muted-foreground">{fmtMoney(v.cost)}</div>
                          <div className={`text-sm font-bold ${v.balance > 0 ? "text-red-600" : v.balance < 0 ? "text-emerald-600" : "text-emerald-600"}`}>
                            {v.balance > 0 ? `${fmtMoney(v.balance)} due` : v.balance < 0 ? `${fmtMoney(Math.abs(v.balance))} extra` : "Settled"}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {isVendorOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                      </button>

                      {/* vendor expanded content */}
                      <AnimatePresence>
                        {isVendorOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                          >
                            <div className="mx-3 sm:mx-5 mb-4 rounded-xl border bg-background overflow-x-auto">
                              {/* vendor summary strip */}
                              <div className="grid grid-cols-3 gap-3 px-4 py-3 bg-muted/30 rounded-t-xl">
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost</div>
                                  <div className="font-bold text-sm">{fmtMoney(v.cost)}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid</div>
                                  <div className="font-bold text-sm text-emerald-600">{fmtMoney(v.paid)}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</div>
                                  <div className={`font-bold text-sm ${v.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                    {fmtMoney(Math.abs(v.balance))}
                                  </div>
                                </div>
                              </div>

                              {/* entries */}
                              {v.entries.length > 0 && (
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                                      <th className="px-4 py-1.5 text-left font-medium">Date</th>
                                      {isTime ? (
                                        <>
                                          <th className="px-3 py-1.5 text-right font-medium">Time</th>
                                          <th className="px-3 py-1.5 text-right font-medium">Rate/hr</th>
                                        </>
                                      ) : isDaily ? (
                                        <>
                                          <th className="px-3 py-1.5 text-right font-medium">Days</th>
                                          <th className="px-3 py-1.5 text-right font-medium">Rate/day</th>
                                        </>
                                      ) : (
                                        <>
                                          <th className="px-3 py-1.5 text-right font-medium">{g.source === "work_done" ? "Units" : "Qty"}</th>
                                          <th className="px-3 py-1.5 text-right font-medium">{isIron ? "Price" : "Rate"}</th>
                                        </>
                                      )}
                                      <th className="px-4 py-1.5 text-right font-medium">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...v.entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => (
                                      <tr key={e.id} className="border-b last:border-b-0 hover:bg-muted/20">
                                        <td className="px-4 py-2">
                                          <div>{new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                                          {e.notes && <div className="text-[11px] text-muted-foreground">{e.notes}</div>}
                                        </td>
                                        {isTime ? (
                                          <>
                                            <td className="px-3 py-2 text-right">{fmtTime(e.time_worked_minutes ?? 0)}</td>
                                            <td className="px-3 py-2 text-right">{fmtMoney(e.price_per_hour ?? 0)}</td>
                                          </>
                                        ) : isDaily ? (
                                          <>
                                            <td className="px-3 py-2 text-right">{e.total_quantity ?? 0}</td>
                                            <td className="px-3 py-2 text-right">{fmtMoney(e.price_per_quantity ?? 0)}</td>
                                          </>
                                        ) : (
                                          <>
                                            <td className="px-3 py-2 text-right">{e.total_quantity ?? 0}</td>
                                            <td className="px-3 py-2 text-right">{fmtMoney(e.price_per_quantity ?? 0)}</td>
                                          </>
                                        )}
                                        <td className="px-4 py-2 text-right font-medium">{fmtMoney(calcTotal(e))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}

                              {/* payments for this vendor */}
                              {v.payments.length > 0 && (
                                <div className="border-t">
                                  <div className="px-4 py-1.5 bg-emerald-50/50 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                                    Payments
                                  </div>
                                  {v.payments.sort((a, b) => a.date.localeCompare(b.date)).map((p) => (
                                    <div key={p.id} className="flex items-center justify-between px-4 py-2 border-b last:border-b-0 hover:bg-emerald-50/30">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm">{new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                            p.notes === "check" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                                          }`}>
                                            {p.notes === "check" ? "Check" : "Cash"}
                                          </span>
                                        </div>
                                        {p.description && (
                                          <div className="text-xs text-muted-foreground/80 mt-0.5 italic">— {p.description}</div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-semibold text-emerald-700">{fmtMoney(p.amount)}</span>
                                        <button
                                          onClick={() => onDeletePayment(p.id)}
                                          className="rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* add payment for this vendor */}
                              <div className="border-t px-4 py-2.5">
                                {isPaying ? (
                                  <div className="space-y-3">
                                    <div className="grid gap-3 sm:grid-cols-3">
                                      <div>
                                        <label className="text-xs font-medium text-muted-foreground">Amount</label>
                                        <input
                                          type="text" inputMode="decimal"
                                          value={payAmount}
                                          onChange={(e) => setPayAmount(e.target.value)}
                                          placeholder="0"
                                          min="0"
                                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                                          autoFocus
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs font-medium text-muted-foreground">Date</label>
                                        <input
                                          type="date"
                                          value={payDate}
                                          onChange={(e) => setPayDate(e.target.value)}
                                          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs font-medium text-muted-foreground">Method</label>
                                        <div className="mt-1 flex gap-1 rounded-lg border bg-muted p-0.5">
                                          <button
                                            onClick={() => setPayMethod("cash")}
                                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                                              payMethod === "cash" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                            }`}
                                          >
                                            Cash
                                          </button>
                                          <button
                                            onClick={() => setPayMethod("check")}
                                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                                              payMethod === "check" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                            }`}
                                          >
                                            Check
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
                                      <input
                                        type="text"
                                        value={payDescription}
                                        onChange={(e) => setPayDescription(e.target.value)}
                                        placeholder="e.g. Advance payment, Final settlement..."
                                        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                                      />
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        onClick={() => { setPayingGroup(null); setPayAmount(""); setPayMethod("cash"); setPayVendor(""); setPayDescription(""); }}
                                        className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={onAddPayment}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                      >
                                        <Plus className="h-3 w-3" /> Add Payment
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setPayingGroup(`${cardKey}::${v.vendor}`);
                                      setPayAmount("");
                                      setPayDate(today());
                                      setPayMethod("cash");
                                      setPayVendor(isNoVendor ? "" : v.vendor);
                                      setPayDescription("");
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition w-full justify-center"
                                  >
                                    <Plus className="h-3 w-3" /> Add Payment
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   WORK DETAILS TAB
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function WorkDetailsTab({
  projectId,
  materialEntries,
  workDoneEntries,
  onRefresh,
}: {
  projectId: string;
  materialEntries: WorkEntry[];
  workDoneEntries: WorkDoneEntry[];
  onRefresh: () => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>("materials");

  return (
    <div className="mt-6 space-y-5">
      <div className="flex gap-1 rounded-lg border bg-card p-1">
        <button
          onClick={() => setSubTab("materials")}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
            subTab === "materials"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Add Materials
        </button>
        <button
          onClick={() => setSubTab("done")}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
            subTab === "done"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <ListChecks className="h-4 w-4" />
          Work Done
          {workDoneEntries.length > 0 && (
            <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              subTab === "done" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {workDoneEntries.length}
            </span>
          )}
        </button>
      </div>

      {subTab === "materials" ? (
        <EntryForm
          projectId={projectId}
          entrySource="material"
          title="Add Materials"
          particularLabel="Particular (Type of Work)"
          particularPlaceholder="e.g. Plumbing, Electrical, Painting..."
          existingParticulars={[...new Set(materialEntries.map((e) => e.particular))]}
          showNameField
          existingNames={[...new Set(materialEntries.map((e) => e.name).filter(Boolean) as string[])]}
          entries={materialEntries}
          onSave={async (data) => db.workEntries.create({ projectId, ...data })}
          onUpdate={async (data) => { await db.workEntries.update(data); }}
          onDelete={async (id) => { await db.workEntries.delete(id); }}
          onRefresh={onRefresh}
        />
      ) : (
        <EntryForm
          projectId={projectId}
          entrySource="work_done"
          title="Work Done"
          particularLabel="Name"
          particularPlaceholder="e.g. Ram, Sai, Electrician..."
          existingParticulars={[...new Set(workDoneEntries.map((e) => e.particular))]}
          entries={workDoneEntries}
          onSave={async (data) => db.workDone.create({ projectId, ...data })}
          onUpdate={async (data) => { await db.workDone.update(data); }}
          onDelete={async (id) => { await db.workDone.delete(id); }}
          onRefresh={onRefresh}
        />
      )}

    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   REUSABLE ENTRY FORM + LIST
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function EntryForm({
  projectId,
  entrySource,
  title,
  particularLabel,
  particularPlaceholder,
  existingParticulars,
  showNameField = false,
  existingNames = [],
  entries,
  onSave,
  onUpdate,
  onDelete,
  onRefresh,
}: {
  projectId: string;
  entrySource: "material" | "work_done";
  title: string;
  particularLabel: string;
  particularPlaceholder: string;
  existingParticulars: string[];
  showNameField?: boolean;
  existingNames?: string[];
  entries: AnyEntry[];
  onSave: (data: {
    date: string;
    particular: string;
    name?: string;
    pricingType: "quantity" | "time" | "iron" | "daily";
    totalQuantity?: number;
    pricePerQuantity?: number;
    pricePerHour?: number;
    timeWorkedMinutes?: number;
    notes?: string;
  }) => Promise<{ id: string }>;
  onUpdate: (data: {
    id: string;
    date: string;
    particular: string;
    name?: string;
    pricingType: "quantity" | "time" | "iron" | "daily";
    totalQuantity?: number;
    pricePerQuantity?: number;
    pricePerHour?: number;
    timeWorkedMinutes?: number;
    notes?: string;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const [showPriceDropdown, setShowPriceDropdown] = useState(false);

  const [pendingBills, setPendingBills] = useState<File[]>([]);

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditId(null);
    setPendingBills([]);
  };

  const getTimeWorkedMinutes = (): number => {
    const h = parseInt(form.timeHours) || 0;
    const m = parseInt(form.timeMinutes) || 0;
    return h * 60 + m;
  };

  const startEdit = (e: AnyEntry) => {
    setEditId(e.id);
    const totalMins = e.time_worked_minutes ?? 0;
    const h = Math.floor(totalMins / 60);
    const m = Math.round(totalMins % 60);
    setForm({
      date: e.date,
      particular: e.particular,
      name: ("name" in e ? (e as WorkEntry).name : null) ?? "",
      pricingType: e.pricing_type,
      totalQuantity: e.total_quantity?.toString() ?? "",
      pricePerQuantity: e.price_per_quantity?.toString() ?? "",
      ironTotalPrice: e.pricing_type === "iron" ? (e.price_per_quantity?.toString() ?? "") : "",
      pricePerHour: e.price_per_hour?.toString() ?? "",
      timeHours: h > 0 ? h.toString() : "",
      timeMinutes: m > 0 ? m.toString() : "",
      totalDays: e.pricing_type === "daily" ? (e.total_quantity?.toString() ?? "") : "",
      pricePerDay: e.pricing_type === "daily" ? (e.price_per_quantity?.toString() ?? "") : "",
      notes: e.notes ?? "",
    });
  };

  const handleSave = async () => {
    if (!form.particular.trim()) {
      toast.error(`Please enter ${particularLabel.toLowerCase()}`);
      return;
    }
    setSaving(true);
    try {
      const timeMinutes = getTimeWorkedMinutes();
      const payload = {
        date: form.date,
        particular: form.particular.trim(),
        name: showNameField ? (form.name.trim() || undefined) : undefined,
        pricingType: form.pricingType as "quantity" | "time" | "iron" | "daily",
        totalQuantity: form.pricingType === "quantity" ? parseFloat(form.totalQuantity) || 0
          : form.pricingType === "iron" ? parseFloat(form.totalQuantity) || 0
          : form.pricingType === "daily" ? parseFloat(form.totalDays) || 0
          : undefined,
        pricePerQuantity: form.pricingType === "quantity" ? parseFloat(form.pricePerQuantity) || 0
          : form.pricingType === "iron" ? parseFloat(form.ironTotalPrice) || 0
          : form.pricingType === "daily" ? parseFloat(form.pricePerDay) || 0
          : undefined,
        pricePerHour: form.pricingType === "time" ? parseFloat(form.pricePerHour) || 0 : undefined,
        timeWorkedMinutes: form.pricingType === "time" ? timeMinutes : undefined,
        notes: form.notes.trim() || undefined,
      };

      let entryId = editId;
      if (editId) {
        await onUpdate({ id: editId, ...payload });
        toast.success("Entry updated");
      } else {
        const created = await onSave(payload);
        entryId = created.id;
        toast.success("Entry added");
      }

      // Upload pending bills
      if (entryId && pendingBills.length > 0) {
        for (const file of pendingBills) {
          const buf = await file.arrayBuffer();
          await db.workBills.saveDropped({ projectId, entryId, entrySource, fileName: file.name, data: buf });
        }
        toast.success(`${pendingBills.length} bill(s) uploaded`);
      }

      setPendingBills([]);
      resetForm();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const [confirmEntryDeleteId, setConfirmEntryDeleteId] = useState<string | null>(null);

  const handlePickBills = async () => {
    // Use a hidden file input to pick files in the renderer
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";
    input.onchange = () => {
      if (input.files) {
        setPendingBills((prev) => [...prev, ...Array.from(input.files!)]);
      }
    };
    input.click();
  };

  const removePendingBill = (idx: number) => {
    setPendingBills((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDelete = (id: string) => {
    setConfirmEntryDeleteId(id);
  };

  const confirmEntryDelete = async () => {
    if (!confirmEntryDeleteId) return;
    await onDelete(confirmEntryDeleteId);
    toast.success("Entry deleted");
    if (editId === confirmEntryDeleteId) resetForm();
    setConfirmEntryDeleteId(null);
    onRefresh();
  };

  const liveTotal = useMemo(() => {
    if (form.pricingType === "iron") {
      return parseFloat(form.ironTotalPrice) || 0;
    }
    if (form.pricingType === "daily") {
      return (parseFloat(form.totalDays) || 0) * (parseFloat(form.pricePerDay) || 0);
    }
    if (form.pricingType === "quantity") {
      return (parseFloat(form.totalQuantity) || 0) * (parseFloat(form.pricePerQuantity) || 0);
    }
    const mins = (parseInt(form.timeHours) || 0) * 60 + (parseInt(form.timeMinutes) || 0);
    return (mins / 60) * (parseFloat(form.pricePerHour) || 0);
  }, [form.pricingType, form.totalQuantity, form.pricePerQuantity, form.ironTotalPrice, form.pricePerHour, form.timeHours, form.timeMinutes, form.totalDays, form.pricePerDay]);

  const filteredParticulars = existingParticulars.filter(
    (p) => p.toLowerCase().includes(form.particular.toLowerCase()) && p.toLowerCase() !== form.particular.toLowerCase()
  );

  const filteredNames = existingNames.filter(
    (n) => n.toLowerCase().includes(form.name.toLowerCase()) && n.toLowerCase() !== form.name.toLowerCase()
  );

  /* previous prices for the selected particular */
  const previousPrices = useMemo(() => {
    if (!form.particular.trim()) return [];
    const key = form.particular.trim().toLowerCase();
    const matching = entries.filter((e) => e.particular.trim().toLowerCase() === key);
    const priceSet = new Map<number, string>();
    for (const e of matching) {
      if (form.pricingType === "quantity" && e.pricing_type === "quantity" && e.price_per_quantity) {
        if (!priceSet.has(e.price_per_quantity)) priceSet.set(e.price_per_quantity, e.date);
      }
      if (form.pricingType === "time" && e.pricing_type === "time" && e.price_per_hour) {
        if (!priceSet.has(e.price_per_hour)) priceSet.set(e.price_per_hour, e.date);
      }
      if (form.pricingType === "daily" && e.pricing_type === "daily" && e.price_per_quantity) {
        if (!priceSet.has(e.price_per_quantity)) priceSet.set(e.price_per_quantity, e.date);
      }
    }
    return Array.from(priceSet.entries())
      .map(([price, date]) => ({ price, date }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, form.particular, form.pricingType]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{editId ? `Edit ${title}` : title}</h2>
          {editId && (
            <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="h-3 w-3" /> Cancel edit
            </button>
          )}
        </div>

        <div className={`grid gap-4 ${showNameField ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground">{particularLabel}</label>
            <input
              type="text"
              value={form.particular}
              onChange={(e) => { set("particular", e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder={particularPlaceholder}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
            {showDropdown && filteredParticulars.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border bg-background shadow-lg max-h-40 overflow-y-auto">
                {filteredParticulars.map((p) => (
                  <button
                    key={p}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { set("particular", p); setShowDropdown(false); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition capitalize"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            {existingParticulars.length > 0 && !form.particular && !showDropdown && (
              <button
                onClick={() => setShowDropdown(true)}
                className="absolute right-3 top-[30px] text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </div>

          {showNameField && (
            <div className="relative">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => { set("name", e.target.value); setShowNameDropdown(true); }}
                onFocus={() => setShowNameDropdown(true)}
                onBlur={() => setTimeout(() => setShowNameDropdown(false), 150)}
                placeholder="e.g. Supplier name, vendor..."
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
          )}

          <div className={showNameField ? "sm:col-span-3" : "sm:col-span-2"}>
            <label className="text-xs font-medium text-muted-foreground">Pricing Type</label>
            <div className="mt-1 flex gap-1 rounded-lg bg-muted p-1">
              <button onClick={() => set("pricingType", "quantity")} className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${form.pricingType === "quantity" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <Package className="h-4 w-4" /> {entrySource === "work_done" ? "Unit Based" : "Quantity Based"}
              </button>
              <button onClick={() => set("pricingType", "time")} className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${form.pricingType === "time" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <Clock className="h-4 w-4" /> Time Based
              </button>
              <button onClick={() => set("pricingType", "daily")} className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${form.pricingType === "daily" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <CalendarDays className="h-4 w-4" /> Day Based
              </button>
              <button onClick={() => set("pricingType", "iron")} className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${form.pricingType === "iron" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <Ruler className="h-4 w-4" /> Iron
              </button>
            </div>
          </div>

          {form.pricingType === "quantity" ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{entrySource === "work_done" ? "Total Units" : "Total Quantity"}</label>
                <input type="text" inputMode="decimal" value={form.totalQuantity} onChange={(e) => set("totalQuantity", e.target.value)} placeholder="0" min="0" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="relative">
                <label className="text-xs font-medium text-muted-foreground">{entrySource === "work_done" ? "Price per Unit" : "Price per Quantity"}</label>
                <input
                  type="text" inputMode="decimal"
                  value={form.pricePerQuantity}
                  onChange={(e) => set("pricePerQuantity", e.target.value)}
                  onFocus={() => setShowPriceDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPriceDropdown(false), 150)}
                  placeholder="0"
                  min="0"
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
                {showPriceDropdown && previousPrices.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border bg-background shadow-lg max-h-40 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b">Previous prices</div>
                    {previousPrices.map(({ price, date }) => (
                      <button
                        key={price}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { set("pricePerQuantity", price.toString()); setShowPriceDropdown(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition"
                      >
                        <span className="font-medium">{fmtMoney(price)}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                      </button>
                    ))}
                  </div>
                )}
                {previousPrices.length > 0 && !showPriceDropdown && (
                  <button onClick={() => setShowPriceDropdown(true)} className="absolute right-3 top-[30px] text-muted-foreground hover:text-foreground">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          ) : form.pricingType === "daily" ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Number of Days</label>
                <input type="text" inputMode="decimal" value={form.totalDays} onChange={(e) => set("totalDays", e.target.value)} placeholder="0" min="0" step="0.5" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="relative">
                <label className="text-xs font-medium text-muted-foreground">Price per Day</label>
                <input
                  type="text" inputMode="decimal"
                  value={form.pricePerDay}
                  onChange={(e) => set("pricePerDay", e.target.value)}
                  onFocus={() => setShowPriceDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPriceDropdown(false), 150)}
                  placeholder="0"
                  min="0"
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
                {showPriceDropdown && previousPrices.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border bg-background shadow-lg max-h-40 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b">Previous rates</div>
                    {previousPrices.map(({ price, date }) => (
                      <button
                        key={price}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { set("pricePerDay", price.toString()); setShowPriceDropdown(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition"
                      >
                        <span className="font-medium">{fmtMoney(price)}/day</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                      </button>
                    ))}
                  </div>
                )}
                {previousPrices.length > 0 && !showPriceDropdown && (
                  <button onClick={() => setShowPriceDropdown(true)} className="absolute right-3 top-[30px] text-muted-foreground hover:text-foreground">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          ) : form.pricingType === "iron" ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Total Quantity</label>
                <input type="text" inputMode="decimal" value={form.totalQuantity} onChange={(e) => set("totalQuantity", e.target.value)} placeholder="0" min="0" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Total Price</label>
                <input type="text" inputMode="decimal" value={form.ironTotalPrice} onChange={(e) => set("ironTotalPrice", e.target.value)} placeholder="0" min="0" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Time Worked</label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <input type="text" inputMode="decimal" value={form.timeHours} onChange={(e) => set("timeHours", e.target.value)} placeholder="0" min="0" className="w-16 rounded-lg border bg-background px-3 py-2 text-sm text-center" />
                    <span className="text-xs font-medium text-muted-foreground">hrs</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input type="text" inputMode="decimal" value={form.timeMinutes} onChange={(e) => set("timeMinutes", e.target.value)} placeholder="0" min="0" max="59" className="w-16 rounded-lg border bg-background px-3 py-2 text-sm text-center" />
                    <span className="text-xs font-medium text-muted-foreground">min</span>
                  </div>
                </div>
              </div>
              <div className="relative">
                <label className="text-xs font-medium text-muted-foreground">Price per Hour</label>
                <input
                  type="text" inputMode="decimal"
                  value={form.pricePerHour}
                  onChange={(e) => set("pricePerHour", e.target.value)}
                  onFocus={() => setShowPriceDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPriceDropdown(false), 150)}
                  placeholder="0"
                  min="0"
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
                {showPriceDropdown && previousPrices.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border bg-background shadow-lg max-h-40 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b">Previous rates</div>
                    {previousPrices.map(({ price, date }) => (
                      <button
                        key={price}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { set("pricePerHour", price.toString()); setShowPriceDropdown(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition"
                      >
                        <span className="font-medium">{fmtMoney(price)}/hr</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                      </button>
                    ))}
                  </div>
                )}
                {previousPrices.length > 0 && !showPriceDropdown && (
                  <button onClick={() => setShowPriceDropdown(true)} className="absolute right-3 top-[30px] text-muted-foreground hover:text-foreground">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}

          <div className={showNameField ? "sm:col-span-3" : "sm:col-span-2"}>
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <input type="text" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any additional notes..." className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </div>

          {/* Bill upload */}
          <div className={showNameField ? "sm:col-span-3" : "sm:col-span-2"}>
            <label className="text-xs font-medium text-muted-foreground">Bill (optional)</label>
            <div className="mt-1">
              {pendingBills.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {pendingBills.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted">
                        {file.type.startsWith("image/") ? (
                          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <span className="flex-1 truncate text-xs">{file.name}</span>
                      <button onClick={() => removePendingBill(idx)} className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={handlePickBills}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition"
              >
                <Upload className="h-3.5 w-3.5" />
                {pendingBills.length > 0 ? "Add more bills" : "Upload bill"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Calculated Total: <span className="font-bold text-foreground">{fmtMoney(liveTotal)}</span>
          </div>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Plus className="h-4 w-4" />
            {editId ? "Update Entry" : "Add Entry"}
          </button>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-semibold">All Entries ({entries.length})</h3>
          </div>
          <div className="divide-y">
            {entries.map((e) => {
              const total = calcTotal(e);
              return (
                <div key={e.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{e.particular}</span>
                      {showNameField && "name" in e && (e as WorkEntry).name && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[10px] font-medium">
                          <User className="h-2.5 w-2.5" /> {(e as WorkEntry).name}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${e.pricing_type === "iron" ? "bg-orange-100 text-orange-700" : e.pricing_type === "daily" ? "bg-purple-100 text-purple-700" : e.pricing_type === "time" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {e.pricing_type === "iron" ? <><Ruler className="h-2.5 w-2.5" /> Iron</> : e.pricing_type === "daily" ? <><CalendarDays className="h-2.5 w-2.5" /> Daily</> : e.pricing_type === "time" ? <><Clock className="h-2.5 w-2.5" /> Time</> : <><Package className="h-2.5 w-2.5" /> {entrySource === "work_done" ? "Units" : "Qty"}</>}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      {e.pricing_type === "iron"
                        ? ` · ${e.total_quantity ?? 0} ${entrySource === "work_done" ? "units" : "qty"} · ${fmtMoney(e.price_per_quantity ?? 0)}`
                        : e.pricing_type === "daily"
                        ? ` · ${e.total_quantity ?? 0} days × ${fmtMoney(e.price_per_quantity ?? 0)}/day`
                        : e.pricing_type === "time"
                        ? ` · ${fmtTime(e.time_worked_minutes ?? 0)} @ ${fmtMoney(e.price_per_hour ?? 0)}/hr`
                        : ` · ${e.total_quantity ?? 0} ${entrySource === "work_done" ? "units" : "qty"} × ${fmtMoney(e.price_per_quantity ?? 0)}`}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </div>
                  </div>
                  <div className="text-right font-semibold text-sm">{fmtMoney(total)}</div>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(e)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(e.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* entry delete confirmation modal */}
      {confirmEntryDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmEntryDeleteId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Confirm Delete</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this entry? This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmEntryDeleteId(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmEntryDelete}
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   INFO PAGE
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

type InfoRow = {
  id: string;
  date: string;
  particular: string;
  name: string;
  type: "material" | "work_done";
  pricingType: "quantity" | "time" | "iron" | "daily";
  detail: string;
  total: number;
  groupCost: number;
  paid: number;
  balance: number;
  method: string;
};

function InfoPage({
  projectId,
  materialEntries,
  workDoneEntries,
  payments,
}: {
  projectId: string;
  materialEntries: WorkEntry[];
  workDoneEntries: WorkDoneEntry[];
  payments: WorkPayment[];
}) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");

  /* load all bills for this project */
  const [allBills, setAllBills] = useState<WorkBill[]>([]);
  useEffect(() => {
    db.workBills.list({ projectId }).then(setAllBills);
  }, [projectId, materialEntries, workDoneEntries]);
  const [page, setPage] = useState(0);
  const [viewRow, setViewRow] = useState<InfoRow | null>(null);
  const PAGE_SIZE = 10;

  /* build paid-per-particular-per-vendor lookup */
  const paidMap = useMemo(() => {
    const m = new Map<string, { total: number; cash: number; check: number; payments: WorkPayment[] }>();
    for (const p of payments) {
      const vendorKey = (p.vendor || "—").trim().toLowerCase();
      const key = `${p.source}:${p.particular_key}:${vendorKey}`;
      const prev = m.get(key) ?? { total: 0, cash: 0, check: 0, payments: [] };
      prev.total += p.amount;
      if (p.notes === "cash") prev.cash += p.amount;
      if (p.notes === "check") prev.check += p.amount;
      prev.payments.push(p);
      m.set(key, prev);
    }
    return m;
  }, [payments]);

  /* build rows from all entries */
  const rows: InfoRow[] = useMemo(() => {
    const allEntries: { entry: AnyEntry; source: "material" | "work_done" }[] = [
      ...materialEntries.map((e) => ({ entry: e, source: "material" as const })),
      ...workDoneEntries.map((e) => ({ entry: e, source: "work_done" as const })),
    ];

    /* group by source:particular:vendor to get paid/balance per vendor */
    const groupTotals = new Map<string, { cost: number; paid: number }>();
    for (const { entry, source } of allEntries) {
      const name = source === "material" ? ((entry as WorkEntry).name ?? "—") : "—";
      const key = `${source}:${entry.particular.trim().toLowerCase()}:${name.trim().toLowerCase()}`;
      const prev = groupTotals.get(key) ?? { cost: 0, paid: 0 };
      prev.cost += calcTotal(entry);
      groupTotals.set(key, prev);
    }
    for (const [key, val] of groupTotals) {
      val.paid = paidMap.get(key)?.total ?? 0;
    }

    return allEntries
      .map(({ entry, source }) => {
        const total = calcTotal(entry);
        const name = source === "material" ? ((entry as WorkEntry).name ?? "—") : "—";
        const gKey = `${source}:${entry.particular.trim().toLowerCase()}:${name.trim().toLowerCase()}`;
        const group = groupTotals.get(gKey)!;
        const payStatus = group.paid >= group.cost && group.cost > 0
          ? "Paid" : group.paid > 0 ? "Partial" : "Unpaid";
        return {
          id: entry.id,
          date: entry.date,
          particular: entry.particular,
          name,
          type: source,
          pricingType: entry.pricing_type,
          detail: entry.pricing_type === "iron"
            ? `${entry.total_quantity ?? 0} ${source === "work_done" ? "units" : "qty"} · ${fmtMoney(entry.price_per_quantity ?? 0)}`
            : entry.pricing_type === "daily"
            ? `${entry.total_quantity ?? 0} days × ${fmtMoney(entry.price_per_quantity ?? 0)}/day`
            : entry.pricing_type === "time"
            ? `${fmtTime(entry.time_worked_minutes ?? 0)} @ ${fmtMoney(entry.price_per_hour ?? 0)}/hr`
            : `${entry.total_quantity ?? 0} ${source === "work_done" ? "units" : "qty"} × ${fmtMoney(entry.price_per_quantity ?? 0)}`,
          total,
          groupCost: group.cost,
          paid: group.paid,
          balance: group.cost - group.paid,
          method: payStatus,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [materialEntries, workDoneEntries, paidMap]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (q && ![r.particular, r.name, r.detail].some((v) => v.toLowerCase().includes(q.toLowerCase()))) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (paymentFilter !== "all" && r.method.toLowerCase() !== paymentFilter) return false;
      return true;
    });
  }, [rows, q, typeFilter, paymentFilter]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const totalCost = rows.reduce((s, r) => s + r.total, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  function downloadPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Work Management - Info", 14, 18);
    doc.setFontSize(10);
    doc.text(`${filtered.length} records`, 14, 25);

    const headers = ["S.No", "Date", "Particular", "Name", "Type", "Total", "Payment", "Balance"];
    const body = filtered.map((r, i) => [
      i + 1,
      new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      r.particular,
      r.name,
      r.type === "material" ? "Material" : "Work Done",
      fmtMoney(r.total),
      r.method,
      fmtMoney(Math.abs(r.balance)),
    ]);

    autoTable(doc, {
      head: [headers],
      body,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 101, 52] },
    });

    doc.save("Work_Management_Info.pdf");
  }

  function downloadExcel() {
    const ws = styledSheet(
      filtered.map((r, i) => ({
        "S.No": i + 1,
        Date: new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        Particular: r.particular,
        Name: r.name,
        Type: r.type === "material" ? "Material" : "Work Done",
        Total: r.total,
        Payment: r.method,
        Balance: r.balance,
      })),
      "Work Management",
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Work Info");
    XLSX.writeFile(wb, "Work_Management_Info.xlsx");
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Browse all materials, work done and payments at a glance.</p>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadPDF}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-primary bg-card px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
          <button
            onClick={downloadExcel}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download Excel
          </button>
        </div>
      </div>

      {/* search & filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search particular or name..."
            className="w-64 rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All types</option>
          <option value="material">Materials</option>
          <option value="work_done">Work Done</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => { setPaymentFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All payments</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </div>

      {/* table */}
      <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Particular</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-left">Payment</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3 text-center">Bill</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted-foreground">No matching records.</td>
              </tr>
            ) : (
              paged.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="px-4 py-3 font-medium capitalize">{r.particular}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      r.type === "material" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {r.type === "material" ? "Material" : "Work Done"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtMoney(r.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.method === "Paid" ? "bg-success/15 text-success"
                        : r.method === "Partial" ? "bg-warning/20 text-warning-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {r.method}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${r.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {fmtMoney(Math.abs(r.balance))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const entryBills = allBills.filter((b) => b.entry_id === r.id);
                      if (entryBills.length === 0) return <span className="text-muted-foreground">—</span>;
                      return (
                        <button
                          onClick={() => {
                            if (entryBills.length === 1) {
                              db.workBills.open(entryBills[0]);
                            } else {
                              setViewRow(r);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition"
                          title={`${entryBills.length} bill(s)`}
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          {entryBills.length}
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setViewRow(r)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>{filtered.length} records</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-md border border-border px-2 py-1 disabled:opacity-40">Prev</button>
            <span>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded-md border border-border px-2 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {/* view modal */}
      {viewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setViewRow(null)}>
          <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-lg rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold capitalize">{viewRow.particular}</h2>
              <button onClick={() => setViewRow(null)} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{new Date(viewRow.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
                <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{viewRow.type === "material" ? "Material" : "Work Done"}</span></div>
                {viewRow.name !== "—" && <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{viewRow.name}</span></div>}
                <div><span className="text-muted-foreground">Detail:</span> <span className="font-medium">{viewRow.detail}</span></div>
              </div>
              <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/30 p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                  <div className="font-bold">{fmtMoney(viewRow.groupCost)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid</div>
                  <div className="font-bold text-emerald-600">{fmtMoney(viewRow.paid)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</div>
                  <div className={`font-bold ${viewRow.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtMoney(Math.abs(viewRow.balance))}</div>
                </div>
              </div>
              {/* payments for this particular + vendor */}
              {(() => {
                const gKey = `${viewRow.type}:${viewRow.particular.trim().toLowerCase()}:${viewRow.name.trim().toLowerCase()}`;
                const gPayments = paidMap.get(gKey)?.payments ?? [];
                if (gPayments.length === 0) return <div className="text-muted-foreground text-xs">No payments recorded for this particular.</div>;
                return (
                  <div>
                    <div className="text-xs font-semibold mb-2">Payments ({gPayments.length})</div>
                    <div className="divide-y rounded-lg border">
                      {gPayments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              p.notes === "check" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                            }`}>
                              {p.notes === "check" ? "Check" : "Cash"}
                            </span>
                            <span>{new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                          </div>
                          <span className="font-medium text-emerald-700">{fmtMoney(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* bills for this entry */}
              {(() => {
                const entryBills = allBills.filter((b) => b.entry_id === viewRow.id);
                if (entryBills.length === 0) return null;
                return (
                  <div>
                    <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                      <Receipt className="h-3 w-3" /> Bills ({entryBills.length})
                    </div>
                    <div className="space-y-1.5">
                      {entryBills.map((bill) => (
                        <div
                          key={bill.id}
                          onClick={() => db.workBills.open(bill)}
                          className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-muted/30 transition"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted">
                            {bill.mime_type?.startsWith("image/") ? (
                              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium">{bill.original_name}</div>
                          </div>
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

