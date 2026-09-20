// COMMENTED OUT - Root level PostgreSQL models deleted
// import AgencyPortalCaseRequest from "../models/caseRequestModel.js"; // DELETED - PostgreSQL model
// import AgencyPortalCaseRequestStatus from "../models/caseRequestStatusModel.js"; // DELETED - PostgreSQL model
// COMMENTED OUT - Case models deleted (PostgreSQL)
// import Case from "../models/case/caseDetailsModel.js"; // DELETED - PostgreSQL model
// import CaseParty from "../models/case/partyDetailsCaseModel.js"; // DELETED - PostgreSQL model
// import CaseMinorParty from "../models/case/minorChildrenPartyDetailsCaseModel.js"; // DELETED - PostgreSQL model
// import CaseDocument from "../models/case/documentsModel.js"; // DELETED - PostgreSQL model

import {
  AUDIT_LOG_MODULE_NAME,
  AUDIT_LOG_ACTIONS,
} from "../constants/constant-messages.js";
import { mysqlSequelize } from "../../connections/seqDB.js";
import { insertModuleAuditLog } from "../helpers/auditLogs.helper.js";
// import { setCaseIdSequence } from "../helpers/case.helper"; // DELETED - case.helper.js file deleted
import {
  generateUniqueS3Key,
  extractOriginalFileName,
  getFile,
  uploadFile,
} from "../../helpers/s3.js";
import { logger } from "../../config/winstonLogger.js";
const moduleNames = [AUDIT_LOG_MODULE_NAME.CASE_REQUESTS];

export const rejectCaseInitiationRequest = async (req, res) => {
  const userId = req.userId;
  const { caseRequestId, feedback, currentValue } = req.body;

  try {
    // Find the case request by ID
    // COMMENTED OUT - AgencyPortalCaseRequest model deleted (PostgreSQL)
    // const caseRequest = await AgencyPortalCaseRequest.findByPk(caseRequestId);
    const caseRequest = null; // Placeholder - AgencyPortalCaseRequest model deleted
    if (!caseRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Case request not found" });
    }

    // Update the status_id and feedback
    caseRequest.status_id = 3;
    await caseRequest.save();

    // Insert audit log for the case request
    for (const moduleName of moduleNames) {
      await insertModuleAuditLog(
        userId,
        AUDIT_LOG_ACTIONS.REJECTED,
        `{{User}} rejected case initiation request ${caseRequestId}`,
        moduleName,
        "status_id",
        caseRequestId,
        currentValue,
        "Rejected",
        feedback,
      );
    }

    // COMMENTED OUT - AgencyPortalCaseRequestStatus model deleted (PostgreSQL)
    // const caseRequestStatus = await AgencyPortalCaseRequestStatus.findByPk(3, {
    //   attributes: ["id", "status"],
    // });
    const caseRequestStatus = null; // Placeholder - AgencyPortalCaseRequestStatus model deleted

    const updatedStatus = {
      status: caseRequestStatus?.dataValues?.status,
      status_id: caseRequestStatus?.dataValues?.id,
    };

    return res.status(200).json({
      success: true,
      message: "Case initiation request rejected successfully",
      updatedStatus,
    });
  } catch (error) {
    logger.error("Error rejecting case initiation request:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal Server Error" });
  }
};

export const approveCaseInitiationRequest = async (req, res) => {
  const { caseFiles, caseRequestStatus, id, parties } = req.body;

  const userId = req.userId;

  const transaction = await mysqlSequelize.transaction();
  try {
    /************* CASE_ID GENERATION LOGIC  ******************/
    // COMMENTED OUT - setCaseIdSequence function deleted (case.helper.js deleted)
    // await setCaseIdSequence();
    /*******   END OF CASE_ID GENERATION LOGIC ***********/

    // COMMENTED OUT - Case model deleted (PostgreSQL)
    // const caseDetails = await Case.create(caseDetailsData, { transaction });
    const caseDetails = null; // Placeholder - Case model deleted
    const caseId = caseDetails.dataValues.case_id;

    if (caseFiles.length > 0) {
      await Promise.all(
        caseFiles.map(async (file) => {
          const fileStream = await getFile(file.file_upload_key);
          const uniqueS3Key = generateUniqueS3Key(
            extractOriginalFileName(file.file_upload_key),
          );

          // Convert the stream to a buffer
          const chunks = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          await uploadFile(buffer, uniqueS3Key, true);

          // COMMENTED OUT - CaseDocument model deleted (PostgreSQL)
          // await CaseDocument.create(documentData, { transaction });
        }),
      );
    }
    // COMMENTED OUT - CaseMinorParty model deleted (PostgreSQL)
    // if (parties.length > 0) {
    //   await Promise.all(
    //     parties.map(async (party) => {
    //       if (
    //         party.partyType.party_type_name === "Minor/child" ||
    //         party.partyType.party_type_name === "Minor/children"
    //       ) {

    //         // await CaseMinorParty.create(minorPartyData, { transaction });
    //       } else {
    //         // COMMENTED OUT - CaseParty model deleted (PostgreSQL)
    //         // await CaseParty.create(partyData, { transaction });
    //       }
    //     }),
    //   );
    // }

    // COMMENTED OUT - AgencyPortalCaseRequest model deleted (PostgreSQL)
    // const caseRequest = await AgencyPortalCaseRequest.findByPk(id);
    const caseRequest = null; // Placeholder - AgencyPortalCaseRequest model deleted
    caseRequest.status_id = 4;
    await caseRequest.save({ transaction });

    // Insert audit log for the case request
    for (const moduleName of moduleNames) {
      await insertModuleAuditLog(
        userId,
        AUDIT_LOG_ACTIONS.APPROVED,
        `{{User}} approved case initiation request ${id}`,
        moduleName,
        "status_id",
        id,
        caseRequestStatus.status,
        "Approved",
        "",
      );
    }

    // COMMENTED OUT - AgencyPortalCaseRequestStatus model deleted (PostgreSQL)
    // const caseRequestStatusModel = await AgencyPortalCaseRequestStatus.findByPk(
    //   4,
    //   {
    //     attributes: ["id", "status"],
    //   }
    // );
    const caseRequestStatusModel = null; // Placeholder - AgencyPortalCaseRequestStatus model deleted

    const updatedStatus = {
      status: caseRequestStatusModel.dataValues.status,
      status_id: caseRequestStatusModel.dataValues.id,
    };

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Case request approved successfully",
      caseId,
      updatedStatus,
    });
  } catch (error) {
    await transaction.rollback();
    logger.error("Error approving case initiation request:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};
