import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { db, type PlotFile } from "@/lib/db";
import { fmtDate, fmtMoney, type Customer, type Payment, type Plot } from "@/lib/data";
import { Eye, Search, Loader2, FileText, Trash2, Download } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { styledSheet } from "@/lib/xlsx-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/projects/$projectId/info")({ component: InfoPage });

type Row = {
  date: string;
  customer: string;
  plotNumber: string;
  plotType: string;
  totalPaid: number;
  paymentStatus: "Paid" | "Partial" | "Unpaid";
  registrationStatus: Plot["status"];
  plot: Plot;
  customerObj?: Customer;
  payments: Payment[];
};

function InfoPage() {
  const { projectId } = Route.useParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [regFilter, setRegFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<Row | null>(null);
  const PAGE_SIZE = 10;

  useEffect(() => {
    db.infoData(projectId).then(({ plots, customers, payments }) => {
      const cMap = new Map(customers.map((c) => [c.id, c]));
      const out: Row[] = plots.map((p: any) => {
        const pays = payments.filter((pay: any) => pay.plot_id === p.id);
        const totalPaid = pays.reduce(
          (s: number, x: any) => s + Number(x.amount_white_bank) + Number(x.amount_white_cash) + Number(x.amount_black_cash) + Number(x.amount_advance_cash) + Number(x.amount_advance_bank),
          0,
        );
        const plotTotalPrice = Number(p.price) * Number(p.size_sqft || 0);
        const status: Row["paymentStatus"] =
          totalPaid >= plotTotalPrice && plotTotalPrice > 0
            ? "Paid"
            : totalPaid > 0
              ? "Partial"
              : "Unpaid";
        const cust = p.customer_id ? cMap.get(p.customer_id) : undefined;
        const buyerName = p.buyer_name || cust?.name || "—";
        const lastDate = p.advance_date ?? p.created_at?.slice(0, 10) ?? "";
        return {
          date: lastDate,
          customer: buyerName,
          plotNumber: p.plot_number,
          plotType: p.plot_type ?? "—",
          totalPaid,
          paymentStatus: status,
          registrationStatus: p.status,
          plot: p,
          customerObj: cust,
          payments: pays as any,
        };
      });
      setRows(out);
      setLoading(false);
    });
  }, [projectId]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (q && ![r.customer, r.plotNumber].some((v) => v.toLowerCase().includes(q.toLowerCase())))
        return false;
      if (statusFilter !== "all" && r.paymentStatus.toLowerCase() !== statusFilter) return false;
      if (regFilter !== "all" && r.registrationStatus !== regFilter) return false;
      return true;
    });
  }, [rows, q, statusFilter, regFilter]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  function downloadPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Info", 14, 18);
    doc.setFontSize(10);
    doc.text(`${filtered.length} records`, 14, 25);

    const headers = ["S.No", "Advance Date", "Customer", "Plot #", "Type", "Paid", "Payment", "Reg."];
    const body = filtered.map((r, i) => [
      i + 1,
      fmtDate(r.date),
      r.customer,
      r.plotNumber,
      r.plotType,
      fmtMoney(r.totalPaid),
      r.paymentStatus,
      fmtStatus(r.registrationStatus),
    ]);

    autoTable(doc, {
      head: [headers],
      body,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 101, 52] },
    });

    doc.save("Info.pdf");
  }

  function downloadExcel() {
    const ws = styledSheet(
      filtered.map((r, i) => ({
        "S.No": i + 1,
        "Advance Date": fmtDate(r.date),
        Customer: r.customer,
        "Plot #": r.plotNumber,
        Type: r.plotType,
        Paid: r.totalPaid,
        Payment: r.paymentStatus,
        "Reg.": fmtStatus(r.registrationStatus),
      })),
      "Plots Info",
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Info");
    XLSX.writeFile(wb, "Info.xlsx");
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Info</h1>
          <p className="text-sm text-muted-foreground">
            Browse all plots, customers and payments at a glance.
          </p>
        </div>
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search customer or plotâ€¦"
            className="w-64 rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
          options={[
            ["all", "All payments"],
            ["paid", "Paid"],
            ["partial", "Partial"],
            ["unpaid", "Unpaid"],
          ]}
        />
        <Select
          value={regFilter}
          onChange={(v) => {
            setRegFilter(v);
            setPage(0);
          }}
          options={[
            ["all", "All registration"],
            ["available", "Available"],
            ["advance", "Advance"],
            ["sale_agreement", "Sale Agreement"],
            ["registered", "Registered"],
          ]}
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th>Advance Date</Th>
              <Th>Customer</Th>
              <Th>Plot #</Th>
              <Th>Type</Th>
              <Th className="text-right">Paid</Th>
              <Th>Payment</Th>
              <Th>Reg.</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground">
                  No matching records.
                </td>
              </tr>
            ) : (
              paged.map((r) => (
                <tr key={r.plot.id} className="border-t border-border hover:bg-muted/30">
                  <Td>{fmtDate(r.date)}</Td>
                  <Td className="font-medium">{r.customer}</Td>
                  <Td>{r.plotNumber}</Td>
                  <Td>{r.plotType}</Td>
                  <Td className="text-right font-semibold">{fmtMoney(r.totalPaid)}</Td>
                  <Td>
                    <Badge
                      tone={
                        r.paymentStatus === "Paid"
                          ? "success"
                          : r.paymentStatus === "Partial"
                            ? "warning"
                            : "muted"
                      }
                    >
                      {r.paymentStatus}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        r.registrationStatus === "registered"
                          ? "danger"
                          : r.registrationStatus === "advance"
                            ? "warning"
                            : r.registrationStatus === "sale_agreement"
                              ? "info"
                              : "success"
                      }
                    >
                      {fmtStatus(r.registrationStatus)}
                    </Badge>
                  </Td>
                  <Td>
                    <button
                      onClick={() => setView(r)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>{filtered.length} records</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {view && <ViewModal row={view} onClose={() => setView(null)} onRefresh={() => {
        db.infoData(projectId).then(({ plots, customers, payments }) => {
          const cMap = new Map(customers.map((c) => [c.id, c]));
          const out: Row[] = plots.map((p: any) => {
            const pays = payments.filter((pay: any) => pay.plot_id === p.id);
            const totalPaid = pays.reduce(
              (s: number, x: any) => s + Number(x.amount_white_bank) + Number(x.amount_white_cash) + Number(x.amount_black_cash) + Number(x.amount_advance_cash) + Number(x.amount_advance_bank),
              0,
            );
            const plotTotalPrice = Number(p.price) * Number(p.size_sqft || 0);
            const status: Row["paymentStatus"] =
              totalPaid >= plotTotalPrice && plotTotalPrice > 0
                ? "Paid"
                : totalPaid > 0
                  ? "Partial"
                  : "Unpaid";
            const cust = p.customer_id ? cMap.get(p.customer_id) : undefined;
            const buyerName = p.buyer_name || cust?.name || "—";
            const lastDate = pays.length
              ? pays
                  .map((x: any) => x.payment_date)
                  .sort()
                  .slice(-1)[0]
              : (p.created_at?.slice(0, 10) as string);
            return {
              date: lastDate,
              customer: buyerName,
              plotNumber: p.plot_number,
              plotType: p.plot_type ?? "—",
              totalPaid,
              paymentStatus: status,
              registrationStatus: p.status,
              plot: p,
              customerObj: cust,
              payments: pays as any,
            };
          });
          setRows(out);
          // Update the view with refreshed data for the same plot
          const updated = out.find((r) => r.plot.id === view.plot.id);
          if (updated) setView(updated);
        });
      }} />}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left ${className || ""}`}>{children}</th>;
}
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className || ""}`}>{children}</td>;
}
function fmtStatus(s: string) {
  const map: Record<string, string> = {
    available: "Available",
    advance: "Advance",
    sale_agreement: "Sale Agreement",
    registered: "Registered",
  };
  return map[s] || s;
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "warning" | "danger" | "muted" | "info";
}) {
  const map = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    danger: "bg-danger/15 text-danger",
    muted: "bg-muted text-muted-foreground",
    info: "bg-blue-100 text-blue-700",
  } as const;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[tone]}`}>
      {children}
    </span>
  );
}
function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function ViewModal({ row, onClose, onRefresh }: { row: Row; onClose: () => void; onRefresh: () => void }) {
  const sizeVal = Number(row.plot.size_sqft || 0);
  const totalPrice = Number(row.plot.price || 0) * sizeVal;
  const govtTotalPrice = Number(row.plot.govt_price || 0) * sizeVal;
  const totalWhiteBank = row.payments.reduce((s, p) => s + Number(p.amount_white_bank), 0);
  const totalWhiteCash = row.payments.reduce((s, p) => s + Number(p.amount_white_cash), 0);
  const totalBlackCash = row.payments.reduce((s, p) => s + Number(p.amount_black_cash), 0);
  const totalAdvanceCash = row.payments.reduce((s, p) => s + Number(p.amount_advance_cash), 0);
  const totalAdvanceBank = row.payments.reduce((s, p) => s + Number(p.amount_advance_bank), 0);
  const total = totalWhiteBank + totalWhiteCash + totalBlackCash + totalAdvanceCash + totalAdvanceBank;
  const balance = totalPrice - total;
  const [plotFiles, setPlotFiles] = useState<PlotFile[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    db.plotFiles.list(row.plot.id).then(setPlotFiles);
  }, [row.plot.id]);

  async function handleDeletePayment(paymentId: string) {
    await db.payments.delete(paymentId);
    setConfirmDeleteId(null);
    onRefresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-2xl rounded-2xl bg-card p-6 shadow-2xl"
      >
        <h3 className="font-display text-2xl font-bold">Plot {row.plotNumber}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{row.plot.buyer_name || "—"}</p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Card title="Buyer">
            <Row2 k="Name" v={row.plot.buyer_name ?? "—"} />
            <Row2 k="Phone" v={row.plot.buyer_phone ?? "—"} />
            <Row2 k="Date" v={row.plot.booking_date ? fmtDate(row.plot.booking_date) : "—"} />
            <Row2 k="Description" v={row.plot.description ?? "—"} />
          </Card>
          <Card title="Plot details">
            <Row2 k="Type" v={row.plot.plot_type ?? "—"} />
            <Row2 k="Size" v={row.plot.size_sqft ? `${row.plot.size_sqft} sqyd` : "—"} />
            {(row.plot.length || row.plot.width) && (
              <Row2 k="L × W" v={`${row.plot.length ?? "—"} × ${row.plot.width ?? "—"}`} />
            )}
            <Row2 k="Price/sqyd" v={fmtMoney(Number(row.plot.price))} />
            <Row2 k="Govt price/sqyd" v={fmtMoney(Number(row.plot.govt_price))} />
            <Row2 k="Status" v={fmtStatus(row.registrationStatus)} />
            {row.plot.advance_date && (
              <Row2 k="Advance Date" v={fmtDate(row.plot.advance_date)} />
            )}
            {row.plot.sale_agreement_date && (
              <Row2 k="Agreement Date" v={fmtDate(row.plot.sale_agreement_date)} />
            )}
            {row.plot.notes && (
              <Row2 k="Notes" v={row.plot.notes} />
            )}
            {row.plot.document_number && (
              <Row2 k="Doc No." v={row.plot.document_number} />
            )}
            {row.plot.registration_date && (
              <Row2 k="Reg. Date" v={fmtDate(row.plot.registration_date)} />
            )}
          </Card>
          <Card title="Payment summary">
            <Row2 k="Total" v={fmtMoney(totalPrice)} />
            <Row2 k="Govt total" v={fmtMoney(govtTotalPrice)} />
            <Row2 k="White (Bank)" v={fmtMoney(totalWhiteBank)} />
            <Row2 k="White (Cash)" v={fmtMoney(totalWhiteCash)} />
            <Row2 k="Black (Cash)" v={fmtMoney(totalBlackCash)} />
            <Row2 k="Advance (Cash)" v={fmtMoney(totalAdvanceCash)} />
            <Row2 k="Total paid" v={fmtMoney(total)} />
            <Row2 k="Balance" v={fmtMoney(balance)} />
          </Card>
          <Card title="Payment history">
            {row.payments.length === 0 ? (
              <div className="text-sm text-muted-foreground">No payments recorded.</div>
            ) : (
              <div className="space-y-3">
                {row.payments.map((p, i) => {
                  const payTotal = Number(p.amount_white_bank) + Number(p.amount_white_cash) + Number(p.amount_black_cash) + Number(p.amount_advance_cash) + Number(p.amount_advance_bank);
                  const activePayments = [
                    { label: "White (Bank)", amount: Number(p.amount_white_bank) },
                    { label: "White (Cash)", amount: Number(p.amount_white_cash) },
                    { label: "Black (Cash)", amount: Number(p.amount_black_cash) },
                    { label: "Advance (Cash)", amount: Number(p.amount_advance_cash) },
                  ].filter(x => x.amount > 0);

                  return (
                    <div key={i} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-muted-foreground">{fmtDate(p.payment_date)}</span>
                          {activePayments.length === 1 && (
                            <div className="text-xs text-muted-foreground mt-0.5 font-medium">
                              {activePayments[0].label}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{fmtMoney(payTotal)}</span>
                          <button
                            onClick={() => setConfirmDeleteId(p.id)}
                            className="rounded-md p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                            title="Delete payment"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {activePayments.length > 1 && (
                        <div className="mt-2 border-t border-border/50 pt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                          {activePayments.map((ap, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span className="text-muted-foreground">{ap.label}</span>
                              <span>{fmtMoney(ap.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Delete confirmation popup */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setConfirmDeleteId(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
              <h4 className="text-lg font-bold">Delete Payment</h4>
              <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to delete this payment? This action cannot be undone.</p>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeletePayment(confirmDeleteId)}
                  className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {plotFiles.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <h4 className="mb-3 text-sm font-semibold">Files</h4>
            <div className="space-y-2">
              {plotFiles.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 cursor-pointer hover:bg-muted"
                  onClick={() => db.plotFiles.open(f)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{f.original_name}</span>
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row2({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

