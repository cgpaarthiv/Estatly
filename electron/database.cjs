const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { app, ipcMain, dialog, shell } = require("electron");

let db = null;
let SQL = null;
let currentDbPath = null;

function getDataDir() {
  if (app.isPackaged) {
    const baseDir =
      process.env.PORTABLE_EXECUTABLE_DIR ||
      path.dirname(app.getPath("exe"));
    return path.join(baseDir, "data");
  }
  return path.join(__dirname, "..", "data");
}

function getAuthPath() {
  return path.join(getDataDir(), "auth.dat");
}

function getDbPath(mode) {
  return path.join(getDataDir(), mode, "estatly.db");
}

let currentMode = null;

function getFilesDir(projectId) {
  return path.join(getDataDir(), currentMode, "files", projectId);
}

function getPlotFilesDir(plotId) {
  return path.join(getDataDir(), currentMode, "plot_files", plotId);
}

function getMapImagesDir() {
  return path.join(getDataDir(), currentMode, "map_images");
}

function save() {
  if (!db || !currentDbPath) return;
  const data = db.export();
  fs.writeFileSync(currentDbPath, Buffer.from(data));
}

function ensureSchema(database) {
  database.run("PRAGMA foreign_keys = OFF");

  // Migrate plots table: sold→advance, add new status set
  try {
    const info = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='plots'");
    if (info.length && info[0].values.length) {
      const ddl = info[0].values[0][0];
      if (ddl && !ddl.includes("'advance'")) {
        // Rebuild table with new status constraint
        database.run("ALTER TABLE plots RENAME TO plots_old");
        database.run(`
          CREATE TABLE plots (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            plot_number TEXT NOT NULL,
            plot_type TEXT,
            size_sqft REAL,
            length REAL,
            width REAL,
            price REAL NOT NULL DEFAULT 0,
            govt_price REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'available'
              CHECK(status IN ('available','advance','sale_agreement','registered')),
            document_number TEXT,
            customer_id TEXT REFERENCES customers(id),
            buyer_name TEXT,
            buyer_phone TEXT,
            description TEXT,
            booking_date TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(project_id, plot_number)
          )
        `);
        database.run(`
          INSERT INTO plots (id, project_id, plot_number, plot_type, size_sqft, price, govt_price, status, customer_id, buyer_name, buyer_phone, description, booking_date, notes, created_at, updated_at)
          SELECT id, project_id, plot_number, plot_type, size_sqft, price, 0,
            CASE WHEN status = 'sold' THEN 'advance' ELSE status END,
            customer_id, buyer_name, buyer_phone, description, booking_date, notes, created_at, updated_at
          FROM plots_old
        `);
        database.run("DROP TABLE plots_old");
      }
    }
  } catch (_) {}

  // Migrate payments table: amount_bank/amount_cash → white_bank/white_cash/black_cash
  try {
    const pInfo = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'");
    if (pInfo.length && pInfo[0].values.length) {
      const pddl = pInfo[0].values[0][0];
      if (pddl && !pddl.includes("amount_white_bank")) {
        // Migrate from old amount_bank/amount_cash schema
        database.run("ALTER TABLE payments RENAME TO payments_old");
        database.run(`
          CREATE TABLE payments (
            id TEXT PRIMARY KEY,
            plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
            customer_id TEXT REFERENCES customers(id),
            amount_white_bank REAL NOT NULL DEFAULT 0,
            amount_white_cash REAL NOT NULL DEFAULT 0,
            amount_black_cash REAL NOT NULL DEFAULT 0,
            amount_advance_cash REAL NOT NULL DEFAULT 0,
            amount_advance_bank REAL NOT NULL DEFAULT 0,
            payment_date TEXT NOT NULL DEFAULT (date('now','localtime')),
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          )
        `);
        database.run(`
          INSERT INTO payments (id, plot_id, customer_id, amount_white_bank, amount_white_cash, amount_black_cash, amount_advance_cash, amount_advance_bank, payment_date, notes, created_at)
          SELECT id, plot_id, customer_id, amount_bank, amount_cash, 0, 0, 0, payment_date, notes, created_at
          FROM payments_old
        `);
        database.run("DROP TABLE payments_old");
      } else if (pddl && !pddl.includes("amount_advance_bank")) {
        // Migrate to add advance_bank column
        database.run("ALTER TABLE payments RENAME TO payments_mig");
        database.run(`
          CREATE TABLE payments (
            id TEXT PRIMARY KEY,
            plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
            customer_id TEXT REFERENCES customers(id),
            amount_white_bank REAL NOT NULL DEFAULT 0,
            amount_white_cash REAL NOT NULL DEFAULT 0,
            amount_black_cash REAL NOT NULL DEFAULT 0,
            amount_advance_cash REAL NOT NULL DEFAULT 0,
            amount_advance_bank REAL NOT NULL DEFAULT 0,
            payment_date TEXT NOT NULL DEFAULT (date('now','localtime')),
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          )
        `);
        database.run(`
          INSERT INTO payments (id, plot_id, customer_id, amount_white_bank, amount_white_cash, amount_black_cash, amount_advance_cash, amount_advance_bank, payment_date, notes, created_at)
          SELECT id, plot_id, customer_id, amount_white_bank, amount_white_cash, amount_black_cash, COALESCE(amount_advance_cash,0), 0, payment_date, notes, created_at
          FROM payments_mig
        `);
        database.run("DROP TABLE payments_mig");
      }
    }
  } catch (_) {}

  database.run("PRAGMA foreign_keys = ON");

  database.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lp_number TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS plots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      plot_number TEXT NOT NULL,
      plot_type TEXT,
      size_sqft REAL,
      length REAL,
      width REAL,
      price REAL NOT NULL DEFAULT 0,
      govt_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available'
        CHECK(status IN ('available','advance','sale_agreement','registered')),
      document_number TEXT,
      customer_id TEXT REFERENCES customers(id),
      buyer_name TEXT,
      buyer_phone TEXT,
      description TEXT,
      booking_date TEXT,
      agreement_date TEXT,
      advance_date TEXT,
      sale_agreement_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(project_id, plot_number)
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES customers(id),
      amount_white_bank REAL NOT NULL DEFAULT 0,
      amount_white_cash REAL NOT NULL DEFAULT 0,
      amount_black_cash REAL NOT NULL DEFAULT 0,
      amount_advance_cash REAL NOT NULL DEFAULT 0,
      amount_advance_bank REAL NOT NULL DEFAULT 0,
      payment_date TEXT NOT NULL DEFAULT (date('now','localtime')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  const migrateCols = [
    ["plots", "buyer_name", "TEXT"],
    ["plots", "buyer_phone", "TEXT"],
    ["plots", "description", "TEXT"],
    ["plots", "booking_date", "TEXT"],
    ["plots", "length", "REAL"],
    ["plots", "width", "REAL"],
    ["plots", "govt_price", "REAL NOT NULL DEFAULT 0"],
    ["plots", "document_number", "TEXT"],
  ];
  for (const [table, col, colType] of migrateCols) {
    try {
      database.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${colType}`);
    } catch (_) {}
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS plot_files (
      id TEXT PRIMARY KEY,
      plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS work_bills (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL DEFAULT '',
      entry_source TEXT NOT NULL DEFAULT 'material',
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // Migrate: add entry_id / entry_source to work_bills if missing
  try { database.run("ALTER TABLE work_bills ADD COLUMN entry_id TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  try { database.run("ALTER TABLE work_bills ADD COLUMN entry_source TEXT NOT NULL DEFAULT 'material'"); } catch (_) {}
  try { database.run("ALTER TABLE work_payments ADD COLUMN vendor TEXT"); } catch (_) {}
  try { database.run("ALTER TABLE work_payments ADD COLUMN description TEXT"); } catch (_) {}
  try { database.run("ALTER TABLE plots ADD COLUMN registration_date TEXT"); } catch (_) {}
  try { database.run("ALTER TABLE plots ADD COLUMN agreement_date TEXT"); } catch (_) {}
  try { database.run("ALTER TABLE plots ADD COLUMN advance_date TEXT"); } catch (_) {}
  try { database.run("ALTER TABLE plots ADD COLUMN sale_agreement_date TEXT"); } catch (_) {}

  // Always recreate plot_pins with correct multi-map UNIQUE constraint
  try {
    const info = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='plot_pins'");
    if (info.length && info[0].values.length) {
      const ddl = String(info[0].values[0][0]);
      // If the table exists but doesn't have the correct 3-column unique constraint, rebuild it
      if (!ddl.includes("UNIQUE(project_id, plot_id, map_id)")) {
        database.run("ALTER TABLE plot_pins RENAME TO plot_pins_old");
        database.run(`
          CREATE TABLE plot_pins (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
            x_pct REAL NOT NULL,
            y_pct REAL NOT NULL,
            map_id TEXT,
            UNIQUE(project_id, plot_id, map_id)
          )
        `);
        // Check if old table had map_id column
        try {
          database.run(`
            INSERT INTO plot_pins (id, project_id, plot_id, x_pct, y_pct, map_id)
            SELECT id, project_id, plot_id, x_pct, y_pct, map_id FROM plot_pins_old
          `);
        } catch (_) {
          database.run(`
            INSERT INTO plot_pins (id, project_id, plot_id, x_pct, y_pct)
            SELECT id, project_id, plot_id, x_pct, y_pct FROM plot_pins_old
          `);
        }
        database.run("DROP TABLE plot_pins_old");
      }
    } else {
      // Table doesn't exist, create fresh
      database.run(`
        CREATE TABLE plot_pins (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          plot_id TEXT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
          x_pct REAL NOT NULL,
          y_pct REAL NOT NULL,
          map_id TEXT,
          UNIQUE(project_id, plot_id, map_id)
        )
      `);
    }
  } catch (_) {}

  database.run(`
    CREATE TABLE IF NOT EXISTS map_landmarks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6b7280',
      x_pct REAL NOT NULL,
      y_pct REAL NOT NULL
    )
  `);

  // Add map_image column to projects (legacy, kept for migration)
  try {
    database.run("ALTER TABLE projects ADD COLUMN map_image TEXT");
  } catch (_) {}

  // Multi-map support
  database.run(`
    CREATE TABLE IF NOT EXISTS project_maps (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'Map',
      file_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // Add map_id to map_landmarks
  try { database.run("ALTER TABLE map_landmarks ADD COLUMN map_id TEXT"); } catch (_) {}

  // Migrate legacy single map_image to project_maps table
  try {
    const rows = database.exec("SELECT id, map_image FROM projects WHERE map_image IS NOT NULL AND map_image != ''");
    if (rows.length && rows[0].values.length) {
      for (const [projId, mapImg] of rows[0].values) {
        const existing = database.exec("SELECT id FROM project_maps WHERE project_id = ? AND file_name = ?", [projId, mapImg]);
        if (!existing.length || !existing[0].values.length) {
          const mapId = crypto.randomUUID();
          database.run(
            "INSERT INTO project_maps (id, project_id, label, file_name, sort_order) VALUES (?, ?, 'Map', ?, 0)",
            [mapId, projId, mapImg]
          );
          // Assign existing pins/landmarks to this map
          database.run("UPDATE plot_pins SET map_id = ? WHERE project_id = ? AND map_id IS NULL", [mapId, projId]);
          database.run("UPDATE map_landmarks SET map_id = ? WHERE project_id = ? AND map_id IS NULL", [mapId, projId]);
        }
      }
    }
  } catch (_) {}

  // Work management entries
  database.run(`
    CREATE TABLE IF NOT EXISTS work_entries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      particular TEXT NOT NULL,
      name TEXT,
      pricing_type TEXT NOT NULL DEFAULT 'quantity' CHECK(pricing_type IN ('quantity','time','iron','daily')),
      total_quantity REAL,
      price_per_quantity REAL,
      price_per_hour REAL,
      time_worked_minutes REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // migrate: add name column if missing
  try { database.run("ALTER TABLE work_entries ADD COLUMN name TEXT"); } catch (_) {}

  // migrate: add 'iron' to pricing_type CHECK constraint
  try {
    const weInfo = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='work_entries'");
    if (weInfo.length && weInfo[0].values.length) {
      const weddl = weInfo[0].values[0][0];
      if (weddl && !weddl.includes("'iron'")) {
        database.run("ALTER TABLE work_entries RENAME TO work_entries_old");
        database.run(`
          CREATE TABLE work_entries (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            particular TEXT NOT NULL,
            name TEXT,
            pricing_type TEXT NOT NULL DEFAULT 'quantity' CHECK(pricing_type IN ('quantity','time','iron','daily')),
            total_quantity REAL,
            price_per_quantity REAL,
            price_per_hour REAL,
            time_worked_minutes REAL,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          )
        `);
        database.run(`
          INSERT INTO work_entries (id, project_id, date, particular, name, pricing_type, total_quantity, price_per_quantity, price_per_hour, time_worked_minutes, notes, created_at)
          SELECT id, project_id, date, particular, name, pricing_type, total_quantity, price_per_quantity, price_per_hour, time_worked_minutes, notes, created_at
          FROM work_entries_old
        `);
        database.run("DROP TABLE work_entries_old");
      }
    }
  } catch (_) {}

  // migrate: add 'daily' to work_entries pricing_type CHECK constraint
  try {
    const weInfo2 = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='work_entries'");
    if (weInfo2.length && weInfo2[0].values.length) {
      const weddl2 = weInfo2[0].values[0][0];
      if (weddl2 && !weddl2.includes("'daily'")) {
        database.run("ALTER TABLE work_entries RENAME TO work_entries_old");
        database.run(`
          CREATE TABLE work_entries (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            particular TEXT NOT NULL,
            name TEXT,
            pricing_type TEXT NOT NULL DEFAULT 'quantity' CHECK(pricing_type IN ('quantity','time','iron','daily')),
            total_quantity REAL,
            price_per_quantity REAL,
            price_per_hour REAL,
            time_worked_minutes REAL,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          )
        `);
        database.run(`
          INSERT INTO work_entries (id, project_id, date, particular, name, pricing_type, total_quantity, price_per_quantity, price_per_hour, time_worked_minutes, notes, created_at)
          SELECT id, project_id, date, particular, name, pricing_type, total_quantity, price_per_quantity, price_per_hour, time_worked_minutes, notes, created_at
          FROM work_entries_old
        `);
        database.run("DROP TABLE work_entries_old");
      }
    }
  } catch (_) {}

  database.run(`
    CREATE TABLE IF NOT EXISTS work_done (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      particular TEXT NOT NULL,
      pricing_type TEXT NOT NULL DEFAULT 'quantity' CHECK(pricing_type IN ('quantity','time','iron','daily')),
      total_quantity REAL,
      price_per_quantity REAL,
      price_per_hour REAL,
      time_worked_minutes REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // migrate: add 'iron' to work_done pricing_type CHECK constraint
  try {
    const wdInfo = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='work_done'");
    if (wdInfo.length && wdInfo[0].values.length) {
      const wdddl = wdInfo[0].values[0][0];
      if (wdddl && !wdddl.includes("'iron'")) {
        database.run("ALTER TABLE work_done RENAME TO work_done_old");
        database.run(`
          CREATE TABLE work_done (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            particular TEXT NOT NULL,
            pricing_type TEXT NOT NULL DEFAULT 'quantity' CHECK(pricing_type IN ('quantity','time','iron','daily')),
            total_quantity REAL,
            price_per_quantity REAL,
            price_per_hour REAL,
            time_worked_minutes REAL,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          )
        `);
        database.run(`
          INSERT INTO work_done (id, project_id, date, particular, pricing_type, total_quantity, price_per_quantity, price_per_hour, time_worked_minutes, notes, created_at)
          SELECT id, project_id, date, particular, pricing_type, total_quantity, price_per_quantity, price_per_hour, time_worked_minutes, notes, created_at
          FROM work_done_old
        `);
        database.run("DROP TABLE work_done_old");
      }
    }
  } catch (_) {}

  // migrate: add 'daily' to work_done pricing_type CHECK constraint
  try {
    const wdInfo2 = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='work_done'");
    if (wdInfo2.length && wdInfo2[0].values.length) {
      const wdddl2 = wdInfo2[0].values[0][0];
      if (wdddl2 && !wdddl2.includes("'daily'")) {
        database.run("ALTER TABLE work_done RENAME TO work_done_old");
        database.run(`
          CREATE TABLE work_done (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            particular TEXT NOT NULL,
            pricing_type TEXT NOT NULL DEFAULT 'quantity' CHECK(pricing_type IN ('quantity','time','iron','daily')),
            total_quantity REAL,
            price_per_quantity REAL,
            price_per_hour REAL,
            time_worked_minutes REAL,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          )
        `);
        database.run(`
          INSERT INTO work_done (id, project_id, date, particular, pricing_type, total_quantity, price_per_quantity, price_per_hour, time_worked_minutes, notes, created_at)
          SELECT id, project_id, date, particular, pricing_type, total_quantity, price_per_quantity, price_per_hour, time_worked_minutes, notes, created_at
          FROM work_done_old
        `);
        database.run("DROP TABLE work_done_old");
      }
    }
  } catch (_) {}

  database.run(`
    CREATE TABLE IF NOT EXISTS work_payments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK(source IN ('material','work_done')),
      particular_key TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // Calendar tasks & reminders
  database.run(`
    CREATE TABLE IF NOT EXISTS calendar_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      time TEXT,
      type TEXT NOT NULL DEFAULT 'task' CHECK(type IN ('task','reminder')),
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // General payments (project-level misc payments)
  database.run(`
    CREATE TABLE IF NOT EXISTS general_payments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      particular TEXT NOT NULL,
      name TEXT,
      amount REAL NOT NULL DEFAULT 0,
      method TEXT NOT NULL DEFAULT 'cash' CHECK(method IN ('cash','bank')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);
}

function seedDecoyData(database) {
  const id1 = uuid();
  database.run(
    "INSERT OR IGNORE INTO projects (id, name, lp_number, description) VALUES (?, ?, ?, ?)",
    [id1, "Green Valley Phase 1", "LP-2024-001", "Residential plots near highway"],
  );

  for (let i = 1; i <= 12; i++) {
    database.run(
      "INSERT OR IGNORE INTO plots (id, project_id, plot_number, status) VALUES (?, ?, ?, ?)",
      [uuid(), id1, String(i).padStart(3, "0"), i <= 3 ? "sold" : "available"],
    );
  }

  const id2 = uuid();
  database.run(
    "INSERT OR IGNORE INTO projects (id, name, lp_number, description) VALUES (?, ?, ?, ?)",
    [id2, "Sunrise Gardens", "LP-2024-008", "Premium villa plots"],
  );

  for (let i = 1; i <= 8; i++) {
    database.run(
      "INSERT OR IGNORE INTO plots (id, project_id, plot_number, status) VALUES (?, ?, ?, ?)",
      [uuid(), id2, String(i).padStart(3, "0"), "available"],
    );
  }
}

function loadDatabase(mode) {
  const dbPath = getDbPath(mode);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
    ensureSchema(db);
    if (mode === "decoy") {
      seedDecoyData(db);
    }
  }

  ensureSchema(db);
  currentDbPath = dbPath;
  currentMode = mode;
  save();
}

async function initDatabase() {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  SQL = await initSqlJs();
}

// ── Auth helpers ──────────────────────────────────────────────────────────

function readAuth() {
  const authPath = getAuthPath();
  if (!fs.existsSync(authPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(authPath, "utf-8"));
  } catch {
    return null;
  }
}

function writeAuth(data) {
  fs.writeFileSync(getAuthPath(), JSON.stringify(data), "utf-8");
}

function uuid() {
  return crypto.randomUUID();
}

function hashPin(pin) {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(pin, salt, 64).toString("hex");
  return check === hash;
}

// ── Query helpers ─────────────────────────────────────────────────────────

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

// ── IPC handlers ──────────────────────────────────────────────────────────

function registerIpcHandlers() {
  // ── AUTH ─────────────────────────────────────────────────────────────
  ipcMain.handle("db:has-pin", () => {
    return readAuth() !== null;
  });

  ipcMain.handle("db:setup-pins", (_, { realPin, duressPin }) => {
    writeAuth({
      real: hashPin(realPin),
      duress: hashPin(duressPin),
    });
    loadDatabase("main");
    return true;
  });

  ipcMain.handle("db:verify-pin", (_, pin) => {
    const auth = readAuth();
    if (!auth) return { ok: false, mode: null };

    if (verifyPin(pin, auth.real)) {
      loadDatabase("main");
      return { ok: true, mode: "main" };
    }
    if (verifyPin(pin, auth.duress)) {
      loadDatabase("decoy");
      return { ok: true, mode: "decoy" };
    }
    return { ok: false, mode: null };
  });

  ipcMain.handle("db:change-pins", (_, { currentPin, newPin, target }) => {
    const auth = readAuth();
    if (!auth) return { ok: false, error: "No PIN configured" };

    // Verify the current PIN matches the target being changed
    const storedHash = target === "main" ? auth.real : auth.duress;
    if (!verifyPin(currentPin, storedHash)) {
      return { ok: false, error: "Current password is incorrect" };
    }

    // Check new PIN doesn't match the other PIN
    const otherHash = target === "main" ? auth.duress : auth.real;
    if (verifyPin(newPin, otherHash)) {
      return { ok: false, error: "New PIN cannot be the same as the other account's PIN" };
    }

    if (target === "main") {
      writeAuth({ real: hashPin(newPin), duress: auth.duress });
    } else {
      writeAuth({ real: auth.real, duress: hashPin(newPin) });
    }
    return { ok: true };
  });

  ipcMain.handle("db:get-mode", () => {
    return currentMode;
  });

  // ── PROJECTS ─────────────────────────────────────────────────────────
  ipcMain.handle("db:projects-list", () => {
    return queryAll("SELECT * FROM projects ORDER BY created_at DESC");
  });

  ipcMain.handle("db:projects-create", (_, data) => {
    const id = uuid();
    run("INSERT INTO projects (id, name, lp_number, description) VALUES (?, ?, ?, ?)", [
      id,
      data.name,
      data.lp_number,
      data.description || null,
    ]);
    return queryOne("SELECT * FROM projects WHERE id = ?", [id]);
  });

  ipcMain.handle("db:projects-get", (_, id) => {
    return queryOne("SELECT * FROM projects WHERE id = ?", [id]);
  });

  ipcMain.handle("db:projects-update", (_, data) => {
    run(
      `UPDATE projects SET name = ?, lp_number = ?, description = ?,
       updated_at = datetime('now','localtime') WHERE id = ?`,
      [data.name, data.lp_number, data.description || null, data.id],
    );
    return queryOne("SELECT * FROM projects WHERE id = ?", [data.id]);
  });

  ipcMain.handle("db:projects-delete", (_, id) => {
    run("DELETE FROM projects WHERE id = ?", [id]);
    return true;
  });

  // ── PLOTS ────────────────────────────────────────────────────────────
  ipcMain.handle("db:plots-list", (_, projectId) => {
    return queryAll(
      "SELECT * FROM plots WHERE project_id = ? ORDER BY plot_number",
      [projectId],
    );
  });

  ipcMain.handle("db:plots-create", (_, data) => {
    const id = uuid();
    run(
      `INSERT INTO plots (id, project_id, plot_number, plot_type, size_sqft, length, width, price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.project_id,
        data.plot_number,
        data.plot_type || null,
        data.size_sqft || null,
        data.length || null,
        data.width || null,
        data.price || 0,
        data.status || "available",
      ],
    );
    return queryOne("SELECT * FROM plots WHERE id = ?", [id]);
  });

  ipcMain.handle("db:plots-delete", (_, id) => {
    run("DELETE FROM plots WHERE id = ?", [id]);
    return true;
  });

  ipcMain.handle("db:plots-bulk-create", (_, data) => {
    for (let i = 1; i <= data.count; i++) {
      db.run(
        "INSERT INTO plots (id, project_id, plot_number) VALUES (?, ?, ?)",
        [uuid(), data.projectId, String(i).padStart(3, "0")],
      );
    }
    save();
    return true;
  });

  ipcMain.handle("db:plots-update", (_, data) => {
    run(
      `UPDATE plots SET plot_number = COALESCE(?, plot_number), status = ?, customer_id = ?, plot_type = ?,
       size_sqft = ?, length = ?, width = ?, price = ?, govt_price = ?,
       document_number = ?, buyer_name = ?, buyer_phone = ?,
       description = ?, booking_date = ?, registration_date = ?,
       advance_date = ?, sale_agreement_date = ?, notes = ?,
       updated_at = datetime('now','localtime')
       WHERE id = ?`,
      [
        data.plot_number || null,
        data.status,
        data.customer_id || null,
        data.plot_type || null,
        data.size_sqft || null,
        data.length || null,
        data.width || null,
        data.price || 0,
        data.govt_price || 0,
        data.document_number || null,
        data.buyer_name || null,
        data.buyer_phone || null,
        data.description || null,
        data.booking_date || null,
        data.registration_date || null,
        data.advance_date || null,
        data.sale_agreement_date || null,
        data.notes || null,
        data.id,
      ],
    );

    // Auto-sync buyer to customers table (deduplicate by name + phone)
    const buyerName = (data.buyer_name || "").trim();
    const buyerPhone = (data.buyer_phone || "").trim();
    if (buyerName) {
      const existing = buyerPhone
        ? queryOne("SELECT id FROM customers WHERE name = ? AND phone = ?", [buyerName, buyerPhone])
        : queryOne("SELECT id FROM customers WHERE name = ? AND (phone IS NULL OR phone = '')", [buyerName]);
      if (!existing) {
        const custId = uuid();
        run(
          "INSERT INTO customers (id, name, phone) VALUES (?, ?, ?)",
          [custId, buyerName, buyerPhone || null],
        );
      }
    }

    return queryOne("SELECT * FROM plots WHERE id = ?", [data.id]);
  });

  ipcMain.handle("db:plots-update-status", (_, data) => {
    run(
      "UPDATE plots SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      [data.status, data.id],
    );
    return true;
  });

  ipcMain.handle("db:plots-count-by-project", (_, projectIds) => {
    if (!projectIds.length) return {};
    const placeholders = projectIds.map(() => "?").join(",");
    const rows = queryAll(
      `SELECT project_id, status, COUNT(*) as count
       FROM plots WHERE project_id IN (${placeholders})
       GROUP BY project_id, status`,
      projectIds,
    );
    const result = {};
    rows.forEach((r) => {
      if (!result[r.project_id]) result[r.project_id] = { total: 0, available: 0 };
      result[r.project_id].total += r.count;
      if (r.status === "available") result[r.project_id].available += r.count;
    });
    return result;
  });

  // ── CUSTOMERS ────────────────────────────────────────────────────────
  ipcMain.handle("db:customers-list", () => {
    return queryAll("SELECT * FROM customers ORDER BY created_at DESC");
  });

  ipcMain.handle("db:customers-create", (_, data) => {
    const id = uuid();
    run(
      "INSERT INTO customers (id, name, phone, email, address) VALUES (?, ?, ?, ?, ?)",
      [id, data.name, data.phone || null, data.email || null, data.address || null],
    );
    return queryOne("SELECT * FROM customers WHERE id = ?", [id]);
  });

  ipcMain.handle("db:customers-update", (_, data) => {
    run(
      "UPDATE customers SET name = ?, phone = ?, email = ?, address = ? WHERE id = ?",
      [data.name, data.phone || null, data.email || null, data.address || null, data.id],
    );
    return queryOne("SELECT * FROM customers WHERE id = ?", [data.id]);
  });

  ipcMain.handle("db:customers-delete", (_, ids) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    for (const id of idArray) {
      run("UPDATE plots SET customer_id = NULL WHERE customer_id = ?", [id]);
      run("UPDATE payments SET customer_id = NULL WHERE customer_id = ?", [id]);
      run("DELETE FROM customers WHERE id = ?", [id]);
    }
    return true;
  });

  // ── PAYMENTS ─────────────────────────────────────────────────────────
  ipcMain.handle("db:payments-list-by-plot", (_, plotId) => {
    return queryAll(
      "SELECT * FROM payments WHERE plot_id = ? ORDER BY payment_date DESC",
      [plotId],
    );
  });

  ipcMain.handle("db:payments-list-by-project", (_, projectId) => {
    return queryAll(
      `SELECT p.*, pl.plot_number, pl.buyer_name,
              COALESCE(pl.buyer_name, c.name) as customer_name
       FROM payments p
       JOIN plots pl ON p.plot_id = pl.id
       LEFT JOIN customers c ON p.customer_id = c.id
       WHERE pl.project_id = ?
       ORDER BY p.payment_date DESC`,
      [projectId],
    );
  });

  ipcMain.handle("db:payments-create", (_, data) => {
    const id = uuid();
    run(
      `INSERT INTO payments (id, plot_id, customer_id, amount_white_bank, amount_white_cash, amount_black_cash, amount_advance_cash, amount_advance_bank, payment_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.plot_id,
        data.customer_id || null,
        data.amount_white_bank || 0,
        data.amount_white_cash || 0,
        data.amount_black_cash || 0,
        data.amount_advance_cash || 0,
        data.amount_advance_bank || 0,
        data.payment_date || new Date().toISOString().slice(0, 10),
        data.notes || null,
      ],
    );
    return queryOne("SELECT * FROM payments WHERE id = ?", [id]);
  });

  ipcMain.handle("db:payments-delete", (_, paymentId) => {
    run("DELETE FROM payments WHERE id = ?", [paymentId]);
    return true;
  });

  // ── EXPORT ───────────────────────────────────────────────────────────
  ipcMain.handle("db:export-project", (_, projectId) => {
    const project = queryOne("SELECT * FROM projects WHERE id = ?", [projectId]);
    if (!project) throw new Error("Project not found");

    const plots = queryAll(
      "SELECT * FROM plots WHERE project_id = ? ORDER BY plot_number",
      [projectId],
    );
    const customers = queryAll("SELECT * FROM customers");

    let payments = [];
    if (plots.length) {
      const ids = plots.map((p) => p.id);
      const placeholders = ids.map(() => "?").join(",");
      payments = queryAll(
        `SELECT * FROM payments WHERE plot_id IN (${placeholders})`,
        ids,
      );
    }
    return { project, plots, customers, payments };
  });

  // ── INFO PAGE ────────────────────────────────────────────────────────
  ipcMain.handle("db:info-data", (_, projectId) => {
    const plots = queryAll("SELECT * FROM plots WHERE project_id = ?", [projectId]);
    const customers = queryAll("SELECT * FROM customers");
    const payments = queryAll("SELECT * FROM payments");
    return { plots, customers, payments };
  });

  // ── CALENDAR ─────────────────────────────────────────────────────────
  ipcMain.handle("db:calendar-events", (_, projectId) => {
    const payments = queryAll(
      `SELECT p.payment_date, p.amount_white_bank, p.amount_white_cash, p.amount_black_cash, p.amount_advance_cash, p.amount_advance_bank,
              pl.plot_number, COALESCE(pl.buyer_name, c.name) as customer_name
       FROM payments p
       JOIN plots pl ON p.plot_id = pl.id
       LEFT JOIN customers c ON p.customer_id = c.id
       WHERE pl.project_id = ?`,
      [projectId],
    );

    const plots = queryAll(
      `SELECT plot_number, status, updated_at, buyer_name, booking_date FROM plots WHERE project_id = ?`,
      [projectId],
    );

    const events = [];

    for (const pay of payments) {
      const whiteBank = Number(pay.amount_white_bank);
      const whiteCash = Number(pay.amount_white_cash);
      const blackCash = Number(pay.amount_black_cash);
      const advanceCash = Number(pay.amount_advance_cash);
      const advanceBank = Number(pay.amount_advance_bank);
      const total = whiteBank + whiteCash + blackCash + advanceCash + advanceBank;
      events.push({
        date: pay.payment_date,
        type: "payment",
        label: `Payment ₹${total.toLocaleString("en-IN")} — Plot ${pay.plot_number}`,
        detail: {
          plot: pay.plot_number,
          customer: pay.customer_name || null,
          whiteBank,
          whiteCash,
          blackCash,
          advanceCash,
          advanceBank,
          total,
        },
      });
    }

    for (const plot of plots) {
      if (plot.status === "registered") {
        events.push({
          date: plot.updated_at ? plot.updated_at.split(" ")[0] : null,
          type: "registration",
          label: `Plot ${plot.plot_number} registered`,
          detail: { plot: plot.plot_number, customer: plot.buyer_name || null },
        });
      } else if (plot.status === "advance") {
        events.push({
          date: plot.updated_at ? plot.updated_at.split(" ")[0] : null,
          type: "booking",
          label: `Plot ${plot.plot_number} advance`,
          detail: { plot: plot.plot_number, customer: plot.buyer_name || null },
        });
      } else if (plot.status === "sale_agreement") {
        events.push({
          date: plot.updated_at ? plot.updated_at.split(" ")[0] : null,
          type: "booking",
          label: `Plot ${plot.plot_number} sale agreement`,
          detail: { plot: plot.plot_number, customer: plot.buyer_name || null },
        });
      }

      // Booking date event
      if (plot.booking_date) {
        events.push({
          date: plot.booking_date,
          type: "booking",
          label: `Plot ${plot.plot_number} booking date`,
          detail: { plot: plot.plot_number, customer: plot.buyer_name || null },
        });
      }
    }

    // Include tasks & reminders
    const tasks = queryAll(
      "SELECT * FROM calendar_tasks WHERE project_id = ?",
      [projectId],
    );
    for (const t of tasks) {
      events.push({
        date: t.date,
        type: t.type,
        label: `${t.completed ? "✓ " : ""}${t.title}`,
        detail: {
          plot: "",
          customer: t.description || null,
          taskId: t.id,
          time: t.time || null,
          completed: !!t.completed,
        },
      });
    }

    return events.filter((e) => e.date);
  });

  // ── CALENDAR TASKS & REMINDERS ─────────────────────────────────────
  ipcMain.handle("db:tasks-list", (_, projectId) => {
    return queryAll(
      "SELECT * FROM calendar_tasks WHERE project_id = ? ORDER BY date, time",
      [projectId],
    );
  });

  ipcMain.handle("db:tasks-create", (_, { projectId, title, description, date, time, type }) => {
    const id = uuid();
    run(
      "INSERT INTO calendar_tasks (id, project_id, title, description, date, time, type) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, projectId, title, description || null, date, time || null, type || "task"],
    );
    return queryOne("SELECT * FROM calendar_tasks WHERE id = ?", [id]);
  });

  ipcMain.handle("db:tasks-update", (_, { id, title, description, date, time, type, completed }) => {
    run(
      "UPDATE calendar_tasks SET title = ?, description = ?, date = ?, time = ?, type = ?, completed = ? WHERE id = ?",
      [title, description || null, date, time || null, type || "task", completed ? 1 : 0, id],
    );
    return queryOne("SELECT * FROM calendar_tasks WHERE id = ?", [id]);
  });

  ipcMain.handle("db:tasks-toggle", (_, id) => {
    run("UPDATE calendar_tasks SET completed = CASE WHEN completed = 0 THEN 1 ELSE 0 END WHERE id = ?", [id]);
    return queryOne("SELECT * FROM calendar_tasks WHERE id = ?", [id]);
  });

  ipcMain.handle("db:tasks-delete", (_, id) => {
    run("DELETE FROM calendar_tasks WHERE id = ?", [id]);
    return true;
  });

  // ── WORK ENTRIES ────────────────────────────────────────────────────
  ipcMain.handle("db:work-entries-list", (_, projectId) => {
    return queryAll(
      "SELECT * FROM work_entries WHERE project_id = ? ORDER BY date DESC, created_at DESC",
      [projectId],
    );
  });

  ipcMain.handle("db:work-entries-create", (_, data) => {
    const id = uuid();
    run(
      `INSERT INTO work_entries (id, project_id, date, particular, name, pricing_type, total_quantity, price_per_quantity, price_per_hour, time_worked_minutes, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.projectId,
        data.date,
        data.particular,
        data.name || null,
        data.pricingType || "quantity",
        data.totalQuantity ?? null,
        data.pricePerQuantity ?? null,
        data.pricePerHour ?? null,
        data.timeWorkedMinutes ?? null,
        data.notes || null,
      ],
    );
    return queryOne("SELECT * FROM work_entries WHERE id = ?", [id]);
  });

  ipcMain.handle("db:work-entries-update", (_, data) => {
    run(
      `UPDATE work_entries SET date = ?, particular = ?, name = ?, pricing_type = ?, total_quantity = ?, price_per_quantity = ?, price_per_hour = ?, time_worked_minutes = ?, notes = ? WHERE id = ?`,
      [
        data.date,
        data.particular,
        data.name || null,
        data.pricingType || "quantity",
        data.totalQuantity ?? null,
        data.pricePerQuantity ?? null,
        data.pricePerHour ?? null,
        data.timeWorkedMinutes ?? null,
        data.notes || null,
        data.id,
      ],
    );
    return queryOne("SELECT * FROM work_entries WHERE id = ?", [data.id]);
  });

  ipcMain.handle("db:work-entries-delete", (_, id) => {
    run("DELETE FROM work_entries WHERE id = ?", [id]);
    return true;
  });

  // ── WORK DONE ──────────────────────────────────────────────────────
  ipcMain.handle("db:work-done-list", (_, projectId) => {
    return queryAll(
      "SELECT * FROM work_done WHERE project_id = ? ORDER BY date DESC, created_at DESC",
      [projectId],
    );
  });

  ipcMain.handle("db:work-done-create", (_, data) => {
    const id = uuid();
    run(
      `INSERT INTO work_done (id, project_id, date, particular, pricing_type, total_quantity, price_per_quantity, price_per_hour, time_worked_minutes, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.projectId,
        data.date,
        data.particular,
        data.pricingType || "quantity",
        data.totalQuantity ?? null,
        data.pricePerQuantity ?? null,
        data.pricePerHour ?? null,
        data.timeWorkedMinutes ?? null,
        data.notes || null,
      ],
    );
    return queryOne("SELECT * FROM work_done WHERE id = ?", [id]);
  });

  ipcMain.handle("db:work-done-update", (_, data) => {
    run(
      `UPDATE work_done SET date = ?, particular = ?, pricing_type = ?, total_quantity = ?, price_per_quantity = ?, price_per_hour = ?, time_worked_minutes = ?, notes = ? WHERE id = ?`,
      [
        data.date,
        data.particular,
        data.pricingType || "quantity",
        data.totalQuantity ?? null,
        data.pricePerQuantity ?? null,
        data.pricePerHour ?? null,
        data.timeWorkedMinutes ?? null,
        data.notes || null,
        data.id,
      ],
    );
    return queryOne("SELECT * FROM work_done WHERE id = ?", [data.id]);
  });

  ipcMain.handle("db:work-done-delete", (_, id) => {
    run("DELETE FROM work_done WHERE id = ?", [id]);
    return true;
  });

  // ── WORK PAYMENTS ──────────────────────────────────────────────────
  ipcMain.handle("db:work-payments-list", (_, projectId) => {
    return queryAll(
      "SELECT * FROM work_payments WHERE project_id = ? ORDER BY date DESC, created_at DESC",
      [projectId],
    );
  });

  ipcMain.handle("db:work-payments-create", (_, data) => {
    const id = uuid();
    run(
      "INSERT INTO work_payments (id, project_id, source, particular_key, amount, date, notes, vendor, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, data.projectId, data.source, data.particularKey, data.amount, data.date, data.notes || null, data.vendor || null, data.description || null],
    );
    return queryOne("SELECT * FROM work_payments WHERE id = ?", [id]);
  });

  ipcMain.handle("db:work-payments-delete", (_, id) => {
    run("DELETE FROM work_payments WHERE id = ?", [id]);
    return true;
  });

  // ── WORK BILLS ─────────────────────────────────────────────────────
  function getBillsDir(projectId) {
    return path.join(getDataDir(), currentMode, "bills", projectId);
  }

  ipcMain.handle("db:work-bills-list", (_, { projectId, entryId }) => {
    if (entryId) {
      return queryAll(
        "SELECT * FROM work_bills WHERE project_id = ? AND entry_id = ? ORDER BY created_at DESC",
        [projectId, entryId],
      );
    }
    return queryAll(
      "SELECT * FROM work_bills WHERE project_id = ? ORDER BY created_at DESC",
      [projectId],
    );
  });

  ipcMain.handle("db:work-bills-pick-and-save", async (_, { projectId, entryId, entrySource }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"] },
        { name: "Documents", extensions: ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (canceled || !filePaths.length) return [];

    const billsDir = getBillsDir(projectId);
    fs.mkdirSync(billsDir, { recursive: true });

    const saved = [];
    for (const filePath of filePaths) {
      const id = uuid();
      const originalName = path.basename(filePath);
      const ext = path.extname(originalName);
      const storedName = `${id}${ext}`;
      const stat = fs.statSync(filePath);
      const mime = extToMime(ext);

      fs.copyFileSync(filePath, path.join(billsDir, storedName));

      run(
        `INSERT INTO work_bills (id, project_id, entry_id, entry_source, name, original_name, size, mime_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, entryId, entrySource, storedName, originalName, stat.size, mime],
      );

      saved.push(queryOne("SELECT * FROM work_bills WHERE id = ?", [id]));
    }
    return saved;
  });

  ipcMain.handle("db:work-bills-save-dropped", (_, { projectId, entryId, entrySource, fileName, data }) => {
    const billsDir = getBillsDir(projectId);
    fs.mkdirSync(billsDir, { recursive: true });

    const id = uuid();
    const ext = path.extname(fileName);
    const storedName = `${id}${ext}`;
    const buf = Buffer.from(data);
    const mime = extToMime(ext);

    fs.writeFileSync(path.join(billsDir, storedName), buf);

    run(
      `INSERT INTO work_bills (id, project_id, entry_id, entry_source, name, original_name, size, mime_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, entryId, entrySource, storedName, fileName, buf.length, mime],
    );

    return queryOne("SELECT * FROM work_bills WHERE id = ?", [id]);
  });

  ipcMain.handle("db:work-bills-open", (_, fileRecord) => {
    const filePath = path.join(getBillsDir(fileRecord.project_id), fileRecord.name);
    if (fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  });

  ipcMain.handle("db:work-bills-delete", (_, fileRecord) => {
    const filePath = path.join(getBillsDir(fileRecord.project_id), fileRecord.name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    run("DELETE FROM work_bills WHERE id = ?", [fileRecord.id]);
    return true;
  });

  // ── PROJECT FILES ───────────────────────────────────────────────────
  ipcMain.handle("db:files-list", (_, projectId) => {
    return queryAll(
      "SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at DESC",
      [projectId],
    );
  });

  ipcMain.handle("db:files-pick-and-save", async (_, projectId) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Documents", extensions: ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt"] },
        { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (canceled || !filePaths.length) return [];

    const filesDir = getFilesDir(projectId);
    fs.mkdirSync(filesDir, { recursive: true });

    const saved = [];
    for (const filePath of filePaths) {
      const id = uuid();
      const originalName = path.basename(filePath);
      const ext = path.extname(originalName);
      const storedName = `${id}${ext}`;
      const stat = fs.statSync(filePath);
      const mime = extToMime(ext);

      fs.copyFileSync(filePath, path.join(filesDir, storedName));

      run(
        `INSERT INTO project_files (id, project_id, name, original_name, size, mime_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, storedName, originalName, stat.size, mime],
      );

      saved.push(queryOne("SELECT * FROM project_files WHERE id = ?", [id]));
    }
    return saved;
  });

  ipcMain.handle("db:files-save-dropped", (_, { projectId, fileName, data }) => {
    const filesDir = getFilesDir(projectId);
    fs.mkdirSync(filesDir, { recursive: true });

    const id = uuid();
    const ext = path.extname(fileName);
    const storedName = `${id}${ext}`;
    const buf = Buffer.from(data);
    const mime = extToMime(ext);

    fs.writeFileSync(path.join(filesDir, storedName), buf);

    run(
      `INSERT INTO project_files (id, project_id, name, original_name, size, mime_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, projectId, storedName, fileName, buf.length, mime],
    );

    return queryOne("SELECT * FROM project_files WHERE id = ?", [id]);
  });

  ipcMain.handle("db:files-open", (_, fileRecord) => {
    const filePath = path.join(getFilesDir(fileRecord.project_id), fileRecord.name);
    if (fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  });

  ipcMain.handle("db:files-download", async (_, fileRecord) => {
    const srcPath = path.join(getFilesDir(fileRecord.project_id), fileRecord.name);
    if (!fs.existsSync(srcPath)) return false;

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: fileRecord.original_name,
    });
    if (canceled || !filePath) return false;

    fs.copyFileSync(srcPath, filePath);
    return true;
  });

  ipcMain.handle("db:files-delete", (_, fileRecord) => {
    const filePath = path.join(getFilesDir(fileRecord.project_id), fileRecord.name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    run("DELETE FROM project_files WHERE id = ?", [fileRecord.id]);
    return true;
  });

  // ── PLOT FILES ──────────────────────────────────────────────────────
  ipcMain.handle("db:plot-files-list", (_, plotId) => {
    return queryAll(
      "SELECT * FROM plot_files WHERE plot_id = ? ORDER BY created_at DESC",
      [plotId],
    );
  });

  ipcMain.handle("db:plot-files-pick-and-save", async (_, plotId) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Documents", extensions: ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt"] },
        { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (canceled || !filePaths.length) return [];

    const filesDir = getPlotFilesDir(plotId);
    fs.mkdirSync(filesDir, { recursive: true });

    const saved = [];
    for (const fp of filePaths) {
      const id = uuid();
      const originalName = path.basename(fp);
      const ext = path.extname(originalName);
      const storedName = `${id}${ext}`;
      const stat = fs.statSync(fp);
      const mime = extToMime(ext);

      fs.copyFileSync(fp, path.join(filesDir, storedName));
      run(
        `INSERT INTO plot_files (id, plot_id, name, original_name, size, mime_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, plotId, storedName, originalName, stat.size, mime],
      );
      saved.push(queryOne("SELECT * FROM plot_files WHERE id = ?", [id]));
    }
    return saved;
  });

  ipcMain.handle("db:plot-files-open", (_, fileRecord) => {
    const filePath = path.join(getPlotFilesDir(fileRecord.plot_id), fileRecord.name);
    if (fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  });

  ipcMain.handle("db:plot-files-delete", (_, fileRecord) => {
    const filePath = path.join(getPlotFilesDir(fileRecord.plot_id), fileRecord.name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    run("DELETE FROM plot_files WHERE id = ?", [fileRecord.id]);
    return true;
  });

  // ── MULTI-MAP SUPPORT ──────────────────────────────────────────────

  ipcMain.handle("db:maps-list", (_, projectId) => {
    return queryAll(
      "SELECT * FROM project_maps WHERE project_id = ? ORDER BY sort_order, created_at",
      [projectId],
    );
  });

  ipcMain.handle("db:maps-add", async (_, { projectId, label }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"] },
      ],
    });
    if (canceled || !filePaths.length) return null;

    const filePath = filePaths[0];
    const dir = getMapImagesDir();
    fs.mkdirSync(dir, { recursive: true });

    const id = uuid();
    const ext = path.extname(filePath);
    const storedName = `${id}${ext}`;
    fs.copyFileSync(filePath, path.join(dir, storedName));

    const maxOrder = queryOne("SELECT MAX(sort_order) as mx FROM project_maps WHERE project_id = ?", [projectId]);
    const order = (maxOrder && maxOrder.mx != null ? maxOrder.mx : -1) + 1;

    run(
      "INSERT INTO project_maps (id, project_id, label, file_name, sort_order) VALUES (?, ?, ?, ?, ?)",
      [id, projectId, label || "Map", storedName, order],
    );

    // Also update legacy column for backwards compat
    const first = queryOne("SELECT file_name FROM project_maps WHERE project_id = ? ORDER BY sort_order LIMIT 1", [projectId]);
    if (first) run("UPDATE projects SET map_image = ? WHERE id = ?", [first.file_name, projectId]);

    return queryOne("SELECT * FROM project_maps WHERE id = ?", [id]);
  });

  ipcMain.handle("db:maps-rename", (_, { mapId, label }) => {
    run("UPDATE project_maps SET label = ? WHERE id = ?", [label, mapId]);
    return true;
  });

  ipcMain.handle("db:maps-remove", (_, { mapId }) => {
    const map = queryOne("SELECT * FROM project_maps WHERE id = ?", [mapId]);
    if (!map) return false;
    // Delete the image file
    const filePath = path.join(getMapImagesDir(), map.file_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    // Delete associated pins and landmarks
    run("DELETE FROM plot_pins WHERE map_id = ?", [mapId]);
    run("DELETE FROM map_landmarks WHERE map_id = ?", [mapId]);
    run("DELETE FROM project_maps WHERE id = ?", [mapId]);
    // Update legacy column
    const first = queryOne("SELECT file_name FROM project_maps WHERE project_id = ? ORDER BY sort_order LIMIT 1", [map.project_id]);
    run("UPDATE projects SET map_image = ? WHERE id = ?", [first ? first.file_name : null, map.project_id]);
    return true;
  });

  ipcMain.handle("db:maps-change-image", async (_, { mapId }) => {
    const map = queryOne("SELECT * FROM project_maps WHERE id = ?", [mapId]);
    if (!map) return false;

    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"] },
      ],
    });
    if (canceled || !filePaths.length) return false;

    const dir = getMapImagesDir();
    // Delete old file
    const oldPath = path.join(dir, map.file_name);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

    const ext = path.extname(filePaths[0]);
    const storedName = `${mapId}${ext}`;
    fs.copyFileSync(filePaths[0], path.join(dir, storedName));
    run("UPDATE project_maps SET file_name = ? WHERE id = ?", [storedName, mapId]);
    return true;
  });

  ipcMain.handle("db:map-get-image", (_, { mapId }) => {
    const map = queryOne("SELECT file_name FROM project_maps WHERE id = ?", [mapId]);
    if (!map) return null;
    const filePath = path.join(getMapImagesDir(), map.file_name);
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(map.file_name).toLowerCase();
    const mime = extToMime(ext);
    return `data:${mime};base64,${buf.toString("base64")}`;
  });

  // Legacy handlers kept for backward compat
  ipcMain.handle("db:map-upload", async (_, projectId) => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    const dir = getMapImagesDir();
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(filePath);
    const storedName = `${projectId}${ext}`;
    fs.copyFileSync(filePath, path.join(dir, storedName));
    run("UPDATE projects SET map_image = ? WHERE id = ?", [storedName, projectId]);
    return storedName;
  });

  ipcMain.handle("db:map-get", (_, projectId) => {
    const project = queryOne("SELECT map_image FROM projects WHERE id = ?", [projectId]);
    if (!project || !project.map_image) return null;
    const filePath = path.join(getMapImagesDir(), project.map_image);
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(project.map_image).toLowerCase();
    const mime = extToMime(ext);
    return `data:${mime};base64,${buf.toString("base64")}`;
  });

  ipcMain.handle("db:map-remove", (_, projectId) => {
    const project = queryOne("SELECT map_image FROM projects WHERE id = ?", [projectId]);
    if (project && project.map_image) {
      const filePath = path.join(getMapImagesDir(), project.map_image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    run("UPDATE projects SET map_image = NULL WHERE id = ?", [projectId]);
    run("DELETE FROM plot_pins WHERE project_id = ?", [projectId]);
    run("DELETE FROM map_landmarks WHERE project_id = ?", [projectId]);
    return true;
  });

  // ── PLOT PINS (now map_id aware) ──────────────────────────────────

  ipcMain.handle("db:pins-list", (_, { projectId, mapId }) => {
    if (mapId) {
      return queryAll(
        "SELECT pp.*, p.plot_number, p.status FROM plot_pins pp JOIN plots p ON pp.plot_id = p.id WHERE pp.project_id = ? AND pp.map_id = ?",
        [projectId, mapId],
      );
    }
    return queryAll(
      "SELECT pp.*, p.plot_number, p.status FROM plot_pins pp JOIN plots p ON pp.plot_id = p.id WHERE pp.project_id = ?",
      [projectId],
    );
  });

  ipcMain.handle("db:pins-save", (_, { projectId, plotId, xPct, yPct, mapId }) => {
    const mid = mapId || null;
    const existing = mid
      ? queryOne("SELECT id FROM plot_pins WHERE project_id = ? AND plot_id = ? AND map_id = ?", [projectId, plotId, mid])
      : queryOne("SELECT id FROM plot_pins WHERE project_id = ? AND plot_id = ? AND map_id IS NULL", [projectId, plotId]);
    if (existing) {
      run("UPDATE plot_pins SET x_pct = ?, y_pct = ? WHERE id = ?", [xPct, yPct, existing.id]);
    } else {
      const id = uuid();
      run(
        "INSERT INTO plot_pins (id, project_id, plot_id, x_pct, y_pct, map_id) VALUES (?, ?, ?, ?, ?, ?)",
        [id, projectId, plotId, xPct, yPct, mid],
      );
    }
    return true;
  });

  ipcMain.handle("db:pins-delete", (_, { projectId, plotId, mapId }) => {
    if (mapId) {
      run("DELETE FROM plot_pins WHERE project_id = ? AND plot_id = ? AND map_id = ?", [projectId, plotId, mapId]);
    } else {
      run("DELETE FROM plot_pins WHERE project_id = ? AND plot_id = ?", [projectId, plotId]);
    }
    return true;
  });

  // ── MAP LANDMARKS (now map_id aware) ──────────────────────────────

  ipcMain.handle("db:landmarks-list", (_, { projectId, mapId }) => {
    if (mapId) {
      return queryAll("SELECT * FROM map_landmarks WHERE project_id = ? AND map_id = ?", [projectId, mapId]);
    }
    return queryAll("SELECT * FROM map_landmarks WHERE project_id = ?", [projectId]);
  });

  ipcMain.handle("db:landmarks-create", (_, { projectId, label, color, xPct, yPct, mapId }) => {
    const id = uuid();
    run(
      "INSERT INTO map_landmarks (id, project_id, label, color, x_pct, y_pct, map_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, projectId, label, color || "#6b7280", xPct, yPct, mapId || null],
    );
    return queryOne("SELECT * FROM map_landmarks WHERE id = ?", [id]);
  });

  ipcMain.handle("db:landmarks-update", (_, { id, label, color, xPct, yPct }) => {
    run(
      "UPDATE map_landmarks SET label = ?, color = ?, x_pct = ?, y_pct = ? WHERE id = ?",
      [label, color || "#6b7280", xPct, yPct, id],
    );
    return queryOne("SELECT * FROM map_landmarks WHERE id = ?", [id]);
  });

  ipcMain.handle("db:landmarks-delete", (_, id) => {
    run("DELETE FROM map_landmarks WHERE id = ?", [id]);
    return true;
  });

  // ── GENERAL PAYMENTS ────────────────────────────────────────────────
  ipcMain.handle("db:general-payments-list", (_, projectId) => {
    return queryAll(
      "SELECT * FROM general_payments WHERE project_id = ? ORDER BY date DESC, created_at DESC",
      [projectId],
    );
  });

  ipcMain.handle("db:general-payments-create", (_, data) => {
    const id = uuid();
    run(
      "INSERT INTO general_payments (id, project_id, date, particular, name, amount, method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, data.projectId, data.date, data.particular, data.name || null, data.amount, data.method || "cash", data.notes || null],
    );
    return queryOne("SELECT * FROM general_payments WHERE id = ?", [id]);
  });

  ipcMain.handle("db:general-payments-update", (_, data) => {
    run(
      "UPDATE general_payments SET date = ?, particular = ?, name = ?, amount = ?, method = ?, notes = ? WHERE id = ?",
      [data.date, data.particular, data.name || null, data.amount, data.method || "cash", data.notes || null, data.id],
    );
    return queryOne("SELECT * FROM general_payments WHERE id = ?", [data.id]);
  });

  ipcMain.handle("db:general-payments-delete", (_, id) => {
    run("DELETE FROM general_payments WHERE id = ?", [id]);
    return true;
  });
}

function extToMime(ext) {
  const map = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

module.exports = { initDatabase, registerIpcHandlers };
