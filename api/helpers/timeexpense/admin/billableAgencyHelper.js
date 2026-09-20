/*
  Created by  : Snehal Narkar
  Date        : 2026-08-10
  Description : Admin Billable Agencies helper (Time & Expense). Mirrors PHP
                TimeExpenseController's getBillableAgencyListAction /
                getBillableAgencyDetailsAction / saveBillableAgencyFormAction /
                setBillableAgencyStatusAction, via Sequelize instead of raw SQL.
                Search is client-side only (matches legacy Angular's `filter:search_users`
                over the full list) — the list endpoint has no server-side search filter.
*/
import BillableAgency from '../../../models/timeexpense/invoicing/BillableAgency.js';

// Codes legacy disables editing for (system/reserved rows) — getBillableAgencyListAction.
const NON_EDITABLE_AGENCY_CODES = new Set(['AAA', 'HOLIDAY', 'LEAVE', 'NON-BILL']);

function mapAgencyRow(row) {
  const plain = row?.toJSON ? row.toJSON() : row;
  return {
    id: plain.id,
    agencyDescription: plain.agencyDescription || '',
    agencyCode: plain.agencyCode || '',
    parentAgency: plain.parentAgency || '',
    firstName: plain.firstName || '',
    lastName: plain.lastName || '',
    middleName: plain.middleName || '',
    email: plain.email || '',
    addressLineOne: plain.addressLineOne || '',
    addressLineTwo: plain.addressLineTwo || '',
    city: plain.city || '',
    state: plain.state || '',
    zipcode: plain.zipcode || '',
    isActive: plain.isActive ?? '1',
    createdDate: plain.createdDate,
    updatedDate: plain.updatedDate,
    firstNameTwo: plain.firstNameTwo || '',
    lastNameTwo: plain.lastNameTwo || '',
    middleNameTwo: plain.middleNameTwo || '',
    emailTwo: plain.emailTwo || '',
    addressLineBillingOne: plain.addressLineBillingOne || '',
    addressLineBillingTwo: plain.addressLineBillingTwo || '',
    cityTwo: plain.cityTwo || '',
    stateTwo: plain.stateTwo || '',
    zipcodeTwo: plain.zipcodeTwo || '',
    firstNameThree: plain.firstNameThree || '',
    lastNameThree: plain.lastNameThree || '',
    emailThree: plain.emailThree || '',
    addressLineBillingThree: plain.addressLineBillingThree || '',
    addressLineBillingFour: plain.addressLineBillingFour || '',
    cityThree: plain.cityThree || '',
    stateThree: plain.stateThree || '',
    zipcodeThree: plain.zipcodeThree || '',
  };
}

function mapListRow(row) {
  const mapped = mapAgencyRow(row);
  return {
    ...mapped,
    isDisabled: NON_EDITABLE_AGENCY_CODES.has(mapped.agencyCode),
  };
}

/** Fetch all billable agencies, ordered by agency code. Search filtering happens client-side. */
export async function getBillableAgencyList() {
  const rows = await BillableAgency.findAll({ order: [['agencyCode', 'ASC']] });
  return rows.map(mapListRow);
}

/** Fetch a single billable agency's details by id. Returns null when not found. */
export async function getBillableAgencyDetails(id) {
  const agency = await BillableAgency.findByPk(id);
  if (!agency) return null;

  const mapped = mapAgencyRow(agency);
  return {
    ...mapped,
    // Only relevant to the Add/Edit form — whether the billing-contact-2/3 sections
    // should render expanded, derived the same way legacy's Angular controller does
    // after its details fetch (non-empty firstNameTwo/firstNameThree).
    billingContactOneEnabled: !!mapped.firstNameTwo,
    billingContactTwoEnabled: !!mapped.firstNameThree,
  };
}

// Blanks a billing-contact field group when its "enabled" toggle is off — mirrors legacy,
// which clears the _two/_three columns rather than leaving stale data when a contact
// section is removed from the form before saving. Contact 1 and Contact 2 are the same
// shape (an "enabled" flag gating a fixed set of field names), just against different
// column names, so both are driven from this one function.
function contactFields(formData, enabledKey, fieldNames) {
  if (!formData[enabledKey]) {
    return Object.fromEntries(fieldNames.map((name) => [name, '']));
  }

  return Object.fromEntries(fieldNames.map((name) => [name, formData[name] || '']));
}

const BILLING_CONTACT_ONE_FIELDS = [
  'firstNameTwo',
  'lastNameTwo',
  'middleNameTwo',
  'emailTwo',
  'addressLineBillingOne',
  'addressLineBillingTwo',
  'cityTwo',
  'stateTwo',
  'zipcodeTwo',
];

const BILLING_CONTACT_TWO_FIELDS = [
  'firstNameThree',
  'lastNameThree',
  'emailThree',
  'addressLineBillingThree',
  'addressLineBillingFour',
  'cityThree',
  'stateThree',
  'zipcodeThree',
];

function buildAgencyData(formData) {
  const now = new Date();
  return {
    agencyDescription: formData.agencyDescription,
    agencyCode: formData.agencyCode,
    parentAgency: formData.parentAgency || '',
    firstName: formData.firstName,
    lastName: formData.lastName,
    middleName: formData.middleName || '',
    email: formData.email,
    addressLineOne: formData.addressLineOne,
    addressLineTwo: formData.addressLineTwo || '',
    city: formData.city,
    state: formData.state,
    zipcode: formData.zipcode,
    updatedDate: now,
    ...contactFields(formData, 'billingContactOneEnabled', BILLING_CONTACT_ONE_FIELDS),
    ...contactFields(formData, 'billingContactTwoEnabled', BILLING_CONTACT_TWO_FIELDS),
  };
}

/**
 * Create or update a billable agency depending on whether formData.id is present.
 * The frontend re-fetches the list after a save rather than reading the saved row back
 * (see useBillableAgencyForm.js), so this returns just the id — not the full mapped row.
 */
export async function saveBillableAgency(formData) {
  const data = buildAgencyData(formData);

  if (formData.id) {
    const agency = await BillableAgency.findByPk(formData.id);
    if (!agency) return null;

    await agency.update(data);
    return { id: agency.id };
  }

  const agency = await BillableAgency.create({ ...data, createdDate: new Date() });
  return { id: agency.id };
}

/**
 * Toggle a billable agency's active status. Returns null when not found.
 * The frontend updates its row from the requested status on a successful response (see
 * useAdminEntityList.js), so this returns just id/isActive — not the full mapped row.
 */
export async function setBillableAgencyStatus(id, statusActiveInActive) {
  const agency = await BillableAgency.findByPk(id);
  if (!agency) return null;

  await agency.update({ isActive: statusActiveInActive });
  return { id: agency.id, isActive: agency.isActive };
}
