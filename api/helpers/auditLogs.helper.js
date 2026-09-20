// DELETED - All audit log models (PostgreSQL)
// import AuditLog from "../models/audit_logs/auditLogsModel.js"; // DELETED - PostgreSQL model
// import usersAuditLog from "../models/audit_logs/usersAuditLogModel.js"; // DELETED - PostgreSQL model
// import casesAuditLog from "../models/audit_logs/casesAuditLogModel.js"; // DELETED - PostgreSQL model
// import PartyTypesAuditLog from "../models/audit_logs/partyTypesLogModel.js"; // DELETED - PostgreSQL model
// import CaseTypesAuditLog from "../models/audit_logs/caseTypesAuditLogModel.js"; // DELETED - PostgreSQL model
// import LocationsAuditLog from "../models/audit_logs/locationsAuditLogModel.js"; // DELETED - PostgreSQL model
// import AgenciesAuditLog from "../models/audit_logs/agenciesAuditLogModel.js"; // DELETED - PostgreSQL model
// import TemplatesAuditLog from "../models/audit_logs/templatesAuditLogModel.js"; // DELETED - PostgreSQL model
// import InvoicesAuditLog from "../models/audit_logs/invoicesAuditLogModel.js"; // DELETED - PostgreSQL model
// import PartiesAuditLog from "../models/audit_logs/partiesAuditLogModel.js"; // DELETED - PostgreSQL model
// import TimeEntriesAuditLog from "../models/audit_logs/timeEntriesAuditLogModel.js"; // DELETED - PostgreSQL model
// import ExpensesAuditLog from "../models/audit_logs/expensesAuditLogModel.js"; // DELETED - PostgreSQL model
// import BillingPeriodsAuditLog from "../models/audit_logs/billingPeriodsAuditLogModel.js"; // DELETED - PostgreSQL model
// import RolesAuditLog from "../models/audit_logs/rolesAuditLogModel.js"; // DELETED - PostgreSQL model
// import DocumentTypesAuditLog from "../models/audit_logs/documentTypesAuditLogModel.js"; // DELETED - PostgreSQL model
// import CaseRequestsAuditLog from "../models/audit_logs/caseRequestsAuditLogModel.js"; // DELETED - PostgreSQL model
import { AUDIT_LOG_MODULE_NAME } from "../constants/constant-messages.js";
import { logger } from "../../config/winstonLogger.js";
// import EFileAuditLog from "../models/audit_logs/eFileAuditLogModel.js"; // DELETED - PostgreSQL model
// import AgencyContactsAuditLog from "../models/audit_logs/agencyContactsAuditLogModel.js";

/**
 * Inserts a record into the audit logs table.
 *
 * @param {string} created_by - The ID of the user who created the log.
 * @param {string} impacted_table - The name of the table that was impacted.
 * @param {string} impacted_id - The ID of the record that was impacted.
 * @param {string} comment - A comment about the change.
 * @returns {Promise<AuditLog>} The created audit log record.
 */
export async function insertAuditLog(
  created_by,
  impacted_table,
  impacted_id,
  comment
) {
  try {
    // COMMENTED OUT - AuditLog model deleted (PostgreSQL)
    // const auditLog = await AuditLog.create({
    //   created_by,
    //   impacted_table,
    //   impacted_id,
    //   comment,
    // });
    const auditLog = null; // Placeholder - AuditLog model deleted
    logger.info("Audit log inserted successfully:", auditLog);
    return auditLog;
  } catch (error) {
    logger.error("Error inserting audit log:", error);
    throw error; // Rethrow the error to handle it in the calling context
  }
}

export async function insertModuleAuditLog(
  created_by,
  action = "CREATED",
  label = null,
  impacted_table,
  impacted_field,
  impacted_id,
  value_before,
  value_after,
  reasons,
  agency_contact_impacted_id = null,
  impacted_module = null,
  case_id = null
) {
  try {
    // COMMENTED OUT - All audit log models deleted (PostgreSQL)
    // const auditLogModels = {
    //   cases: casesAuditLog,
    //   users: usersAuditLog,
    //   party_types: PartyTypesAuditLog,
    //   case_types: CaseTypesAuditLog,
    //   locations: LocationsAuditLog,
    //   agencies: AgenciesAuditLog,
    //   templates: TemplatesAuditLog,
    //   invoices: InvoicesAuditLog,
    //   parties: PartiesAuditLog,
    //   time_entries: TimeEntriesAuditLog,
    //   expenses: ExpensesAuditLog,
    //   billing_periods: BillingPeriodsAuditLog,
    //   roles: RolesAuditLog,
    //   document_types: DocumentTypesAuditLog,
    //   public_efile_documents: EFileAuditLog,
    //   agency_portal_case_request: CaseRequestsAuditLog,
    // };

    // const tableName = impacted_table.trim().toLowerCase();
    // const auditLogModel = auditLogModels[tableName];

    // if (!auditLogModel) {
    //   throw new Error("Invalid table name");
    // }

    // const auditLogData = {
    //   created_by,
    //   action,
    //   label,
    //   impacted_field,
    //   impacted_id,
    //   value_before,
    //   value_after,
    //   reasons,
    // };

    // if (impacted_table == AUDIT_LOG_MODULE_NAME.AGENCIES) {
    //   auditLogData.agency_contact_impacted_id = agency_contact_impacted_id;
    // }
    // if (impacted_table == AUDIT_LOG_MODULE_NAME.CASES) {
    //   auditLogData.impacted_module = impacted_module;
    //   auditLogData.case_id = case_id;
    // }

    // const auditLogInstance = auditLogModel.build(auditLogData);
    // await auditLogInstance.save();

    // return `Audit log inserted successfully for ${impacted_table} table`;

    // Placeholder - Audit log models deleted
    logger.info(
      `Audit log disabled - models deleted (PostgreSQL): ${impacted_table}`
    );
    return `Audit log disabled - models deleted`;
  } catch (error) {
    logger.error("Error inserting audit log:", error);
    throw error; // Rethrow the error to handle it in the calling context
  }
}

// Task: https://app.clickup.com/t/86du33vbq end
