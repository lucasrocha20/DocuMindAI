# DocuMind AI: frontend

React + Vite dashboard for uploading invoice PDFs, following their processing, and reading the extracted invoices. The project overview, setup, and limitations are in the [root README](../README.md).

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server on `http://localhost:5173` (needs the backend running) |
| `npm run build` | Type check (`tsc -b`), then build to `dist/` |
| `npm run lint` | oxlint |
| `npm test` | Component and unit tests (Vitest, jsdom, Testing Library) |

The API address is `VITE_API_URL` (see `.env.example`). It is read at **build time**, so set it when building for deployment.

## Structure

```
src/api/         typed API client (fetch; XMLHttpRequest for upload progress)
src/pages/       dashboard, invoice details, not found
src/components/  upload panel, tables, status badge, state messages
src/hooks/       useApi (fetching with loading/error/reload), page title
src/lib/         date, money, and quantity formatting
```

## Design notes

- **No state library.** Data comes from a small `useApi` hook; search and page live in the URL, so going back from an invoice restores the list.
- **Live status.** The dashboard polls every 3 seconds, but only while an upload is Pending or Processing.
- **Accessible by default:** labelled controls, keyboard-reachable actions, visible focus, status shown with text and an icon (never colour alone), and live regions for upload progress and errors.
- **Responsive.** On narrow screens the tables keep two columns and move secondary details under the main one.
- **Locale-aware.** Dates and money follow the browser's locale.

The visual style (a stationery-desk palette, Bitter and Public Sans fonts, the invoice page styled as a sheet of paper) is defined by the tokens in `src/index.css`.
