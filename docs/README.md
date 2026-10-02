# Gold Trading Terminal

## What this project does

This repository contains an early, browser-based gold-trading terminal. It is intended for a shop or counter operator who needs to authenticate an approved terminal, update the day's gold rates, register customers, find customers by phone number, and record payments against customer balances.

The project has two parts:

- A **frontend**, the web page the operator uses, built with React and Vite.
- A **backend**, a Node.js service that checks the terminal's access token and reads or writes records in PostgreSQL.

The application currently targets a backend at `http://localhost:4000`. The frontend includes a fixed device identifier in its code, and the backend currently accepts that identifier as the device-login credential. The app keeps its login token and form values in React memory, so they are lost when their view is closed or the page is reloaded. The repository describes itself in the interface as “Sprint 1”; deployment and production API coverage remain incomplete. An owner-provided reference ERD is preserved in [database_schema.md](./database_schema.md), but no executable migration is included.

## Technology at a glance

| Area | Technology |
|---|---|
| Browser interface | React 19, JavaScript, JSX, CSS |
| Frontend development/build | Vite 8, `@vitejs/plugin-react` |
| Backend/API | Node.js, Express 5 |
| Database access | PostgreSQL through `pg` |
| Login token | JSON Web Token (`jsonwebtoken`) |
| Browser-to-server access | Express CORS middleware |
| Configuration | Environment variables loaded with `dotenv` |
| Database hosting | Not declared. The database connection comment mentions Neon, but no hosting configuration is checked in. |
| External business APIs | None found in the application source. |

## Documentation

- [Feature guide](./features.md) — what each screen/module does and how it behaves.
- [Data model](./data_model.md) — owner-provided model, observed API usage, gaps, and data flow.
- [Owner-provided database schema](./database_schema.md) — supplied ERD retained as a project reference, not a migration.
- [Authorized-device SQL reference](./authorised_devices_reference.sql) — owner-provided `authorized_devices` table and seed example, normalized to the confirmed table spelling; not a migration.
- [API reference](./api_reference.md) — all implemented HTTP routes, inputs, outputs, and errors.
- [Developer guide](./developer_guide.md) — local setup, configuration, folder layout, and conventions.
- [Project analysis](./analysis.md) — verified stack, API, data model, existing UI, and implementation gaps.
- [Design system](./DESIGN.md) — proposed interface tokens and accessibility baseline.
- [Open questions](./questions.md) — unresolved API, database, and business-rule decisions.
- [Test data status](./test-data.md) — confirms no test rows or seed commands exist.
- [Test data plan](./test-data-plan.md) — source-backed inventory and safe seeding blockers.

## Diagrams

- [Main request and user flow](./diagrams/main_flow.mmd)
- [Primary use-case sequence](./diagrams/primary_sequence.mmd)
- [Database entity relationship diagram](./diagrams/data_model.mmd)
- [Owner-provided database schema diagram](./diagrams/database_schema.mmd)
- [High-level architecture](./diagrams/architecture.mmd)

## Project file catalog

The descriptions below cover first-party project files and directories. Generated dependencies under either `node_modules/` are intentionally not cataloged file-by-file; they are installed third-party package contents, not application source. No executable SQL schema/migration, backend test suite, or root-level README was present in the project inventory. The owner-provided reference ERD is cataloged below.

### Repository root

| Path | Purpose |
|---|---|
| `.gitignore` | Excludes dependency directories, environment files, generated builds, logs, and Git ignore files. |
| `backend/` | Node.js API and PostgreSQL connection code. |
| `frontend/` | React web application, its build configuration, and static assets. |
| `docs/` | This documentation set and its Mermaid diagrams. |

### `backend/`

| Path | Purpose |
|---|---|
| `backend/server.js` | Express server, device-token middleware, and routes for rates, customers, and payments. |
| `backend/db.js` | Loads environment configuration and creates the PostgreSQL connection pool. |
| `backend/package.json` | Backend package metadata, dependencies, and the currently placeholder test script. |
| `backend/package-lock.json` | Locks the backend's npm dependency resolution. |
| `backend/.env` | Local database/server secrets and settings, ignored by Git. Values are intentionally not reproduced in documentation. The expected PostgreSQL variable names are listed in the developer guide. |
| `backend/node_modules/` | Installed backend dependencies; generated/third-party files are not project source. |

### `frontend/`

| Path | Purpose |
|---|---|
| `frontend/.gitignore` | Frontend-local ignore rules. |
| `frontend/package.json` | Frontend scripts and React/Vite/lint dependencies. |
| `frontend/package-lock.json` | Locks the frontend's npm dependency resolution. |
| `frontend/vite.config.js` | Enables Vite's React plugin; no API proxy or deployment configuration is set. |
| `frontend/eslint.config.js` | ESLint settings for JavaScript, JSX, React Hooks, and React refresh. |
| `frontend/index.html` | Browser HTML shell and the mount point for the React app. |
| `frontend/README.md` | Frontend-specific run instructions and script summary. |
| `frontend/node_modules/` | Installed frontend dependencies; generated/third-party files are not project source. |
| `frontend/src/` | Frontend application code and styles. |
| `frontend/src/main.jsx` | Creates the React root and renders `App` inside `StrictMode`. |
| `frontend/src/App.jsx` | Terminal session state, view selection, and authenticated app shell composition. |
| `frontend/src/api.js` | Fetch-based API helper, API base URL, and configured device identifier. |
| `frontend/src/validation.js` | Shared finite-number and two-decimal-place input validation. |
| `frontend/src/components/AppShell.jsx` | Top navigation, device identity, sign-out, and content layout. |
| `frontend/src/components/FormField.jsx` | Labeled control wrapper with accessible hint and error wiring. |
| `frontend/src/components/Feedback.jsx` | Inline status, error, warning, and empty-state panel. |
| `frontend/src/components/Skeleton.jsx` | Accessible content placeholder for loading states. |
| `frontend/src/components/Toast.jsx` | Temporary success/error notification and dismiss control. |
| `frontend/src/hooks/useDraftForm.js` | React-memory-only form state, discarded when its view unmounts. |
| `frontend/src/hooks/useCustomerSearch.js` | Debounced customer search through the existing phone-search route. |
| `frontend/src/pages/LoginPage.jsx` | Device sign-in screen. |
| `frontend/src/pages/RatesPage.jsx` | Load, validate, and save today's rates. |
| `frontend/src/pages/CustomersPage.jsx` | Customer registration and phone search. |
| `frontend/src/pages/PaymentsPage.jsx` | Customer selection and transactional payment submission. |
| `frontend/src/App.css` | Global shell, controls, shared components, and responsive styling. |
| `frontend/src/pages.css` | Rates, customer, and payment page layouts and responsive styles. |
| `frontend/src/index.css` | Global starter styles and `--terminal-*` design tokens. |
| `frontend/src/assets/` | Images and SVG assets. |
| `frontend/src/assets/hero.png` | Static image asset; no application behavior is attached to it in the inspected component. |
| `frontend/src/assets/react.svg` | React logo asset from the starter template. |
| `frontend/src/assets/vite.svg` | Vite logo asset from the starter template. |
| `frontend/public/` | Files served directly from the site root by Vite. |
| `frontend/public/favicon.svg` | Browser tab icon. |
| `frontend/public/icons.svg` | Static SVG icon resource. |

### `docs/`

| Path | Purpose |
|---|---|
| `docs/README.md` | Plain-English project overview, documentation contents, and project file catalog. |
| `docs/features.md` | Feature behavior, code locations, inputs/outputs, limitations, and connections. |
| `docs/data_model.md` | Owner-provided data model, implementation mapping, schema gaps, and data flow. |
| `docs/database_schema.md` | Owner-provided full ER diagram retained for future reference, with implementation status and outstanding clarifications. |
| `docs/authorised_devices_reference.sql` | Owner-provided `authorized_devices` DDL and seed, saved as a non-executable reference. |
| `docs/api_reference.md` | Implemented API routes, headers, request/response examples, and errors. |
| `docs/developer_guide.md` | Local setup, environment settings, commands, structure, and coding patterns. |
| `docs/analysis.md` | Phase 1 technical findings and implementation gaps. |
| `docs/DESIGN.md` | Product colors, typography, spacing, component patterns, and accessibility tokens. |
| `docs/questions.md` | Unresolved backend/data/product decisions that should not be guessed. |
| `docs/test-data.md` | Current seeding status and safe database workflow; no data was seeded. |
| `docs/test-data-plan.md` | Table/query inventory and safeguards for future test data generation. |
| `docs/diagrams/` | Mermaid source diagrams for the main flows, interactions, data model, and architecture. |
| `docs/diagrams/main_flow.mmd` | Main sign-in and feature request flow. |
| `docs/diagrams/primary_sequence.mmd` | Device login and payment request sequence between components. |
| `docs/diagrams/data_model.mmd` | Mermaid ER diagram of the owner-provided business schema. |
| `docs/diagrams/database_schema.mmd` | Mermaid ER diagram for the owner-provided schema. |
| `docs/diagrams/architecture.mmd` | Frontend, backend, database, and operator architecture overview. |

## Inventory and coverage

The documentation was prepared from the first-party frontend component/entry point/styles, backend server and database connector, package manifests and lockfiles, Vite/ESLint/HTML configuration, existing README, ignore files, static asset names, current user stories, and owner-provided ERD. Installed `node_modules` content is third-party generated dependency material and is excluded. The local `.env` values are not reproduced.

**Not skipped among the inventoried first-party application files.** Important absent items are called out rather than guessed: there is no checked-in SQL schema or migration, no route-level automated test suite, and no declared deployment/hosting setup.
