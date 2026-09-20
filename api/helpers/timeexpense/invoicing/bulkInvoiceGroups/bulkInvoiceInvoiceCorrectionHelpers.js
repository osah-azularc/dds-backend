/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-26
 * @description
 * Bulk Invoice Groups > group detail > Invoices tab - the per-invoice rounding-
 * correction logic (recompute from invoice_items, correct in place, shape the
 * Rounding Adjustments modal row) and the stored-summary write-back, split out of
 * bulkInvoiceGroupInvoicesHelpers.js purely to stay under the 300-line file
 * guideline - no behavior change. See that file's own module doc comment for the
 * full write-on-read behavior this implements (ported from
 * BulkinvoicesController::getBulkInvoiceDetailsAction).
 *
 * 2026-08-28: recomputeAndCorrectInvoice used to repeat the literal
 * `Math.round(x * 100) / 100` formula three times inline. Factored into the
 * local roundToCents below to remove that in-file repetition ONLY - deliberately
 * NOT unified with computationHelpers.js's roundMoney/computeLineTotal, even
 * though that would look like the more obvious cross-module consolidation.
 * Verified empirically (300k randomized trials) that Math.round(x*100)/100 and
 * roundMoney's formula (at the time, plain `Number(x.toFixed(2))`) disagreed by
 * a cent on ~0.7% of realistic item totals. roundMoney was itself fixed on the
 * same date (see computationHelpers.js's own header comment) to a legacy-
 * parity-verified safeRound port - but that's a port of PrecisionHelper::
 * safeRound specifically, a DIFFERENT legacy function than the plain PHP
 * round() this correction routine's own legacy source
 * (BulkinvoicesController.php:1554-1559) actually calls, so unifying the two
 * is still the wrong move here, now for a cleaner reason: roundToCents and
 * roundMoney are each faithful ports of two different legacy functions, not
 * one "correct" and one "not decimal-safe." roundToCents keeps the exact
 * Math.round(x*100)/100 formula (and the same round-every-step accumulation
 * order legacy's own correction routine uses), so this change is provably
 * behavior-identical to what shipped before it, not just probably so.
 */

const STATUS_LABELS = { 2: "DRAFT", 3: "PAID", 4: "OVERDUE", 5: "UNPAID", 6: "PARTIAL", 7: "WRITTEN OFF" };

// Local to this file, deliberately not computationHelpers.js's roundMoney - see this file's own
// header comment for why the two "round to cents" formulas are not interchangeable here.
const roundToCents = (value) => Math.round(Number(value) * 100) / 100;

// A simple, non-regex email check - matches legacy's own filter_var(FILTER_VALIDATE_EMAIL)
// intent closely enough for this display-only "missing/invalid email" banner, without a
// backtracking-prone pattern.
const isValidEmail = (email) => {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1);
  const dot = domain.indexOf(".");
  return dot > 0 && dot < domain.length - 1;
};

// Recomputes one invoice's total from its own line items and, if it drifted from the stored
// subtotal, corrects invoice_items.total + invoices.{subtotal,inv_amt,balance,correction,
// correction_type} in place. Mirrors legacy's per-item then per-invoice correction loop
// (correction_type 1 = db amount was too low, 2 = too high) - including its two *independent*
// writes to invoices.correction/correction_type, confirmed live (2026-08-26) against a real,
// deliberately-introduced item-level drift: legacy's own per-item block unconditionally
// UPDATEs invoices.correction/correction_type the moment an item-level mismatch is found,
// separate from (and not gated by) the invoice-level subtotal-vs-stored-subtotal check further
// below - which runs regardless and can overwrite that value again with its own diff if the
// two disagree. An earlier version of this port nested the item-level write inside the
// invoice-level `if`, so a real item-level drift that happened not to change the invoice's own
// rollup total (this port's original stored subtotal already "coincidentally" matched the
// recomputed total, e.g. a compensating error elsewhere) never got persisted - confirmed to
// produce an empty Rounding Adjustments modal despite the drift being real and already
// correctly reflected in this function's own *returned* value for the current request.
const recomputeAndCorrectInvoice = async (invoice, transaction) => {
  let correction = Number(invoice.correction) || 0;
  let correctionType = invoice.correctionType || "0";
  const originalSubtotal = Number(invoice.subtotal);

  const items = invoice.items || [];
  let calculatedTotal = 0;
  for (const item of items) {
    const itemTotal =
      Number(item.quantity) === 0
        ? roundToCents(Number(item.rate))
        : roundToCents(Number(item.quantity) * Number(item.rate));
    calculatedTotal = roundToCents(calculatedTotal + itemTotal);

    if (item.itemType === "time" && itemTotal !== Number(item.total)) {
      correction = Number(Math.abs(itemTotal - Number(item.total)).toFixed(2));
      correctionType = itemTotal > Number(item.total) ? "1" : "2";
      await item.update({ total: itemTotal }, { transaction });
      await invoice.update({ correction, correctionType }, { transaction });
    }
  }

  if (items.length && calculatedTotal !== originalSubtotal) {
    correction = Number(Math.abs(calculatedTotal - originalSubtotal).toFixed(2));
    correctionType = calculatedTotal > originalSubtotal ? "1" : "2";
    await invoice.update(
      { subtotal: calculatedTotal, invAmt: calculatedTotal, balance: calculatedTotal, correction, correctionType },
      { transaction },
    );
  }

  return { calculatedTotal: items.length ? calculatedTotal : originalSubtotal, correction, correctionType };
};

// Builds this invoice's Rounding Adjustments modal row + which correction bucket (added/removed)
// its own amount belongs to - only called when correctionType is '1' or '2'.
const buildCorrectionEntry = (invoice, invAmt, correction, correctionType) => {
  const oldInvAmt = correctionType === "1" ? invAmt - correction : invAmt + correction;
  return {
    oldInvAmt,
    modalEntry: {
      agencyCode: invoice.billableAgency?.agencyCode,
      agencyName: invoice.agencyName,
      diff: correctionType === "1" ? `$${correction}` : `($${correction})`,
      summaryTotal: oldInvAmt.toFixed(2),
      finalAmount: invoice.subtotal,
    },
  };
};

// Shapes one invoice row for the response, applying (or reading back) its rounding correction.
export const shapeInvoiceRow = async (invoice, isCorrected, transaction, fileCountByInvoiceId) => {
  const result = isCorrected
    ? { calculatedTotal: Number(invoice.subtotal), correction: Number(invoice.correction) || 0, correctionType: invoice.correctionType }
    : await recomputeAndCorrectInvoice(invoice, transaction);

  const invAmt = isCorrected ? Number(invoice.invAmt) : result.calculatedTotal;
  const discount = Number(invoice.discount) || 0;

  let oldInvAmt = invAmt;
  let modalEntry = null;
  if (result.correctionType === "1" || result.correctionType === "2") {
    ({ oldInvAmt, modalEntry } = buildCorrectionEntry(invoice, invAmt, result.correction, result.correctionType));
  }

  const emails = String(invoice.agencyEmail || "").split(",");
  const hasInvalidEmail = emails.some((email) => !email.trim() || !isValidEmail(email.trim()));
  const validationError = hasInvalidEmail
    ? {
        type: "email",
        agencyName: invoice.agencyName,
        agencyId: invoice.agency,
        message: `Email Required for ${invoice.invNo} ${invoice.agencyName}`,
      }
    : null;

  const row = {
    id: invoice.id,
    invNo: invoice.invNo,
    invDate: invoice.invDate,
    agencyId: invoice.agency,
    agencyCode: invoice.billableAgency?.agencyCode || null,
    agencyName: invoice.agencyName,
    agencyEmail: invoice.agencyEmail,
    bulkInvGrp: invoice.bulkInvGrp,
    subtotal: Number(invoice.subtotal) || 0,
    discount,
    invAmt,
    oldInvAmt,
    balance: Number(invoice.balance) || 0,
    status: Number(invoice.status),
    statusLabel: STATUS_LABELS[Number(invoice.status)] || "",
    invDueDate: invoice.invDueDate,
    correction: result.correction,
    correctionType: result.correctionType,
    fileCount: fileCountByInvoiceId.get(invoice.id) || 0,
    emailValidation: hasInvalidEmail ? 1 : 0,
  };

  return { row, discount, invAmt, modalEntry, validationError };
};

// Re-writes the stored Summary-screen JSON's per-agency discount/total/correction fields to
// match what this pass just (re)computed - matches legacy's own post-correction
// bulk_invoice_summary UPDATE, only run the one time the correction itself runs.
//
// Shape-aware: a legacy-created row's inv_summary_data is snake_case
// (time_expense_entries[agency].total_invoice_amount, invoices_summary.total_discount - see
// bulkInvoiceGroupSummaryHelpers.js's own comment on why both shapes exist in this table for
// real). Written back in whichever shape was already there, same as every field this function
// doesn't touch - converting a legacy row to camelCase mid-write would leave it inconsistent
// with every *other* untouched field still in its original shape.
export const applySummaryCorrections = (summaryRow, invoiceRows, bulkInvoiceDiscount, bulkInvoiceTotal, adminCorrection) => {
  const summaryData = JSON.parse(summaryRow.invSummaryData);
  const isLegacyShape = "bill_date_from" in summaryData;
  const summaryKey = isLegacyShape ? "invoices_summary" : "invoicesSummary";
  const entriesKey = isLegacyShape ? "time_expense_entries" : "timeExpenseEntries";

  if (summaryData[summaryKey]) {
    if (isLegacyShape) {
      summaryData[summaryKey].total_discount = bulkInvoiceDiscount;
      summaryData[summaryKey].total_invoice_amount = bulkInvoiceTotal;
    } else {
      summaryData[summaryKey].totalDiscount = bulkInvoiceDiscount;
      summaryData[summaryKey].totalInvoiceAmount = bulkInvoiceTotal;
    }
  }

  invoiceRows.forEach((invoice) => {
    const entry = summaryData[entriesKey]?.[invoice.agencyName];
    if (!entry) return;
    let correctionDisplay = "0.00";
    if (invoice.correctionType === "1") correctionDisplay = invoice.correction;
    else if (invoice.correctionType === "2") correctionDisplay = `(${invoice.correction})`;
    if (isLegacyShape) {
      entry.discount = invoice.discount;
      entry.total_invoice_amount = invoice.invAmt;
      entry.correction_type = invoice.correctionType;
      entry.correction = correctionDisplay;
    } else {
      entry.discount = invoice.discount;
      entry.totalInvoiceAmount = invoice.invAmt;
      entry.correctionType = invoice.correctionType;
      entry.correction = correctionDisplay;
    }
  });

  summaryData.adminCorrection = adminCorrection;
  return JSON.stringify(summaryData);
};
