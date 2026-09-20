import { Op, literal } from "sequelize";
import ExpenseEntry from "../../../models/timeexpense/timeentry/ExpenseEntry.js";
import BillableAgency from "../../../models/timeexpense/invoicing/BillableAgency.js";
import { logger } from "../../../../config/winstonLogger.js";

/**
 * @module
 * @description
 * Time & Expense > Expenses (Expense Entry) CSV export - the Download button beside Reset.
 * Given the exact target file layout (`excelsheets<unix-seconds>.csv`, columns ID/Employee/
 * Expense Type/Description/Status/Date Incurred/Rounded Amount/Allocated Amount/Round Down
 * Difference/Agency Code/Location, MM/DD/YYYY dates, "FirstName LastName" employee, one row per
 * agency the expense was split to), this isn't osah.repos' own exportExpenseDataAction (that
 * action's CSV is a different, older 8-column shape - one row per expense, not per agency, and
 * "%d-%m-%Y" dates) - it matches a newer export format supplied directly rather than found in
 * this checkout. Filters (employee/status/expenseType/agency/dateFrom/dateTo) are the same ones
 * getExpenseEntryList takes, and legacy's own exportExpenseData() (expenseentrycontroller.js)
 * resends whatever's currently in the General Search form the same way.
 *
 * Agency Code is resolved via a separate BillableAgency lookup (description -> code) rather than
 * trusting the stored agency_work_type_code column directly - that column has been observed to
 * hold a bare JSON-encoded string instead of a 1-element JSON array for some legacy-era rows
 * (single-agency expenses), which would silently break a naive JSON.parse-and-explode. agency_
 * work_type (the description list) has been consistently a clean JSON array in every row
 * inspected, so it's the one this explodes on.
 */

// Mirrors legacy's getAllExpenseEntryAction posted_status CASE exactly (see
// expenseEntryListController.js's own copy of this table).
const STATUS_LABELS = {
  1: "Posted",
  2: "Invoiced",
  3: "Partially Invoiced",
};
const statusLabel = (isPosted) => STATUS_LABELS[Number(isPosted)] || "Not Posted";

const includeOptions = [
  { association: "employee", attributes: ["firstName", "lastName"], required: true },
  { association: "expenseTypeDetail", attributes: ["expenseType"], required: true },
  { association: "courtLocation", attributes: ["locationName"], required: false },
];

const parseAgencyDescriptions = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
};

// RFC 4180 field escaping - quotes (doubling any embedded quote) only when the value contains a
// comma, quote, or newline; a bare value is left unquoted, matching the sample file exactly
// (e.g. `906854789,` and `Fuel,`, not `"906854789",`/`"Fuel",`).
const csvField = (value) => {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const CSV_HEADERS = [
  "ID",
  "Employee",
  "Expense Type",
  "Description",
  "Status",
  "Date Incurred",
  "Rounded Amount",
  "Allocated Amount",
  "Round Down Difference",
  "Agency Code",
  "Location",
];

const formatAmount = (value) => (value === null || value === undefined ? "" : Number(value).toFixed(2));

/**
 * @param {import('express').Request} req
 * - req.query.employee/status/expenseType/agency/dateFrom/dateTo - same filters as
 * getExpenseEntryList (see expenseEntryExportQuerySchema)
 * @param {import('express').Response} res - Express response object; sends a text/csv attachment
 * directly rather than a JSON envelope.
 */
export const exportExpenseEntries = async (req, res) => {
  try {
    const {
      employee = "",
      status = "",
      expenseType = "",
      agency = "",
      dateFrom = "",
      dateTo = "",
    } = req.query;

    const whereCondition = { isDeleted: "0" };
    if (employee !== "" && !Number.isNaN(Number(employee))) {
      whereCondition.userId = Number(employee);
    }
    if (status !== "") {
      whereCondition.isPosted = String(status);
    }
    if (expenseType !== "" && !Number.isNaN(Number(expenseType))) {
      whereCondition.expenseTypeId = Number(expenseType);
    }
    if (agency && agency.trim()) {
      whereCondition.agencyWorkType = { [Op.like]: `%${agency.trim()}%` };
    }
    if (dateFrom && dateTo) {
      whereCondition.dateIncurred = { [Op.between]: [dateFrom, dateTo] };
    }

    const [agencyRows, rows] = await Promise.all([
      BillableAgency.findAll({ attributes: ["agencyDescription", "agencyCode"] }),
      ExpenseEntry.findAll({
        where: whereCondition,
        attributes: [
          "expenseId",
          "isPosted",
          "description",
          "transactionAmount",
          "roundedAmount",
          "differenceAmount",
          "agencyWorkType",
          [literal("DATE_FORMAT(date_incurred, '%m/%d/%Y')"), "dateIncurredFormatted"],
        ],
        include: includeOptions,
        order: [["createdDate", "DESC"]],
      }),
    ]);

    const codeByDescription = new Map(agencyRows.map((a) => [a.agencyDescription, a.agencyCode]));

    const lines = [CSV_HEADERS.map(csvField).join(",")];
    rows.forEach((row) => {
      const plain = row.toJSON();
      const descriptions = parseAgencyDescriptions(plain.agencyWorkType);
      // An expense with no parseable agency still gets one row (with a blank Agency Code) -
      // never silently dropped from the export.
      const agencyList = descriptions.length ? descriptions : [null];

      agencyList.forEach((description) => {
        lines.push(
          [
            Number(plain.expenseId),
            `${plain.employee?.firstName ?? ""} ${plain.employee?.lastName ?? ""}`.trim(),
            plain.expenseTypeDetail?.expenseType ?? "",
            plain.description ?? "",
            statusLabel(plain.isPosted),
            plain.dateIncurredFormatted ?? "",
            formatAmount(plain.roundedAmount),
            formatAmount(plain.transactionAmount),
            formatAmount(plain.differenceAmount),
            description ? codeByDescription.get(description) || "" : "",
            plain.courtLocation?.locationName ?? "",
          ]
            .map(csvField)
            .join(","),
        );
      });
    });

    const csvBody = lines.join("\r\n");
    // Matches legacy's own filename pattern exactly - 'excelsheets'.time() (PHP's time(), unix
    // seconds - not Date.now()'s milliseconds).
    const filename = `excelsheets${Math.floor(Date.now() / 1000)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csvBody);
  } catch (error) {
    logger.error("Error exporting expense entries:", { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Unable to export expenses. Please try again.",
      status: 500,
    });
  }
};
