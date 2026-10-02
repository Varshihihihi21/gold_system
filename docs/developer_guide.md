# Developer guide

## Prerequisites

Install Node.js `^20.19.0` or `>=22.12.0` (the range required by the locked Vite release) and npm. Express 5 itself supports Node `>=18`. A reachable PostgreSQL database with the expected tables is also required.

The owner-provided ERD is preserved in [database_schema.md](./database_schema.md), but there is no executable SQL schema or migration, so a new developer cannot create the database from this repository alone. Obtain the compatible migration and an authorized device row from the project maintainer or environment owner. The supplied business ERD does not include the internal `authorized_devices` table, which the current API queries; its separate reference is documented in [authorised_devices_reference.sql](./authorised_devices_reference.sql).

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
| `CORS_ORIGINS` | Comma-separated exact browser origins allowed to read API responses. Development defaults to Vite's localhost origins; configure the approved Electron application origin in a packaged deployment. |

`JWT_SECRET` is now required; the backend exits rather than using a known fallback. Create a unique high-entropy value and keep it outside version control. `CORS_ORIGINS` should list only trusted frontend origins. Requests without an `Origin` header (for example, Postman) remain usable; this is not an authentication control.

Do not commit `.env` or copy real credentials into documentation or logs. PostgreSQL TLS certificate verification is enabled. If the provider uses a private certificate authority, configure Node/PostgreSQL to trust that CA instead of disabling certificate verification.

The frontend defaults to `http://localhost:4000` and can be pointed at another backend with the `VITE_API_BASE_URL` frontend environment variable. The Vite config does not define an API proxy. The terminal device identifier remains a fixed frontend constant and is currently the only credential used by device login; this is not secure proof of device possession.

## Install and run locally

Open two terminals from the repository root.

**Backend terminal**

```sh
cd backend
npm install
node server.js
```

The server logs its selected port on startup. `backend/package.json` does not currently define a development/start command; `node server.js` runs the entry point directly.

**Frontend terminal**

```sh
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. Use the “Authenticate terminal” button, then test the rate, customer, search, and payment forms. A matching active device must exist in the database, and the frontend's configured device identifier must match it.

## Available frontend commands

Run these from `frontend/`:

| Command | Result |
|---|---|
| `npm run dev` | Starts the Vite development server. |
| `npm run build` | Builds the frontend into Vite's generated output directory. |
| `npm run preview` | Serves the built frontend locally for preview. |
| `npm run lint` | Runs ESLint. |

The backend's `npm test` is only a placeholder that prints “Error: no test specified” and exits unsuccessfully. No application-specific automated tests were found.

## Folder structure

```text
.
├── backend/
│   ├── server.js             # Express routes and device authentication
│   ├── db.js                 # PostgreSQL connection pool
│   ├── package.json          # Backend dependencies
│   └── .env                  # Local-only configuration; do not commit
├── frontend/
│   ├── index.html            # Vite HTML shell
│   ├── vite.config.js        # React/Vite setup
│   ├── eslint.config.js      # Frontend lint configuration
│   └── src/
│       ├── main.jsx          # React bootstrap
│       ├── App.jsx           # Session state and authenticated view selection
│       ├── api.js            # Fetch helper, API base, and device identity
│       ├── validation.js     # Shared numeric input validation
│       ├── components/       # Shared form, shell, feedback, toast, skeleton UI
│       ├── hooks/            # In-memory form state and debounced customer search
│       ├── pages/            # Device login and three API-backed work areas
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
