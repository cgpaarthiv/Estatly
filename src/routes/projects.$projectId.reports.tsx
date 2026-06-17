import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { exportProjectExcel, exportProjectPDF } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId/reports")({ component: ReportsPage });

function ReportsPage() {
  const { projectId } = Route.useParams();
  async function go(fmt: "pdf" | "excel") {
    try {
      fmt === "pdf" ? await exportProjectPDF(projectId) : await exportProjectExcel(projectId);
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  return (
    <div className="p-6 md:p-8">
      <h1 className="font-display text-2xl font-bold">Reports</h1>
      <p className="text-sm text-muted-foreground">Generate professional project reports.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          {
            fmt: "pdf" as const,
            title: "PDF report",
            desc: "Formatted, print-ready report with plot and payment tables.",
          },
          {
            fmt: "excel" as const,
            title: "Excel workbook",
            desc: "Multi-sheet workbook: project, plots, customers, payments.",
          },
        ].map((c) => (
          <div
            key={c.fmt}
            className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">{c.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
            <button
              onClick={() => go(c.fmt)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Download className="h-4 w-4" /> Download {c.fmt.toUpperCase()}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
