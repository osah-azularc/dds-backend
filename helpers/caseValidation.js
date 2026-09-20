import { Sequelize, Op } from "sequelize";
import partyType from "../api/models/admin/partyTypeModel.js";
import { COURT_EVENT_STATUS } from "../api/constants/constant-messages.js";
import moment from "moment";

export const validateParties = async (data) => {
  const {
    party_type_id,
    firstname,
    lastname,
    title,
    city,
    zip,
    phone,
    email,
    fax,
    attorney_bar,
    badge_no,
    birth_year,
  } = data;

  const fieldAliases = {
    case_id: "Case ID",
    party_type_id: "Party type",
    firstname: "First name",
    lastname: "Last name",
    address1: "Address 1",
    city: "City",
    state: "State",
    zip: "Zip",
    birth_year: "Birth year",
  };

  if (!party_type_id || party_type_id === "" || party_type_id === 0) {
    return ["Party type is required"];
  }

  const partyTypeTable = await partyType.findOne({
    where: { id: party_type_id },
    attributes: ["party_type_name", "party_type_table", "is_attorney"],
  });

  let requiredFields = [
    "case_id",
    "party_type_id",
    "firstname",
    "lastname",
    "address1",
    "city",
    "state",
    "zip",
  ];
  if (
    partyTypeTable?.party_type_name === "Minor/child" ||
    partyTypeTable?.party_type_name === "Minor/children"
  ) {
    requiredFields = [
      "case_id",
      "party_type_id",
      "firstname",
      "lastname",
      "birth_year",
    ];
  }

  const emptyFields = requiredFields.filter((field) => !data[field]);
  if (emptyFields.length > 0) {
    return emptyFields.map((field) => `${fieldAliases[field]} is required`);
  }

  if (partyTypeTable?.is_attorney === "1" && !attorney_bar) {
    return ["Attorney bar number is required"];
  }
  if (partyTypeTable?.party_type_name === "Officer" && !badge_no) {
    return ["Badge number is required"];
  }

  if (firstname && !/^[a-zA-Z\s]+$/.test(firstname)) {
    return ["Firstname must contain only alphabetic characters"];
  }
  if (lastname && !/^[a-zA-Z\s]+$/.test(lastname)) {
    return ["Lastname must contain only alphabetic characters"];
  }
  if (title && !/^[a-zA-Z\s.]+$/.test(title)) {
    return ["Title must contain only alphabetic characters"];
  }
  if (city && !/^[a-zA-Z\s]+$/.test(city)) {
    return ["City must contain only alphabetic characters"];
  }
  if (zip && !/^\d+$/.test(zip)) {
    return ["Zip must contain only numeric characters"];
  }
  if (zip && /^\d+$/.test(zip) && zip.length > 10) {
    return ["Zip must be 10 digits"];
  }
  if (phone && !/^\d+$/.test(phone)) {
    return ["Phone number must contain only numeric characters"];
  }
  if (
    phone &&
    /^\d+$/.test(phone) &&
    (phone.length < 10 || phone.length > 10)
  ) {
    return ["Phone number must be 10 digits"];
  }
  if (fax && !/^\d+$/.test(fax)) {
    return ["Fax number must contain only numeric characters"];
  }
  if (fax && /^\d+$/.test(fax) && (fax.length < 10 || fax.length > 10)) {
    return ["Fax number must be 10 digits"];
  }
  if (email && !/^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$/.test(email)) {
    return ["Email format is not valid"];
  }
  if (birth_year && !/^\d+$/.test(birth_year)) {
    return ["Birth year must contain only numeric characters"];
  }
};

export const validateCase = async (data) => {
  const {
    case_id,
    date_requested,
    date_received,
    agency_reference_no,
    county,
    judge_id,
    support_staff_id,
    is_continue,
    future_court_event_update,
  } = data;

  try {
    validateCaseRequiredFields(data);
    validateCaseAgencyReferenceNo(agency_reference_no);
    validateCasesDates(date_requested, date_received);
    validateCasesCounty(county);

    if (case_id > 0 && !is_continue) {
      await checkCaseJudgeAndSupportStaffChanges(
        case_id,
        judge_id,
        support_staff_id,
        future_court_event_update,
      );
    }
  } catch (error) {
    return [error.message];
  }
};

const validateCaseRequiredFields = (data) => {
  const MAX_CASE_NAME_LENGTH = 100;

  const FIELD_ALIASES = {
    case_name: "Case name",
    agency_id: "Agency",
    agency_reference_no: "Agency reference no",
    date_requested: "Date requested",
    date_received: "Date received",
  };

  const REQUIRED_FIELDS = [
    "case_name",
    "date_requested",
    "date_received",
    "agency_id",
    "agency_reference_no",
  ];

  const emptyFields = REQUIRED_FIELDS.filter((field) => !data[field]);
  if (emptyFields.length > 0) {
    throw new Error(
      emptyFields
        .map((field) => `${FIELD_ALIASES[field]} is required`)
        .join(", "),
    );
  }
  if (data?.case_name.length > MAX_CASE_NAME_LENGTH) {
    throw new Error("Case name must not exceed 100 characters");
  }
};
const validateCaseAgencyReferenceNo = (agency_reference_no) => {
  const MAX_AGENCY_REF_NO_LENGTH = 10;
  if (!/^\d+$/.test(agency_reference_no)) {
    throw new Error(
      "Agency reference number must contain only numeric characters",
    );
  }
  if (agency_reference_no.length > MAX_AGENCY_REF_NO_LENGTH) {
    throw new Error("Agency reference number must not exceed 10 numbers");
  }
};
const validateCasesDates = (date_requested, date_received) => {
  if (date_requested && moment(date_requested).isAfter(moment())) {
    throw new Error("Date requested cannot be in the future");
  }
  if (date_received && moment(date_received).isAfter(moment())) {
    throw new Error("Date received cannot be in the future");
  }
};
const validateCasesCounty = (county) => {
  if (county && !/^[a-zA-Z\s]+$/.test(county)) {
    throw new Error("County must contain only alphabetic characters");
  }
};
const checkCaseJudgeAndSupportStaffChanges = async (
  case_id,
  judge_id,
  support_staff_id,
  future_court_event_update,
) => {
  const prevJudgeCase = await caseDetails.findOne({
    where: { case_id },
    attributes: ["judge_id"],
  });

  const isJudgeAssigneeChanged =
    prevJudgeCase && prevJudgeCase.judge_id !== judge_id;

  let isSupportStaffAssigneeChanged = false;
  if (future_court_event_update) {
    const futureCourtEvents = await CourtEvent.findAll({
      where: {
        case_id,
        status: {
          [Op.in]: [
            COURT_EVENT_STATUS.SCHEDULED,
            COURT_EVENT_STATUS.RESCHEDULED,
          ],
        },
        event_date: { [Op.gte]: moment().format("YYYY-MM-DD") },
      },
      attributes: ["id"],
    });
    for (const courtEvent of futureCourtEvents) {
      const courtEventSupportStaffs = await courtEventSupportStaff.findAll({
        attributes: ["court_event_id"],
        where: {
          court_event_id: courtEvent.id,
          support_staff_id: { [Op.in]: support_staff_id },
        },
        group: ["court_event_id"],
        having: Sequelize.literal(
          `COUNT(DISTINCT support_staff_id) = ${support_staff_id.length}`,
        ),
      });
      if (courtEventSupportStaffs.length === 0) {
        isSupportStaffAssigneeChanged = true;
        break;
      }
    }
  }
  if (isJudgeAssigneeChanged || isSupportStaffAssigneeChanged) {
    const case_ids = [case_id];
    const todayCourtEvents = await checkTodaysCourtEvents(case_ids);
    if (todayCourtEvents > 0) {
      let appendText = "";
      if (isJudgeAssigneeChanged && isSupportStaffAssigneeChanged) {
        appendText = "judge and support staff";
      } else if (isJudgeAssigneeChanged) {
        appendText = "judge";
      } else if (isSupportStaffAssigneeChanged) {
        appendText = "support staff";
      }
      throw new Error(`today_court_event_exists_${appendText}`);
    }
  }
};

export const validateAutopopulateParties = (data) => {
  const { searched_party_name } = data;

  if (!searched_party_name || searched_party_name === "") {
    return ["Party name is required to search"];
  }

  if (searched_party_name.length < 3) {
    return ["Party name must be at least 3 characters long to search"];
  }
};

export const validateDocument = (data) => {
  const { name } = data;
  const fieldAliases = {
    case_id: "Case ID",
    name: "Name",
    document_type: "Document type",
    date_filed: "Date filed",
  };

  let requiredFields = ["case_id", "name", "document_type", "date_filed"];

  const emptyFields = requiredFields.filter((field) => !data[field]);
  if (emptyFields.length > 0) {
    return emptyFields.map((field) => `${fieldAliases[field]} is required`);
  }

  if (name && !/^[a-zA-Z0-9-_ \s]+$/.test(name)) {
    return ["Name must contain only alphanumeric characters"];
  }
};

export const validateCaseNote = (data) => {
  const { note } = data;
  const fieldAliases = {
    case_id: "Case ID",
    note: "Note",
  };

  let requiredFields = ["case_id", "note"];

  const emptyFields = requiredFields.filter((field) => !data[field]);
  if (emptyFields.length > 0) {
    return emptyFields.map((field) => `${fieldAliases[field]} is required`);
  }

  if (note && note.length > 2000) {
    return ["Note must be 2000 characters or less"];
  }
};

export const validateBulkEditJudgeAction = async (data) => {
  const { case_ids, judge, is_continue } = data;
  const fieldAliases = {
    case_ids: "Case IDs",
    judge: "Judge",
  };

  let requiredFields = ["case_ids", "judge"];

  const emptyFields = requiredFields.filter((field) => !data[field]);
  if (emptyFields.length > 0) {
    return emptyFields.map((field) => `${fieldAliases[field]} is required`);
  }
  const whereRoleCondition = {
    role_name: {
      [Op.iLike]: "judge",
    },
  };
  const roleBasedUsers = await User.count({
    distinct: true, // Ensures distinct counting of records
    where: { id: judge, is_active: true },
    include: [
      {
        model: Role,
        as: "role",
        attributes: ["role_name", "id"], // Specify the fields you want from the Role model
        where: whereRoleCondition,
      },
    ],
  });
  if (!roleBasedUsers) {
    return ["Selected user is not a judge"];
  }
  //Also check that is there any todays court events exists for the selected cases, if Yes then pass today_court_event_exists as a message
  if (!is_continue) {
    const todayCourtEvents = await checkTodaysCourtEvents(case_ids);
    if (todayCourtEvents > 0) {
      return "today_court_event_exists";
    }
  }
};

export const validateBulkEditSupportStaffAction = async (data) => {
  const { case_ids, is_continue, future_court_event_update } = data;
  const fieldAliases = {
    case_ids: "Case IDs",
    judge: "Support Staff",
  };

  let requiredFields = ["case_ids", "support_staffs"];

  const emptyFields = requiredFields.filter((field) => !data[field]);
  if (emptyFields.length > 0) {
    return emptyFields.map((field) => `${fieldAliases[field]} is required`);
  }
  // Also check that is there any todays court events exists for the selected cases, if Yes then pass today_court_event_exists as a message for both action add and remove
  if (!is_continue && future_court_event_update) {
    const todayCourtEvents = await checkTodaysCourtEvents(case_ids);
    if (todayCourtEvents > 0) {
      return "today_court_event_exists";
    }
  }
};

async function checkTodaysCourtEvents(case_ids) {
  return await CourtEvent.count({
    where: {
      case_id: { [Op.in]: case_ids },
      event_date: moment().format("YYYY-MM-DD"),
    },
  });
}

export const validateCourtEvent = async (data) => {
  const { start_time, end_time, judge, comment } = data;

  const fieldAliases = {
    case_id: "Case ID",
    event_type: "Event Type",
    event_date: "Date",
    start_time: "Start Time",
    location: "Location",
    judge: "Judge",
  };

  let requiredFields = [
    "case_id",
    "event_type",
    "event_date",
    "start_time",
    "location",
    "judge",
  ];

  const emptyFields = requiredFields.filter((field) => !data[field]);
  if (emptyFields.length > 0) {
    return emptyFields.map((field) => `${fieldAliases[field]} is required`);
  }

  if (end_time && start_time) {
    const startTime = moment(start_time, "HH:mm:ss");
    const endTime = moment(end_time, "HH:mm:ss");

    if (!startTime.isValid() || !endTime.isValid()) {
      return ["Invalid start or end time format"];
    }

    if (startTime.isSameOrAfter(endTime)) {
      return ["Start time must be less than end time"];
    }
  }
  if (comment && comment.length > 200) {
    return ["Comment should be maximum of 200 characters"];
  }

  const whereRoleCondition = {
    role_name: {
      [Op.iLike]: "judge",
    },
  };
  const roleBasedUsers = await User.count({
    distinct: true, // Ensures distinct counting of records
    where: { id: judge, is_active: true },
    include: [
      {
        model: Role,
        as: "role",
        attributes: ["role_name", "id"], // Specify the fields you want from the Role model
        where: whereRoleCondition,
      },
    ],
  });
  if (!roleBasedUsers) {
    return ["Selected user is not a judge"];
  }
};

export const validateDeleteCourtEvent = (data) => {
  const { reason } = data;

  if (!reason || reason === "") {
    return ["Reason is required"];
  }

  if (reason.length > 2000) {
    return ["Reason should be maximum of 2000 characters"];
  }
};

export const validateReopenCase = (data) => {
  const MAX_CASE_REOPEN_REASON_LENGTH = 2000;
  const { reason } = data;

  if (reason && reason.length > MAX_CASE_REOPEN_REASON_LENGTH) {
    return ["Reason should be maximum of 2000 characters"];
  }
};
