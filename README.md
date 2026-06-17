# Estatly

**An offline-first desktop app for real-estate plot & land management.** Built for property developers and land dealers to track projects, plots, customers, payments, and on-site work — entirely on their own machine, with no internet, no cloud, and no third-party servers.

> Estatly runs as a native Windows desktop application. All data lives in a local encrypted-at-rest SQLite database next to the executable — nothing ever leaves the user's computer.

---

## Why I built it

Small real-estate operators often run their entire business out of spreadsheets and notebooks. They need something purpose-built but are (rightly) wary of putting sensitive financial records in the cloud. Estatly is my answer: a polished, fast, **fully offline** desktop tool that feels like a modern web app but keeps every byte of data local to the user.

## Highlights

- 🏗️ **Project → Plot → Customer → Payment** workflow modeling the real sales lifecycle (`available → advance → sale agreement → registered`).
- 🔐 **Dual-PIN security with plausible deniability** — a real PIN unlocks the genuine database; a separate *duress* PIN unlocks a decoy database seeded with dummy data. PINs are hashed with `scrypt` + per-PIN salt.
- 🗺️ **Interactive plot maps** — upload a layout image and drop draggable, status-colored pins and landmarks onto plots.
- 💸 **Granular payment tracking** — separate bank/cash and advance breakdowns per transaction.
- 🧱 **Work & materials ledger** — track labor and material entries with quantity / time / daily pricing, attach bills, and record vendor payments.
- 📅 **Calendar** of payments, registrations, tasks, and reminders.
- 📄 **One-click exports** to styled **Excel** and **PDF** (per-page reports and a full project report).
- ⚡ **Zero-config & offline** — install the portable `.exe` and go. No accounts, no setup, no connection required.

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | **Electron** (secure `contextIsolation`, no `nodeIntegration`) |
| UI | **React 19** + **TypeScript**, **Tailwind CSS v4**, **shadcn/ui** (Radix) |
| Routing & data | **TanStack Router** (file-based) + **TanStack Query** |
| Storage | **SQLite** via `sql.js` (WASM) in the Electron main process |
| Exports | `jsPDF` + `jspdf-autotable`, `xlsx-js-style` |
| Build & packaging | **Vite 7**, **electron-builder** (portable + NSIS installer) |

## Architecture

```
┌────────────────────────────┐         IPC          ┌──────────────────────────────┐
│  Renderer (React 19)        │  ───────────────▶    │  Main process (Electron)      │
│  TanStack Router + Query    │   window.electronAPI │  electron/database.cjs        │
│  Tailwind v4 + shadcn/ui    │  ◀───────────────    │  sql.js (SQLite) + fs         │
└────────────────────────────┘                      └──────────────────────────────┘
         src/                                                  data/<mode>/estatly.db
```

- The renderer never touches the filesystem directly. Every operation goes through a typed `db` client (`src/lib/db.ts`) that calls **~100 `db:*` IPC channels** exposed via a minimal `contextBridge` preload.
- The database layer includes **idempotent schema migrations** (e.g. evolving plot statuses and splitting payment columns) that run safely on every launch.
- Data is partitioned by unlock mode (`main` vs `decoy`) into completely separate database files and attachment folders.

## Running locally

> Requires [Node.js](https://nodejs.org/) 18+.

```bash
npm install
npm run dev      # launches Vite + Electron together
```

Build a distributable Windows app:

```bash
npm run package  # portable Estatly.exe + NSIS installer via electron-builder
```

## User manual

📖 A full **25-page illustrated walkthrough** covering every feature — with screenshots of the dashboard, plot records, site map, payment ledgers, customers, calendar and more — is included here:

**[→ Estatly User Manual (PDF)](docs/Estatly-User-Manual.pdf)**

All data shown is dummy demo data.

## Notes on data & privacy

This is a personal/portfolio build. No real customer data is included in this repository — the local database, attachments, and credentials are all generated at runtime and are excluded from version control via `.gitignore`.

---

*Built with React, Electron, and TypeScript.*
