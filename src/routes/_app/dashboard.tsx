import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Download, MapPinned, Lock, Calendar, Hash, MapPin, Settings, X, Loader2, Eye, EyeOff, Trash2, Pencil } from "lucide-react";
import logoImg from "@/assets/logo.png";
import { fmtDate, useProjects, type Project } from "@/lib/data";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { exportProjectExcel, exportProjectPDF } from "@/lib/export";
import { usePinLock } from "@/lib/pin-context";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

function Dashboard() {
  const { lock } = usePinLock();
  const nav = useNavigate();
  const { projects, loading, reload } = useProjects();
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [counts, setCounts] = useState<Record<string, { total: number; available: number }>>({});
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [editProject, setEditProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!projects.length) return;
    db.plots.countByProject(projects.map((p) => p.id)).then(setCounts);
  }, [projects]);

  const filtered = useMemo(
    () =>
      projects.filter((p) =>
        [p.name, p.lp_number].some((v) => v.toLowerCase().includes(q.toLowerCase())),
      ),
    [projects, q],
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-2 font-display text-lg font-bold">
            <img src={logoImg} alt="Estatly" className="h-8 w-8 rounded-lg" />
            Estatly
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Settings className="h-4 w-4" /> Settings
            </button>
            <button
              onClick={lock}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Lock className="h-4 w-4" /> Lock
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Your projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage every layout, plot and payment in one place.
            </p>
          </div>
          <div className="flex flex-1 flex-wrap justify-end gap-3 sm:flex-none">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects…"
                className="w-64 rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New project
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} hasQuery={!!q} />
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p, i) => (
              <ProjectCard key={p.id} project={p} delay={i * 0.04} stat={counts[p.id]} onDelete={() => setDeleteProject(p)} onEdit={() => setEditProject(p)} />
            ))}
          </div>
        )}
      </main>

      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => {
          reload();
          nav({ to: "/projects/$projectId", params: { projectId: id } });
        }}
      />

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onLockAndSwitch={() => { setShowSettings(false); lock(); }}
        />
      )}

      {deleteProject && (
        <DeleteProjectModal
          project={deleteProject}
          onClose={() => setDeleteProject(null)}
          onDeleted={() => { setDeleteProject(null); reload(); }}
        />
      )}

      {editProject && (
        <EditProjectModal
          project={editProject}
          onClose={() => setEditProject(null)}
          onSaved={() => { setEditProject(null); reload(); }}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  delay,
  stat,
  onDelete,
  onEdit,
}: {
  project: Project;
  delay: number;
  stat?: { total: number; available: number };
  onDelete: () => void;
  onEdit: () => void;
}) {
  const total = stat?.total ?? 0;
  const available = stat?.available ?? 0;

  async function onDownload(e: React.MouseEvent, fmt: "pdf" | "excel") {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (fmt === "pdf") await exportProjectPDF(project.id);
      else await exportProjectExcel(project.id);
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -4 }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-elegant)]"
    >
      <Link to="/projects/$projectId" params={{ projectId: project.id }} className="block">
        <div className="flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-sm">
            <MapPin className="h-5 w-5" />
          </div>
          <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
            {total} plots
          </span>
        </div>
        <h3 className="mt-4 line-clamp-1 font-display text-lg font-semibold">{project.name}</h3>
        {project.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Hash className="h-3 w-3" />
            LP {project.lp_number}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {fmtDate(project.created_at)}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat label="Total" value={total} />
          <Stat label="Available" value={available} accent />
        </div>
      </Link>
      <div className="mt-4 flex gap-2">
        <button
          onClick={(e) => onDownload(e, "pdf")}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" /> PDF
        </button>
        <button
          onClick={(e) => onDownload(e, "excel")}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" /> Excel
        </button>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }}
          className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          title="Edit project"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          className="inline-flex items-center justify-center rounded-lg border border-destructive/30 bg-card px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          title="Delete project"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg border border-border ${accent ? "bg-accent/40" : "bg-muted/50"} px-3 py-2`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-lg font-bold">{value}</div>
    </div>
  );
}

function SettingsModal({
  onClose,
  onLockAndSwitch,
}: {
  onClose: () => void;
  onLockAndSwitch: () => void;
}) {
  const [tab, setTab] = useState<"password" | "decoy">("password");
  const [mode, setMode] = useState<string | null>(null);

  // Change main password
  const [mainCurrent, setMainCurrent] = useState("");
  const [mainNew, setMainNew] = useState("");
  const [mainConfirm, setMainConfirm] = useState("");
  const [mainBusy, setMainBusy] = useState(false);
  const [showMainPins, setShowMainPins] = useState(false);

  // Change duress password
  const [duressCurrent, setDuressCurrent] = useState("");
  const [duressNew, setDuressNew] = useState("");
  const [duressConfirm, setDuressConfirm] = useState("");
  const [duressBusy, setDuressBusy] = useState(false);
  const [showDuressPins, setShowDuressPins] = useState(false);

  useEffect(() => {
    db.getMode().then(setMode);
  }, []);

  async function handleChangePin(target: "main" | "duress") {
    const current = target === "main" ? mainCurrent : duressCurrent;
    const newPin = target === "main" ? mainNew : duressNew;
    const confirm = target === "main" ? mainConfirm : duressConfirm;
    const setBusy = target === "main" ? setMainBusy : setDuressBusy;

    if (newPin !== confirm) { toast.error("New PINs don't match"); return; }
    if (newPin.length < 4) { toast.error("PIN must be at least 4 digits"); return; }

    setBusy(true);
    const result = await db.changePins({ currentPin: current, newPin, target });
    setBusy(false);

    if (result.ok) {
      toast.success(`${target === "main" ? "Main" : "Duress"} PIN updated`);
      if (target === "main") { setMainCurrent(""); setMainNew(""); setMainConfirm(""); }
      else { setDuressCurrent(""); setDuressNew(""); setDuressConfirm(""); }
    } else {
      toast.error(result.error || "Failed to change PIN");
    }
  }

  const isDecoyMode = mode === "decoy";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-bold">Settings</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs — only show in main mode */}
        {!isDecoyMode && (
          <div className="flex rounded-lg border border-border mb-5">
            <button
              onClick={() => setTab("password")}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-l-lg transition ${
                tab === "password" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              Change Password
            </button>
            <button
              onClick={() => setTab("decoy")}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-r-lg transition ${
                tab === "decoy" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              Decoy Account
            </button>
          </div>
        )}

        {/* Decoy mode: single simple change password form */}
        {isDecoyMode && (
          <form onSubmit={(e) => { e.preventDefault(); handleChangePin("duress"); }} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Current password</span>
              <div className="relative">
                <input
                  type={showDuressPins ? "text" : "password"}
                  value={duressCurrent}
                  onChange={(e) => setDuressCurrent(e.target.value)}
                  required
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 pr-10 text-sm"
                />
                <button type="button" onClick={() => setShowDuressPins(!showDuressPins)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showDuressPins ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">New password</span>
                <input type={showDuressPins ? "text" : "password"} value={duressNew} onChange={(e) => setDuressNew(e.target.value)} required className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Confirm password</span>
                <input type={showDuressPins ? "text" : "password"} value={duressConfirm} onChange={(e) => setDuressConfirm(e.target.value)} required className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
              </label>
            </div>
            <button disabled={duressBusy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {duressBusy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
            </button>
          </form>
        )}

        {/* Main mode: password tab with both sections */}
        {!isDecoyMode && tab === "password" && (
          <div className="space-y-6">
            {/* Main Password Section */}
            <form onSubmit={(e) => { e.preventDefault(); handleChangePin("main"); }} className="rounded-xl border border-border p-4 space-y-3">
              <h4 className="text-sm font-semibold">Change Main Password</h4>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Current main PIN</span>
                <div className="relative">
                  <input
                    type={showMainPins ? "text" : "password"}
                    value={mainCurrent}
                    onChange={(e) => setMainCurrent(e.target.value)}
                    required
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 pr-10 text-sm"
                  />
                  <button type="button" onClick={() => setShowMainPins(!showMainPins)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showMainPins ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">New PIN</span>
                  <input type={showMainPins ? "text" : "password"} value={mainNew} onChange={(e) => setMainNew(e.target.value)} required className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Confirm PIN</span>
                  <input type={showMainPins ? "text" : "password"} value={mainConfirm} onChange={(e) => setMainConfirm(e.target.value)} required className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                </label>
              </div>
              <button disabled={mainBusy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {mainBusy && <Loader2 className="h-4 w-4 animate-spin" />} Update main PIN
              </button>
            </form>

            {/* Duress Password Section */}
            <form onSubmit={(e) => { e.preventDefault(); handleChangePin("duress"); }} className="rounded-xl border border-border p-4 space-y-3">
              <h4 className="text-sm font-semibold">Change Duress Password</h4>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Current duress PIN</span>
                <div className="relative">
                  <input
                    type={showDuressPins ? "text" : "password"}
                    value={duressCurrent}
                    onChange={(e) => setDuressCurrent(e.target.value)}
                    required
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 pr-10 text-sm"
                  />
                  <button type="button" onClick={() => setShowDuressPins(!showDuressPins)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showDuressPins ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">New PIN</span>
                  <input type={showDuressPins ? "text" : "password"} value={duressNew} onChange={(e) => setDuressNew(e.target.value)} required className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Confirm PIN</span>
                  <input type={showDuressPins ? "text" : "password"} value={duressConfirm} onChange={(e) => setDuressConfirm(e.target.value)} required className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
                </label>
              </div>
              <button disabled={duressBusy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {duressBusy && <Loader2 className="h-4 w-4 animate-spin" />} Update duress PIN
              </button>
            </form>
          </div>
        )}

        {/* Main mode: decoy tab */}
        {!isDecoyMode && tab === "decoy" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">Current mode</h4>
                <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-800">
                  Main
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                You are currently in your main account. To edit the decoy account, lock the app and log in with the duress PIN.
              </p>
              <button
                onClick={onLockAndSwitch}
                className="w-full rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Lock and switch to decoy PIN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeleteProjectModal({
  project,
  onClose,
  onDeleted,
}: {
  project: Project;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirmed) return;
    setBusy(true);
    try {
      await db.projects.delete(project.id);
      toast.success("Project deleted");
      onDeleted();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete project");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl font-bold text-destructive">Delete project</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 mb-4">
          <p className="text-sm font-medium text-destructive">Warning: This action cannot be undone.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Deleting <span className="font-semibold text-foreground">"{project.name}"</span> will permanently remove all its plots, payments, maps, pins, files and customer associations.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-destructive"
          />
          <span className="text-sm text-muted-foreground">
            I understand that this will permanently delete <span className="font-semibold text-foreground">{project.name}</span> and all associated data.
          </span>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete project
          </button>
        </div>
      </div>
    </div>
  );
}

function EditProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [lp, setLp] = useState(project.lp_number);
  const [desc, setDesc] = useState(project.description ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !lp.trim()) {
      toast.error("Name and LP number are required");
      return;
    }
    setBusy(true);
    try {
      await db.projects.update({
        id: project.id,
        name: name.trim(),
        lp_number: lp.trim(),
        description: desc.trim() || undefined,
      });
      toast.success("Project updated");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-bold">Edit project</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Project name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">LP number</span>
            <input
              value={lp}
              onChange={(e) => setLp(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Description (optional)</span>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ onCreate, hasQuery }: { onCreate: () => void; hasQuery: boolean }) {
  return (
    <div className="mt-16 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <MapPinned className="h-6 w-6" />
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold">
        {hasQuery ? "No projects match" : "No projects yet"}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasQuery ? "Try a different search term." : "Create your first land layout project to get started."}
      </p>
      {!hasQuery && (
        <button
          onClick={onCreate}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Create project
        </button>
      )}
    </div>
  );
}
