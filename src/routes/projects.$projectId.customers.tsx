import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { db } from "@/lib/db";
import type { Customer } from "@/lib/data";
import { Plus, Loader2, X, Pencil, Download, Trash2 } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { styledSheet } from "@/lib/xlsx-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId/customers")({ component: CustomersPage });

type GroupedCustomer = Customer & {
  plotsDisplay: string;
  allIds: string[];
};

function CustomersPage() {
  const { projectId } = Route.useParams();
  const [list, setList] = useState<GroupedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);

  async function handleDelete(ids: string[]) {
    setConfirmDeleteIds(ids);
  }

  async function executeDelete() {
    if (!confirmDeleteIds) return;
    try {
      await db.customers.delete(confirmDeleteIds);
      toast.success("Customer deleted");
      setConfirmDeleteIds(null);
      reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function reload() {
    const [custs, plots] = await Promise.all([
      db.customers.list(),
      db.plots.list(projectId),
    ]);

    const groups: {
      customer: Customer;
      ids: Set<string>;
      names: Set<string>;
      plotNumbers: string[];
    }[] = [];

    custs.forEach((c) => {
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

    const processedList = groups.map((g) => {
      const uniquePlots = Array.from(new Set(g.plotNumbers)).sort((a, b) => 
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      );
      return {
        ...g.customer,
        plotsDisplay: uniquePlots.length > 0 ? uniquePlots.join(", ") : "—",
        allIds: Array.from(g.ids),
      };
    });

    setList(processedList);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  function downloadPDF() {
    const doc = new jsPDF({ orientation: "portrait" });
    doc.setFontSize(16);
    doc.text("Customers", 14, 18);
    doc.setFontSize(10);
    doc.text(`${list.length} customers`, 14, 25);

    const headers = ["S.No", "Name", "Plots", "Phone", "Email", "Address"];
    const body = list.map((c, i) => [
      i + 1,
      c.name,
      c.plotsDisplay,
      c.phone ?? "—",
      c.email ?? "—",
      c.address ?? "—",
    ]);

    autoTable(doc, {
      head: [headers],
      body,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 101, 52] },
    });

    doc.save("Customers.pdf");
  }

  function downloadExcel() {
    const ws = styledSheet(
      list.map((c, i) => ({
        "S.No": i + 1,
        Name: c.name,
        Plots: c.plotsDisplay,
        Phone: c.phone ?? "—",
        Email: c.email ?? "—",
        Address: c.address ?? "—",
      })),
      "Customers",
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, "Customers.xlsx");
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">Customers across all your projects.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadPDF}
            disabled={list.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-primary bg-card px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
          <button
            onClick={downloadExcel}
            disabled={list.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download Excel
          </button>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add customer
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
          </div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No customers yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Plots</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Address</th>
                <th className="px-4 py-3 text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 font-semibold text-primary">{c.plotsDisplay}</td>
                  <td className="px-4 py-3">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3">{c.email ?? "—"}</td>
                  <td className="px-4 py-3">{c.address ?? "—"}</td>
                  <td className="px-4 py-3 text-center flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => setEditing(c)}
                      className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.allIds)}
                      className="inline-flex items-center justify-center rounded-md p-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <AddModal
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            reload();
          }}
        />
      )}

      {editing && (
        <EditModal
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {confirmDeleteIds && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmDeleteIds(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-foreground">Confirm Delete</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this customer?
              <br />
              This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteIds(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
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

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await db.customers.create({
        name,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
      });
      toast.success("Customer added");
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Add customer</h3>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {(
            [
              ["Name *", name, setName, true],
              ["Phone", phone, setPhone, false],
              ["Email", email, setEmail, false],
              ["Address", address, setAddress, false],
            ] as const
          ).map(([l, v, s, req]) => (
            <label key={l} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{l}</span>
              <input
                value={v}
                onChange={(e) => s(e.target.value)}
                required={req}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          ))}
        </div>
        <button
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      </form>
    </div>
  );
}

function EditModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await db.customers.update({
        id: customer.id,
        name,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
      });
      toast.success("Customer updated");
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Edit customer</h3>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Name *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Address</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>
        <button
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update
        </button>
      </form>
    </div>
  );
}



