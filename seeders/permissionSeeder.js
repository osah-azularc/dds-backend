import Permission from "../api/models/Permission.js";
import { DDS_PERMISSIONS } from "../api/constants/permissions.js";

// Mirrors the current `permissions` table (DDS-only RBAC, 2026-09-27).
// permissions/role_permissions are maintained by hand directly in the
// database now; this seeder exists to stand up a fresh environment with the
// same data, not to be edited when a permission changes — add the new
// permission in api/constants/permissions.js and the database first, then
// re-run the generation to pick it up.
const permissions = [
  {
    name: DDS_PERMISSIONS.HOME_VIEW,
    resource: "dds",
    action: "home_view",
    description: "View DDS home/dashboard",
  },

  {
    name: DDS_PERMISSIONS.DOCKET_SEARCH,
    resource: "dds",
    action: "docket_search",
    description: "Search DDS dockets/cases",
  },

  {
    name: DDS_PERMISSIONS.DOCKET_VIEW,
    resource: "dds",
    action: "docket_view",
    description: "View a DDS docket's details",
  },

  {
    name: DDS_PERMISSIONS.DOCKET_CREATE,
    resource: "dds",
    action: "docket_create",
    description: "Create a new DDS docket/case",
  },

  {
    name: DDS_PERMISSIONS.DOCKET_EDIT,
    resource: "dds",
    action: "docket_edit",
    description: "Edit/update a DDS docket (status, disposition, case info)",
  },

  {
    name: DDS_PERMISSIONS.PARTY_CREATE,
    resource: "dds",
    action: "party_create",
    description: "Add party details to a docket",
  },

  {
    name: DDS_PERMISSIONS.PARTY_EDIT,
    resource: "dds",
    action: "party_edit",
    description: "Edit party details",
  },

  {
    name: DDS_PERMISSIONS.PARTY_DELETE,
    resource: "dds",
    action: "party_delete",
    description: "Delete party details",
  },

  {
    name: DDS_PERMISSIONS.ATTORNEY_RESPONDENT_ADD,
    resource: "dds",
    action: "attorney_respondent_add",
    description: "Add attorney/respondent info",
  },

  {
    name: DDS_PERMISSIONS.LICENSE_NUMBER_UPDATE,
    resource: "dds",
    action: "license_number_update",
    description: "Update driver's license number",
  },

  {
    name: DDS_PERMISSIONS.FORM1205_SEARCH,
    resource: "dds",
    action: "form1205_search",
    description: "Search DDS Form 1205 offense/eligibility info",
  },

  {
    name: DDS_PERMISSIONS.NOTES_CREATE,
    resource: "dds",
    action: "notes_create",
    description: "Add case notes",
  },

  {
    name: DDS_PERMISSIONS.HISTORY_VIEW,
    resource: "dds",
    action: "history_view",
    description: "View DDS case history",
  },

  {
    name: DDS_PERMISSIONS.PERMITS_PRINT,
    resource: "dds",
    action: "permits_print",
    description: "Print permits",
  },

  {
    name: DDS_PERMISSIONS.PERMITS_GENERATE_PDF,
    resource: "dds",
    action: "permits_generate_pdf",
    description: "Generate temporary permit PDF",
  },

  {
    name: DDS_PERMISSIONS.DPS_UPDATE,
    resource: "dds",
    action: "dps_update",
    description: "Push docket updates to DPS",
  },

  {
    name: DDS_PERMISSIONS.DOCKET_SEARCH_DOCUMENTS_DOWNLOAD,
    resource: "dds",
    action: "docket_search_documents_download",
    description: "Download/zip documents",
  },

  {
    name: DDS_PERMISSIONS.REJECTED_FORMS_VIEW,
    resource: "dds",
    action: "rejected_forms_view",
    description: "View rejected DDS form submissions",
  },

  {
    name: DDS_PERMISSIONS.DOCKET_SEARCH_EXPORT_DATA,
    resource: "dds",
    action: "docket_search_export_data",
    description: "Bulk export DDS data",
  },

  {
    name: DDS_PERMISSIONS.DOCKET_DELETE,
    resource: "dds",
    action: "docket_delete",
    description: "Delete a DDS docket",
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
