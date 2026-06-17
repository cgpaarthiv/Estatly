import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/data";
import { Loader2, Eye, EyeOff, ChevronLeft, ChevronRight, Search, Download } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { styledSheet } from "@/lib/xlsx-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/projects/$projectId/payments")({ component: PaymentsPage });

const PAGE_SIZE = 10;

function PaymentsPage() {
  const { projectId } = Route.useParams();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTotals, setShowTotals] = useState(false);
  const [page, setPage] = useState(0);
  const [plotFilter, setPlotFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    db.payments.listByProject(projectId).then((data) => {
      setRows(
        data.map((p) => ({
          ...p,
          customer: p.customer_name ?? "—",
          plot: p.plot_number ?? "—",
          total: Number(p.amount_white_bank) + Number(p.amount_white_cash) + Number(p.amount_black_cash) + Number(p.amount_advance_cash) + Number(p.amount_advance_bank),
        })),
      );
      setLoading(false);
    });
  }, [projectId]);

  // Get unique plot numbers for filter
  const plotNumbers = [...new Set(rows.map((r) => r.plot))].sort();

  // Filter rows
  const filtered = rows.filter((r) => {
    if (plotFilter !== "all" && r.plot !== plotFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const dateStr = fmtDate(r.payment_date).toLowerCase();
      return (
        r.customer.toLowerCase().includes(q) ||
        r.plot.toLowerCase().includes(q) ||
        dateStr.includes(q) ||
        String(r.amount_white_bank).includes(q) ||
        String(r.amount_white_cash).includes(q) ||
        String(r.amount_black_cash).includes(q) ||
        String(r.amount_advance_cash).includes(q) ||
        String(r.total).includes(q)
      );
    }
    return true;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [plotFilter, search]);

  const totals = filtered.reduce(
    (s, r) => ({
      whiteBank: s.whiteBank + Number(r.amount_white_bank),
      whiteCash: s.whiteCash + Number(r.amount_white_cash),
      blackCash: s.blackCash + Number(r.amount_black_cash),
      advanceCash: s.advanceCash + Number(r.amount_advance_cash),
      advanceBank: s.advanceBank + Number(r.amount_advance_bank),
      total: s.total + r.total,
    }),
    { whiteBank: 0, whiteCash: 0, blackCash: 0, advanceCash: 0, advanceBank: 0, total: 0 },
  );

  function downloadPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Payments", 14, 18);
    doc.setFontSize(10);
    doc.text(`${filtered.length} payments`, 14, 25);

    const headers = ["S.No", "Date", "Plot", "Customer", "White(Bank)", "White(Cash)", "Black(Cash)", "Advance(Cash)", "Total"];
    const body = filtered.map((r, i) => [
      i + 1,
      fmtDate(r.payment_date),
      r.plot,
      r.customer,
      fmtMoney(Number(r.amount_white_bank)),
      fmtMoney(Number(r.amount_white_cash)),
      fmtMoney(Number(r.amount_black_cash)),
      fmtMoney(Number(r.amount_advance_cash)),
      fmtMoney(r.total),
    ]);

    autoTable(doc, {
      head: [headers],
      body,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 101, 52] },
    });

    doc.save("Payments.pdf");
  }

  function downloadExcel() {
    const ws = styledSheet(
      filtered.map((r, i) => ({
        "S.No": i + 1,
        Date: fmtDate(r.payment_date),
        Plot: r.plot,
        Customer: r.customer,
        "White(Bank)": Number(r.amount_white_bank),
        "White(Cash)": Number(r.amount_white_cash),
        "Black(Cash)": Number(r.amount_black_cash),
        "Advance(Cash)": Number(r.amount_advance_cash),
        Total: r.total,
      })),
      "Payments",
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments");
    XLSX.writeFile(wb, "Payments.xlsx");
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Payments</h1>
          <p className="text-sm text-muted-foreground">All payments recorded across the project.</p>
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

      {/* Totals - hidden by default */}
      <div className="mt-6">
        <button
          onClick={() => setShowTotals(!showTotals)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          {showTotals ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showTotals ? "Hide totals" : "Show totals"}
        </button>
        {showTotals && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <Total label="White (Bank)" value={fmtMoney(totals.whiteBank)} />
            <Total label="White (Cash)" value={fmtMoney(totals.whiteCash)} />
            <Total label="Black (Cash)" value={fmtMoney(totals.blackCash)} />
            <Total label="Advance (Cash)" value={fmtMoney(totals.advanceCash)} />
            <Total label="Grand total" value={fmtMoney(totals.total)} accent />
          </div>
        )}
      </div>

      {/* Search & filter bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by date, name, amount..."
            className="w-full rounded-lg border border-input bg-card pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={plotFilter}
          onChange={(e) => setPlotFilter(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All plots</option>
          {plotNumbers.map((pn) => (
            <option key={pn} value={pn}>Plot {pn}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} payment{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No payments yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Plot</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-right">White (Bank)</th>
                <th className="px-4 py-3 text-right">White (Cash)</th>
                <th className="px-4 py-3 text-right">Black (Cash)</th>
                <th className="px-4 py-3 text-right">Advance (Cash)</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">{fmtDate(r.payment_date)}</td>
                  <td className="px-4 py-3 font-medium">{r.plot}</td>
                  <td className="px-4 py-3">{r.customer}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(Number(r.amount_white_bank))}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(Number(r.amount_white_cash))}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(Number(r.amount_black_cash))}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(Number(r.amount_advance_cash))}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
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

function Total({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] ${accent ? "ring-2 ring-primary/30" : ""}`}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

