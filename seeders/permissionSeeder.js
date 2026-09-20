import Permission from "../api/models/Permission.js";
import {
  HOME_PERMISSIONS,
  CALENDAR_PERMISSIONS,
  DOCKET_PERMISSIONS,
  REPORTS_PERMISSIONS,
  AGENCIES_PERMISSIONS,
  REVIEWFORM1_PERMISSIONS,
  BULK_DOCS_PERMISSIONS,
  ADMIN_PERMISSIONS,
  EFILING_PERMISSIONS,
  TIME_AND_EXPENSE_PERMISSIONS,
} from "../api/constants/permissions.js";

// Mirrors the current `permissions` table exactly (live DB dump, 2026-09-02
// — 53 rows, verified 1:1 against api/constants/permissions.js with no gaps
// either direction). permissions/role_permissions are maintained by hand
// directly in the database now; this seeder exists to stand up a fresh
// environment with the same data, not to be edited when a permission
// changes — add the new permission in api/constants/permissions.js and the
// database first, then re-run the generation to pick it up.
const permissions = [

  {
    name: HOME_PERMISSIONS.VIEW,
    resource: "home",
    action: "view",
  },

  {
    name: HOME_PERMISSIONS.UPCOMING_CALENDARS_VIEW,
    resource: "home",
    action: "upcoming_calendars_view",
  },

  {
    name: HOME_PERMISSIONS.OPEN_COMPLEX_CASES_VIEW,
    resource: "home",
    action: "open_complex_cases_view",
  },

  {
    name: HOME_PERMISSIONS.DOCKETS_RECEIVED_VIEW,
    resource: "home",
    action: "dockets_received_view",
  },

  {
    name: HOME_PERMISSIONS.OPEN_CASES_DECISION_VIEW,
    resource: "home",
    action: "open_cases_decision_view",
  },

  {
    name: HOME_PERMISSIONS.CLERK_VIEW,
    resource: "home",
    action: "clerk_view",
  },

  {
    name: HOME_PERMISSIONS.CLERK_EXPORT_BULK_DOCS,
    resource: "home",
    action: "clerk_export_bulk_docs",
  },

  {
    name: HOME_PERMISSIONS.CLERK_CREATE_DOCKETS,
    resource: "home",
    action: "clerk_create_dockets",
  },

  {
    name: HOME_PERMISSIONS.DOCKETS_SEARCH_VIEW,
    resource: "home",
    action: "dockets_search_view",
  },

  {
    name: HOME_PERMISSIONS.ADDITIONAL_SEARCH_EXPORT,
    resource: "home",
    action: "additional_search_export",
  },

  {
    name: HOME_PERMISSIONS.ADDITIONAL_SEARCH_BULK_EDIT,
    resource: "home",
    action: "additional_search_bulk_edit",
  },

  {
    name: HOME_PERMISSIONS.ADDITIONAL_SEARCH_DOWNLOAD_FILES,
    resource: "home",
    action: "additional_search_download_files",
  },

  {
    name: HOME_PERMISSIONS.ADDITIONAL_SEARCH_BULK_EMAIL,
    resource: "home",
    action: "additional_search_bulk_email",
  },

  {
    name: HOME_PERMISSIONS.ADDITIONAL_SEARCH_BULK_DESIGNATION,
    resource: "home",
    action: "additional_search_bulk_designation",
  },

  {
    name: CALENDAR_PERMISSIONS.VIEW,
    resource: "calendar_management",
    action: "view",
  },

  {
    name: CALENDAR_PERMISSIONS.CALENDAR_MANAGEMENT,
    resource: "calendar_management",
    action: "calendar_management",
    description: "Calendar Management - Calendar Management",
  },

  {
    name: CALENDAR_PERMISSIONS.CHECKIN,
    resource: "calendar_management",
    action: "checkin",
    description: "Calendar Management - Checkin",
  },

  {
    name: CALENDAR_PERMISSIONS.HISTORY,
    resource: "calendar_management",
    action: "history",
    description: "Calendar Management - History",
  },

  {
    name: CALENDAR_PERMISSIONS.PAST_CALENDARS,
    resource: "calendar_management",
    action: "past_calendars",
    description: "Calendar Management - Past Calendars",
  },

  {
    name: CALENDAR_PERMISSIONS.UPCOMING_CALENDAR,
    resource: "calendar_management",
    action: "upcoming_calendar",
    description: "Calendar Management - Upcoming calendar",
  },

  {
    name: DOCKET_PERMISSIONS.VIEW,
    resource: "docket",
    action: "view",
  },

  {
    name: DOCKET_PERMISSIONS.DOCKET_CREATE,
    resource: "docket",
    action: "docket_create",
    description: "Docket - Docket Create",
  },

  {
    name: DOCKET_PERMISSIONS.DOWNLOAD,
    resource: "docket",
    action: "download",
    description: "Docket - Download",
  },

  {
    name: DOCKET_PERMISSIONS.EDIT,
    resource: "docket",
    action: "edit",
    description: "Docket - Edit",
  },

  {
    name: DOCKET_PERMISSIONS.HISTORY,
    resource: "docket",
    action: "history",
    description: "Docket - History",
  },

  {
    name: DOCKET_PERMISSIONS.NOTES,
    resource: "docket",
    action: "notes",
    description: "Docket - Notes",
  },

  {
    name: DOCKET_PERMISSIONS.NOTIFY_ME,
    resource: "docket",
    action: "notify_me",
    description: "Docket - Notify Me",
  },

  {
    name: DOCKET_PERMISSIONS.PENDING_REJECTED,
    resource: "docket",
    action: "pending_rejected",
    description: "Docket - Pending/Rejected",
  },

  {
    name: AGENCIES_PERMISSIONS.VIEW,
    resource: "agencies",
    action: "view",
  },

  {
    name: AGENCIES_PERMISSIONS.BULK_UPLOAD,
    resource: "agencies",
    action: "bulk_upload",
    description: "Agencies - Bulk Upload",
  },

  {
    name: AGENCIES_PERMISSIONS.DHS_FILES,
    resource: "agencies",
    action: "dhs_files",
    description: "Agencies - DHS Files",
  },

  {
    name: AGENCIES_PERMISSIONS.PRINT_DDS,
    resource: "agencies",
    action: "print_dds",
    description: "Agencies - Print DDS",
  },

  {
    name: REPORTS_PERMISSIONS.VIEW,
    resource: "reports",
    action: "view",
  },

  {
    name: REVIEWFORM1_PERMISSIONS.VIEW,
    resource: "reviewform1",
    action: "view",
  },

  {
    name: BULK_DOCS_PERMISSIONS.VIEW,
    resource: "bulk_docs",
    action: "view",
    description: "CLerk tabs - Bulk Docs",
  },

  {
    name: ADMIN_PERMISSIONS.VIEW,
    resource: "admin",
    action: "view",
  },

  {
    name: ADMIN_PERMISSIONS.AGENCY_CASETYPES,
    resource: "admin",
    action: "agency_casetypes",
    description: "Admin - Agency/Casetypes",
  },

  {
    name: ADMIN_PERMISSIONS.ASSIGNS_DOCS_TO_CMA,
    resource: "admin",
    action: "assigns_docs_to_cma",
    description: "Admin - Assigns docs to cma",
  },

  {
    name: ADMIN_PERMISSIONS.BULK_COMM,
    resource: "admin",
    action: "bulk_comm",
    description: "Admin - Bulk comm",
  },

  {
    name: ADMIN_PERMISSIONS.CALENDAR_MGMT,
    resource: "admin",
    action: "calendar_mgmt",
    description: "Admin - Calendar mgmt",
  },

  {
    name: ADMIN_PERMISSIONS.DOCUMENTS,
    resource: "admin",
    action: "documents",
    description: "Admin - Documents",
  },

  {
    name: ADMIN_PERMISSIONS.HEARING_LOCATIONS,
    resource: "admin",
    action: "hearing_locations",
    description: "Admin - Hearing Locations",
  },

  {
    name: ADMIN_PERMISSIONS.PARTIES,
    resource: "admin",
    action: "parties",
    description: "Admin - Parties",
  },

  {
    name: ADMIN_PERMISSIONS.TANDE,
    resource: "admin",
    action: "tande",
    description: "Admin - T&E",
  },

  {
    name: ADMIN_PERMISSIONS.USERS,
    resource: "admin",
    action: "users",
    description: "Admin - Users",
  },

  {
    name: EFILING_PERMISSIONS.VIEW,
    resource: "efiling",
    action: "view",
  },

  {
    name: EFILING_PERMISSIONS.HISTORY,
    resource: "efiling",
    action: "history",
    description: "eFiling - History",
  },

  {
    name: EFILING_PERMISSIONS.PENDING_DOCS_FOR_APPROVAL,
    resource: "efiling",
    action: "pending_docs_for_approval",
    description: "eFiling - Pending docs for approval",
  },

  {
    name: TIME_AND_EXPENSE_PERMISSIONS.VIEW,
    resource: "timeandexpense",
    action: "view",
  },

  {
    name: TIME_AND_EXPENSE_PERMISSIONS.EXPENSE_ENTRY,
    resource: "timeandexpense",
    action: "expense_entry",
    description: "TimeAndExpense - expense entry",
  },

  {
    name: TIME_AND_EXPENSE_PERMISSIONS.INVOICING,
    resource: "timeandexpense",
    action: "invoicing",
    description: "TimeAndExpense - invoicing",
  },

  {
    name: TIME_AND_EXPENSE_PERMISSIONS.SETTINGS,
    resource: "timeandexpense",
    action: "settings",
    description: "TimeAndExpense - settings",
  },

  {
    name: TIME_AND_EXPENSE_PERMISSIONS.TIME_ENTRY,
    resource: "timeandexpense",
    action: "time_entry",
    description: "TimeAndExpense - time entry",
  },
];

export const seedPermissions = async () => {
  try {
    for (const permission of permissions) {
      const existingPermission = await Permission.findOne({
        where: {
          name: permission.name,
        },
      });

      if (!existingPermission) {
        await Permission.create(permission);
      }
    }

    console.log("Permissions seeded");
  } catch (error) {
    console.log("Permissions seeded error", error);
  }
};
