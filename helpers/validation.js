// import AgencyContact from "../api/models/admin/agencyContactModel.js"; // DELETED - PostgreSQL model
import partyType from "../api/models/admin/partyTypeModel.js";
import documentType from "../api/models/case/documentTypeModel.js";
import { Op } from "sequelize";

export const validateEmptyFields = (data) => {
  const { locationName } = data;

  // Define an array of required fields
  const requiredFields = ["locationName"];

  // Check if any required field is empty
  const emptyFields = requiredFields.filter((field) => !data[field]);

  // If any required field is empty, return a list of empty fields
  if (emptyFields.length > 0) {
    return emptyFields.map((field) => `${field} is required`);
  }

  // Check if locationName contains only alphabetic characters
  if (!/^[a-zA-Z\s]+$/.test(locationName)) {
    return ["locationName must contain only alphabetic characters"];
  }

  // Check if tel contains only numeric characters
  if (!/^\d+$/.test(tel)) {
    return ["tel must contain only numeric characters"];
  }

  // Check if zip contains only numeric characters
  if (!/^\d+$/.test(zip)) {
    return ["zip must contain only numeric characters"];
  }
  // If all required fields are present and not empty, return null
  return null;
};

export const validatePartyType = async (data) => {
  let { id, party_type_name } = data;

  // Trim the party_type_name
  party_type_name = party_type_name.trim();

  // Define an array of required fields
  const requiredFields = ["party_type_name"];

  // Check if any required field is empty
  const emptyFields = requiredFields.filter((field) => !data[field]);

  // If any required field is empty, return a list of empty fields
  if (emptyFields.length > 0) {
    return emptyFields.map(() => `Party type is required`);
  }

  // Check if party_type_name contains only alphabetic characters
  if (!/^[a-zA-Z\s/]+$/.test(party_type_name)) {
    return ["Party type name should have only alphabetical characters"];
  }

  let partyTypeExists = "";
  if (id && id > 0) {
    partyTypeExists = await partyType.findOne({
      where: { party_type_name, id: { [Op.ne]: id } },
    });
  } else {
    partyTypeExists = await partyType.findOne({
      where: { party_type_name },
    });
  }
  if (partyTypeExists) {
    return "Party already exists!";
  }

  // If all required fields are present and not empty, return null
  return null;
};

export const validateParties = (data) => {
  const {
    firstname,
    lastname,
    middlename,
    title,
    city,
    zip,
    phone_number,
    email,
    fax,
  } = data;

  const fieldAliases = {
    party_type_id: "Party type",
    firstname: "First name",
    lastname: "Last name",
    middlename: "Middle name",
    title: "Title",
    company: "Company",
    city: "City",
    state: "State",
    address1: "Address 1",
    phone_number: "Phone number",
    email: "Email",
    fax: "Fax",
  };

  const requiredFields = [
    "party_type_id",
    "lastname",
    "address1",
    "city",
    "state",
    "zip",
  ];
  const emptyFields = requiredFields.filter((field) => !data[field]);
  if (emptyFields.length > 0) {
    return emptyFields.map((field) => `${fieldAliases[field]} is required`);
  }

  if (firstname && !/^[a-zA-Z\s]+$/.test(firstname)) {
    return ["Firstname must contain only alphabetic characters"];
  }
  if (!/^[a-zA-Z\s]+$/.test(lastname)) {
    return ["Lastname must contain only alphabetic characters"];
  }
  if (middlename && !/^[a-zA-Z\s]+$/.test(middlename)) {
    return ["Middlename must contain only alphabetic characters"];
  }
  if (title && !/^[a-zA-Z\s.]+$/.test(title)) {
    return ["Title must contain only alphabetic characters"];
  }
  if (!/^[a-zA-Z\s]+$/.test(city)) {
    return ["City must contain only alphabetic characters"];
  }
  if (!/^\d+$/.test(zip)) {
    return ["Zip must contain only numeric characters"];
  }
  if (phone_number && !/^[0-9=-]+$/.test(phone_number)) {
    return ["Phone number must contain only numeric characters"];
  }
  if (fax && !/^[0-9=-]+$/.test(fax)) {
    return ["Fax number must contain only numeric characters"];
  }
  if (email && !/^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$/.test(email)) {
    return ["Email format is not valid"];
  }
};

/**
 * Comprehensive location name validation for server-side security
 */
const validateLocationName = (locationName) => {
  const errors = [];

  // Check if empty
  if (!locationName || typeof locationName !== "string") {
    errors.push("Location name is required");
    return errors;
  }

  // Sanitize: remove leading/trailing spaces and collapse multiple spaces
  const sanitized = locationName.trim().replace(/\s+/g, " ");

  if (!sanitized) {
    errors.push("Location name is required");
    return errors;
  }

  // Check length
  if (sanitized.length > 100) {
    errors.push("Location name must be 100 characters or less");
  }

  // Allowed characters: A-Z, a-z, 0-9, accented letters, spaces, apostrophes, hyphens, commas, periods
  const allowedPattern = /^[A-Za-z0-9\u00C0-\u017F\u1E00-\u1EFF\s',.'-]+$/;
  if (!allowedPattern.test(sanitized)) {
    errors.push(
      "Location name contains invalid characters. Only letters, numbers, spaces, apostrophes ('), hyphens (-), commas (,), and periods (.) are allowed",
    );
  }

  // Check for forbidden characters (security)
  const forbiddenPattern = /[<>"\\\/;:%$&|^~*#@!?=+{}[\]`]/;
  if (forbiddenPattern.test(sanitized)) {
    errors.push(
      "Location name contains forbidden characters for security reasons",
    );
  }

  // Check for HTML/Script content
  const htmlScriptPattern =
    /<[^>]*>|javascript:|vbscript:|onload|onerror|onclick/i;
  if (htmlScriptPattern.test(sanitized)) {
    errors.push("Location name cannot contain HTML or script content");
  }

  // Check for emojis and non-standard Unicode
  const emojiPattern =
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
  if (emojiPattern.test(sanitized)) {
    errors.push("Location name cannot contain emojis or special symbols");
  }

  // Additional SQL injection protection
  const sqlPattern =
    /('|('')|;|--|\/\*|\*\/|xp_|sp_|exec|execute|select|insert|update|delete|drop|create|alter|union|script)/i;
  if (sqlPattern.test(sanitized)) {
    errors.push("Location name contains potentially harmful content");
  }

  return errors;
};

export const validateLocationFields = (data) => {
  const { locationName } = data;

  // Validate location name with comprehensive rules
  const locationNameErrors = validateLocationName(locationName);

  if (locationNameErrors.length > 0) {
    return locationNameErrors;
  }

  return null;
};

export const validateTimeentryFields = async (data) => {
  const { timeentry_id, is_admin } = data;

  // Define an array of required fields
  const requiredFields = [
    "task_id",
    "time_tracking_date_entry",
    "original_working_time",
    "rounded_up_time",
    "split_time_btwn_agency",
    "description",
  ];

  // Check if any required field is empty
  const emptyFields = requiredFields.filter((field) => !data[field]);

  // If any required field is empty, return a list of empty fields
  if (emptyFields.length > 0) {
    return emptyFields.map((field) => `${field} is required`);
  }

  // COMMENTED OUT - BillingPeriod model deleted (PostgreSQL)
  // const closedPeriod = await BillingPeriod.findOne({
  //   where: {
  //     billing_status_id: "3",
  //     is_visible: "1",
  //     is_deleted: "0",
  //     billing_start_date: { [Op.lte]: time_tracking_date_entry },
  //     billing_end_date: { [Op.gte]: time_tracking_date_entry },
  //   },
  // });
  const closedPeriod = null; // Placeholder - BillingPeriod model deleted
  //IF BILLING PERIOD IS CLOSED AND MODIFIYNG PERSON IS NON ADMIN THEN DON'T ALLOW (BECAUSE billing admin (with the correct permission) CAN MODIFY CLOSED BILLING PERIOD)
  // Add Billing Admin check with correct permissions (As per updated AC) on 06/05/2024
  if (
    closedPeriod &&
    ((!timeentry_id && is_admin == "0") ||
      (timeentry_id > 0 && is_admin == "0"))
  ) {
    return [
      `Time entry cannot be ${
        timeentry_id && timeentry_id > 0 ? "modified" : "added"
      } to a closed billing period`,
    ];
  }

  // COMMENTED OUT - BillingPeriod model deleted (PostgreSQL)
  // const inReviewPeriod = await BillingPeriod.findOne({
  //   where: {
  //     billing_status_id: "2",
  //     is_visible: "1",
  //     is_deleted: "0",
  //     billing_start_date: { [Op.lte]: time_tracking_date_entry },
  //     billing_end_date: { [Op.gte]: time_tracking_date_entry },
  //   },
  // });
  const inReviewPeriod = null; // Placeholder - BillingPeriod model deleted
  //IF BILLING PERIOD IS IN-REVIEW AND MODIFIYNG PERSON IS NON ADMIN THEN DON'T ALLOW (BECAUSE ADMIN CAN MODIFY IN-REVIEW BILLING PERIOD)
  //CHECKING IF TIMEENTRY IS IN-REVIEW BILLING PERIOD BUT IN REJECTED STATUS, THEN AS A NON-ADMIN USER I CAN MODIFY IT
  let timeentryStatusData = "";
  if (timeentry_id) {
    timeentryStatusData = await TimeEntry.findOne({
      where: {
        id: timeentry_id,
      },
      attributes: ["status"],
    });
  }

  if (
    inReviewPeriod &&
    ((!timeentry_id && is_admin == "0") ||
      (timeentry_id > 0 &&
        is_admin == "0" &&
        timeentryStatusData.status &&
        timeentryStatusData.status != "3"))
  ) {
    return [
      `Time entry cannot be ${
        timeentry_id && timeentry_id > 0 ? "modified" : "added"
      } to an in-review billing period`,
    ];
  }

  return null;
};

export const roundToNearestQuarter = (data) => {
  data = data.split(":");

  let minutesToRound = 15;
  let rounded =
    Math.round(totalTimeInMinutes / minutesToRound) * minutesToRound;
  let rHr = "" + Math.floor(rounded / 60);
  let rMin = "" + (rounded % 60);
  if (rHr == 0) {
    rHr = "00"; // To set 12 noon as actual value instead of 0 as per input type time
  }
  if (rMin == 0) {
    rMin = "00"; // To set 00 noon as actual value instead of 0 as per input type time
  }
  return rHr.padStart(2, "0") + ":" + rMin.padStart(2, "0");
};

export const validateExpense = async (data) => {
  const { expense_id, is_admin } = data;

  const closedPeriod = null; // Placeholder - BillingPeriod model deleted
  //IF BILLING PERIOD IS CLOSED AND MODIFIYNG PERSON IS NON ADMIN THEN DON'T ALLOW (BECAUSE ADMIN CAN MODIFY CLOSED BILLING PERIOD)
  if (
    closedPeriod &&
    ((!expense_id && is_admin == "0") || (expense_id > 0 && is_admin == "0"))
  ) {
    return [
      `Expense cannot be ${
        expense_id && expense_id > 0 ? "modified" : "added"
      } to a closed billing period`,
    ];
  }

  // COMMENTED OUT - BillingPeriod model deleted (PostgreSQL)
  // const inReviewPeriod = await BillingPeriod.findOne({
  //   where: {
  //     billing_status_id: "2",
  //     is_visible: "1",
  //     is_deleted: "0",
  //     billing_start_date: { [Op.lte]: transactionDate },
  //     billing_end_date: { [Op.gte]: transactionDate },
  //   },
  // });
  const inReviewPeriod = null; // Placeholder - BillingPeriod model deleted
  //IF BILLING PERIOD IS IN-REVIEW AND MODIFIYNG PERSON IS NON ADMIN THEN DON'T ALLOW (BECAUSE ADMIN CAN MODIFY IN-REVIEW BILLING PERIOD)
  if (
    inReviewPeriod &&
    ((!expense_id && is_admin == "0") || (expense_id > 0 && is_admin == "0"))
  ) {
    return [
      `Expense cannot be ${
        expense_id && expense_id > 0 ? "modified" : "added"
      } to an in-review billing period`,
    ];
  }
};

export const validateDocumentType = async (data) => {
  let { name } = data;

  // Trim the name
  name = name.trim();

  // Define an array of required fields
  const requiredFields = ["name"];

  // Check if any required field is empty
  const emptyFields = requiredFields.filter((field) => !data[field]);

  // If any required field is empty, return a list of empty fields
  if (emptyFields.length > 0) {
    return emptyFields.map(() => `File type is required`);
  }

  const documentTypeExists = await documentType.findOne({
    where: {
      name: {
        [Op.iLike]: name, // Case-insensitive match i.e must be unique
      },
      is_active: "1",
    },
  });

  if (documentTypeExists) {
    return "file_type_exists";
  }

  // If all required fields are present and not empty, return null
  return null;
};

export const validateTemplate = (data) => {
  const { templateName } = data;
  const fieldAliases = {
    templateName: "Template Name",
    fileType: "File Type",
    caseTypes: "Case Type",
  };

  let requiredFields = ["templateName", "fileType", "caseTypes"];

  const emptyFields = requiredFields.filter((field) => !data[field]);
  if (emptyFields.length > 0) {
    return emptyFields.map((field) => `${fieldAliases[field]} is required`);
  }

  if (templateName && !/^[a-zA-Z0-9-_ \s]+$/.test(templateName)) {
    return ["Name must contain only alphanumeric characters"];
  }
};
