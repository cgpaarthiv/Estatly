import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/data";
import { Loader2, Search, ChevronLeft, ChevronRight, Download, Scale, Building2 } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { styledSheet } from "@/lib/xlsx-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/projects/$projectId/registered")({
  component: RegisteredPage,
});

type Row = {
  serial: number;
  registrationDate: string;
  plotNumber: string;
  sizeSqyd: number | null;
  pricePerSqyd: number;
  documentNumber: string;
  buyerName: string;
  whiteBankPaid: number;
  whiteCashPaid: number;
  blackCashPaid: number;
  advanceCashPaid: number;
  advanceBankPaid: number;
  grandTotal: number;
};

type ViewMode = "auditor" | "company";

const PAGE_SIZE = 10;

function RegisteredPage() {
  const { projectId } = Route.useParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<ViewMode>("auditor");

  useEffect(() => {
    db.infoData(projectId).then(({ plots, customers, payments }) => {
      const registered = plots.filter((p) => p.status === "registered");
      const cMap = new Map(customers.map((c) => [c.id, c]));

      const out: Row[] = registered.map((p, i) => {
        const pays = payments.filter((pay) => pay.plot_id === p.id);
        const whiteBankPaid = pays.reduce((s, x) => s + Number(x.amount_white_bank), 0);
        const whiteCashPaid = pays.reduce((s, x) => s + Number(x.amount_white_cash), 0);
        const blackCashPaid = pays.reduce((s, x) => s + Number(x.amount_black_cash), 0);
        const advanceCashPaid = pays.reduce((s, x) => s + Number(x.amount_advance_cash), 0);
        const advanceBankPaid = pays.reduce((s, x) => s + Number(x.amount_advance_bank), 0);
        const cust = p.customer_id ? cMap.get(p.customer_id) : undefined;
        const name = p.buyer_name || cust?.name || "—";

        return {
          serial: i + 1,
          registrationDate: p.registration_date ?? "—",
          plotNumber: p.plot_number,
          sizeSqyd: p.size_sqft,
          pricePerSqyd: p.price,
          documentNumber: p.document_number ?? "—",
          buyerName: name,
          whiteBankPaid,
          whiteCashPaid,
          blackCashPaid: blackCashPaid + advanceCashPaid + advanceBankPaid,
          advanceCashPaid,
          advanceBankPaid,
          grandTotal: whiteBankPaid + whiteCashPaid + blackCashPaid + advanceCashPaid + advanceBankPaid,
        };
      });

      out.sort((a, b) => {
        if (a.registrationDate === "—" && b.registrationDate === "—") return 0;
        if (a.registrationDate === "—") return 1;
        if (b.registrationDate === "—") return -1;
        return a.registrationDate.localeCompare(b.registrationDate);
      });
      out.forEach((r, i) => (r.serial = i + 1));

      setRows(out);
      setLoading(false);
    });
  }, [projectId]);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.buyerName.toLowerCase().includes(q) ||
      r.plotNumber.toLowerCase().includes(q) ||
      r.documentNumber.toLowerCase().includes(q)
    );
  });

  const numbered = filtered.map((r, i) => ({ ...r, serial: i + 1 }));

  const totalPages = Math.max(1, Math.ceil(numbered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = numbered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [search]);

  const totals = numbered.reduce(
    (s, r) => ({
      whiteBank: s.whiteBank + r.whiteBankPaid,
      whiteCash: s.whiteCash + r.whiteCashPaid,
      blackCash: s.blackCash + r.blackCashPaid,
      advanceCash: s.advanceCash + r.advanceCashPaid,
      advanceBank: s.advanceBank + r.advanceBankPaid,
      grandTotal: s.grandTotal + r.grandTotal,
    }),
    { whiteBank: 0, whiteCash: 0, blackCash: 0, advanceCash: 0, advanceBank: 0, grandTotal: 0 },
  );

  const isCompany = view === "company";
  const auditorTotal = (r: Row) => r.whiteBankPaid + r.whiteCashPaid;

  function downloadExcel() {
    const title = isCompany ? "Company" : "Auditor";
    const sheetData = numbered.map((r) => {
      const base: Record<string, string | number> = {
        "S.No": r.serial,
        "Reg. Date": r.registrationDate !== "—" ? fmtDate(r.registrationDate) : "—",
        "Doc No.": r.documentNumber,
        Name: r.buyerName,
        Plot: r.plotNumber,
        Size: r.sizeSqyd ?? "—",
      };
      if (isCompany) base["Rate/sqyd"] = r.pricePerSqyd;
      base["W. Bank"] = r.whiteBankPaid;
      base["W. Cash"] = r.whiteCashPaid;
      if (isCompany) base["Black Cash"] = r.blackCashPaid;
      base["Total"] = isCompany ? r.grandTotal : auditorTotal(r);
      return base;
    });

    const totalWBank = numbered.reduce((sum, r) => sum + r.whiteBankPaid, 0);
    const totalWCash = numbered.reduce((sum, r) => sum + r.whiteCashPaid, 0);
    const totalBCash = isCompany ? numbered.reduce((sum, r) => sum + r.blackCashPaid, 0) : 0;
    const totalGrand = isCompany
      ? numbered.reduce((sum, r) => sum + r.grandTotal, 0)
      : numbered.reduce((sum, r) => sum + auditorTotal(r), 0);

    const totalRow: Record<string, string | number> = {
      "S.No": "",
      "Reg. Date": "",
      "Doc No.": "",
      Name: "Total",
      Plot: "",
      Size: "",
    };
    if (isCompany) totalRow["Rate/sqyd"] = "";
    totalRow["W. Bank"] = "";
    totalRow["W. Cash"] = "";
    if (isCompany) totalRow["Black Cash"] = "";
    totalRow["Total"] = totalGrand;

    sheetData.push(totalRow);

    const ws = styledSheet(sheetData, title);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isCompany ? "Company View" : "Auditor View");
    XLSX.writeFile(wb, `Registered_Plot_Details_${title}.xlsx`);
  }

  function downloadPDF() {
    const doc = new jsPDF({ orientation: isCompany ? "landscape" : "portrait" });
    doc.setFontSize(16);
    doc.text(`Registered Plot Details (${isCompany ? "Company" : "Auditor"})`, 14, 18);
    doc.setFontSize(10);
    doc.text(`${numbered.length} registered plots`, 14, 25);

    const headers = isCompany
      ? ["S.No", "Reg. Date", "Doc No.", "Name", "Plot", "Size", "Rate/sqyd", "W. Bank", "W. Cash", "Black Cash", "Total"]
      : ["S.No", "Reg. Date", "Doc No.", "Name", "Plot", "Size", "W. Bank", "W. Cash", "Total"];

    const body = numbered.map((r) => {
      const dateStr = r.registrationDate !== "—" ? fmtDate(r.registrationDate) : "—";
      if (isCompany) {
        return [r.serial, dateStr, r.documentNumber, r.buyerName, r.plotNumber, r.sizeSqyd ?? "—",
          fmtMoney(r.pricePerSqyd), fmtMoney(r.whiteBankPaid), fmtMoney(r.whiteCashPaid),
          fmtMoney(r.blackCashPaid), fmtMoney(r.grandTotal)];
      }
      return [r.serial, dateStr, r.documentNumber, r.buyerName, r.plotNumber, r.sizeSqyd ?? "—",
        fmtMoney(r.whiteBankPaid), fmtMoney(r.whiteCashPaid), fmtMoney(auditorTotal(r))];
    });

    const footerRow = isCompany
      ? ["", "", "", "", "", "Total", "", "", "", "", fmtMoney(totals.grandTotal)]
      : ["", "", "", "", "Total", "", "", "", fmtMoney(totals.whiteBank + totals.whiteCash)];
    body.push(footerRow);

    autoTable(doc, {
      head: [headers],
      body,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 101, 52] },
    });

    doc.save(`Registered_Plot_Details_${isCompany ? "Company" : "Auditor"}.pdf`);
  }

  const tabs: { key: ViewMode; label: string; icon: typeof Scale }[] = [
    { key: "auditor", label: "Auditor", icon: Scale },
    { key: "company", label: "Company", icon: Building2 },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">
            Registered Plot Details
          </h1>
          <p className="text-sm text-muted-foreground">
            All plots with registered status and their payment details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadPDF}
            disabled={numbered.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-primary bg-card px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
          <button
            onClick={downloadExcel}
            disabled={numbered.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download Excel
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="mt-6 flex rounded-xl border border-border bg-card p-1 shadow-sm">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setView(key); setPage(0); }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              view === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              view === key
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}>
              {numbered.length}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, plot or document..."
            className="w-full rounded-lg border border-input bg-card pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {numbered.length} registered plot{numbered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
          </div>
        ) : numbered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No registered plots found.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/60 uppercase tracking-wide text-muted-foreground" style={{ fontSize: "10px" }}>
              <tr>
                <th className="px-3 py-2.5 text-left">#</th>
                <th className="px-3 py-2.5 text-left">Reg. Date</th>
                <th className="px-3 py-2.5 text-left">Doc No.</th>
                <th className="px-3 py-2.5 text-left">Name</th>
                <th className="px-3 py-2.5 text-left">Plot</th>
                <th className="px-3 py-2.5 text-right">Size</th>
                {isCompany && <th className="px-3 py-2.5 text-right">Rate/sqyd</th>}
                <th className="px-3 py-2.5 text-right">W. Bank</th>
                <th className="px-3 py-2.5 text-right">W. Cash</th>
                {isCompany && <th className="px-3 py-2.5 text-right">Black Cash</th>}
                <th className="px-3 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr
                  key={r.plotNumber}
                  className="border-t border-border hover:bg-muted/30"
                >
                  <td className="px-3 py-2.5 text-muted-foreground">{r.serial}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.registrationDate !== "—" ? fmtDate(r.registrationDate) : "—"}</td>
                  <td className="px-3 py-2.5">{r.documentNumber}</td>
                  <td className="px-3 py-2.5">{r.buyerName}</td>
                  <td className="px-3 py-2.5 font-medium">{r.plotNumber}</td>
                  <td className="px-3 py-2.5 text-right">{r.sizeSqyd ?? "—"}</td>
                  {isCompany && <td className="px-3 py-2.5 text-right">{fmtMoney(r.pricePerSqyd)}</td>}
                  <td className="px-3 py-2.5 text-right">{fmtMoney(r.whiteBankPaid)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtMoney(r.whiteCashPaid)}</td>
                  {isCompany && <td className="px-3 py-2.5 text-right">{fmtMoney(r.blackCashPaid)}</td>}
                  <td className="px-3 py-2.5 text-right font-semibold">
                    {fmtMoney(isCompany ? r.grandTotal : auditorTotal(r))}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td colSpan={isCompany ? 10 : 8} className="px-3 py-2.5 text-right">Total</td>
                <td className="px-3 py-2.5 text-right">
                  {fmtMoney(isCompany ? totals.grandTotal : totals.whiteBank + totals.whiteCash)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

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
