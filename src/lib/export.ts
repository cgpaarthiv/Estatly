import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx-js-style";
import { db } from "./db";
import { fmtDate, fmtMoney } from "./data";
import { styledSheet } from "./xlsx-style";

function customerName(customers: any[], id: string | null) {
  if (!id) return "—";
  return customers.find((c: any) => c.id === id)?.name || "—";
}

function calcTotal(e: any): number {
  if (e.pricing_type === "iron") return e.price_per_quantity ?? 0;
  if (e.pricing_type === "daily" || e.pricing_type === "quantity")
    return (e.total_quantity ?? 0) * (e.price_per_quantity ?? 0);
  return ((e.time_worked_minutes ?? 0) / 60) * (e.price_per_hour ?? 0);
}

function fmtStatus(s: string) {
  if (s === "sale_agreement") return "Sale Agreement";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtPricingType(t: string) {
  if (t === "quantity") return "Quantity Based";
  if (t === "time") return "Time Based";
  if (t === "daily") return "Day Based";
  if (t === "iron") return "Iron";
  return t;
}

function fmtTimeMin(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtWorkQty(e: any): string | number {
  if (e.pricing_type === "time") return fmtTimeMin(e.time_worked_minutes ?? 0);
  if (e.pricing_type === "iron") return e.total_quantity ?? "—";
  return e.total_quantity ?? "—";
}

function fmtWorkRate(e: any): string | number {
  if (e.pricing_type === "time") return `${e.price_per_hour ?? 0}/hour`;
  if (e.pricing_type === "quantity") return `${e.price_per_quantity ?? 0}/qty`;
  if (e.pricing_type === "daily") return `${e.price_per_quantity ?? 0}/day`;
  if (e.pricing_type === "iron") return e.price_per_quantity ?? 0;
  return e.price_per_quantity ?? "—";
}

async function fetchAll(projectId: string) {
  const [exportData, workEntries, workDone, workPayments, generalPayments] =
    await Promise.all([
      db.exportProject(projectId),
      db.workEntries.list(projectId),
      db.workDone.list(projectId),
      db.workPayments.list(projectId),
      db.generalPayments.list(projectId),
    ]);
  return { ...exportData, workEntries, workDone, workPayments, generalPayments };
}

function processGroupedCustomers(customers: any[], plots: any[]): any[] {
  const groups: {
    customer: any;
    ids: Set<string>;
    names: Set<string>;
    plotNumbers: string[];
  }[] = [];

  customers.forEach((c) => {
    const cName = c.name.toLowerCase().trim();
    const cPhone = (c.phone || "").toLowerCase().trim();

    let matchedGroup = groups.find((g) => {
      const gName = g.customer.name.toLowerCase().trim();
      const gPhone = (g.customer.phone || "").toLowerCase().trim();

      return cName === gName && cPhone === gPhone;
    });

    if (matchedGroup) {
      matchedGroup.ids.add(c.id);
      matchedGroup.names.add(c.name);
      if (c.name.length > matchedGroup.customer.name.length) {
        matchedGroup.customer.name = c.name;
      }
      if (!matchedGroup.customer.phone && c.phone) matchedGroup.customer.phone = c.phone;
      if (!matchedGroup.customer.email && c.email) matchedGroup.customer.email = c.email;
      if (!matchedGroup.customer.address && c.address) matchedGroup.customer.address = c.address;
    } else {
      groups.push({
        customer: { ...c },
        ids: new Set([c.id]),
        names: new Set([c.name]),
        plotNumbers: [],
      });
    }
  });

  plots.forEach((p) => {
    const matchedGroup = groups.find((g) => {
      if (p.customer_id && g.ids.has(p.customer_id)) return true;
      if (p.buyer_name) {
        const bName = p.buyer_name.toLowerCase().trim();
        return Array.from(g.names).some(n => n.toLowerCase().trim() === bName);
      }
      return false;
    });

    if (matchedGroup) {
      matchedGroup.plotNumbers.push(p.plot_number);
    }
  });

  return groups.map((g) => {
    const uniquePlots = Array.from(new Set(g.plotNumbers)).sort((a, b) => 
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
    return {
      ...g.customer,
      plotsDisplay: uniquePlots.length > 0 ? uniquePlots.join(", ") : "—",
    };
  });
}


/* ═══════════════════════════════════════════════════════════════════════
   FULL PROJECT PDF
   ═══════════════════════════════════════════════════════════════════════ */

export async function exportProjectPDF(projectId: string) {
  const data = await fetchAll(projectId);
  const { project, plots, customers, payments, workEntries, workDone, workPayments, generalPayments } = data;

  // Sort plots by plot number numerically ascending
  plots.sort((a, b) => a.plot_number.localeCompare(b.plot_number, undefined, { numeric: true, sensitivity: "base" }));
  // Sort payments by payment date ascending
  payments.sort((a, b) => (a.payment_date ?? "").localeCompare(b.payment_date ?? ""));
  // Sort work entries by date ascending
  workEntries.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  workDone.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  // Sort work payments by date ascending
  workPayments.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  // Sort general payments by date ascending
  generalPayments.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const doc = new jsPDF({ orientation: "landscape" });
  const green: [number, number, number] = [22, 101, 52];
  const styles = { fontSize: 8 };

  // ── Cover / Project Summary ──
  doc.setFontSize(20);
  doc.text(project.name, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`LP Number: ${project.lp_number}`, 14, 26);
  doc.text(`Created: ${fmtDate(project.created_at)}`, 14, 32);
  doc.text(`Total plots: ${plots.length} | Advance/Sold: ${plots.filter((p) => p.status !== "available").length}`, 14, 38);
  doc.setTextColor(0);

  // ── 1. Info (All Plots) ──
  doc.setFontSize(13);
  doc.text("Info — All Plots", 14, 50);
  autoTable(doc, {
    startY: 54,
    head: [["S.No", "Plot No.", "Facing", "Size", "Price/sqyd", "Status", "Buyer", "Referred by"]],
    body: plots.map((p, i) => [
      i + 1, p.plot_number, p.plot_type ?? "—", p.size_sqft ?? "—",
      fmtMoney(p.price), fmtStatus(p.status), p.buyer_name ?? "—", p.description ?? "—",
    ]),
    headStyles: { fillColor: green }, styles,
  });

  // ── 2a. Registered Plot Details (Auditor) ──
  const registered = plots.filter((p) => p.status === "registered");
  registered.sort((a, b) => {
    const dA = a.registration_date;
    const dB = b.registration_date;
    if (!dA && !dB) return 0;
    if (!dA) return 1;
    if (!dB) return -1;
    return dA.localeCompare(dB);
  });
  if (registered.length) {
    doc.addPage();
    doc.setFontSize(13);
    doc.text("Registered Plot Details — Auditor", 14, 18);
    const auditorBody = registered.map((p, i) => {
      const pays = payments.filter((pay) => pay.plot_id === p.id);
      const wBank = pays.reduce((s, x) => s + Number(x.amount_white_bank), 0);
      const wCash = pays.reduce((s, x) => s + Number(x.amount_white_cash), 0);
      return [
        i + 1, p.registration_date ? fmtDate(p.registration_date) : "—",
        p.document_number ?? "—", p.buyer_name ?? "—", p.plot_number,
        p.size_sqft ?? "—",
        fmtMoney(wBank), fmtMoney(wCash), fmtMoney(wBank + wCash),
      ];
    });

    const totAuditorWBank = registered.reduce((s, p) => {
      const pays = payments.filter((pay) => pay.plot_id === p.id);
      return s + pays.reduce((sum, x) => sum + Number(x.amount_white_bank), 0);
    }, 0);
    const totAuditorWCash = registered.reduce((s, p) => {
      const pays = payments.filter((pay) => pay.plot_id === p.id);
      return s + pays.reduce((sum, x) => sum + Number(x.amount_white_cash), 0);
    }, 0);

    auditorBody.push([
      "", "", "", "Total", "", "",
      "", "", fmtMoney(totAuditorWBank + totAuditorWCash)
    ]);

    autoTable(doc, {
      startY: 24,
      head: [["S.No", "Reg. Date", "Doc No.", "Name", "Plot No.", "Size", "W. Bank", "W. Cash", "Total"]],
      body: auditorBody,
      headStyles: { fillColor: green }, styles,
    });

    // ── 2b. Registered Plot Details (Company) ──
    doc.addPage();
    doc.setFontSize(13);
    doc.text("Registered Plot Details — Company", 14, 18);

    const companyBody = registered.map((p, i) => {
      const pays = payments.filter((pay) => pay.plot_id === p.id);
      const wBank = pays.reduce((s, x) => s + Number(x.amount_white_bank), 0);
      const wCash = pays.reduce((s, x) => s + Number(x.amount_white_cash), 0);
      const bCash = pays.reduce((s, x) => s + Number(x.amount_black_cash), 0);
      const advCash = pays.reduce((s, x) => s + Number(x.amount_advance_cash), 0);
      const advBank = pays.reduce((s, x) => s + Number(x.amount_advance_bank), 0);
      return [
        i + 1, p.registration_date ? fmtDate(p.registration_date) : "—",
        p.document_number ?? "—", p.buyer_name ?? "—", p.plot_number,
        p.size_sqft ?? "—", fmtMoney(p.price),
        fmtMoney(wBank), fmtMoney(wCash), fmtMoney(bCash + advCash + advBank), fmtMoney(wBank + wCash + bCash + advCash + advBank),
      ];
    });

    const totCoWBank = registered.reduce((s, p) => {
      const pays = payments.filter((pay) => pay.plot_id === p.id);
      return s + pays.reduce((sum, x) => sum + Number(x.amount_white_bank), 0);
    }, 0);
    const totCoWCash = registered.reduce((s, p) => {
      const pays = payments.filter((pay) => pay.plot_id === p.id);
      return s + pays.reduce((sum, x) => sum + Number(x.amount_white_cash), 0);
    }, 0);
    const totCoBCash = registered.reduce((s, p) => {
      const pays = payments.filter((pay) => pay.plot_id === p.id);
      return s + pays.reduce((sum, x) => sum + Number(x.amount_black_cash) + Number(x.amount_advance_cash) + Number(x.amount_advance_bank), 0);
    }, 0);
    const totCoTotal = totCoWBank + totCoWCash + totCoBCash;

    companyBody.push([
      "", "", "", "Total", "", "", "",
      "", "", "", fmtMoney(totCoTotal)
    ]);

    autoTable(doc, {
      startY: 24,
      head: [["S.No", "Reg. Date", "Doc No.", "Name", "Plot No.", "Size", "Rate/sqyd", "W. Bank", "W. Cash", "Black Cash", "Total"]],
      body: companyBody,
      headStyles: { fillColor: green }, styles,
    });
  }

  // ── 3. Customers ──
  const groupedCustsPDF = processGroupedCustomers(customers, plots);
  if (groupedCustsPDF.length) {
    doc.addPage();
    doc.setFontSize(13);
    doc.text("Customers", 14, 18);
    autoTable(doc, {
      startY: 24,
      head: [["S.No", "Name", "Plots", "Phone", "Email", "Address"]],
      body: groupedCustsPDF.map((c, i) => [
        i + 1, c.name, c.plotsDisplay, c.phone ?? "—", c.email ?? "—", c.address ?? "—",
      ]),
      headStyles: { fillColor: green }, styles,
    });
  }

  // ── 4. Payments ──
  if (payments.length) {
    doc.addPage();
    doc.setFontSize(13);
    doc.text("Payments", 14, 18);
    autoTable(doc, {
      startY: 24,
      head: [["Date", "Plot No.", "Customer", "W. Bank", "W. Cash", "Black", "Adv. Cash", "Total"]],
      body: payments.map((pay) => {
        const plot = plots.find((pl) => pl.id === pay.plot_id);
        const total = Number(pay.amount_white_bank) + Number(pay.amount_white_cash) + Number(pay.amount_black_cash) + Number(pay.amount_advance_cash) + Number(pay.amount_advance_bank);
        return [
          fmtDate(pay.payment_date), plot?.plot_number ?? "—",
          customerName(customers, pay.customer_id),
          fmtMoney(Number(pay.amount_white_bank)), fmtMoney(Number(pay.amount_white_cash)),
          fmtMoney(Number(pay.amount_black_cash)), fmtMoney(Number(pay.amount_advance_cash)),
          fmtMoney(total),
        ];
      }),
      headStyles: { fillColor: green }, styles,
    });
  }

  // ── 5. Work Management ──
  const allWorkEntries = [
    ...workEntries.map((e) => ({ ...e, source: "Material" as const })),
    ...workDone.map((e) => ({ ...e, source: "Work Done" as const })),
  ];
  allWorkEntries.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  if (allWorkEntries.length) {
    doc.addPage();
    doc.setFontSize(13);
    doc.text("Work Management", 14, 18);
    autoTable(doc, {
      startY: 24,
      head: [["S.No", "Date", "Particular", "Name", "Type", "Total"]],
      body: allWorkEntries.map((e, i) => [
        i + 1,
        fmtDate(e.date),
        e.particular,
        "name" in e ? ((e as any).name ?? "—") : "—",
        e.source,
        fmtMoney(calcTotal(e)),
      ]),
      headStyles: { fillColor: green }, styles,
    });
  }

  // ── 6. Work Payments ──
  if (workPayments.length) {
    doc.addPage();
    doc.setFontSize(13);
    doc.text("Work Payments", 14, 18);
    autoTable(doc, {
      startY: 24,
      head: [["S.No", "Date", "Particular", "Vendor", "Amount", "Method", "Description"]],
      body: workPayments.map((p, i) => [
        i + 1, fmtDate(p.date), p.particular_key, p.vendor ?? "—",
        fmtMoney(p.amount), p.notes === "check" ? "Bank" : "Cash",
        (p as any).description ?? "—",
      ]),
      headStyles: { fillColor: green }, styles,
    });
  }

  // ── 7. General Payments ──
  if (generalPayments.length) {
    doc.addPage();
    doc.setFontSize(13);
    doc.text("General Payments", 14, 18);
    autoTable(doc, {
      startY: 24,
      head: [["S.No", "Date", "Particulars", "Name", "Amount", "Method"]],
      body: generalPayments.map((g, i) => [
        i + 1, fmtDate(g.date), g.particular, g.name ?? "—",
        fmtMoney(g.amount), g.method === "bank" ? "Bank" : "Cash",
      ]),
      headStyles: { fillColor: green }, styles,
    });
  }

  doc.save(`${project.name.replace(/\s+/g, "_")}_Full_Report.pdf`);
}

/* ═══════════════════════════════════════════════════════════════════════
   FULL PROJECT EXCEL
   ═══════════════════════════════════════════════════════════════════════ */

export async function exportProjectExcel(projectId: string) {
  const data = await fetchAll(projectId);
  const { project, plots, customers, payments, workEntries, workDone, workPayments, generalPayments } = data;

  // Sort plots by plot number numerically ascending
  plots.sort((a, b) => a.plot_number.localeCompare(b.plot_number, undefined, { numeric: true, sensitivity: "base" }));
  // Sort payments by payment date ascending
  payments.sort((a, b) => (a.payment_date ?? "").localeCompare(b.payment_date ?? ""));
  // Sort work entries by date ascending
  workEntries.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  workDone.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  // Sort work payments by date ascending
  workPayments.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  // Sort general payments by date ascending
  generalPayments.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const wb = XLSX.utils.book_new();

  // 1. Project Summary
  XLSX.utils.book_append_sheet(wb, styledSheet([{
    Name: project.name,
    "LP Number": project.lp_number,
    Created: fmtDate(project.created_at),
    "Total Plots": plots.length,
    "Advance/Sold": plots.filter((p) => p.status !== "available").length,
  }], "Project Summary"), "Project");

  // 2. All Plots (Info)
  XLSX.utils.book_append_sheet(wb, styledSheet(
    plots.map((p, i) => ({
      "S.No": i + 1,
      "Plot No.": p.plot_number,
      Facing: p.plot_type ?? "—",
      "Size (sqyd)": p.size_sqft ?? "—",
      Length: p.length ?? "—",
      Width: p.width ?? "—",
      "Price/sqyd": p.price,
      Status: fmtStatus(p.status),
      "Doc No.": p.document_number ?? "—",
      Buyer: p.buyer_name ?? "—",
      "Referred by": p.description ?? "—",
      Notes: p.notes ?? "—",
    })),
  "Plots Info"), "Plots");

  // 3a. Registered Plots (Auditor)
  const registered = plots.filter((p) => p.status === "registered");
  registered.sort((a, b) => {
    const dA = a.registration_date;
    const dB = b.registration_date;
    if (!dA && !dB) return 0;
    if (!dA) return 1;
    if (!dB) return -1;
    return dA.localeCompare(dB);
  });
  if (registered.length) {
    // Auditor sheet — title row + headers + data
    const auditorData: any[] = registered.map((p, i) => {
      const pays = payments.filter((pay) => pay.plot_id === p.id);
      const wBank = pays.reduce((s, x) => s + Number(x.amount_white_bank), 0);
      const wCash = pays.reduce((s, x) => s + Number(x.amount_white_cash), 0);
      return {
        "S.No": i + 1,
        "Reg. Date": p.registration_date ? fmtDate(p.registration_date) : "—",
        "Doc No.": p.document_number ?? "—",
        Name: p.buyer_name ?? "—",
        "Plot No.": p.plot_number,
        Size: p.size_sqft ?? "—",
        "W. Bank": wBank,
        "W. Cash": wCash,
        Total: wBank + wCash,
      };
    });

    const totTotal = auditorData.reduce((sum, r) => sum + r.Total, 0);

    auditorData.push({
      "S.No": "",
      "Reg. Date": "",
      "Doc No.": "",
      Name: "Total",
      "Plot No.": "",
      Size: "",
      "W. Bank": "",
      "W. Cash": "",
      Total: totTotal,
    });

    XLSX.utils.book_append_sheet(wb, styledSheet(auditorData, "Auditor"), "Registered (Auditor)");

    // 3b. Registered Plots (Company)
    const companyData: any[] = registered.map((p, i) => {
      const pays = payments.filter((pay) => pay.plot_id === p.id);
      const wBank = pays.reduce((s, x) => s + Number(x.amount_white_bank), 0);
      const wCash = pays.reduce((s, x) => s + Number(x.amount_white_cash), 0);
      const bCash = pays.reduce((s, x) => s + Number(x.amount_black_cash), 0);
      const advCash = pays.reduce((s, x) => s + Number(x.amount_advance_cash), 0);
      const advBank = pays.reduce((s, x) => s + Number(x.amount_advance_bank), 0);
      return {
        "S.No": i + 1,
        "Reg. Date": p.registration_date ? fmtDate(p.registration_date) : "—",
        "Doc No.": p.document_number ?? "—",
        Name: p.buyer_name ?? "—",
        "Plot No.": p.plot_number,
        Size: p.size_sqft ?? "—",
        "Rate/sqyd": p.price,
        "W. Bank": wBank,
        "W. Cash": wCash,
        "Black Cash": bCash + advCash + advBank,
        Total: wBank + wCash + bCash + advCash + advBank,
      };
    });

    const totTotalCo = companyData.reduce((sum, r) => sum + r.Total, 0);

    companyData.push({
      "S.No": "",
      "Reg. Date": "",
      "Doc No.": "",
      Name: "Total",
      "Plot No.": "",
      Size: "",
      "Rate/sqyd": "",
      "W. Bank": "",
      "W. Cash": "",
      "Black Cash": "",
      Total: totTotalCo,
    });

    XLSX.utils.book_append_sheet(wb, styledSheet(companyData, "Company"), "Registered (Company)");
  }

  // 4. Customers
  const groupedCustsExcel = processGroupedCustomers(customers, plots);
  XLSX.utils.book_append_sheet(wb, styledSheet(
    groupedCustsExcel.map((c, i) => ({
      "S.No": i + 1,
      Name: c.name,
      Plots: c.plotsDisplay,
      Phone: c.phone ?? "—",
      Email: c.email ?? "—",
      Address: c.address ?? "—",
    })),
  "Customers"), "Customers");

  // 5. Payments
  XLSX.utils.book_append_sheet(wb, styledSheet(
    payments.map((pay) => {
      const plot = plots.find((pl) => pl.id === pay.plot_id);
      const total = Number(pay.amount_white_bank) + Number(pay.amount_white_cash) + Number(pay.amount_black_cash) + Number(pay.amount_advance_cash) + Number(pay.amount_advance_bank);
      return {
        Date: fmtDate(pay.payment_date),
        "Plot No.": plot?.plot_number ?? "—",
        Customer: customerName(customers, pay.customer_id),
        "White (Bank)": pay.amount_white_bank,
        "White (Cash)": pay.amount_white_cash,
        "Black (Cash)": pay.amount_black_cash,
        "Advance (Cash)": pay.amount_advance_cash,
        Total: total,
      };
    }),
  "Payments"), "Payments");

  // 6. Work Management (Materials + Work Done)
  const allWorkEntries = [
    ...workEntries.map((e) => ({ ...e, source: "Material" as const })),
    ...workDone.map((e) => ({ ...e, source: "Work Done" as const })),
  ];
  allWorkEntries.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  if (allWorkEntries.length) {
    XLSX.utils.book_append_sheet(wb, styledSheet(
      allWorkEntries.map((e, i) => ({
        "S.No": i + 1,
        Date: fmtDate(e.date),
        Particular: e.particular,
        Name: "name" in e ? ((e as any).name ?? "—") : "—",
        Type: e.source,
        "Pricing Type": fmtPricingType(e.pricing_type),
        Quantity: fmtWorkQty(e),
        Rate: fmtWorkRate(e),
        Total: calcTotal(e),
        Notes: (e as any).notes ?? "—",
      })),
    "Work Management"), "Work Entries");
  }

  // 7. Work Payments
  if (workPayments.length) {
    XLSX.utils.book_append_sheet(wb, styledSheet(
      workPayments.map((p, i) => ({
        "S.No": i + 1,
        Date: fmtDate(p.date),
        Particular: p.particular_key,
        Vendor: p.vendor ?? "—",
        Amount: p.amount,
        Method: p.notes === "check" ? "Bank" : "Cash",
        Description: (p as any).description ?? "—",
      })),
    "Work Payments"), "Work Payments");
  }

  // 8. General Payments
  if (generalPayments.length) {
    XLSX.utils.book_append_sheet(wb, styledSheet(
      generalPayments.map((g, i) => ({
        "S.No": i + 1,
        Date: fmtDate(g.date),
        Particulars: g.particular,
        Name: g.name ?? "—",
        Amount: g.amount,
        Method: g.method === "bank" ? "Bank" : "Cash",
      })),
    "General Payments"), "General Payments");
  }

  XLSX.writeFile(wb, `${project.name.replace(/\s+/g, "_")}_Full_Report.xlsx`);
}
