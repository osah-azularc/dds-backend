# Money math conventions - Invoicing module

This module has **two intentionally different "round to cents" implementations**.
Before adding new money math anywhere under `invoicing/`, use this to pick the
right one rather than writing a third.

## `shared/computationHelpers.js` - use this for everything by default

`roundMoney` / `computeLineTotal` / `sumLineItems` / `formatMoney`. This is the
module's default: line item totals, invoice subtotal/discount/total, partial
payments, balances. Rounds via decimal-safe, string-based half-up rounding
(`safeRoundString`, a JS port of legacy's own `PrecisionHelper::safeRound`) -
fixed 2026-08-28, previously used plain `Number(x.toFixed(2))` which had a real
native-floating-point caveat (see that file's own header comment for the
concrete `8.575` example and the `toPrecision(14)`-vs-`String()` subtlety that
made the port actually legacy-faithful, not just "close"). `computeLineTotal`
itself is verified against **real legacy PHP execution** (the project's own PHP
5.6 CLI running `InvoicesController::saveInvoiceAction`'s own real formula for
'time'/'other' items, `number_format($q*$r, 2)` - confirmed identical to
`PrecisionHelper::calculateTotal` too) - 0 mismatches across 170,017+
randomized/boundary test cases (`dev-scripts/precision-verify/`). The frontend
keeps a hand-synced mirror at `frontend/src/utils/computationHelpers.js` - same
formula, kept in sync deliberately (see that file's own header comment).

**`sumLineItems` (BUG FIX 2026-09-03, precision audit) - a deliberate deviation
from legacy, not a parity target.** Real legacy's `invoices.subtotal` is NOT
computed the same way as its own `invoice_items.total` rows: the subtotal is
whatever the Angular client computed and submitted (`saveInvoiceAction` trusts
`invoiceData.subTotal` verbatim, applying a double-rounded `toFixed(3)`-then-
`toFixed(2)` formula uniformly to every item), while each `invoice_items.total`
row is separately recomputed server-side (`number_format`, matching
`computeLineTotal` - confirmed for EVERY item type including 'expense' via 3
real, live-driven legacy saves, see `dev-scripts/precision-verify/README.md`'s
own "CORRECTION" section for the full trace and the earlier wrong claim it
retracts). These two real legacy code paths (client-computed subtotal vs.
server-recomputed item total) can genuinely disagree by a cent for the same
invoice - confirmed concretely: a single line item with quantity=8.575, rate=1
stores an `invoice_items.total` of $8.58 (server `number_format`, matching
`computeLineTotal` exactly) but legacy's own `invoices.subtotal` shows $8.57
(client `toFixed`) for that same invoice.
Explicit product decision (2026-09-03): this app does NOT reproduce that
inconsistency - `sumLineItems` sums each item's own already-rounded
`computeLineTotal` result (not raw quantity*rate), so `invoices.subtotal`
always exactly equals `SUM(invoice_items.total)` for its own line items,
verified with 0 mismatches across 20,000 randomized multi-item cases.

## `bulkInvoiceGroups/precisionHelpers.js` - AAA admin-fee allocation math ONLY

`safeTruncate` / `calculateAgencyPercentage` / `calculateAAAAllocation` /
`calculateAaaRoleQuantity`. Rounds via string-based **truncation**, ported
verbatim from legacy's `PrecisionHelper.php`, to preserve a real legacy
business rule (4-decimal AAA percentage truncation, not rounding). Used only
by Bulk Invoice Groups' AAA (Administrative Law Judge / Staff Attorney / Law
Clerk) admin-fee allocation across agencies. **Do not** reach for this outside
that one calculation, and do not swap it for `roundMoney` there either - see
that file's own header comment for why both directions would be wrong.

## Don't write a third one

`Math.round(x*100)/100`, `Number(x.toFixed(2))`, and `roundMoney`'s own
`safeRoundString` all look interchangeable and often are - but they're three
different algorithms and were confirmed empirically (2026-08-28) to disagree
with each other, and with real legacy PHP output, on a meaningful fraction of
realistic randomized item totals. `roundMoney` is legacy-parity-verified as of
2026-08-28 (see above); the other two are not, and porting a legacy PHP
`round()` call (a different legacy function than `safeRound`, with its own
different behavior) still means keeping it as its own clearly-named local
helper rather than assuming it's safe to unify with `roundMoney` - see
`bulkInvoiceGroups/bulkInvoiceInvoiceCorrectionHelpers.js`'s `roundToCents` for
the pattern and the reasoning. When in doubt, verify against real legacy
execution (the project's PHP 5.6 CLI is available) rather than assuming two
rounding formulas that look alike actually agree.
