/*
  Description : Docket History-tab entries written when a party is added or
                edited via createPartyDocket/updatePartyDocket
                (api/controllers/admin/docketPartyController.js).
                Both templates are built generically from whatever fields the
                caller actually wrote to the DB (the create payload / update
                payload / raw previous-row), rather than a hand-maintained
                per-table field allowlist — a fixed EXCLUDE_KEYS set strips
                bookkeeping columns (ids, FKs, timestamps, flags) that are
                common across all four party tables, and every remaining key
                is humanized into a label automatically. This mirrors how the
                legacy PHP built these entries: it looped over the actual
                row/payload object and only unset a handful of housekeeping
                keys, rather than keeping a separate list of "fields to show"
                in sync with each table's columns.
                  - the "add" entry mirrors legacy addHistory()'s case
                    'addParties': a flat "Party has been added with
                    following:" dump of Docket Number, Contact Type, then
                    every non-blank field in the inserted row. No diffing —
                    it's a new row.
                  - the "update" entry mirrors OsahformController::
                    docketPartyHistory() (OsahformController.php:4239, called
                    from editpartydetailsAction): diffs the pre-update DB row
                    against the submitted payload and only includes fields
                    that actually changed, listing the new value under a
                    "has been updated/modified for:" heading followed by a
                    "Previous Entry:" heading with the old values of those same
                    fields. If the contact type itself changed, every
                    (non-excluded) field on each side is listed instead of
                    just the diffed ones, since the old and new records live
                    in different tables and aren't a like-for-like comparison
                    (e.g. Officer -> Minor/children has no shared columns).
*/
import History from "../../models/History.js";
import { localNow } from "../timeUtils.js";
import { escapeHtml } from "../../utilities/htmlEscape.js";

// value can come from user-submitted party fields (address1, email, etc.) and
// is stored/rendered as HTML in the docket History tab — escape it to prevent
// stored XSS. label is always a hardcoded/derived string, never user input.
const historyRow = (label, value) =>
  label && value !== undefined && value !== null && value !== ""
    ? `<p><span class="history-label">${label}:</span><span class="history-data">${escapeHtml(value)}</span></p>`
    : "";

// Like historyRow, but always renders the label even when the value is
// blank/undefined/null. Used only for the update-diff rows (insertPartyUpdated
// History's changedKeys), where every row is a field already confirmed to
// have changed — e.g. addressLine1/city/state/zip get unregistered client-side
// (and so arrive undefined) when a party switches to an international
// address. That's a real change worth showing, not a field to silently drop;
// dropping it left the "updated to" side of the entry blank while the
// "Previous Entry" side still showed the old value, making the diff look
// broken instead of showing what the field was cleared to.
const historyRowAlways = (label, value) =>
  label
    ? `<p><span class="history-label">${label}:</span><span class="history-data">${escapeHtml(value ?? "")}</span></p>`
    : "";

// Bookkeeping columns common to minordetails/peopledetails/agencycaseworkerbycase/
// attorneybycase that are never shown as their own history row: primary/foreign
// keys, timestamps, and flags nobody edits through this form. typeOfContact is
// excluded here because it's rendered as its own "Contact Type" row (add) or
// folded into the section title (edit) instead of a generic field row.
// isInternationalAddr is excluded because internationalAddress (the actual
// text) already conveys the change; showing the raw "0"/"1" flag alongside it
// is redundant.
// Matched case-insensitively (see rowKeys below) since caseId in particular
// can arrive as "caseId" (camelCase attribute name) or "caseid" (raw db
// column name) depending on the source object — it's never a "visible" party
// field either way (it's already shown via the "Docket Number" header row on
// add, or implied by which docket the entry lives under), so it must never
// surface as its own row regardless of casing.
const EXCLUDE_KEYS = new Set(
  [
    "peopleId",
    "minorId",
    "sno",
    "attorneyId",
    "contactId",
    "caseId",
    "docketCaseId",
    "typeOfContact",
    "createdDate",
    "modifiedDate",
    "externalUserId",
    "eServices",
    "isGeorgiaState",
    "mailToReceive",
    "mailToReceive1",
    "isInternationalAddr",
  ].map((key) => key.toLowerCase()),
);

// A handful of keys whose auto-humanized form doesn't read well; everything
// else is derived from the key itself so a newly added column shows up in
// history automatically instead of silently being dropped until someone
// remembers to add it to a field list.
const LABEL_OVERRIDES = {
  dobYear: "DOB Year",
};

// camelCase/db-style key -> "Human Readable" label, e.g. "lastName" ->
// "Last Name", "address1" -> "Address 1", "altZipCode" -> "Alt Zip Code".
const humanizeLabel = (key) =>
  LABEL_OVERRIDES[key] ||
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

// Non-excluded, in-object-order keys of `obj`, or [] if `obj` is nullish.
const rowKeys = (obj) =>
  obj
    ? Object.keys(obj).filter((key) => !EXCLUDE_KEYS.has(key.toLowerCase()))
    : [];

async function insertPartyHistory(caseId, description, username, transaction) {
  const now = localNow();
  await History.create(
    {
      caseId,
      docketCaseId: caseId,
      description,
      modifiedBy: username || "",
      date: now.format("YYYY-MM-DD"),
      createdTime: now.format("HH:mm:ss"),
    },
    { transaction },
  );
}

/**
 * Logs a "Party has been added with following:" history entry: every
 * non-blank field of `party` (typically the exact object just written to the
 * party table). Docket Number/Contact Type aren't repeated as rows here —
 * they're already shown elsewhere in the History tab. Mirrors legacy
 * addHistory()'s case 'addParties' — a flat dump of the just-inserted row,
 * not a diff.
 * @param {number} caseId
 * @param {string} contactType
 * @param {object} party - the fields written to the party row (housekeeping
 *   keys in EXCLUDE_KEYS are skipped automatically; safe to pass the whole
 *   insert payload)
 * @param {string} username - modifiedBy for the history row
 * @param {import('sequelize').Transaction} [transaction]
 */
export async function insertPartyAddedHistory(
  caseId,
  contactType,
  party,
  username,
  transaction,
) {
  const rows = rowKeys(party)
    .map((key) => historyRow(humanizeLabel(key), party[key]))
    .join("");
  const description = `<p class="history-title">Party has been added with following:</p><br/>${rows}`;
  await insertPartyHistory(caseId, description, username, transaction);
}

/**
 * Logs a "Party has been Deleted:" history entry: every non-blank field of
 * `party`. Mirrors insertPartyAddedHistory in shape (Docket Number/Contact
 * Type aren't repeated as rows — already shown elsewhere in the History
 * tab), just for the opposite lifecycle event — `party` here is the row as
 * it existed immediately before being destroyed (callers must fetch it
 * before issuing the delete), since there's nothing left in the DB to read
 * from afterward.
 * @param {number} caseId
 * @param {string} contactType
 * @param {object|null} party - the party row as it existed right before
 *   deletion (housekeeping keys in EXCLUDE_KEYS are skipped automatically);
 *   null logs an empty field list.
 * @param {string} username - modifiedBy for the history row
 * @param {import('sequelize').Transaction} [transaction]
 */
export async function insertPartyDeletedHistory(
  caseId,
  contactType,
  party,
  username,
  transaction,
) {
  const rows = rowKeys(party)
    .map((key) => historyRow(humanizeLabel(key), party[key]))
    .join("");
  const description = `<p class="history-title">Party has been Deleted:</p><br/>${rows}`;
  await insertPartyHistory(caseId, description, username, transaction);
}

/**
 * Diffs `previousParty` (the party's DB row before the update) against
 * `newParty` (the submitted payload) and, if at least one field actually
 * changed OR the contact type itself changed, logs one history entry
 * containing the new values under a "has been updated/modified for:"
 * heading (titled with the *new* contact type) and the old values under a
 * "Previous Entry:" heading (titled with the *previous* contact type).
 * When the contact type changed, every (non-excluded) field on each side is
 * listed (rather than only the diffed ones), since the old and new records
 * may live in different tables and aren't a like-for-like comparison.
 * No-op if nothing changed.
 * @param {number} caseId
 * @param {string} contactType - the party's contact type after the update
 * @param {object|null} previousParty - party row as it existed before the
 *   update (e.g. a raw Sequelize row — extra columns beyond what's in
 *   `newParty` are fine, EXCLUDE_KEYS strips the housekeeping ones)
 * @param {object} newParty - fields written to the party row (e.g. the
 *   exact update/insert payload)
 * @param {string} username - modifiedBy for the history row
 * @param {import('sequelize').Transaction} [transaction]
 * @param {string} [previousContactType] - the party's contact type before the
 *   update, if different from `contactType`. Defaults to `contactType`.
 */
export async function insertPartyUpdatedHistory(
  caseId,
  contactType,
  previousParty,
  newParty,
  username,
  transaction,
  previousContactType = contactType,
) {
  const contactTypeChanged = previousContactType !== contactType;

  let newKeys = rowKeys(newParty);
  let oldKeys = newKeys;
  if (contactTypeChanged) {
    oldKeys = rowKeys(previousParty);
  } else {
    newKeys = newKeys.filter(
      (key) =>
        String(previousParty?.[key] ?? "") !== String(newParty[key] ?? ""),
    );
    if (newKeys.length === 0) return;
    oldKeys = newKeys;
  }

  // Diffed rows (contact type unchanged) are each a field already confirmed to
  // have changed, so always render both sides even if one is now blank —
  // that's the change. The full-field dump (contact type changed) keeps
  // suppressing blanks, since most of a differently-shaped table's fields
  // won't be relevant.
  const rowRenderer = contactTypeChanged ? historyRow : historyRowAlways;
  const newRows = newKeys
    .map((key) => rowRenderer(humanizeLabel(key), newParty[key]))
    .join("");
  const oldRows = oldKeys
    .map((key) => rowRenderer(humanizeLabel(key), previousParty?.[key]))
    .join("");
  const escapedContactType = escapeHtml(contactType);
  const escapedPreviousContactType = escapeHtml(previousContactType);

  const description =
    `<p class="history-title">${escapedContactType} party information has been updated/modified for:</p><br/>${newRows}` +
    `<br><p class="history-title"><strong>Previous Entry: </strong></p><br/>` +
    `<p class="history-title">${escapedPreviousContactType} party information :</p><br/>${oldRows}`;

  await insertPartyHistory(caseId, description, username, transaction);
}
