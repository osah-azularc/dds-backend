/**
 * @module
 * @author Rizwan Hiroli
 * @date 2026-08-19
 * @description
 * The 'time' item half of buildInvoicePdfSections' bucketing (Adjudication Fees
 * "Legal" rollups + Administrative Fees) - see invoicePdfSections.js's own doc
 * comment for the full bucketing-rules table this implements. Split out of that
 * file (2026-08-27, alongside invoicePdfExpenseSections.js) purely to stay
 * under the 300-line file guideline; no behavior change. ADJUDICATION_LEGAL_LABEL
 * is defined (and exported) here rather than in invoicePdfSections.js
 * specifically so that file can import it from here instead of the reverse -
 * invoicePdfSections.js already needs to import handleTimeItem from this file,
 * and a two-way import between the two would be a circular dependency.
 */

export const ADJUDICATION_LEGAL_LABEL = "Legal";

// BUG FIX 2026-09-03 (precision audit, live-verified - see invoicePdfSections.js's own matching
// fix for the full trace): item.total is a Sequelize DECIMAL column, returned as a STRING - a
// bare `+ item.total`/`+= item.total` does JS string concatenation, not numeric addition, which
// Number() can't parse back - silently producing $0.00 on the PDF's SUMMARY page. Number(item.total)
// at every accumulation point below.
const pushTimeItem = (bucket, summary, item, employee, label, taskName) => {
  bucket.push({
    ...item,
    taskName: taskName || "",
    userTypeLabel: label,
    firstName: employee?.firstName || "",
    lastName: employee?.lastName || "",
  });
  summary.timeExpense.set(
    ADJUDICATION_LEGAL_LABEL,
    (summary.timeExpense.get(ADJUDICATION_LEGAL_LABEL) || 0) + Number(item.total),
  );
};

const pushAdminFeeItem = (buckets, summary, item, label) => {
  buckets.allAgenciesAdministrativeFee.push({ ...item, userTypeLabel: label });
  summary.administrativeFee += Number(item.total);
};

/**
 * @description
 * Combines an Adjudication Fees bucket's rows by professional - matches
 * InvoiceModel::combineData, which generateAttachment runs on time_alj/time_sa/
 * time_saalj (each independently) *only when that bucket has more than one row*
 * (its own `count($data[$key]) > 1` gate - a lone item is left exactly as-is,
 * matching that here). quantity/total are summed across a professional's rows;
 * rate/name/label are simply overwritten by each later row in encounter order,
 * same as legacy's own last-write-wins assignment (harmless in practice - a
 * professional's rate/name don't vary row to row within one bucket).
 * @param {*} items
 */
export const combineByProfessional = (items) => {
  if (items.length <= 1) return items;
  const grouped = new Map();
  items.forEach((item) => {
    const existing = grouped.get(item.professional);
    if (!existing) {
      // total normalized to a Number here (not left as the DB's own string) - the row this
      // becomes might never hit the += below (a lone row for this professional), but if a
      // second row DOES merge into it, existing.total needs to already be numeric.
      grouped.set(item.professional, { ...item, total: Number(item.total) });
      return;
    }
    existing.quantity = (existing.quantity || 0) + (item.quantity || 0);
    existing.total += Number(item.total);
    existing.rate = item.rate;
    existing.firstName = item.firstName;
    existing.lastName = item.lastName;
    existing.userTypeLabel = item.userTypeLabel;
    existing.taskName = item.taskName;
  });
  return [...grouped.values()];
};

// combineAndSortByParam's own role-label -> display-label normalization, applied to whichever
// string ends up as a group's key (see combineAdminFees below for why the key itself is left
// as-is, not pre-normalized).
const ADMIN_FEE_DISPLAY_LABEL = {
  ALJ: "Administrative Law Judge",
  SAALJ: "Special Assistant Administrative Law Judge",
  SA: "Staff Attorney",
  LAW_CLERK: "Law Clerk",
};
const ADMIN_FEE_SORT_ORDER = ["ALJ", "SAALJ", "SA"];

/**
 * @description
 * Combines the Administrative Fees bucket - matches
 * InvoiceModel::combineAndSortByParam($data['all_agencies_administrative_fee'],
 * 'user_type'), run unconditionally (no row-count gate, unlike combineData).
 * Groups by the row's *current* userTypeLabel string exactly as-is - by the time
 * legacy's own combine step runs, that string is already either a full label
 * ("Administrative Law Judge", from a real professional match) or an abbreviated
 * code ("ALJ"/"SAALJ"/"SA"/"LAW_CLERK", from the Role-select-with-no-employee-
 * match branch) - legacy's own 'judge'/'saalj'/'sa' raw-value special cases in
 * combineAndSortByParam can never actually match at this point (nothing upstream
 * ever stores those exact raw strings into user_type by the time this runs), so
 * the grouping key is really always just the label string verbatim. This means a
 * full-label row and an abbreviated-code row for the same real role do NOT merge
 * with each other (two different strings), even though both display the same
 * normalized name afterward - a real, if odd, legacy artifact, reproduced here
 * deliberately rather than "fixed". Sorted ALJ, SAALJ, SA first (legacy's own
 * fixed uksort order); anything else keeps its original encounter order after.
 * @param {*} items
 */
export const combineAdminFees = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
    const key = item.userTypeLabel;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...item, total: Number(item.total) });
      return;
    }
    existing.quantity = (existing.quantity || 0) + (item.quantity || 0);
    existing.total += Number(item.total);
    existing.rate = item.rate;
    existing.firstName = item.firstName;
    existing.lastName = item.lastName;
  });

  // Sort on the pre-normalization key (matches legacy's uksort, which sorts $aggregatedArray's
  // actual keys - the raw label strings, not the display names computed from them afterward).
  // array_search returning false (not in the fixed list) effectively keeps those keys in their
  // original relative order in PHP's stable sort; Map's own insertion order already gives us
  // that same relative order here, so unmatched keys just keep whatever position
  // Array.prototype.sort (stable, ES2019+) leaves them in.
  const rank = (key) => {
    const index = ADMIN_FEE_SORT_ORDER.indexOf(key);
    return index === -1 ? ADMIN_FEE_SORT_ORDER.length : index;
  };

  return [...grouped.entries()]
    .sort(([keyA], [keyB]) => rank(keyA) - rank(keyB))
    .map(([key, item]) => ({ ...item, userTypeLabel: ADMIN_FEE_DISPLAY_LABEL[key] || key }));
};

// Applies one already-matched time item to its bucket, given the display label already resolved
// for it - shared tail end of 3 of the 4 branches below (Admin. Fees when the task is AAA,
// otherwise its own Adjudication Fees rollup). rowState bundles the one row's own already-derived
// values (item/employee/task/isAaaTask); each branch's own leaf function (below) exists only so
// its nested if/else doesn't compound with handleTimeItem's own branch-selection complexity.
const applyResolvedTimeItem = (rowState, bucket, buckets, summary, label) => {
  const { item, employee, task, isAaaTask } = rowState;
  if (isAaaTask) pushAdminFeeItem(buckets, summary, item, label);
  else pushTimeItem(bucket, summary, item, employee, label, task?.taskName);
};

const applyAljTimeItem = (rowState, buckets, summary) => {
  applyResolvedTimeItem(rowState, buckets.timeAlj, buckets, summary, "Administrative Law Judge");
};

// The Role-select-with-no-employee-match AAA case - matches getRoleDetails' own raw
// subTypeRole->abbreviation mapping (judge -> "ALJ", everything else -> its own value
// uppercased, e.g. "sa" -> "SA", "saalj" -> "SAALJ").
const aaaRoleLabel = (rawSubTypeRole) => {
  if (!rawSubTypeRole) return "";
  if (rawSubTypeRole === "judge") return "ALJ";
  return rawSubTypeRole.toUpperCase();
};

const applyAaaRoleTimeItem = (rowState, roleById, buckets, summary) => {
  const role = roleById.get(rowState.item.professional);
  const label = aaaRoleLabel(role?.subTypeRole);
  pushAdminFeeItem(buckets, summary, rowState.item, label);
};

const applySaTimeItem = (rowState, subTypeRole, buckets, summary) => {
  const label = subTypeRole === "law_clerk" ? "Law Clerk" : "Staff Attorney";
  applyResolvedTimeItem(rowState, buckets.timeSa, buckets, summary, label);
};

const applySaaljTimeItem = (rowState, buckets, summary) => {
  applyResolvedTimeItem(rowState, buckets.timeSaalj, buckets, summary, "Special Assistant Administrative Law Judge");
};

/**
 * @description
 * Buckets one 'time' item into its Adjudication Fees / Administrative Fees
 * destination - the 4 mutually-exclusive time-item branches from
 * invoicePdfSections.js's own bucketing rules doc comment (judge/ALJ, the
 * AAA-Role-select case, SA/Staff-Attorney-or-Law-Clerk, SAALJ), each delegated
 * to its own leaf function above. Extracted purely to keep
 * buildInvoicePdfSections' own cognitive complexity down - no behavior change.
 * @param {*} item
 * @param {*} employee
 * @param {*} context
 */
export const handleTimeItem = (item, employee, { taskById, roleById, buckets, summary }) => {
  const userType = employee?.userType;
  const subTypeRole = employee?.subTypeRole;
  const task = taskById.get(item.taskId);
  const isAaaTask = task?.taskAbbreviation === "AAA";
  const rowState = { item, employee, task, isAaaTask };

  if (userType === "judge" && subTypeRole === "judge") {
    applyAljTimeItem(rowState, buckets, summary);
    return;
  }
  if (!employee && isAaaTask) {
    applyAaaRoleTimeItem(rowState, roleById, buckets, summary);
    return;
  }
  if (userType === "sa") {
    applySaTimeItem(rowState, subTypeRole, buckets, summary);
    return;
  }
  if (userType === "judge" && subTypeRole === "saalj") {
    applySaaljTimeItem(rowState, buckets, summary);
  }
};
