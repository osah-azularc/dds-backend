// This file's permission strings must stay in sync with
// seeders/permissionSeeder.js (which imports these constants directly, so it
// can't drift on its own) and with the `permissions` table itself, which is
// maintained by hand directly in the database.

// DDS Module
export const DDS_PERMISSIONS = {
  HOME_VIEW: "dds.home_view",
  DOCKET_SEARCH: "dds.docket_search",
  DOCKET_VIEW: "dds.docket_view",
  DOCKET_CREATE: "dds.docket_create",
  DOCKET_EDIT: "dds.docket_edit",
  PARTY_CREATE: "dds.party_create",
  PARTY_EDIT: "dds.party_edit",
  PARTY_DELETE: "dds.party_delete",
  ATTORNEY_RESPONDENT_ADD: "dds.attorney_respondent_add",
  LICENSE_NUMBER_UPDATE: "dds.license_number_update",
  FORM1205_SEARCH: "dds.form1205_search",
  NOTES_CREATE: "dds.notes_create",
  HISTORY_VIEW: "dds.history_view",
  PERMITS_PRINT: "dds.permits_print",
  PERMITS_GENERATE_PDF: "dds.permits_generate_pdf",
  DPS_UPDATE: "dds.dps_update",
  DOCKET_SEARCH_DOCUMENTS_DOWNLOAD: "dds.docket_search_documents_download",
  REJECTED_FORMS_VIEW: "dds.rejected_forms_view",
  DOCKET_SEARCH_EXPORT_DATA: "dds.docket_search_export_data",
  DOCKET_DELETE: "dds.docket_delete",
};

// Combined map for flat lookups, e.g. PERMISSIONS.DDS.HOME_VIEW
export const PERMISSIONS = {
  DDS: DDS_PERMISSIONS,
};
