/*
 * Note: Keep sync with frontend/src/constants/constant-messages.js
 */
export const MESSAGES = {
  SHIFT_OVERLAP:
    "Please review the board as it may contain overlapping shifts.",
  USER_NOT_ACTIVE: "user_not_active",
  USER_NOT_FOUND: "user_not_found",
  INVALID_PASSWORD: "invalid_password",
  ACCOUNT_LOCKED: "account_locked",
};

export const STANDARD_PRICE = { MONTHLY: 8, ANNUALLY: 6 };

export const BILLING_PERIOD_STATUS = {
  SCHEDULED: "scheduled",
  OPEN: "open",
  IN_REVIEW: "in review",
  CLOSED: "closed",
};

export const FAILED_LOGIN_ATTEMPT_MAX_LIMIT = 5;

export const CASE_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
  REOPEN: "reopen",
};

// Task: https://app.clickup.com/t/86du33vbq start
export const AUDIT_LOG_MODULE_NAME = {
  CASES: "cases",
  USERS: "users",
  PARTY_TYPES: "party_types",
  CASE_TYPES: "case_types",
  DOCUMENT_TYPES: "document_types",
  LOCATIONS: "locations",
  AGENCIES: "agencies",
  TEMPLATES: "templates",
  INVOICES: "invoices",
  PARTIES: "parties",
  TIME_ENTRIES: "time_entries",
  EXPENSES: "expenses",
  BILLING_PERIODS: "billing_periods",
  AGENCY_CONTACTS: "agency_contacts",
  ROLES: "roles",
  PUBLIC_EFILE_DOCUMENT: "public_efile_documents",
  CASE_REQUESTS: "agency_portal_case_request",
};
// Task: https://app.clickup.com/t/86du33vbq end

export const AUDIT_LOG_ACTIONS = {
  CREATED: "created",
  ADDED: "added",
  EDITED: "edited",
  DELETED: "deleted",
  CLOSED: "closed",
  RESCHEDULED: "rescheduled",
  CANCELED: "canceled",
  REMOVED: "removed",
  INVITED: "invited",
  RESENT_INVITATION: "resent_invitation",
  CANCELED_INVITATION: "canceled_invitation",
  CHANGED_STATUS: "changed_status",
  CLONED: "cloned",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const CASE_FILE_PATH = "internal-portal/case-files/";
export const TEMPLATE_FILE_PATH = "template-files/";

export const COURT_EVENT_STATUS = {
  SCHEDULED: "Scheduled",
  RESCHEDULED: "Rescheduled",
  CANCELED: "Canceled",
  COMPLETED: "Completed",
};

// keep in sync with public portal's constant-messages.js
export const CASE_EFILE_STATUS = {
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const TEMPLATES_STATUS = {
  ACTIVE: "Active",
  ARCHIVE: "Archive",
  DRAFT: "Draft",
};

export const TEMPLATE_SETTING_PATH = "template-settings-files";
export const PORTAL_NAMES = {
  OSAH_INTERNAL: "osah_internal",
  PUBLIC_PORTAL: "public_portal",
  AGENCY_PORTAL: "agency_portal",
};

export const AUDIT_LOG_CASES_MODULE = {
  CASES: "cases",
  COURT_EVENTS: "court_events",
  DOCUMENTS: "documents",
  PARTY_DETAILS: "party_details_case",
  MINOR_CHILDREN_PARTY_DETAILS: "minor_children_details_case",
  PUBLIC_EFILE_DOCUMENTS: "public_efile_documents",
};

// Document status constants for rejected documents reports
export const DOCUMENT_STATUS = {
  REJECTED: "Rejected",
  APPROVED: "Approved",
  PENDING: "Pending",
};

// Scan status constants for form1_documents table
export const SCAN_STATUS = {
  NOT_SCANNED: "0",
  SCANNED: "1",
  REJECTED: "2",
};

// Platform IDs for ecourt_external_documents table (file_added_from field)
// Note: file_added_from is VARCHAR in database, so values are strings
// See: backend/api/models/EcourtExternalDocuments.js
export const PLATFORM_IDS = {
  ECOURT: "1",  // eCourt platform
  PUBLIC_ACCESS: "2",  // Public Access platform
  AGENCY: "3",  // Agency platform (SRTA, DFCS-Medicaid, DFCS-Non-Medicaid)
};
