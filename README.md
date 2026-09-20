# ecourt-backend

## Cron Jobs

Scheduled jobs are registered in [api/cron/index.js](api/cron/index.js) using `node-cron`, and initialized from `app-ecourt.js`. The two daily jobs are wrapped with a shared retry helper (3 attempts, 10-minute delay between attempts); the 2-minute clamav job is idempotent and simply logs on failure, relying on its own short interval to pick up unprocessed rows on the next run.

| Schedule | Job | File | Description |
|---|---|---|---|
| `55 6 * * *` (6:55 AM daily) | `runMailVendorCron` | [api/cron/mailVendorCron.js](api/cron/mailVendorCron.js) | Cleans old reports, uploads pending `ecourt_mailvendor_documents` PDFs to the mail vendor via SFTP, and generates a CSV summary. Mirrors legacy PHP `filemovetomailvendorAction`. |
| `1 4 * * *` (4:01 AM daily) | `runBulkExportDocCron` | [api/cron/bulkExportDocCron.js](api/cron/bulkExportDocCron.js) | Runs the DDS/ALS 91-day letter automation (agency 199, casetype 612, document 82) for dockets received that day. Mirrors legacy PHP `bulkDocAutomationAction`. Can also be triggered manually via the authenticated bulk-export-doc route. |
| `*/2 * * * *` (every 2 minutes) | `runClamavScanStatusCron` | [api/cron/clamavScanStatusCron.js](api/cron/clamavScanStatusCron.js) | Drains pending `clamav_scan_status` rows written by the Ruby/ClamAV worker, flipping `documentstable.is_scanned` or rejecting infected files. Mirrors legacy PHP `EfilingController::filescanStatusAction`. |
