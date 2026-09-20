// COMMENTED OUT - Root level PostgreSQL models deleted
// import User from "../models/userModel"; // DELETED - PostgreSQL model
// import TempAgency from "../models/docket_search_models/agencyTempModel"; // DELETED - PostgreSQL model
// import Party from "../models/docket_search_models/partyModel"; // DELETED - PostgreSQL model
// import CaseType from "../models/docket_search_models/caseTypeModel"; // DELETED - PostgreSQL model
// import HearingType from "../models/docket_search_models/hearingTypeModel"; // DELETED - PostgreSQL model
// import Docket from "../models/docket_search_models/docketModel"; // DELETED - PostgreSQL model
import { Op } from "sequelize";

export const fetchFilteredDockets = async (req, res) => {
  const filters = req.body;

  const whereConditions = {};

  if (filters.docketStatus) {
    whereConditions.docket_status = filters.docketStatus;
  }

  if (filters.agency) {
    whereConditions.agency_id = filters.agency;
  }

  if (filters.agencyRefNumber) {
    whereConditions.agency_ref_number = filters.agencyRefNumber;
  }

  if (filters.caseType) {
    whereConditions.case_type_id = filters.caseType;
  }

  if (filters.dateRequested && filters.dateRequested.length === 2) {
    if (filters.dateRequested[0] && filters.dateRequested[1]) {
      whereConditions.date_requested = {
        [Op.between]: filters.dateRequested,
      };
    } else if (filters.dateRequested[0]) {
      whereConditions.date_requested = {
        [Op.gte]: filters.dateRequested[0],
      };
    } else if (filters.dateRequested[1]) {
      whereConditions.date_requested = {
        [Op.lte]: filters.dateRequested[1],
      };
    }
  }

  if (filters.dateReceived && filters.dateReceived.length === 2) {
    if (filters.dateReceived[0] && filters.dateReceived[1]) {
      whereConditions.date_received = {
        [Op.between]: filters.dateReceived,
      };
    } else if (filters.dateReceived[0]) {
      whereConditions.date_received = {
        [Op.gte]: filters.dateReceived[0],
      };
    } else if (filters.dateReceived[1]) {
      whereConditions.date_received = {
        [Op.lte]: filters.dateReceived[1],
      };
    }
  }

  if (filters.hearingType) {
    whereConditions.hearing_type_id = filters.hearingType;
  }

  if (filters.hearingDate && filters.hearingDate.length === 2) {
    if (filters.hearingDate[0] && filters.hearingDate[1]) {
      whereConditions.hearing_date = {
        [Op.between]: filters.hearingDate,
      };
    } else if (filters.hearingDate[0]) {
      whereConditions.hearing_date = {
        [Op.gte]: filters.hearingDate[0],
      };
    } else if (filters.hearingDate[1]) {
      whereConditions.hearing_date = {
        [Op.lte]: filters.hearingDate[1],
      };
    }
  }

  if (filters.partyName) {
    whereConditions["$party.party_name$"] = filters.partyName;
  }

  if (filters.partyType) {
    whereConditions["$party.party_type_id$"] = filters.partyType;
  }

  if (filters.staffAssigned) {
    whereConditions["$assigned_staff.id$"] = filters.staffAssigned;
  }

  if (filters.judge) {
    whereConditions["$assigned_judge.id$"] = filters.judge;
  }
  try {
    const dockets = []; // Placeholder - Docket search models deleted

    res.json({ success: true, dockets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
