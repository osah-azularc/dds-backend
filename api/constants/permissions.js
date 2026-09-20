// This file's permission strings must stay in sync with the frontend's flat
// copy at ecourt-frontend/src/utilities/permissions.js (PERMISSIONS map) and
// with seeders/permissionSeeder.js (which imports these constants directly,
// so it can't drift on its own). Run `npm run check:permission-catalogs`
// after adding/renaming a permission to verify the frontend copy agrees.

// Home Module
export const HOME_PERMISSIONS = {
  VIEW: "home.view",
  UPCOMING_CALENDARS_VIEW: "home.upcoming_calendars.view",
  OPEN_COMPLEX_CASES_VIEW: "home.open_complex_cases.view",
  DOCKETS_RECEIVED_VIEW: "home.dockets_received.view",
  OPEN_CASES_DECISION_VIEW: "home.open_cases_decision.view",
  CLERK_VIEW: "home.clerk.view",
  CLERK_EXPORT_BULK_DOCS: "home.clerk.export_bulk_docs",
  CLERK_CREATE_DOCKETS: "home.clerk.create_dockets",
  DOCKETS_SEARCH_VIEW: "home.dockets_search.view",
  ADDITIONAL_SEARCH_EXPORT: "home.additional_search.export",
  ADDITIONAL_SEARCH_BULK_EDIT: "home.additional_search.bulk_edit",
  ADDITIONAL_SEARCH_DOWNLOAD_FILES: "home.additional_search.download_files",
  ADDITIONAL_SEARCH_BULK_EMAIL: "home.additional_search.bulk_email",
  ADDITIONAL_SEARCH_BULK_DESIGNATION: "home.additional_search.bulk_designation",
};

// Calendar Management Module
// NOTE: the DB row backing VIEW was renamed from "calendar.view" (resource
// "calendar") to "calendar_management.view" (resource "calendar_management")
// on 2026-08-27. The export name here is kept as CALENDAR_PERMISSIONS so
// existing imports don't break, but the string value now matches the renamed
// DB row. permissions/role_permissions are maintained by hand directly in the
// database now — there is no seeder; this file is the source of truth for the
// exact `name` string each permission must have.
export const CALENDAR_PERMISSIONS = {
  VIEW: "calendar_management.view",
  CALENDAR_MANAGEMENT: "calendar_management.calendar_management",
  CHECKIN: "calendar_management.checkin",
  HISTORY: "calendar_management.history",
  PAST_CALENDARS: "calendar_management.past_calendars",
  UPCOMING_CALENDAR: "calendar_management.upcoming_calendar",
};

// Docket Module
export const DOCKET_PERMISSIONS = {
  VIEW: "docket.view",
  DOCKET_CREATE: "docket.docket_create",
  DOWNLOAD: "docket.download",
  EDIT: "docket.edit",
  HISTORY: "docket.history",
  NOTES: "docket.notes",
  NOTIFY_ME: "docket.notify_me",
  PENDING_REJECTED: "docket.pending_rejected",
};

// Agencies Module
export const AGENCIES_PERMISSIONS = {
  VIEW: "agencies.view",
  BULK_UPLOAD: "agencies.bulk_upload",
  DHS_FILES: "agencies.dhs_files",
  PRINT_DDS: "agencies.print_dds",
};

// Reports Module
export const REPORTS_PERMISSIONS = {
  VIEW: "reports.view",
};

// Review Form 1 Module
export const REVIEWFORM1_PERMISSIONS = {
  VIEW: "reviewform1.view",
};

// Bulk Docs Module (standalone clerk-tabs permission, separate from
// HOME_PERMISSIONS.CLERK_EXPORT_BULK_DOCS). This is the current form of what
// used to be "docs.export" — same feature, permission was renamed/moved here.
export const BULK_DOCS_PERMISSIONS = {
  VIEW: "bulk_docs.view",
};

// Admin Module
export const ADMIN_PERMISSIONS = {
  VIEW: "admin.view",
  AGENCY_CASETYPES: "admin.agency_casetypes",
  ASSIGNS_DOCS_TO_CMA: "admin.assigns_docs_to_cma",
  BULK_COMM: "admin.bulk_comm",
  CALENDAR_MGMT: "admin.calendar_mgmt",
  DOCUMENTS: "admin.documents",
  HEARING_LOCATIONS: "admin.hearing_locations",
  PARTIES: "admin.parties",
  TANDE: "admin.tande",
  USERS: "admin.users",
};

// eFiling Module
export const EFILING_PERMISSIONS = {
  VIEW: "efiling.view",
  HISTORY: "efiling.history",
  PENDING_DOCS_FOR_APPROVAL: "efiling.pending_docs_for_approval",
};

// Time And Expense Module
// NOTE: the DB row backing VIEW was renamed from "time_and_expense.view"
// (resource "time_and_expense") to "timeandexpense.view" (resource
// "timeandexpense") on 2026-08-27. The export name here is kept as
// TIME_AND_EXPENSE_PERMISSIONS so existing imports don't break, but the
// string values now match the renamed DB row.
//
// api/middlewares/rbacMiddleware.js's requirePermission() takes the full
// dotted `name` (e.g. HOME_PERMISSIONS.ADDITIONAL_SEARCH_BULK_EMAIL), not a
// separate resource/action pair — this file is its only source of truth, so
// every route-level permission check should import from here rather than
// typing the string inline.
export const TIME_AND_EXPENSE_PERMISSIONS = {
  VIEW: "timeandexpense.view",
  EXPENSE_ENTRY: "timeandexpense.expense_entry",
  INVOICING: "timeandexpense.invoicing",
  SETTINGS: "timeandexpense.settings",
  TIME_ENTRY: "timeandexpense.time_entry",
};

// Combined map for flat lookups, e.g. PERMISSIONS.HOME.VIEW
export const PERMISSIONS = {
  HOME: HOME_PERMISSIONS,
  CALENDAR: CALENDAR_PERMISSIONS,
  DOCKET: DOCKET_PERMISSIONS,
  AGENCIES: AGENCIES_PERMISSIONS,
  REPORTS: REPORTS_PERMISSIONS,
  REVIEWFORM1: REVIEWFORM1_PERMISSIONS,
  BULK_DOCS: BULK_DOCS_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  EFILING: EFILING_PERMISSIONS,
  TIME_AND_EXPENSE: TIME_AND_EXPENSE_PERMISSIONS,
};
