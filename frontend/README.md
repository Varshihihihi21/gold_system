# Goldline Counter Terminal

This Vite + React frontend provides device authentication, daily gold-rate maintenance, customer registration/search, and customer debt payments. The API contract and database limits are documented in [`../docs/api_reference.md`](../docs/api_reference.md) and [`../docs/questions.md`](../docs/questions.md).

## Run locally

```sh
npm install
npm run dev
```

The backend must be running and a registered active device must match the configured terminal identifier. By default the API URL is `http://localhost:4000`; set `VITE_API_BASE_URL` in a local frontend environment file to use another backend URL.

## Scripts

- `npm run dev` — start Vite.
- `npm run build` — create a production build.
- `npm run preview` — preview the production build.
- `npm run lint` — run ESLint.

See the [developer guide](../docs/developer_guide.md) for backend setup and required PostgreSQL configuration.
