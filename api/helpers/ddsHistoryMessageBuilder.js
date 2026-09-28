/**
 * Builds the HTML audit-trail messages written to ddshistory (DDSHistory) by
 * the party/notes/permit actions below. Field labels/message wording port
 * form1-controller.js's own inline HistoryMessage construction
 * (updateHistory() call sites) as closely as this port's simplified,
 * full-current-values approach allows -- legacy's party-edit message diffs
 * old vs. new field values; this logs the saved values instead, since nothing
 * else in this port needs that diff and it would cost an extra fetch per edit.
 */

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const line = (label, value) =>
  value ? `<p>${escapeHtml(label)}: ${escapeHtml(String(value))}</p>` : '';

const PARTY_FIELD_LABELS = [
  ['contactType', 'Contact Type'],
  ['lastName', 'Last Name'],
  ['firstName', 'First Name'],
  ['middleName', 'Middle Name'],
  ['attorneyBar', 'Attorney Bar'],
  ['company', 'Company Name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['fax', 'Fax'],
  ['address1', 'Address1'],
  ['address2', 'Address2'],
  ['city', 'City'],
  ['state', 'State'],
  ['zip', 'Zip Code'],
  ['altAddress1', 'Second Address1'],
  ['altAddress2', 'Second Address2'],
  ['altCity', 'Second City'],
  ['altState', 'Second State'],
  ['altZipCode', 'Second Zip Code'],
];

const buildPartyFieldLines = (partydetails) =>
  PARTY_FIELD_LABELS.map(([field, label]) => line(label, partydetails[field])).join('');

export const buildPartyAddedMessage = (partydetails, licenseNumber) => {
  const license = partydetails.contactType === 'Petitioner' ? line('License Number', licenseNumber) : '';
  return `<p class="history-title">Party has been added with the following:</p>${buildPartyFieldLines(partydetails)}${license}`;
};

export const buildPartyUpdatedMessage = (partydetails, licenseNumber) => {
  const license = partydetails.contactType === 'Petitioner' ? line('License Number', licenseNumber) : '';
  return `<p class="history-title">${escapeHtml(partydetails.contactType)} information has been updated/modified for:</p>${buildPartyFieldLines(partydetails)}${license}`;
};

export const buildPartyDeletedMessage = (party) => {
  const name = [party.firstName, party.lastName].filter(Boolean).join(' ');
  return `<p class="history-title">Party has been Deleted:</p>${line('Name', name)}${line('Contact Type', party.typeOfContact)}`;
};

// Ports addattorneyrespondentAction()'s own inline history message (DdsForm1Controller.php
// lines 1346-1354) -- field/label list matches legacy's $historyarray exactly, applied to the
// attorneybycase_master template row (attorneyByCaseMasterModel.js) that was copied into the
// new form1_parties row.
const ATTORNEY_RESPONDENT_FIELD_LABELS = [
  ['typeOfContact', 'Contact Type'],
  ['lastName', 'Last Name'],
  ['firstName', 'First Name'],
  ['title', 'Title'],
  ['company', 'Company Name'],
  ['address1', 'Address1'],
  ['address2', 'Address2'],
  ['city', 'City'],
  ['state', 'State'],
  ['zip', 'Zip Code'],
  ['email', 'Email'],
];

export const buildAttorneyRespondentAddedMessage = (attorneyInfo) => {
  const fields = ATTORNEY_RESPONDENT_FIELD_LABELS.map(([field, label]) =>
    line(label, attorneyInfo[field]),
  ).join('');
  return `<p class="history-title">Party has been added with following:</p>${fields}`;
};

export const buildNoteAddedMessage = (summaryNotes) =>
  `<p class="history-title">Notes has been added with the following data:</p><p>${escapeHtml(summaryNotes)}</p>`;

export const buildNoteUpdatedMessage = (summaryNotes) =>
  `<p class="history-title">Notes has been updated with the following data:</p><p>${escapeHtml(summaryNotes)}</p>`;

export const buildNoteDeletedMessage = (summaryNotes) =>
  `<span>Deleted Notes!</span><p>${escapeHtml(summaryNotes)}</p>`;

// changedFields: array of [label, value] pairs already resolved by the caller (only fields
// that actually changed), matching legacy's own diff-then-log behavior for this one action.
export const buildPermitUpdatedMessage = (changedFields) => {
  if (!changedFields.length) return '';
  const fields = changedFields.map(([label, value]) => line(label, value)).join('');
  return `<p class="history-title">The permit has been updated with the following information:</p>${fields}`;
};

// Diffs the Temporary Permit save's before/after values and returns the changed-fields
// message (or '' if nothing changed) -- matches form1-controller.js's own
// diff-then-log behavior for updatedocketAction(), computed here rather than in
// ddsForm1Service.js to keep that file under this project's 300-line limit.
export const buildPermitChangeMessage = (previous, next) => {
  const changed = [];

  if (next.agencyRefNumber && previous.agencyRefNumber !== next.agencyRefNumber) {
    changed.push(['Agency Ref Number', next.agencyRefNumber]);
  }
  if (previous.eligibility !== next.eligibility) {
    changed.push(['Eligible for Permit?', next.eligibility === '1' ? 'Yes' : 'No']);
  }
  if (next.effectiveDate && previous.effectiveDate !== next.effectiveDate) {
    changed.push(['Permit Effective Date', next.effectiveDate]);
  }
  if (next.expiryDate && previous.expiryDate !== next.expiryDate) {
    changed.push(['Permit Expiration Date', next.expiryDate]);
  }
  if (next.dob && previous.dob !== next.dob) {
    changed.push(['Date of Birth', next.dob]);
  }
  if (next.incidentDate && previous.incidentDate !== next.incidentDate) {
    changed.push(['Incident Date', next.incidentDate]);
  }

  return buildPermitUpdatedMessage(changed);
};
