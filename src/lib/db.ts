import type { Project, Plot, Customer, Payment } from "./data";

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
  }
}

function api() {
  if (!window.electronAPI) {
    throw new Error("This app must be run through Electron.");
  }
  return window.electronAPI;
}

export const db = {
  hasPin: () => api().invoke("db:has-pin") as Promise<boolean>,
  setupPins: (realPin: string, duressPin: string) =>
    api().invoke("db:setup-pins", { realPin, duressPin }) as Promise<boolean>,
  verifyPin: (pin: string) =>
    api().invoke("db:verify-pin", pin) as Promise<{ ok: boolean; mode: "main" | "decoy" | null }>,
  changePins: (data: { currentPin: string; newPin: string; target: "main" | "duress" }) =>
    api().invoke("db:change-pins", data) as Promise<{ ok: boolean; error?: string }>,
  getMode: () =>
    api().invoke("db:get-mode") as Promise<"main" | "decoy" | null>,

  projects: {
    list: () => api().invoke("db:projects-list") as Promise<Project[]>,
    create: (data: { name: string; lp_number: string; description?: string }) =>
      api().invoke("db:projects-create", data) as Promise<Project>,
    get: (id: string) =>
      api().invoke("db:projects-get", id) as Promise<Project | null>,
    update: (data: {
      id: string;
      name: string;
      lp_number: string;
      description?: string;
    }) => api().invoke("db:projects-update", data) as Promise<Project>,
    delete: (id: string) =>
      api().invoke("db:projects-delete", id) as Promise<boolean>,
  },

  plots: {
    list: (projectId: string) =>
      api().invoke("db:plots-list", projectId) as Promise<Plot[]>,
    create: (data: {
      project_id: string;
      plot_number: string;
      plot_type?: string;
      size_sqft?: number;
      length?: number;
      width?: number;
      price?: number;
    }) => api().invoke("db:plots-create", data) as Promise<Plot>,
    bulkCreate: (projectId: string, count: number) =>
      api().invoke("db:plots-bulk-create", { projectId, count }) as Promise<boolean>,
    update: (data: {
      id: string;
      plot_number?: string;
      status: string;
      customer_id?: string | null;
      plot_type?: string | null;
      size_sqft?: number | null;
      length?: number | null;
      width?: number | null;
      price?: number;
      govt_price?: number;
      document_number?: string | null;
      buyer_name?: string | null;
      buyer_phone?: string | null;
      description?: string | null;
      booking_date?: string | null;
      registration_date?: string | null;
      advance_date?: string | null;
      sale_agreement_date?: string | null;
      notes?: string | null;
    }) => api().invoke("db:plots-update", data) as Promise<Plot>,
    updateStatus: (id: string, status: string) =>
      api().invoke("db:plots-update-status", { id, status }) as Promise<boolean>,
    delete: (id: string) =>
      api().invoke("db:plots-delete", id) as Promise<boolean>,
    countByProject: (ids: string[]) =>
      api().invoke("db:plots-count-by-project", ids) as Promise<
        Record<string, { total: number; available: number }>
      >,
  },

  customers: {
    list: () => api().invoke("db:customers-list") as Promise<Customer[]>,
    create: (data: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
    }) => api().invoke("db:customers-create", data) as Promise<Customer>,
    update: (data: {
      id: string;
      name: string;
      phone?: string;
      email?: string;
      address?: string;
    }) => api().invoke("db:customers-update", data) as Promise<Customer>,
    delete: (id: string | string[]) =>
      api().invoke("db:customers-delete", id) as Promise<boolean>,

  },

  payments: {
    listByPlot: (plotId: string) =>
      api().invoke("db:payments-list-by-plot", plotId) as Promise<Payment[]>,
    listByProject: (projectId: string) =>
      api().invoke("db:payments-list-by-project", projectId) as Promise<
        (Payment & { plot_number: string; customer_name: string | null })[]
      >,
    create: (data: {
      plot_id: string;
      customer_id?: string | null;
      amount_white_bank: number;
      amount_white_cash: number;
      amount_black_cash: number;
      amount_advance_cash: number;
      amount_advance_bank: number;
      payment_date?: string;
      notes?: string;
    }) => api().invoke("db:payments-create", data) as Promise<Payment>,

    delete: (paymentId: string) =>
      api().invoke("db:payments-delete", paymentId) as Promise<boolean>,
  },

  exportProject: (projectId: string) =>
    api().invoke("db:export-project", projectId) as Promise<{
      project: Project;
      plots: Plot[];
      customers: Customer[];
      payments: Payment[];
    }>,

  infoData: (projectId: string) =>
    api().invoke("db:info-data", projectId) as Promise<{
      plots: Plot[];
      customers: Customer[];
      payments: Payment[];
    }>,

  plotFiles: {
    list: (plotId: string) =>
      api().invoke("db:plot-files-list", plotId) as Promise<PlotFile[]>,
    pickAndSave: (plotId: string) =>
      api().invoke("db:plot-files-pick-and-save", plotId) as Promise<PlotFile[]>,
    open: (file: PlotFile) =>
      api().invoke("db:plot-files-open", file) as Promise<void>,
    delete: (file: PlotFile) =>
      api().invoke("db:plot-files-delete", file) as Promise<boolean>,
  },

  calendarEvents: (projectId: string) =>
    api().invoke("db:calendar-events", projectId) as Promise<CalendarEvent[]>,

  tasks: {
    list: (projectId: string) =>
      api().invoke("db:tasks-list", projectId) as Promise<CalendarTask[]>,
    create: (data: { projectId: string; title: string; description?: string; date: string; time?: string; type: "task" | "reminder" }) =>
      api().invoke("db:tasks-create", data) as Promise<CalendarTask>,
    update: (data: { id: string; title: string; description?: string; date: string; time?: string; type: "task" | "reminder"; completed: boolean }) =>
      api().invoke("db:tasks-update", data) as Promise<CalendarTask>,
    toggle: (id: string) =>
      api().invoke("db:tasks-toggle", id) as Promise<CalendarTask>,
    delete: (id: string) =>
      api().invoke("db:tasks-delete", id) as Promise<boolean>,
  },

  files: {
    list: (projectId: string) =>
      api().invoke("db:files-list", projectId) as Promise<ProjectFile[]>,
    pickAndSave: (projectId: string) =>
      api().invoke("db:files-pick-and-save", projectId) as Promise<ProjectFile[]>,
    saveDropped: (projectId: string, fileName: string, data: ArrayBuffer) =>
      api().invoke("db:files-save-dropped", {
        projectId,
        fileName,
        data: Array.from(new Uint8Array(data)),
      }) as Promise<ProjectFile>,
    open: (file: ProjectFile) =>
      api().invoke("db:files-open", file) as Promise<void>,
    download: (file: ProjectFile) =>
      api().invoke("db:files-download", file) as Promise<boolean>,
    delete: (file: ProjectFile) =>
      api().invoke("db:files-delete", file) as Promise<boolean>,
  },

  map: {
    upload: (projectId: string) =>
      api().invoke("db:map-upload", projectId) as Promise<string | null>,
    get: (projectId: string) =>
      api().invoke("db:map-get", projectId) as Promise<string | null>,
    remove: (projectId: string) =>
      api().invoke("db:map-remove", projectId) as Promise<boolean>,
  },

  maps: {
    list: (projectId: string) =>
      api().invoke("db:maps-list", projectId) as Promise<ProjectMap[]>,
    add: (data: { projectId: string; label: string }) =>
      api().invoke("db:maps-add", data) as Promise<ProjectMap | null>,
    rename: (data: { mapId: string; label: string }) =>
      api().invoke("db:maps-rename", data) as Promise<boolean>,
    remove: (mapId: string) =>
      api().invoke("db:maps-remove", { mapId }) as Promise<boolean>,
    changeImage: (mapId: string) =>
      api().invoke("db:maps-change-image", { mapId }) as Promise<boolean>,
    getImage: (mapId: string) =>
      api().invoke("db:map-get-image", { mapId }) as Promise<string | null>,
  },

  pins: {
    list: (data: { projectId: string; mapId?: string }) =>
      api().invoke("db:pins-list", data) as Promise<PlotPin[]>,
    save: (data: { projectId: string; plotId: string; xPct: number; yPct: number; mapId?: string }) =>
      api().invoke("db:pins-save", data) as Promise<boolean>,
    delete: (data: { projectId: string; plotId: string; mapId?: string }) =>
      api().invoke("db:pins-delete", data) as Promise<boolean>,
  },

  landmarks: {
    list: (data: { projectId: string; mapId?: string }) =>
      api().invoke("db:landmarks-list", data) as Promise<Landmark[]>,
    create: (data: { projectId: string; label: string; color: string; xPct: number; yPct: number; mapId?: string }) =>
      api().invoke("db:landmarks-create", data) as Promise<Landmark>,
    update: (data: { id: string; label: string; color: string; xPct: number; yPct: number }) =>
      api().invoke("db:landmarks-update", data) as Promise<Landmark>,
    delete: (id: string) =>
      api().invoke("db:landmarks-delete", id) as Promise<boolean>,
  },

  workEntries: {
    list: (projectId: string) =>
      api().invoke("db:work-entries-list", projectId) as Promise<WorkEntry[]>,
    create: (data: {
      projectId: string;
      date: string;
      particular: string;
      name?: string;
      pricingType: "quantity" | "time" | "iron" | "daily";
      totalQuantity?: number;
      pricePerQuantity?: number;
      pricePerHour?: number;
      timeWorkedMinutes?: number;
      notes?: string;
    }) => api().invoke("db:work-entries-create", data) as Promise<WorkEntry>,
    update: (data: {
      id: string;
      date: string;
      particular: string;
      name?: string;
      pricingType: "quantity" | "time" | "iron" | "daily";
      totalQuantity?: number;
      pricePerQuantity?: number;
      pricePerHour?: number;
      timeWorkedMinutes?: number;
      notes?: string;
    }) => api().invoke("db:work-entries-update", data) as Promise<WorkEntry>,
    delete: (id: string) =>
      api().invoke("db:work-entries-delete", id) as Promise<boolean>,
  },

  workDone: {
    list: (projectId: string) =>
      api().invoke("db:work-done-list", projectId) as Promise<WorkDoneEntry[]>,
    create: (data: {
      projectId: string;
      date: string;
      particular: string;
      pricingType: "quantity" | "time" | "iron" | "daily";
      totalQuantity?: number;
      pricePerQuantity?: number;
      pricePerHour?: number;
      timeWorkedMinutes?: number;
      notes?: string;
    }) => api().invoke("db:work-done-create", data) as Promise<WorkDoneEntry>,
    update: (data: {
      id: string;
      date: string;
      particular: string;
      pricingType: "quantity" | "time" | "iron" | "daily";
      totalQuantity?: number;
      pricePerQuantity?: number;
      pricePerHour?: number;
      timeWorkedMinutes?: number;
      notes?: string;
    }) => api().invoke("db:work-done-update", data) as Promise<WorkDoneEntry>,
    delete: (id: string) =>
      api().invoke("db:work-done-delete", id) as Promise<boolean>,
  },

  workPayments: {
    list: (projectId: string) =>
      api().invoke("db:work-payments-list", projectId) as Promise<WorkPayment[]>,
    create: (data: {
      projectId: string;
      source: "material" | "work_done";
      particularKey: string;
      amount: number;
      date: string;
      notes?: string;
      vendor?: string;
      description?: string;
    }) => api().invoke("db:work-payments-create", data) as Promise<WorkPayment>,
    delete: (id: string) =>
      api().invoke("db:work-payments-delete", id) as Promise<boolean>,
  },

  workBills: {
    list: (data: { projectId: string; entryId?: string }) =>
      api().invoke("db:work-bills-list", data) as Promise<WorkBill[]>,
    pickAndSave: (data: { projectId: string; entryId: string; entrySource: "material" | "work_done" }) =>
      api().invoke("db:work-bills-pick-and-save", data) as Promise<WorkBill[]>,
    saveDropped: (data: { projectId: string; entryId: string; entrySource: "material" | "work_done"; fileName: string; data: ArrayBuffer }) =>
      api().invoke("db:work-bills-save-dropped", {
        ...data,
        data: Array.from(new Uint8Array(data.data)),
      }) as Promise<WorkBill>,
    open: (file: WorkBill) =>
      api().invoke("db:work-bills-open", file) as Promise<void>,
    delete: (file: WorkBill) =>
      api().invoke("db:work-bills-delete", file) as Promise<boolean>,
  },

  generalPayments: {
    list: (projectId: string) =>
      api().invoke("db:general-payments-list", projectId) as Promise<GeneralPayment[]>,
    create: (data: {
      projectId: string;
      date: string;
      particular: string;
      name?: string;
      amount: number;
      method?: "cash" | "bank";
      notes?: string;
    }) => api().invoke("db:general-payments-create", data) as Promise<GeneralPayment>,
    update: (data: {
      id: string;
      date: string;
      particular: string;
      name?: string;
      amount: number;
      method?: "cash" | "bank";
      notes?: string;
    }) => api().invoke("db:general-payments-update", data) as Promise<GeneralPayment>,
    delete: (id: string) =>
      api().invoke("db:general-payments-delete", id) as Promise<boolean>,
  },
};

export type PlotFile = {
  id: string;
  plot_id: string;
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  created_at: string;
};

export type CalendarEvent = {
  date: string;
  type: "payment" | "registration" | "booking" | "followup" | "task" | "reminder";
  label: string;
  detail?: {
    plot: string;
    customer: string | null;
    whiteBank?: number;
    whiteCash?: number;
    blackCash?: number;
    advanceCash?: number;
    advanceBank?: number;
    total?: number;
    taskId?: string;
    time?: string | null;
    completed?: boolean;
  };
};

export type CalendarTask = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  type: "task" | "reminder";
  completed: number;
  created_at: string;
};

export type ProjectFile = {
  id: string;
  project_id: string;
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  created_at: string;
};

export type PlotPin = {
  id: string;
  project_id: string;
  plot_id: string;
  x_pct: number;
  y_pct: number;
  plot_number: string;
  status: string;
};

export type Landmark = {
  id: string;
  project_id: string;
  label: string;
  color: string;
  x_pct: number;
  y_pct: number;
  map_id?: string;
};

export type ProjectMap = {
  id: string;
  project_id: string;
  label: string;
  file_name: string;
  sort_order: number;
  created_at: string;
};

export type WorkEntry = {
  id: string;
  project_id: string;
  date: string;
  particular: string;
  name: string | null;
  pricing_type: "quantity" | "time" | "iron" | "daily";
  total_quantity: number | null;
  price_per_quantity: number | null;
  price_per_hour: number | null;
  time_worked_minutes: number | null;
  notes: string | null;
  created_at: string;
};

export type WorkDoneEntry = {
  id: string;
  project_id: string;
  date: string;
  particular: string;
  pricing_type: "quantity" | "time" | "iron" | "daily";
  total_quantity: number | null;
  price_per_quantity: number | null;
  price_per_hour: number | null;
  time_worked_minutes: number | null;
  notes: string | null;
  created_at: string;
};

export type WorkPayment = {
  id: string;
  project_id: string;
  source: "material" | "work_done";
  particular_key: string;
  amount: number;
  date: string;
  notes: string | null;
  vendor: string | null;
  description: string | null;
  created_at: string;
};

export type WorkBill = {
  id: string;
  project_id: string;
  entry_id: string;
  entry_source: "material" | "work_done";
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  created_at: string;
};

export type GeneralPayment = {
  id: string;
  project_id: string;
  date: string;
  particular: string;
  name: string | null;
  amount: number;
  method: "cash" | "bank";
  notes: string | null;
  created_at: string;
};

