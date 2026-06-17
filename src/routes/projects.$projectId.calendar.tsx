import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { db, type CalendarEvent } from "@/lib/db";
import { fmtMoney } from "@/lib/data";
import { ChevronLeft, ChevronRight, X, Plus, CheckSquare, Bell, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId/calendar")({
  component: ProjectCalendar,
});

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const EVENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  payment: { bg: "bg-emerald-100", text: "text-emerald-800", dot: "bg-emerald-500" },
  registration: { bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500" },
  booking: { bg: "bg-teal-100", text: "text-teal-800", dot: "bg-teal-600" },
  task: { bg: "bg-violet-100", text: "text-violet-800", dot: "bg-violet-500" },
  reminder: { bg: "bg-rose-100", text: "text-rose-800", dot: "bg-rose-500" },
};

function ProjectCalendar() {
  const { projectId } = Route.useParams();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDate, setAddTaskDate] = useState("");

  function loadEvents() {
    db.calendarEvents(projectId).then(setEvents);
  }

  useEffect(() => {
    loadEvents();
  }, [projectId]);

  function prev() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  }

  function next() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  }

  function goToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  }

  function openAddTask(dateStr?: string) {
    setAddTaskDate(dateStr || new Date().toISOString().slice(0, 10));
    setShowAddTask(true);
  }

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const prevMonthLast = new Date(year, month, 0).getDate();

  const cells: { day: number; currentMonth: boolean; dateStr: string }[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevMonthLast - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    cells.push({ day: d, currentMonth: false, dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, currentMonth: true, dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 1 : month + 2;
      const y = month === 11 ? year + 1 : year;
      cells.push({ day: d, currentMonth: false, dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
    }
  }

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    eventsByDate[ev.date].push(ev);
  }

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  return (
    <div className="p-6 md:p-10">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registrations, payments, tasks and reminders.
          </p>
          <div className="mt-3 flex items-center gap-5 text-xs flex-wrap">
            {Object.entries(EVENT_COLORS).map(([type, colors]) => (
              <span key={type} className="flex items-center gap-1.5 capitalize">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors.dot}`} />
                {type === "followup" ? "Follow-Up" : type === "booking" ? "Booking" : type}
              </span>
            ))}
          </div>
        </div>

        {/* Navigation + Add task */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => openAddTask()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Add task
            </button>
            <button onClick={prev} className="rounded-lg p-2 hover:bg-muted">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setShowMonthPicker(!showMonthPicker)}
              className="min-w-[160px] rounded-lg px-3 py-1.5 text-center font-display text-lg font-semibold hover:bg-muted"
            >
              {MONTHS[month]} {year}
            </button>
            <button onClick={next} className="rounded-lg p-2 hover:bg-muted">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <button
            onClick={goToday}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            Today
          </button>
        </div>
      </div>

      {/* Month/Year picker */}
      {showMonthPicker && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-4 flex items-center justify-center gap-4">
            <button onClick={() => setYear(year - 1)} className="rounded-lg p-1.5 hover:bg-muted">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-display text-lg font-bold">{year}</span>
            <button onClick={() => setYear(year + 1)} className="rounded-lg p-1.5 hover:bg-muted">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MONTHS.map((m, i) => (
              <button
                key={m}
                onClick={() => { setMonth(i); setShowMonthPicker(false); }}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  i === month
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {m.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-muted/50">
          {DAYS.map((d) => (
            <div key={d} className="px-3 py-2.5 text-center text-xs font-semibold tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const dayEvents = eventsByDate[cell.dateStr] || [];
            const today = new Date();
            const isToday =
              cell.currentMonth &&
              cell.day === today.getDate() &&
              month === today.getMonth() &&
              year === today.getFullYear();
            const hasEvents = dayEvents.length > 0;

            return (
              <div
                key={i}
                onClick={() => {
                  if (cell.currentMonth) {
                    if (hasEvents) setSelectedDate(cell.dateStr);
                    else openAddTask(cell.dateStr);
                  }
                }}
                className={`min-h-[110px] border-b border-r border-border p-2 ${
                  cell.currentMonth ? "bg-card" : "bg-muted/30"
                } ${cell.currentMonth ? "cursor-pointer hover:bg-muted/40" : ""}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : cell.currentMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {cell.day}
                </span>
                <div className="mt-1 space-y-1">
                  {dayEvents.slice(0, 3).map((ev, j) => {
                    const colors = EVENT_COLORS[ev.type] || EVENT_COLORS.followup;
                    return (
                      <div
                        key={j}
                        className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight ${colors.bg} ${colors.text} ${
                          ev.detail?.completed ? "line-through opacity-60" : ""
                        }`}
                      >
                        {ev.label}
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="px-1.5 text-[10px] text-muted-foreground">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail popup */}
      {selectedDate && (
        <DayDetailModal
          projectId={projectId}
          dateStr={selectedDate}
          events={selectedEvents}
          onClose={() => setSelectedDate(null)}
          onChanged={loadEvents}
          onAddTask={() => { openAddTask(selectedDate); }}
        />
      )}

      {/* Add task modal */}
      {showAddTask && (
        <AddTaskModal
          projectId={projectId}
          initialDate={addTaskDate}
          onClose={() => setShowAddTask(false)}
          onCreated={() => { setShowAddTask(false); loadEvents(); }}
        />
      )}
    </div>
  );
}

/* ── ADD TASK / REMINDER MODAL ── */

function AddTaskModal({
  projectId,
  initialDate,
  onClose,
  onCreated,
}: {
  projectId: string;
  initialDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("");
  const [type, setType] = useState<"task" | "reminder">("task");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title is required"); return; }
    setBusy(true);
    try {
      await db.tasks.create({
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        date,
        time: time || undefined,
        type,
      });
      toast.success(`${type === "task" ? "Task" : "Reminder"} added`);
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to create");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-bold">Add task / reminder</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Type toggle */}
        <div className="flex rounded-lg border border-border mb-4">
          <button
            type="button"
            onClick={() => setType("task")}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-l-lg transition ${
              type === "task" ? "bg-violet-500 text-white" : "hover:bg-muted"
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" /> Task
          </button>
          <button
            type="button"
            onClick={() => setType("reminder")}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-r-lg transition ${
              type === "reminder" ? "bg-rose-500 text-white" : "hover:bg-muted"
            }`}
          >
            <Bell className="h-3.5 w-3.5" /> Reminder
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "task" ? "e.g. Follow up with buyer" : "e.g. Payment due date"}
              required
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Additional details..."
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Time (optional)</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>
        </div>

        <button
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {type === "task" ? <CheckSquare className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {busy ? "Adding..." : `Add ${type}`}
        </button>
      </form>
    </div>
  );
}

/* ── DAY DETAIL MODAL ── */

function DayDetailModal({
  projectId,
  dateStr,
  events,
  onClose,
  onChanged,
  onAddTask,
}: {
  projectId: string;
  dateStr: string;
  events: CalendarEvent[];
  onClose: () => void;
  onChanged: () => void;
  onAddTask: () => void;
}) {
  const dateLabel = new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Group events by type
  const grouped: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    if (!grouped[ev.type]) grouped[ev.type] = [];
    grouped[ev.type].push(ev);
  }

  const typeLabels: Record<string, string> = {
    payment: "Payments",
    registration: "Registrations",
    booking: "Bookings / Sale Agreements",
    followup: "Follow-Ups",
    task: "Tasks",
    reminder: "Reminders",
  };

  async function toggleTask(taskId: string) {
    await db.tasks.toggle(taskId);
    onChanged();
  }

  async function deleteTask(taskId: string) {
    await db.tasks.delete(taskId);
    toast.success("Deleted");
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl font-bold">Day Summary</h3>
            <p className="text-sm text-muted-foreground">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onAddTask}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {Object.entries(grouped).map(([type, evts]) => {
            const colors = EVENT_COLORS[type] || EVENT_COLORS.followup;
            const isTaskType = type === "task" || type === "reminder";
            return (
              <div key={type}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
                  <h4 className="text-sm font-semibold">{typeLabels[type] || type}</h4>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{evts.length}</span>
                </div>
                <div className="space-y-2">
                  {evts.map((ev, i) => (
                    <div key={i} className={`rounded-xl border border-border p-3 ${colors.bg}/30`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className={`text-sm font-medium ${colors.text} ${ev.detail?.completed ? "line-through opacity-60" : ""}`}>
                          {ev.label}
                        </div>
                        {isTaskType && ev.detail?.taskId && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleTask(ev.detail!.taskId!)}
                              className={`rounded-md p-1 text-xs transition ${
                                ev.detail?.completed
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                  : "bg-muted text-muted-foreground hover:bg-accent"
                              }`}
                              title={ev.detail?.completed ? "Mark incomplete" : "Mark complete"}
                            >
                              <CheckSquare className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteTask(ev.detail!.taskId!)}
                              className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {ev.detail && (
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {/* Task/reminder specific details */}
                          {isTaskType && ev.detail.time && (
                            <>
                              <span>Time</span>
                              <span className="font-medium text-foreground inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {ev.detail.time}
                              </span>
                            </>
                          )}
                          {isTaskType && ev.detail.customer && (
                            <>
                              <span>Notes</span>
                              <span className="font-medium text-foreground">{ev.detail.customer}</span>
                            </>
                          )}
                          {/* Regular event details */}
                          {!isTaskType && ev.detail.plot && (
                            <>
                              <span>Plot</span>
                              <span className="font-medium text-foreground">{ev.detail.plot}</span>
                            </>
                          )}
                          {!isTaskType && ev.detail.customer && (
                            <>
                              <span>Customer</span>
                              <span className="font-medium text-foreground">{ev.detail.customer}</span>
                            </>
                          )}
                          {type === "payment" && ev.detail.total !== undefined && (
                            <>
                              {!!ev.detail.whiteBank && (<><span>White (Bank)</span><span className="font-medium text-foreground">{fmtMoney(ev.detail.whiteBank)}</span></>)}
                              {!!ev.detail.whiteCash && (<><span>White (Cash)</span><span className="font-medium text-foreground">{fmtMoney(ev.detail.whiteCash)}</span></>)}
                              {!!ev.detail.blackCash && (<><span>Black (Cash)</span><span className="font-medium text-foreground">{fmtMoney(ev.detail.blackCash)}</span></>)}
                              {!!ev.detail.advanceCash && (<><span>Advance (Cash)</span><span className="font-medium text-foreground">{fmtMoney(ev.detail.advanceCash)}</span></>)}
                              <span>Total</span>
                              <span className="font-semibold text-foreground">{fmtMoney(ev.detail.total)}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {events.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No events on this day.</p>
        )}
      </div>
    </div>
  );
}
