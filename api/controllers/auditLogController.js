import partyType from "../models/admin/partyTypeModel.js";
import { convertToClientTimeZone } from "../helpers/timezone.helper.js";
import moment from "moment";
import { logger } from "../../config/winstonLogger.js";

export const getAllAuditLogs = async (req, res) => {
  try {
    const { module, page, limit, clientTimezone } = req.body;

    let logs = []; // Placeholder - Audit log models deleted
    let groupedLogs = {};
    let countNoOfLogs = 0;

    for (const log of logs) {
      const userName = log.dataValues.user_name;
      const date = convertToClientTimeZone(
        log.createdAt,
        clientTimezone,
      ).format("MM/DD/YYYY");
      const time = convertToClientTimeZone(
        log.createdAt,
        clientTimezone,
      ).format("hh:mm A");
      const impactedId = log.agency_contact_impacted_id
        ? log.agency_contact_impacted_id
        : log.impacted_id;
      if (!groupedLogs[date]) {
        groupedLogs[date] = {};
      }
      const uniqueKey = `${time}-${impactedId}-${log.action}`;
      if (!groupedLogs[date][uniqueKey]) {
        groupedLogs[date][uniqueKey] = {
          id: log.id,
          user_name: userName,
          time: time,
          action: log.action,
          label: log.label.replace("{{User}}", ""), // as of now user's name is at the start of label, so removing it and adding it in user_name field
          fields: [],
        };
      }
      let fieldName = log.impacted_field;
      let valueBefore = log.value_before === "" ? "null" : log.value_before;
      let valueAfter = log.value_after === "" ? "null" : log.value_after;

      // Agency Module
      if (log.impacted_field == "is_active") {
        fieldName = "Status";
        valueBefore = log.value_before == "1" ? "Restored" : "Deactivated";
        valueAfter = log.value_after == "1" ? "Restored" : "Deactivated";
      }
      if (log.impacted_field == "is_billable") {
        fieldName = "Billable Indicator";
        valueBefore = log.value_before == "1" ? "Yes" : "No";
        valueAfter = log.value_after == "1" ? "Yes" : "No";
      }
      if (
        log.impacted_field == "billable_phone_number" ||
        log.impacted_field == "billable_fax" ||
        log.impacted_field == "phone" ||
        log.impacted_field == "fax" ||
        log.impacted_field == "tel"
      ) {
        if (valueBefore !== "" && valueBefore !== "null") {
          valueBefore = `(${valueBefore.slice(0, 3)}) ${valueBefore.slice(
            3,
            6,
          )}-${valueBefore.slice(6)}`;
        }

        if (valueAfter !== "" && valueAfter !== "null") {
          valueAfter = `(${valueAfter.slice(0, 3)}) ${valueAfter.slice(
            3,
            6,
          )}-${valueAfter.slice(6)}`;
        }
      }
      if (log.impacted_field == "billable_firstname") {
        fieldName = "Billable First Name";
      }
      if (log.impacted_field == "billable_lastname") {
        fieldName = "Billable Last Name";
      }
      if (log.impacted_field == "firstname") {
        fieldName = "First Name";
      }
      if (log.impacted_field == "lastname") {
        fieldName = "Last Name";
      }
      if (log.impacted_field == "name" && auditLogModel.AgenciesAuditLog) {
        fieldName = "Agency Name";
      }
      if (log.impacted_field == "code") {
        fieldName = "Agency Code";
      }

      // Party Types Module
      if (log.impacted_field == "is_attorney") {
        fieldName = "Intended for Attorneys";
        valueBefore = log.value_before == "1" ? "Yes" : "No";
        valueAfter = log.value_after == "1" ? "Yes" : "No";
      }
      if (log.impacted_field == "is_autocomplete") {
        fieldName = "Smart Search";
        valueBefore = log.value_before == "1" ? "Yes" : "No";
        valueAfter = log.value_after == "1" ? "Yes" : "No";
      }

      // Parties Module
      if (log.impacted_field == "party_type") {
        fieldName = "Party Type";
        const partyTypeBefore = log.value_before
          ? await partyType.findOne({
              where: { id: log.value_before },
              attributes: ["party_type_name"],
            })
          : null;
        valueBefore = partyTypeBefore
          ? partyTypeBefore.party_type_name
          : "null";

        const partyTypeAfter = log.value_after
          ? await partyType.findOne({
              where: { id: log.value_after },
              attributes: ["party_type_name"],
            })
          : null;
        valueAfter = partyTypeAfter ? partyTypeAfter.party_type_name : "null";
      }

      if (log.impacted_field == "attorney_bar") {
        fieldName = "Attorney Bar Number";
      }
      if (log.impacted_field == "badge_no") {
        fieldName = "Badge Number";
      }
      if (log.impacted_field == "address1") {
        fieldName = "Address Line 1";
      }
      if (log.impacted_field == "address2") {
        fieldName = "Address Line 2";
      }

      // Users Module
      if (log.impacted_field == "role_id") {
        fieldName = "Role";
        const roleBefore = log.value_before
          ? await Role.findOne({
              where: { id: log.value_before },
              attributes: ["role_name"],
            })
          : null;
        valueBefore = roleBefore ? roleBefore.role_name : "null";

        const roleAfter = log.value_after
          ? await Role.findOne({
              where: { id: log.value_after },
              attributes: ["role_name"],
            })
          : null;
        valueAfter = roleAfter ? roleAfter.role_name : "null";
      }

      // Case Types Module
      if (log.impacted_field == "case_type_agency") {
        fieldName = "Permitted Agency";
      }
      if (log.impacted_field == "otherrespondent") {
        fieldName = "Other Respondent";
      }
      if (log.impacted_field == "otherpetitioner") {
        fieldName = "Other Petitioner";
      }
      if (log.impacted_field == "case_code") {
        fieldName = "Case Type Code";
      }

      // Locations Module
      if (log.impacted_field == "locationname") {
        fieldName = "Location Name";
      }

      // File Type Module
      if (log.impacted_field == "name" && module == "document_types") {
        fieldName = "File Type Name";
      }
      if (log.impacted_field == "eFiling_availability") {
        fieldName = "eFiling Availability";
        valueBefore = log.value_before == "1" ? "Yes" : "No";
        valueAfter = log.value_after == "1" ? "Yes" : "No";
      }

      if (log.impacted_field == "document_category_id") {
        fieldName = "File Document Type";
        valueBefore = log.value_before == "1" ? "Decision" : "Non-Decision";
        valueAfter = log.value_after == "1" ? "Decision" : "Non-Decision";
      }

      //Template Module
      if (log.impacted_field == "templateName") {
        fieldName = "Template Name";
      }
      if (log.impacted_field == "document_type") {
        fieldName = "Type";
      }
      if (["status", "template_status"].includes(log?.impacted_field)) {
        valueBefore =
          log.value_before === "Active" ? "Published" : log.value_before;
        valueAfter =
          log.value_after === "Active" ? "Published" : log.value_after;

        if (log.impacted_field === "template_status") {
          fieldName = "Saved As";
        }
      }

      // Locations Module
      if (log.impacted_field == "locationname") {
        fieldName = "Location Name";
      }

      // Roles Management Module
      if (log?.impacted_field?.includes("rolespermission_")) {
        const impactedPermission = null; // Placeholder - Permission model deleted
        fieldName = impactedPermission
          ? impactedPermission.permission_name
          : "null";
      }

      // Cases Module
      if (log.impacted_field == "case_status") {
        valueBefore =
          log.value_before.charAt(0).toUpperCase() + log.value_before.slice(1);
        valueAfter =
          log.value_after.charAt(0).toUpperCase() + log.value_after.slice(1);
      }
      if (log.impacted_field == "reason") {
        valueBefore = "null";
        valueAfter = log?.reasons || "";
      }

      // Cases Documents Module
      if (log.impacted_field == "date_filed") {
        valueBefore = log.value_before
          ? moment(log.value_before).format("MM/DD/YYYY")
          : "null";
        valueAfter = log.value_after
          ? moment(log.value_after).format("MM/DD/YYYY")
          : "null";
      }
      if (log.impacted_field == "is_confidential") {
        valueBefore = log.value_before == "1" ? "Yes" : "No";
        valueAfter = log.value_after == "1" ? "Yes" : "No";
      }

      groupedLogs[date][uniqueKey].fields.push({
        impacted_field: fieldName,
        value_before: valueBefore,
        value_after: valueAfter,
        reasons: log.reasons,
      });
      countNoOfLogs++;
    }

    if (groupedLogs) {
      // Convert the object into an array of entries
      let entries = Object.entries(groupedLogs);

      // Sort the array by date in descending order
      entries.sort((a, b) => new Date(b[0]) - new Date(a[0]));

      // Convert the array back into an object
      groupedLogs = Object.fromEntries(entries);

      return res.status(200).json({
        status: 200,
        message: "Logs data fetched successfully",
        data: groupedLogs,
        total: countNoOfLogs,
        success: true,
      });
    }

    return res.status(200).json({
      status: 500,
      title: "Unable to fetch logs",
      message: "The logs could not be fetched at this time. Please try again.",
      success: false,
    });
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      status: 500,
      title: "Unable to fetch logs",
      message: "The logs could not be fetched at this time. Please try again.",
      success: false,
    });
  }
};
