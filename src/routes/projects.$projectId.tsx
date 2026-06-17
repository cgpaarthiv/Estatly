import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { usePinLock } from "@/lib/pin-context";
import {
  LayoutDashboard, Info, Users, Wallet, FileText, FolderOpen, CalendarDays,
  ChevronLeft, MapPinned, Lock, Loader2, Download, Briefcase, ClipboardCheck, Receipt,
} from "lucide-react";
import type { Project } from "@/lib/data";
import { exportProjectExcel, exportProjectPDF } from "@/lib/export";
import logoImg from "@/assets/logo.png";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { lock } = usePinLock();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    db.projects.get(projectId).then((data) => {
      setProject(data);
      setLoadingProject(false);
    });
  }, [projectId]);

  const items = [
    { to: `/projects/${projectId}`, label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: `/projects/${projectId}/info`, label: "Info Page", icon: Info },
    { to: `/projects/${projectId}/registered`, label: "Registered Plot Details", icon: ClipboardCheck },
    { to: `/projects/${projectId}/customers`, label: "Customers", icon: Users },
    { to: `/projects/${projectId}/payments`, label: "Payments", icon: Wallet },
    { to: `/projects/${projectId}/calendar`, label: "Calendar", icon: CalendarDays },
    { to: `/projects/${projectId}/work`, label: "Work Management", icon: Briefcase },
    { to: `/projects/${projectId}/general-payments`, label: "General Payments", icon: Receipt },
    { to: `/projects/${projectId}/files`, label: "Project Files", icon: FolderOpen },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex h-screen sticky top-0 overflow-y-auto">
        <Link to="/dashboard" className="flex items-center gap-2 px-5 py-5 font-display text-lg font-bold">
          <img src={logoImg} alt="Estatly" className="h-8 w-8 rounded-lg" />
          Estatly
        </Link>
        <Link
          to="/dashboard"
          className="mx-3 mb-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All projects
        </Link>
        <div className="px-5">
          <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/50">Project</div>
          <div className="mt-1 line-clamp-2 font-display font-semibold">{project?.name ?? "…"}</div>
          <div className="text-xs text-sidebar-foreground/60">LP {project?.lp_number}</div>
        </div>
        <nav className="mt-6 flex-1 space-y-1 px-3">
          {items.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? pathname === to : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 p-3">
          <button
            onClick={async () => {
              try {
                await exportProjectPDF(projectId);
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
            className="flex w-full items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-sm hover:bg-sidebar-accent/80"
          >
            <Download className="h-4 w-4" /> Export PDF
          </button>
          <button
            onClick={async () => {
              try {
                await exportProjectExcel(projectId);
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
            className="flex w-full items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-sm hover:bg-sidebar-accent/80"
          >
            <Download className="h-4 w-4" /> Export Excel
          </button>
          <button
            onClick={lock}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent"
          >
            <Lock className="h-4 w-4" /> Lock
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
        {loadingProject ? (
          <Centered>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </Centered>
        ) : !project ? (
          <Centered>Project not found.</Centered>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
