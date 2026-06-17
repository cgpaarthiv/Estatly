import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { db, type PlotFile, type PlotPin, type Landmark, type ProjectMap } from "@/lib/db";
import type { Plot, Customer } from "@/lib/data";
import { fmtMoney, fmtDate } from "@/lib/data";
import {
  LayoutGrid, CheckCircle2, Stamp, Wallet, Loader2, Plus, X,
  Upload, FileText, Eye, EyeOff, Trash2, Map, Grid3X3, ImagePlus, Crosshair, Trash, MapPin,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId/")({ component: ProjectDashboard });

type ViewMode = "grid" | "map";

function ProjectDashboard() {
  const { projectId } = Route.useParams();
  const [plots, setPlots] = useState<Plot[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Plot | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showStats, setShowStats] = useState(() => {
    const saved = localStorage.getItem("dashboard_show_stats");
    return saved !== "false";
  });

  // Multi-map state
  const [maps, setMaps] = useState<ProjectMap[]>([]);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [pins, setPins] = useState<PlotPin[]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [mappingMode, setMappingMode] = useState(false);
  const [mappingPlotId, setMappingPlotId] = useState("");

  async function reload() {
    const [pl, cu] = await Promise.all([
      db.plots.list(projectId),
      db.customers.list(),
    ]);
    setPlots(pl);
    setCustomers(cu);
    setLoading(false);
  }

  async function loadMaps() {
    const mapList = await db.maps.list(projectId);
    setMaps(mapList);
    if (mapList.length > 0) {
      const targetId = activeMapId && mapList.find((m) => m.id === activeMapId)
        ? activeMapId
        : mapList[0].id;
      setActiveMapId(targetId);
      await loadMapData(targetId);
    } else {
      setActiveMapId(null);
      setMapImage(null);
      setPins([]);
      setLandmarks([]);
    }
  }

  async function loadMapData(mapId: string) {
    const [img, pinData, lmData] = await Promise.all([
      db.maps.getImage(mapId),
      db.pins.list({ projectId, mapId }),
      db.landmarks.list({ projectId, mapId }),
    ]);
    setMapImage(img);
    setPins(pinData);
    setLandmarks(lmData);
  }

  async function switchMap(mapId: string) {
    setActiveMapId(mapId);
    setMappingMode(false);
    setMappingPlotId("");
    await loadMapData(mapId);
  }

  useEffect(() => {
    reload();
    loadMaps();
  }, [projectId]);

  const total = plots.length;
  const advance = plots.filter((p) => p.status === "advance").length;
  const registered = plots.filter((p) => p.status === "registered").length;
  const available = plots.filter((p) => p.status === "available").length;

  async function handleAddMap() {
    const label = maps.length === 0 ? "Map" : `Map ${maps.length + 1}`;
    const result = await db.maps.add({ projectId, label });
    if (result) {
      toast.success("Map added");
      await loadMaps();
      setActiveMapId(result.id);
      await loadMapData(result.id);
    }
  }

  async function handleRemoveMap(mapId: string) {
    await db.maps.remove(mapId);
    toast.success("Map removed");
    await loadMaps();
    if (maps.length <= 1) setViewMode("grid");
  }

  async function handleChangeImage(mapId: string) {
    const ok = await db.maps.changeImage(mapId);
    if (ok) {
      toast.success("Image updated");
      await loadMapData(mapId);
    }
  }

  async function handleRenameMap(mapId: string, label: string) {
    await db.maps.rename({ mapId, label });
    setMaps((prev) => prev.map((m) => m.id === mapId ? { ...m, label } : m));
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Project dashboard</h1>
          <p className="text-sm text-muted-foreground">Visual plot status overview.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats((prev) => {
              localStorage.setItem("dashboard_show_stats", String(!prev));
              return !prev;
            })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            {showStats ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            View
          </button>
          <AddPlotButton
            projectId={projectId}
            onAdded={reload}
            nextNumber={String(total + 1).padStart(3, "0")}
          />
        </div>
      </div>

      {showStats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={LayoutGrid} label="Total plots" value={total} tone="default" />
          <StatCard icon={Wallet} label="Available" value={available} tone="success" />
          <StatCard icon={CheckCircle2} label="Advance" value={advance} tone="warning" />
          <StatCard icon={Stamp} label="Registered" value={registered} tone="danger" />
        </div>
      )}

      {/* View toggle */}
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border">
              <button
                onClick={() => setViewMode("grid")}
                className={`inline-flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <Grid3X3 className="h-3.5 w-3.5" /> Grid
              </button>
              <button
                onClick={() => setViewMode("map")}
                className={`inline-flex items-center gap-1.5 rounded-r-lg px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "map" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <Map className="h-3.5 w-3.5" /> Map
              </button>
            </div>
          </div>
          <Legend />
        </div>

        {viewMode === "grid" ? (
          /* ── GRID VIEW ── */
          loading ? (
            <div className="py-12 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            </div>
          ) : plots.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No plots yet — add your first plot.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10">
              {plots.map((p, i) => {
                const hasDetails = p.plot_type || p.size_sqft || (p.length && p.width);
                return (
                  <motion.button
                    key={p.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(i * 0.01, 0.4) }}
                    whileHover={{ scale: 1.04 }}
                    onClick={() => setSelected(p)}
                    className={`flex flex-col items-center justify-center rounded-xl px-1.5 shadow-sm transition ${hasDetails ? "py-2.5" : "py-4"} ${plotClass(p.status)}`}
                    title={`Plot ${p.plot_number} — ${p.status}`}
                  >
                    {p.plot_type && (
                      <span className="text-[9px] font-medium opacity-70 capitalize">{p.plot_type}</span>
                    )}
                    <span className="text-sm font-bold">{p.plot_number}</span>
                    {p.size_sqft && (
                      <span className="text-[9px] opacity-70">{p.size_sqft} sqyd</span>
                    )}
                    {p.length && p.width && (
                      <span className="text-[9px] opacity-60">{p.length} × {p.width}</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )
        ) : (
          /* ── MAP VIEW ── */
          <MapView
            projectId={projectId}
            plots={plots}
            maps={maps}
            activeMapId={activeMapId}
            pins={pins}
            landmarks={landmarks}
            mapImage={mapImage}
            mappingMode={mappingMode}
            mappingPlotId={mappingPlotId}
            setMappingMode={setMappingMode}
            setMappingPlotId={setMappingPlotId}
            onAddMap={handleAddMap}
            onRemoveMap={handleRemoveMap}
            onChangeImage={handleChangeImage}
            onRenameMap={handleRenameMap}
            onSwitchMap={switchMap}
            onSelectPlot={setSelected}
            onPinsChanged={() => activeMapId ? loadMapData(activeMapId) : loadMaps()}
          />
        )}
      </div>

      {selected && (
        <PlotModal
          plot={selected}
          plots={plots}
          customers={customers}
          onClose={() => {
            setSelected(null);
            reload();
            if (activeMapId) loadMapData(activeMapId);
          }}
          onRefresh={async () => {
            const [pl, cu] = await Promise.all([
              db.plots.list(projectId),
              db.customers.list(),
            ]);
            setPlots(pl);
            setCustomers(cu);
            const fresh = pl.find((p) => p.id === selected.id);
            if (fresh) setSelected(fresh);
            if (activeMapId) loadMapData(activeMapId);
          }}
        />
      )}
    </div>
  );
}

/* ── MAP VIEW COMPONENT ── */

type PlacingMode = "none" | "plot" | "custom";

const CUSTOM_COLORS = [
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#6b7280", label: "Gray" },
  { value: "#000000", label: "Black" },
  { value: "#ffffff", label: "White" },
];

function MapView({
  projectId,
  plots,
  maps,
  activeMapId,
  pins,
  landmarks,
  mapImage,
  mappingMode,
  mappingPlotId,
  setMappingMode,
  setMappingPlotId,
  onAddMap,
  onRemoveMap,
  onChangeImage,
  onRenameMap,
  onSwitchMap,
  onSelectPlot,
  onPinsChanged,
}: {
  projectId: string;
  plots: Plot[];
  maps: ProjectMap[];
  activeMapId: string | null;
  pins: PlotPin[];
  landmarks: Landmark[];
  mapImage: string | null;
  mappingMode: boolean;
  mappingPlotId: string;
  setMappingMode: (v: boolean) => void;
  setMappingPlotId: (v: string) => void;
  onAddMap: () => void;
  onRemoveMap: (mapId: string) => void;
  onChangeImage: (mapId: string) => void;
  onRenameMap: (mapId: string, label: string) => void;
  onSwitchMap: (mapId: string) => void;
  onSelectPlot: (p: Plot) => void;
  onPinsChanged: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ id: string; type: "plot" | "landmark"; startX: number; startY: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; xPct: number; yPct: number } | null>(null);
  const didDragRef = useRef(false);

  // Custom pin state
  const [placingMode, setPlacingMode] = useState<PlacingMode>("none");
  const [customLabel, setCustomLabel] = useState("");
  const [customColor, setCustomColor] = useState("#3b82f6");
  const [editingLandmark, setEditingLandmark] = useState<Landmark | null>(null);

  // Confirm remove dialog
  const [confirmRemoveMapId, setConfirmRemoveMapId] = useState<string | null>(null);
  // Rename state
  const [renamingMapId, setRenamingMapId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");

  const pinnedPlotIds = new Set(pins.map((p) => p.plot_id));
  const unmappedPlots = plots.filter((p) => !pinnedPlotIds.has(p.id));

  function getPct(e: React.MouseEvent | MouseEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      xPct: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      yPct: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  const handleImageClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (didDragRef.current) { didDragRef.current = false; return; }
      if (!mappingMode) return;

      const { xPct, yPct } = getPct(e);

      if (placingMode === "plot" && mappingPlotId) {
        await db.pins.save({ projectId, plotId: mappingPlotId, xPct, yPct, mapId: activeMapId || undefined });
        setMappingPlotId("");
        onPinsChanged();
      } else if (placingMode === "custom" && customLabel.trim()) {
        await db.landmarks.create({
          projectId,
          label: customLabel.trim(),
          color: customColor,
          xPct,
          yPct,
          mapId: activeMapId || undefined,
        });
        setCustomLabel("");
        onPinsChanged();
      }
    },
    [mappingMode, placingMode, mappingPlotId, customLabel, customColor, projectId, activeMapId],
  );

  // Drag handlers for both plot pins and landmarks
  function handleDragStart(e: React.MouseEvent, id: string, type: "plot" | "landmark") {
    if (!mappingMode) return;
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = { id, type, startX: e.clientX, startY: e.clientY };
    didDragRef.current = false;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const dx = Math.abs(ev.clientX - draggingRef.current.startX);
      const dy = Math.abs(ev.clientY - draggingRef.current.startY);
      if (dx > 3 || dy > 3) didDragRef.current = true;
      const { xPct, yPct } = getPct(ev);
      setDragPos({ id: draggingRef.current.id, xPct, yPct });
    };

    const onUp = async (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!draggingRef.current) return;
      if (didDragRef.current) {
        const { xPct, yPct } = getPct(ev);
        const d = draggingRef.current;
        if (d.type === "plot") {
          await db.pins.save({ projectId, plotId: d.id, xPct, yPct, mapId: activeMapId || undefined });
        } else {
          const lm = landmarks.find((l) => l.id === d.id);
          if (lm) await db.landmarks.update({ id: d.id, label: lm.label, color: lm.color, xPct, yPct });
        }
        onPinsChanged();
      }
      draggingRef.current = null;
      setDragPos(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function removePin(plotId: string) {
    await db.pins.delete({ projectId, plotId, mapId: activeMapId || undefined });
    onPinsChanged();
  }

  async function removeLandmark(id: string) {
    await db.landmarks.delete(id);
    onPinsChanged();
  }

  async function saveEditLandmark() {
    if (!editingLandmark) return;
    await db.landmarks.update({
      id: editingLandmark.id,
      label: editingLandmark.label,
      color: editingLandmark.color,
      xPct: editingLandmark.x_pct,
      yPct: editingLandmark.y_pct,
    });
    setEditingLandmark(null);
    onPinsChanged();
  }

  if (maps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ImagePlus className="h-12 w-12 text-muted-foreground/40" />
        <p className="mt-4 text-sm text-muted-foreground">
          Upload your site layout image to get started
        </p>
        <button
          onClick={onAddMap}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Upload className="h-4 w-4" /> Upload site plan
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Map tabs */}
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-1 flex-1 flex-wrap">
          {maps.map((m) => (
            <div key={m.id} className="flex items-center">
              {renamingMapId === m.id ? (
                <input
                  autoFocus
                  value={renameLabel}
                  onChange={(e) => setRenameLabel(e.target.value)}
                  onBlur={() => { if (renameLabel.trim()) onRenameMap(m.id, renameLabel.trim()); setRenamingMapId(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { if (renameLabel.trim()) onRenameMap(m.id, renameLabel.trim()); setRenamingMapId(null); } if (e.key === "Escape") setRenamingMapId(null); }}
                  className="rounded-lg border border-primary bg-card px-3 py-1.5 text-xs font-medium w-28"
                />
              ) : (
                <button
                  onClick={() => m.id !== activeMapId ? onSwitchMap(m.id) : undefined}
                  onDoubleClick={() => { setRenamingMapId(m.id); setRenameLabel(m.label); }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    m.id === activeMapId ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"
                  }`}
                  title="Double-click to rename"
                >
                  {m.label}
                </button>
              )}
            </div>
          ))}
          <button
            onClick={onAddMap}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Add map
          </button>
        </div>
      </div>

      {/* Map toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!mappingMode ? (
          <>
            <button
              onClick={() => { setMappingMode(true); setPlacingMode("plot"); setMappingPlotId(""); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Crosshair className="h-3.5 w-3.5" /> Place pins
            </button>
            {activeMapId && (
              <button
                onClick={() => onChangeImage(activeMapId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <ImagePlus className="h-3.5 w-3.5" /> Change image
              </button>
            )}
            {activeMapId && (
              <button
                onClick={() => setConfirmRemoveMapId(activeMapId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash className="h-3.5 w-3.5" /> Remove map
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {pins.length} / {plots.length} plots pinned · {landmarks.length} custom pin{landmarks.length !== 1 ? "s" : ""}
            </span>
          </>
        ) : (
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
                <Crosshair className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-amber-800">Mapping mode</span>
              </div>

              {/* Toggle between plot pins and custom pins */}
              <div className="flex rounded-lg border border-border">
                <button
                  onClick={() => { setPlacingMode("plot"); setCustomLabel(""); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-l-lg transition ${
                    placingMode === "plot" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  Plot pins
                </button>
                <button
                  onClick={() => { setPlacingMode("custom"); setMappingPlotId(""); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-r-lg transition ${
                    placingMode === "custom" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  Custom pins
                </button>
              </div>

              <button
                onClick={() => { setMappingMode(false); setMappingPlotId(""); setPlacingMode("none"); setCustomLabel(""); didDragRef.current = false; }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Done
              </button>
            </div>

            {/* Plot pin controls */}
            {placingMode === "plot" && (
              <div className="flex items-center gap-2">
                <select
                  value={mappingPlotId}
                  onChange={(e) => setMappingPlotId(e.target.value)}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs"
                >
                  <option value="">Select a plot to place...</option>
                  {unmappedPlots.map((p) => (
                    <option key={p.id} value={p.id}>Plot {p.plot_number}</option>
                  ))}
                  {plots.filter((p) => pinnedPlotIds.has(p.id)).map((p) => (
                    <option key={p.id} value={p.id}>Plot {p.plot_number} (reposition)</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {mappingPlotId ? "Click on the image to drop the pin" : "Select a plot, then click on the image. Drag pins to move."}
                </span>
              </div>
            )}

            {/* Custom pin controls */}
            {placingMode === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Pin label (e.g. Park, Road, Entrance)"
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs w-52"
                />
                <div className="flex items-center gap-1">
                  {CUSTOM_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setCustomColor(c.value)}
                      className={`h-5 w-5 rounded-full border-2 transition ${
                        customColor === c.value ? "border-foreground scale-110" : "border-transparent hover:scale-110"
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {customLabel.trim() ? "Click on the image to place" : "Type a label first"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Map image with pins */}
      <div
        ref={containerRef}
        className={`relative overflow-hidden rounded-xl border border-border ${
          mappingMode && ((placingMode === "plot" && mappingPlotId) || (placingMode === "custom" && customLabel.trim()))
            ? "cursor-crosshair" : ""
        }`}
        onClick={handleImageClick}
      >
        <img
          src={mapImage || undefined}
          alt="Site layout"
          className="w-full select-none"
          draggable={false}
        />

        {/* Plot pins */}
        {pins.map((pin) => {
          const plot = plots.find((p) => p.id === pin.plot_id);
          if (!plot) return null;
          const isDragging = dragPos?.id === pin.plot_id;
          const x = isDragging ? dragPos.xPct : pin.x_pct;
          const y = isDragging ? dragPos.yPct : pin.y_pct;
          return (
            <div
              key={pin.id}
              className={`absolute group ${mappingMode ? "cursor-grab active:cursor-grabbing" : ""}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
                zIndex: isDragging ? 50 : 1,
              }}
              onMouseDown={(e) => handleDragStart(e, pin.plot_id, "plot")}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (mappingMode || didDragRef.current) return;
                  onSelectPlot(plot);
                }}
                className={`flex h-7 min-w-[28px] items-center justify-center rounded-full border-2 border-white text-[10px] font-bold shadow-lg transition ${
                  isDragging ? "scale-125 ring-2 ring-primary" : "hover:scale-110"
                } ${pinColor(plot.status)}`}
                title={`Plot ${plot.plot_number} — ${plot.status}`}
              >
                {plot.plot_number}
              </button>
              {mappingMode && !isDragging && (
                <button
                  onClick={(e) => { e.stopPropagation(); removePin(pin.plot_id); }}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white text-[8px] shadow hover:scale-110"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Custom landmark pins */}
        {landmarks.map((lm) => {
          const isDragging = dragPos?.id === lm.id;
          const x = isDragging ? dragPos.xPct : lm.x_pct;
          const y = isDragging ? dragPos.yPct : lm.y_pct;
          const isLight = lm.color === "#ffffff" || lm.color === "#eab308";
          return (
            <div
              key={lm.id}
              className={`absolute group ${mappingMode ? "cursor-grab active:cursor-grabbing" : ""}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
                zIndex: isDragging ? 50 : 2,
              }}
              onMouseDown={(e) => handleDragStart(e, lm.id, "landmark")}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (didDragRef.current) return;
                  if (mappingMode) setEditingLandmark({ ...lm });
                }}
                className={`flex items-center gap-1 rounded-full border-2 border-white px-2 py-0.5 text-[10px] font-bold shadow-lg transition ${
                  isDragging ? "scale-110 ring-2 ring-primary" : "hover:scale-105"
                }`}
                style={{
                  backgroundColor: lm.color,
                  color: isLight ? "#000" : "#fff",
                  cursor: mappingMode ? "grab" : "default",
                }}
                title={lm.label}
              >
                {lm.label}
              </div>
              {mappingMode && !isDragging && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeLandmark(lm.id); }}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white text-[8px] shadow hover:scale-110"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit landmark modal */}
      {editingLandmark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingLandmark(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">Edit pin</h3>
              <button onClick={() => setEditingLandmark(null)}><X className="h-4 w-4" /></button>
            </div>
            <label className="block mb-3">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Label</span>
              <input
                value={editingLandmark.label}
                onChange={(e) => setEditingLandmark({ ...editingLandmark, label: e.target.value })}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
              />
            </label>
            <div className="mb-4">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Color</span>
              <div className="flex items-center gap-1.5 mt-1">
                {CUSTOM_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setEditingLandmark({ ...editingLandmark, color: c.value })}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      editingLandmark.color === c.value ? "border-foreground scale-110" : "border-transparent hover:scale-110"
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={saveEditLandmark}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Confirm remove map dialog */}
      {confirmRemoveMapId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmRemoveMapId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold">Remove map?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete this map image along with all its pins and landmarks. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemoveMapId(null)}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => { onRemoveMap(confirmRemoveMapId); setConfirmRemoveMapId(null); }}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pinColor(status: Plot["status"]) {
  if (status === "available") return "bg-emerald-500 text-white";
  if (status === "advance") return "bg-amber-500 text-white";
  if (status === "sale_agreement") return "bg-blue-500 text-white";
  return "bg-red-500 text-white";
}

function plotClass(s: Plot["status"]) {
  if (s === "available") return "bg-success/15 text-success border border-success/40 hover:bg-success/25";
  if (s === "advance") return "bg-warning/20 text-warning-foreground border border-warning/50 hover:bg-warning/30";
  if (s === "sale_agreement") return "bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200";
  return "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25";
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Dot className="bg-success" label="Available" />
      <Dot className="bg-warning" label="Advance" />
      <Dot className="bg-blue-500" label="Sale Agreement" />
      <Dot className="bg-danger" label="Registered" />
    </div>
  );
}

function Dot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone: "default" | "success" | "danger" | "warning";
}) {
  const map = {
    default: "bg-accent text-accent-foreground",
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
    warning: "bg-warning/20 text-warning-foreground",
  } as const;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${map[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold">{value}</div>
    </motion.div>
  );
}

function AddPlotButton({
  projectId,
  nextNumber,
  onAdded,
}: {
  projectId: string;
  nextNumber: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState(nextNumber);
  const [facing, setFacing] = useState("");
  const [size, setSize] = useState("");
  const [plotLength, setPlotLength] = useState("");
  const [plotWidth, setPlotWidth] = useState("");
  useEffect(() => setNum(nextNumber), [nextNumber]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await db.plots.create({
        project_id: projectId,
        plot_number: num,
        plot_type: facing || undefined,
        size_sqft: size ? Number(size) : undefined,
        length: plotLength ? Number(plotLength) : undefined,
        width: plotWidth ? Number(plotWidth) : undefined,
      });
      toast.success("Plot added");
      setOpen(false);
      setFacing("");
      setSize("");
      setPlotLength("");
      setPlotWidth("");
      onAdded();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> Add plot
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form onSubmit={add} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Add plot</h3>
              <button type="button" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Input label="Plot No.(Site No.)" value={num} onChange={setNum} required />
              <Input label="Facing" value={facing} onChange={setFacing} placeholder="East / West / North / South" />
              <Input label="Size(sqyd)" value={size} onChange={setSize} type="text" inputMode="decimal" />
              <Input label="Length" value={plotLength} onChange={setPlotLength} type="text" inputMode="decimal" />
              <Input label="Width" value={plotWidth} onChange={setPlotWidth} type="text" inputMode="decimal" />
            </div>
            <button className="mt-5 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              Add
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Input({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function PlotModal({
  plot,
  plots,
  customers,
  onClose,
  onRefresh,
}: {
  plot: Plot;
  plots: Plot[];
  customers: Customer[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [plotNumber, setPlotNumber] = useState(plot.plot_number);
  const [status, setStatus] = useState(plot.status);
  const [customerId, setCustomerId] = useState(plot.customer_id ?? "");
  const [type, setType] = useState(plot.plot_type ?? "");
  const [size, setSize] = useState(String(plot.size_sqft ?? ""));
  const [plotLength, setPlotLength] = useState(String(plot.length ?? ""));
  const [plotWidth, setPlotWidth] = useState(String(plot.width ?? ""));
  const [price, setPrice] = useState(String(plot.price ?? ""));
  const [govtPrice, setGovtPrice] = useState(String(plot.govt_price ?? ""));
  const [documentNumber, setDocumentNumber] = useState(plot.document_number ?? "");
  const [registrationDate, setRegistrationDate] = useState(plot.registration_date ?? "");
  const [buyerName, setBuyerName] = useState(plot.buyer_name ?? "");
  const [buyerPhone, setBuyerPhone] = useState(plot.buyer_phone ?? "");
  const [description, setDescription] = useState(plot.description ?? "");
  const [bookingDate, setBookingDate] = useState(plot.booking_date ?? "");
  const [advanceDate, setAdvanceDate] = useState(plot.advance_date ?? "");
  const [saleAgreementDate, setSaleAgreementDate] = useState(plot.sale_agreement_date ?? "");
  const [plotNotes, setPlotNotes] = useState(plot.notes ?? "");
  const [payType, setPayType] = useState<"white" | "black" | "advance">("white");
  const [payMethod, setPayMethod] = useState<"cash" | "bank">("bank");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<string | null>(null);
  const [payments, setPayments] = useState<
    { id: string; amount_white_bank: number; amount_white_cash: number; amount_black_cash: number; amount_advance_cash: number; amount_advance_bank: number; payment_date: string }[]
  >([]);
  const [plotFiles, setPlotFiles] = useState<PlotFile[]>([]);

  useEffect(() => {
    db.payments.listByPlot(plot.id).then(setPayments);
    db.plotFiles.list(plot.id).then(setPlotFiles);
  }, [plot.id]);

  async function handlePickFiles() {
    const saved = await db.plotFiles.pickAndSave(plot.id);
    if (saved.length) {
      toast.success(`${saved.length} file(s) added`);
      setPlotFiles((prev) => [...saved, ...prev]);
    }
  }

  async function handleDeleteFile(file: PlotFile) {
    await db.plotFiles.delete(file);
    setPlotFiles((prev) => prev.filter((f) => f.id !== file.id));
    toast.success("File removed");
  }

  const sizeVal = Number(size || 0);
  const totalPrice = Number(price || 0) * sizeVal;
  const govtTotal = Number(govtPrice || 0) * sizeVal;
  const totalWhiteBank = payments.reduce((s, p) => s + Number(p.amount_white_bank), 0);
  const totalWhiteCash = payments.reduce((s, p) => s + Number(p.amount_white_cash), 0);
  const totalBlackCash = payments.reduce((s, p) => s + Number(p.amount_black_cash), 0);
  const totalAdvanceCash = payments.reduce((s, p) => s + Number(p.amount_advance_cash), 0);
  const totalAdvanceBank = payments.reduce((s, p) => s + Number(p.amount_advance_bank), 0);
  const totalPaid = totalWhiteBank + totalWhiteCash + totalBlackCash + totalAdvanceCash + totalAdvanceBank;
  const balance = totalPrice - totalPaid;

  async function addPayment() {
    const amt = Number(payAmount || 0);
    if (amt <= 0) {
      toast.error("Enter an amount");
      return;
    }
    const payload = {
      plot_id: plot.id,
      customer_id: customerId || null,
      amount_white_bank: 0,
      amount_white_cash: 0,
      amount_black_cash: 0,
      amount_advance_cash: 0,
      amount_advance_bank: 0,
      payment_date: payDate || undefined,
    };
    if (payType === "white" && payMethod === "bank") payload.amount_white_bank = amt;
    else if (payType === "white" && payMethod === "cash") payload.amount_white_cash = amt;
    else if (payType === "black") payload.amount_black_cash = amt;
    else if (payType === "advance" && payMethod === "bank") payload.amount_advance_bank = amt;
    else if (payType === "advance" && payMethod === "cash") payload.amount_advance_cash = amt;
    setBusy(true);
    try {
      await db.payments.create(payload);
      setPayAmount("");
      setPayDate(new Date().toISOString().slice(0, 10));
      const updatedPayments = await db.payments.listByPlot(plot.id);
      setPayments(updatedPayments);
      toast.success("Payment added");
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (plotNumber !== plot.plot_number) {
      const duplicate = plots.find((p) => p.id !== plot.id && p.plot_number === plotNumber);
      if (duplicate) {
        toast.error(`Plot number "${plotNumber}" is already in use.`);
        return;
      }
    }
    setBusy(true);
    try {
      await db.plots.update({
        id: plot.id,
        plot_number: plotNumber,
        status,
        customer_id: customerId || null,
        plot_type: type || null,
        size_sqft: size ? Number(size) : null,
        length: plotLength ? Number(plotLength) : null,
        width: plotWidth ? Number(plotWidth) : null,
        price: price ? Number(price) : 0,
        govt_price: govtPrice ? Number(govtPrice) : 0,
        document_number: documentNumber || null,
        registration_date: registrationDate || null,
        buyer_name: buyerName || null,
        buyer_phone: buyerPhone || null,
        description: description || null,
        booking_date: bookingDate || null,
        advance_date: advanceDate || null,
        sale_agreement_date: saleAgreementDate || null,
        notes: plotNotes || null,
      });
      toast.success("Saved");
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center py-8">
      <motion.form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-2xl rounded-2xl bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-2xl font-bold">Plot {plot.plot_number}</h3>
            <p className="text-sm text-muted-foreground">
              Update status, customer and record payments.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Section title="Plot details">
            <Input label="Plot No.(Site No.)" value={plotNumber} onChange={setPlotNumber} required />
            <Input label="Plot facing" value={type} onChange={setType} placeholder="East / West / North / South" />
            <Input label="Size(sqyd)" value={size} onChange={setSize} type="text" inputMode="decimal" />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Length" value={plotLength} onChange={setPlotLength} type="text" inputMode="decimal" />
              <Input label="Width" value={plotWidth} onChange={setPlotWidth} type="text" inputMode="decimal" />
            </div>
            <Input label="Price per sqyd" value={price} onChange={setPrice} type="text" inputMode="decimal" />
            <Input label="Govt price per sqyd" value={govtPrice} onChange={setGovtPrice} type="text" inputMode="decimal" />
            <Input label="Buyer name" value={buyerName} onChange={setBuyerName} placeholder="Full name" />
            <Input label="Phone number" value={buyerPhone} onChange={setBuyerPhone} placeholder="Phone number" />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Referred by</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Who referred this buyer"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
              >
                <option value="available">Available</option>
                <option value="advance">Advance</option>
                <option value="sale_agreement">Sale Agreement</option>
                <option value="registered">Registered</option>
              </select>
            </label>
            {status === "advance" && (
              <Input label="Advance date" value={advanceDate} onChange={setAdvanceDate} type="date" />
            )}
            {status === "sale_agreement" && (
              <Input label="Sale agreement date" value={saleAgreementDate} onChange={setSaleAgreementDate} type="date" />
            )}
            {(status === "advance" || status === "sale_agreement") && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Notes</span>
                <textarea
                  value={plotNotes}
                  onChange={(e) => setPlotNotes(e.target.value)}
                  rows={2}
                  placeholder="Any notes about this transaction"
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
            )}
            {status === "registered" && (
              <>
                <Input label="Document number" value={documentNumber} onChange={setDocumentNumber} placeholder="Registration document number" />
                <Input label="Registration date" value={registrationDate} onChange={setRegistrationDate} type="date" />
              </>
            )}
          </Section>
          <Section title="Payment summary">
            <Stat2 label="Total price" value={fmtMoney(totalPrice)} />
            <Stat2 label="Govt total price" value={fmtMoney(govtTotal)} />
            <Stat2 label="White (Bank)" value={fmtMoney(totalWhiteBank)} />
            <Stat2 label="White (Cash)" value={fmtMoney(totalWhiteCash)} />
            <Stat2 label="Black (Cash)" value={fmtMoney(totalBlackCash)} />
            <Stat2 label="Advance (Cash)" value={fmtMoney(totalAdvanceCash)} />
            <Stat2 label="Total paid" value={fmtMoney(totalPaid)} accent />
            <Stat2 label="Balance" value={fmtMoney(balance)} tone={balance > 0 ? "danger" : "success"} />
            {payments.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <h5 className="mb-2 text-xs font-semibold text-muted-foreground">Payment history</h5>
                <div className="space-y-1.5">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-md bg-card px-3 py-1.5 text-xs">
                      <span className="text-muted-foreground">{fmtDate(p.payment_date)}</span>
                      <div className="flex items-center gap-2">
                        {Number(p.amount_white_bank) > 0 && (
                          <span className="font-medium text-blue-600">WB: {fmtMoney(Number(p.amount_white_bank))}</span>
                        )}
                        {Number(p.amount_white_cash) > 0 && (
                          <span className="font-medium text-green-600">WC: {fmtMoney(Number(p.amount_white_cash))}</span>
                        )}
                        {Number(p.amount_black_cash) > 0 && (
                          <span className="font-medium text-gray-600">BC: {fmtMoney(Number(p.amount_black_cash))}</span>
                        )}
                        {Number(p.amount_advance_cash) > 0 && (
                          <span className="font-medium text-amber-600">AC: {fmtMoney(Number(p.amount_advance_cash))}</span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setConfirmDeletePaymentId(p.id);
                          }}
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Files</h4>
            <button
              type="button"
              onClick={handlePickFiles}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
          </div>
          {plotFiles.length === 0 ? (
            <p className="text-xs text-muted-foreground">No files attached.</p>
          ) : (
            <div className="space-y-2">
              {plotFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg bg-card px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{f.original_name}</span>
                  <button
                    type="button"
                    onClick={() => db.plotFiles.open(f)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteFile(f)}
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4">
          <h4 className="mb-3 text-sm font-semibold">Add payment</h4>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Payment type</span>
                <select
                  value={payType}
                  onChange={(e) => {
                    const v = e.target.value as "white" | "black" | "advance";
                    setPayType(v);
                    if (v === "white") {
                      setPayMethod("bank");
                    } else {
                      setPayMethod("cash");
                    }
                  }}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  <option value="white">White</option>
                  <option value="black">Black</option>
                  <option value="advance">Advance</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Method</span>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as "cash" | "bank")}
                  disabled={payType === "black" || payType === "advance"}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </label>
            </div>
            <Input label="Amount" value={payAmount} onChange={setPayAmount} type="text" inputMode="decimal" />
            <Input label="Payment date" value={payDate} onChange={setPayDate} type="date" />
          </div>
          <button
            type="button"
            onClick={addPayment}
            disabled={busy}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <Plus className="h-4 w-4" /> Add payment
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete plot
          </button>
          <div className="flex gap-2">
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
        </div>
      </motion.form>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDelete(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-red-600">Delete Plot {plot.plot_number}?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete this plot and all its payments, files, and associated data. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await db.plots.delete(plot.id);
                    toast.success(`Plot ${plot.plot_number} deleted`);
                    setConfirmDelete(false);
                    onClose();
                    onRefresh();
                  } catch (err: any) {
                    toast.error(`Failed to delete: ${err.message}`);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeletePaymentId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeletePaymentId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground">Confirm Delete</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this payment?
              <br />
              This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeletePaymentId(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!confirmDeletePaymentId) return;
                  try {
                    await db.payments.delete(confirmDeletePaymentId);
                    setPayments((prev) => prev.filter((x) => x.id !== confirmDeletePaymentId));
                    toast.success("Payment deleted");
                    setConfirmDeletePaymentId(null);
                  } catch (err: any) {
                    toast.error(err.message || "Failed to delete");
                  }
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Stat2({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "danger" | "success";
}) {
  const cls =
    tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : accent ? "text-primary" : "";
  return (
    <div className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${cls}`}>{value}</span>
    </div>
  );
}
