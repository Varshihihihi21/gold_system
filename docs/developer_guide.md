# Developer guide

## Prerequisites

Install Node.js `>=22.12.0` and npm (Electron 44 requires this; it also satisfies Vite 8). A reachable PostgreSQL database with the expected tables is required.

The owner-provided ERD is preserved in [database_schema.md](./database_schema.md), live Neon metadata and page-to-table mapping are summarized in [live_schema.md](./live_schema.md), and the current complete schema is [backend/database_setup.sql](../backend/database_setup.sql). The application expects PostgreSQL's `public` schema and uses the British-spelled table `authorised_devices`.

## Configuration

The backend's `backend/db.js` loads `backend/.env` using `dotenv`. Configure these PostgreSQL settings there:

| Variable | Purpose |
|---|---|
| `PGHOST` | PostgreSQL server hostname. |
| `PGPORT` | PostgreSQL server port. |
| `PGDATABASE` | Database name. |
| `PGUSER` | Database username. |
| `PGPASSWORD` | Database password. |

Additional runtime settings read in `backend/server.js`:

| Variable | Purpose |
|---|---|
| `PORT` | HTTP listening port; defaults to `4000`. |
| `JWT_SECRET` | Required strong, unique secret used to sign and verify login tokens. The backend refuses to start when it is missing. |
| `CORS_ORIGINS` | Comma-separated exact origins; development defaults include Vite localhost origins and `goldline://app`. Configure only trusted production origins. |

`JWT_SECRET` is now required; the backend exits rather than using a known fallback. Create a unique high-entropy value and keep it outside version control. `CORS_ORIGINS` should list only trusted frontend origins. Requests without an `Origin` header (for example, Postman) remain usable; this is not an authentication control.

Do not commit `.env` or copy real credentials into documentation or logs. PostgreSQL TLS certificate verification is enabled. If the provider uses a private certificate authority, configure Node/PostgreSQL to trust that CA instead of disabling certificate verification.

The frontend uses `VITE_API_BASE_URL` (development default `http://localhost:4000`). Production builds require HTTPS. The Electron main process also requires runtime `GOLD_API_URL` to match the built API origin; packaged mode refuses HTTP. Each terminal needs `GOLD_DEVICE_GUID`. The main process creates an Ed25519 keypair and stores only the OS-encrypted private key in the application-data folder.

Before login or finance routes can work, take a backup and compare the target database with [live_schema.md](./live_schema.md). Then review and run `backend/database_setup.sql` in the intended database using its SQL Editor or an administrative SQL client. In normal databases the script creates/extends the schema, backfills sale fine weights, creates the singleton zeroed inventory row, and installs indexes and audit triggers; it does not create live devices, rates, customers, or opening stock. Smoke-test fixtures are guarded to a disposable database named exactly `kalash_gold_smoke_test`. The script aborts on enum-label mismatches or duplicate logbook source references; resolve those explicitly rather than deleting business data. Do not also run `device_auth_schema.sql` or migration 001 when using the consolidated setup script. These files remain historical incremental references.

The app never applies SQL automatically. Confirm that the backend's `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER` point at the database where the script was run. Launch the terminal once, open “Show device details for administrator provisioning,” and insert its public key into the matching `authorised_devices.device_public_key` row. Do not copy or export the private key. Then, from `backend/`, run `node set-owner-pin.js` in an interactive terminal to configure or rotate the owner PIN/password. The PIN is required at every owner-only action; a terminal's role is not a substitute.

## Install and run locally

The frontend manifest now declares Electron. Because the lockfile could not be regenerated in this environment, run `npm install` in `frontend/` first; this resolves the declared Electron dependency and synchronizes `package-lock.json`.

Open two terminals from the repository root.

**Backend terminal**

```sh
cd backend
npm install
npm test
node server.js
```

The server logs its selected port on startup. `backend/package.json` does not currently define a development/start command; `node server.js` runs the entry point directly.

**Frontend terminal**

```sh
cd frontend
npm install
npm run dev
```

In a third terminal, start the desktop shell while Vite is running:

```powershell
cd frontend
$env:GOLD_DEVICE_GUID = "your-admin-assigned-device-guid"
$env:GOLD_API_URL = "http://localhost:4000"
npm run desktop:dev
```

Use the “Authenticate terminal” button, then test rates, customers, billing, buybacks, debt settlement, expenses, logbook, and analytics. The backend must be running, the consolidated schema applied, device public key provisioned, owner PIN configured, and opening inventory configured before sales can be made.

## Available frontend commands

Run these from `frontend/`:

| Command | Result |
|---|---|
| `npm run dev` | Starts the Vite development server. |
| `npm run build` | Builds the frontend into Vite's generated output directory. |
| `npm run preview` | Serves the built frontend locally for preview. |
| `npm run lint` | Runs ESLint. |
| `npm run desktop:dev` | Opens the Electron shell against Vite at `http://localhost:5173`. |
| `npm run desktop` | Opens the built Electron app using `goldline://app`. Run `npm run build` first. |

The backend uses Node's built-in test runner: `npm test` covers money/gold calculations, the cash-ledger model, device signatures, weighted-average inventory, analytics arithmetic, and frontend finance previews. A packaged distributable/installer is not configured yet.

For a production build, set `VITE_API_BASE_URL` to the HTTPS API endpoint before `npm run build`, then configure the same origin in runtime `GOLD_API_URL`. Terminate TLS 1.3 at the cloud ingress and set `CORS_ORIGINS` to `goldline://app`. The backend itself listens on HTTP and must not be exposed directly to the public internet.

## Folder structure

```text
.
├── backend/
│   ├── server.js             # Express routes and device authentication
│   ├── device-auth.js        # Ed25519 proof verification
│   ├── gold-calculations.js  # Exact weight/money formula helpers
│   ├── cash-ledger.js        # In-memory cash-flow domain model
│   ├── device_auth_schema.sql # Manual device public-key/challenge schema
│   └── test/                 # Node built-in unit tests
│   ├── db.js                 # PostgreSQL connection pool
│   ├── package.json          # Backend dependencies
│   └── .env                  # Local-only configuration; do not commit
├── frontend/
│   ├── index.html            # Vite HTML shell
│   ├── vite.config.js        # React/Vite setup
│   ├── electron/
│   │   ├── main.cjs          # Secure BrowserWindow, OS key storage, print IPC
│   │   └── preload.cjs       # Minimal isolated IPC bridge
│   ├── eslint.config.js      # Frontend lint configuration
│   └── src/
│       ├── main.jsx          # React bootstrap
│       ├── App.jsx           # Session state and authenticated view selection
│       ├── api.js            # Fetch helper, API base, and device identity
│       ├── validation.js     # Shared numeric input validation
│       ├── components/       # Shared form, shell, feedback, toast, skeleton UI
│       ├── hooks/            # In-memory form state and debounced customer search
│       ├── pages/            # Device login and authenticated finance work areas
│       ├── App.css           # Shell and shared component styles
│       ├── pages.css         # Rates, customer, and payment view styles
│       ├── index.css         # Global styles and design tokens
│       └── assets/           # Images and SVGs
├── docs/                     # Project documentation and diagrams
└── .gitignore                # Repository ignore rules
```

`node_modules/` directories are locally installed dependencies and are not source files.

## Main code conventions and patterns

- `App.jsx` owns the in-memory device session and selects one of three protected operational views; focused page components live under `src/pages/`.
- Browser requests use JSON through the shared `src/api.js` fetch helper, which adds the device header and signed token to protected requests.
- Customer searches wait 300 ms after typing before requesting the existing phone-search endpoint.
- Form input is kept in React memory only; switching views, signing out, or closing the page discards unsaved values. No browser storage is used for these drafts.
- The backend uses CommonJS modules (`require`/`module.exports`); the frontend uses ES modules.
- SQL calls use positional PostgreSQL parameters (`$1`, `$2`, etc.) instead of interpolating request values into SQL.
- Database access is performed through a shared `pg` pool exported by `backend/db.js`.
- Protected routes are grouped after `app.use('/api', authenticateDevice)`, so their handlers inherit device authentication.
- The payment route uses a transaction and `SELECT ... FOR UPDATE` to serialize balance changes for one customer.
- This codebase does not currently define TypeScript types, database migrations, backend request-validation schemas, or a server-side logout/session-revocation route.

## Repository contents and unknowns

For a file-by-file first-party catalog and scan coverage, see [Project file catalog](./README.md#project-file-catalog). There is no checked-in executable database definition, documented deployment target, or real backend test suite. The supplied reference ERD is not a migration. The frontend README contains frontend startup notes; this guide remains the source of truth for backend and database setup.
