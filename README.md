# AR Audit Board

A local accounts receivable audit board for grouping document-level AR balances into client cards and preserving audit conclusions as a source of truth.

## Run

```powershell
& 'C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' server.py
```

Then open:

```text
http://127.0.0.1:8765
```

## Workflow

1. Import your `.xlsx` AR balance report.
2. Review one client card at a time.
3. Move cards across statuses.
4. Save findings, issue type, resolution notes, follow-up date, expected adjustment, and reviewer details.
5. Export the audit workbook to Excel, export the audit summary to CSV, or back up the full board to JSON.

Use `Pendiente de Cambios en Sistema` when the audit is complete but a debit note, credit note, receipt reversal, or other system correction still needs to be applied. Use `Completado` once the balance has been audited and the required correction is posted or no correction is needed. Use `Revision Presidencia` for cases that previously lived in `Blocked / Missing Support`, and `Incobrable / Legal` for balances that need collection/legal treatment.

Use the `Has 2019+ invoices` filter when you want to hide clients that only have pre-2019 balances. This keeps the full client card and all unpaid documents visible for clients with at least one invoice from 2019 forward. Use `Old balances + new activity` to focus specifically on clients that have both pre-2019 unpaid balances and newer invoices.

Your audit notes are stored in `data/audit_state.json` and are preserved when you import a refreshed report with the same client keys.

## GitHub Pages

The local Python server is still the best way to import `.xlsx` files and export true `.xlsx` workbooks. GitHub Pages cannot run Python, so the hosted version works in static mode:

1. Push this repository to GitHub.
2. In the repository settings, enable Pages using GitHub Actions.
3. Push to `main`; the workflow in `.github/workflows/deploy-pages.yml` publishes the `web` folder.
4. In the local app, export `Respaldo JSON`.
5. In the GitHub Pages app, use `Importar JSON`.
6. Work normally in the browser. Changes save in that browser's `localStorage`.
7. Export `Respaldo JSON`, `Exportar CSV`, or the Excel-compatible `.xls` file from the hosted app.

Do not commit files in `data/` unless you intentionally want to share client balances and audit notes. The `.gitignore` excludes local audit data by default.
