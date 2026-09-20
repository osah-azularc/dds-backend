import documentTypes from "../../models/case/documentTypeModel.js";
import { Sequelize } from "sequelize";
import { validateDocument } from "../../../helpers/caseValidation.js";
import {
  CASE_FILE_PATH,
  PORTAL_NAMES,
  AUDIT_LOG_MODULE_NAME,
  AUDIT_LOG_CASES_MODULE,
  AUDIT_LOG_ACTIONS,
} from "../../constants/constant-messages.js";
import {
  getFile,
  deleteFile,
  uploadFile,
  generateUniqueS3Key,
} from "../../../helpers/s3.js";
import { insertModuleAuditLog } from "../../helpers/auditLogs.helper.js";
const caseModuleNames = [AUDIT_LOG_MODULE_NAME.CASES];

/**** Note: Since this API is also used in the public portal, any changes made here will impact the public portal as well. Please ensure to cross-check with the public portal accordingly. ***/
export const getAllDocuments = async (req, res) => {
  try {
    const { case_id } = req.body;
    const user_id = req.userId;

    // check active session's user is Osah Core user or not
    const requestedPortal = req.headers["x-portal"] || "";
    let coreUser = null;
    if (requestedPortal && requestedPortal === PORTAL_NAMES.OSAH_INTERNAL) {
      coreUser = await Users.findOne({
        where: {
          id: user_id,
          is_active: true,
          account_registration_status: "Active",
        },
        attributes: ["id"],
      });
    }

    // Confidential files are only visible to Core users (not Agency or Public)
    let internalWhereCondition = {
      case_id: case_id,
      efile_submission: false,
    };
    if (!coreUser) {
      internalWhereCondition = {
        ...internalWhereCondition,
        is_template_confidential: false,
      };
    }

    if (case_id > 0) {
      const internalDocumentsResult = await documents.findAll({
        where: internalWhereCondition,
        attributes: [
          "id",
          "description",
          "file_name",
          "created_by",
          [
            Sequelize.col("document_details_case_document_type.name"),
            "document_type_name",
          ],
          [
            Sequelize.literal("TO_CHAR(documents.updated_date, 'MM/DD/YYYY')"),
            "formatted_modified_date",
          ],
          [
            Sequelize.literal("TO_CHAR(documents.date_filed, 'MM/DD/YYYY')"),
            "formatted_date_filed",
          ],
          [
            Sequelize.literal(
              "CASE WHEN documents.updated_by IS NOT NULL THEN CONCAT(document_details_updatedby_user.first_name, ' ', document_details_updatedby_user.last_name) ELSE NULL END",
            ),
            "modified_name",
          ],
          [
            Sequelize.literal(
              "CASE WHEN documents.created_by IS NOT NULL THEN CONCAT(document_details_createdby_user.first_name, ' ', document_details_createdby_user.last_name) ELSE NULL END",
            ),
            "created_name",
          ],
          [
            Sequelize.literal(
              "CASE WHEN documents.file_name IS NOT NULL THEN UPPER(SUBSTRING(documents.file_name FROM '\\.([^\\.]+)$')) ELSE NULL END",
            ),
            "file_extension",
          ],
          "efile_submission", // efile_submission is used in public portal frontend case details page to show efile icon
          [
            Sequelize.literal(
              "CASE WHEN documents.template_id IS NOT NULL AND documents.template_id > 0 THEN template.name ELSE documents.name END",
            ),
            "name",
          ],
        ],
        order: [["created_date", "DESC"]],
        include: [
          {
            model: documentTypes,
            as: "document_details_case_document_type",
            attributes: [],
          },
          {
            model: Users,
            as: "document_details_updatedby_user",
            attributes: [],
          },
          {
            model: Users,
            as: "document_details_createdby_user",
            attributes: [],
          },
        ],
      });
      const efileDocumentsResult = await documents.findAll({
        where: { case_id: case_id, efile_submission: true },
        attributes: [
          "id",
          "name",
          "description",
          "file_name",
          "created_by",
          [
            Sequelize.col("document_details_case_document_type.name"),
            "document_type_name",
          ],
          [
            Sequelize.literal("TO_CHAR(documents.updated_date, 'MM/DD/YYYY')"),
            "formatted_modified_date",
          ],
          [
            Sequelize.literal("TO_CHAR(documents.date_filed, 'MM/DD/YYYY')"),
            "formatted_date_filed",
          ],
          [
            Sequelize.literal(
              "CASE WHEN documents.updated_by IS NOT NULL THEN CONCAT(document_details_updatedby_user.first_name, ' ', document_details_updatedby_user.last_name) ELSE NULL END",
            ),
            "modified_name",
          ],
          [
            Sequelize.literal(
              "CASE WHEN documents.file_name IS NOT NULL THEN UPPER(SUBSTRING(documents.file_name FROM '\\.([^\\.]+)$')) ELSE NULL END",
            ),
            "file_extension",
          ],
          "efile_submission", // efile_submission is used in public portal frontend case details page to show efile icon
          [
            Sequelize.literal(
              "CASE WHEN documents.created_by IS NOT NULL THEN CONCAT(document_details_createdby_public_user.first_name, ' ', document_details_createdby_public_user.last_name) ELSE NULL END",
            ),
            "created_name",
          ],
        ],
        order: [["created_date", "DESC"]],
        include: [
          {
            model: documentTypes,
            as: "document_details_case_document_type",
            attributes: [],
          },
          {
            model: Users,
            as: "document_details_updatedby_user",
            attributes: [],
          },
          {
            model: PublicUserModel,
            as: "document_details_createdby_public_user",
            attributes: [],
          },
        ],
      });
      // merge internal and efile documents
      const documentsResult = [
        ...internalDocumentsResult,
        ...efileDocumentsResult,
      ];
      return res.status(200).json({
        status: 200,
        message: "Documents data fetched successfully",
        data: documentsResult,
        success: true,
      });
    } else {
      return res.status(200).json({
        status: 500,
        title: "Unable to fetch documents data",
        message:
          "Documents data is unable to fetch at this time. Please try again.",
        success: false,
      });
    }
  } catch (error) {
    return res.status(200).json({
      status: 500,
      title: "Unable to fetch documents data",
      message:
        "Documents data is unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

export const getDocumentTypes = async (req, res) => {
  try {
    const documentTypesResult = await documentTypes.findAll({
      attributes: ["id", ["documenttype", "name"]],
      where: { public_access_flag: 1 },
      order: [["documenttype", "ASC"]],
    });
    return res.status(200).json({
      status: 200,
      message: "Document type data fetched successfully",
      data: documentTypesResult,
      success: true,
    });
  } catch (error) {
    return res.status(200).json({
      status: 500,
      title: "Unable to fetch document type data",
      message:
        "Document type data is unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

export const addDocument = async (req, res) => {
  try {
    const fileData = req.file;
    const { case_id, name, document_type, date_filed, description } = req.body;
    const user_id = req.userId;
    const validationErrors = validateDocument(req.body);
    if (validationErrors) {
      return res.status(200).json({
        status: 400,
        title: "Unable to upload file",
        message: validationErrors,
        success: false,
      });
    }
    if (!fileData) {
      return res.status(200).json({
        status: 500,
        title: "Unable to upload file",
        message:
          "The file could not be uploaded at this time. Please try again.",
        success: false,
      });
    }

    const documentDetailsData = {
      case_id: case_id,
      name: name,
      document_type: document_type,
      date_filed: date_filed,
      description: description,
      file_name: fileData.originalname
        ? CASE_FILE_PATH +
          case_id +
          "/" +
          generateUniqueS3Key(fileData.originalname)
        : "",
      created_by: user_id,
      created_date: new Date(),
    };

    // first upload file to s3 bucket
    const uploadResult = await uploadFile(
      fileData.buffer,
      documentDetailsData.file_name,
      true,
    );

    if (uploadResult) {
      const documentDetailsResult = await documents.create(documentDetailsData);

      if (documentDetailsResult) {
        // AUDIT LOG FOR CREATE DOCUMENT : START
        const result = await documentTypes.findOne({
          where: { id: document_type },
          attributes: ["name"],
        });
        const caseDocumentCreatedData = {
          name,
          document_type: result ? result.name : "",
          date_filed: date_filed,
          description: description,
        };

        for (const moduleName of caseModuleNames) {
          for (const [key, value] of Object.entries(caseDocumentCreatedData)) {
            insertModuleAuditLog(
              user_id,
              AUDIT_LOG_ACTIONS.CREATED,
              `{{User}} added ${name}`,
              moduleName,
              key,
              documentDetailsResult.dataValues.id,
              "",
              value,
              "",
              "",
              AUDIT_LOG_CASES_MODULE.DOCUMENTS,
              case_id,
            );
          }
        }
        // AUDIT LOG FOR CREATE DOCUMENT : END

        const assignedUsers = await Cases.findAll({
          where: {
            case_id,
          },
          attributes: ["judge_id"],
          include: [
            {
              where: {
                case_id: case_id,
              },
              model: SupportStaffCase,
              attributes: ["support_staff_id"],
              as: "CaseSupportStaff",
              order: [["created_date", "DESC"]],
            },
          ],
          raw: true,
        });

        const options = {
          message: "A file has been added on",
          comment: fileData.originalname,
          file_name: documentDetailsResult.file_name,
          created_by: user_id,
          entry_id: case_id,
          user_id: [
            ...new Set(
              assignedUsers
                .map((obj) => Object.values(obj))
                .flatMap((inArr) => inArr),
            ),
          ],
        };
        await createAndSendNotificationData(options);

        return res.status(200).json({
          status: 200,
          message: "File uploaded. Performing security scan",
          success: true,
        });
      }
    }

    return res.status(200).json({
      status: 500,
      title: "Unable to upload file",
      message: "The file could not be uploaded at this time. Please try again.",
      success: false,
    });
  } catch (error) {
    return res.status(200).json({
      status: 500,
      title: "Unable to upload file",
      message: "The file could not be uploaded at this time. Please try again.",
      success: false,
    });
  }
};

export const getDocument = async (req, res) => {
  try {
    const { key } = req.body;
    if (key) {
      const fileStream = await getFile(key);

      if (fileStream?.pipe) {
        res.attachment(key);
        fileStream.pipe(res);
      } else {
        return res.status(200).json({
          status: 500,
          title: "Unable to fetch document data",
          message:
            "Document data is unable to fetch at this time. Please try again.",
          success: false,
        });
      }
    } else {
      return res.status(200).json({
        status: 500,
        title: "Unable to fetch document data",
        message:
          "Document data is unable to fetch at this time. Please try again.",
        success: false,
      });
    }
  } catch (error) {
    return res.status(200).json({
      status: 500,
      title: "Unable to fetch document data",
      message:
        "Document data is unable to fetch at this time. Please try again.",
      success: false,
    });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const { id, key } = req.body;
    if (id) {
      const documentDetailsResult = await documents.findOne({
        where: { id: id },
      });
      if (documentDetailsResult) {
        const deleteResult = await documents.destroy({
          where: { id: id },
        });
        if (deleteResult) {
          // delete file from s3 bucket
          const deleteFileResult = await deleteFile(key);
          if (deleteFileResult) {
            return res.status(200).json({
              status: 200,
              message: "File deleted",
              success: true,
            });
          }
        }
      }
    }
    return res.status(200).json({
      status: 500,
      title: "Unable to delete file",
      message: "The file could not be deleted. Please try again.",
      success: false,
    });
  } catch (error) {
    return res.status(200).json({
      status: 500,
      title: "Unable to delete file",
      message: "The file could not be deleted. Please try again.",
      success: false,
    });
  }
};

export const editCaseFileDetails = async (req, res) => {
  try {
    const { id, name, document_type, date_filed, description, case_id } =
      req.body;

    const user_id = req.userId;
    const validationErrors = validateDocument(req.body);
    if (validationErrors) {
      return res.status(200).json({
        status: 400,
        title: "Unable to upload file",
        message: validationErrors,
        success: false,
      });
    }

    const updateData = {
      name: name,
      document_type: document_type,
      date_filed: date_filed,
      description: description,
      updated_by: user_id,
      updated_date: new Date(),
    };
    const documentTypeResult = await documentTypes.findOne({
      where: { id: document_type },
      attributes: ["name"],
    });

    const originalData = await documents.findOne({
      where: { id: id, case_id: case_id },
      attributes: [
        "name",
        [
          Sequelize.col("document_details_case_document_type.name"),
          "document_type",
        ],
        [Sequelize.literal("TO_CHAR(date_filed, 'YYYY-MM-DD')"), "date_filed"],
        "description",
      ],
      include: [
        {
          model: documentTypes,
          as: "document_details_case_document_type",
          attributes: [],
        },
      ],
      raw: true,
    });

    const changes = {};
    const updatedData = { ...updateData };
    delete updatedData.updated_by;
    delete updatedData.updated_date;
    updatedData.document_type = documentTypeResult
      ? documentTypeResult.name
      : "";

    for (const key in updatedData) {
      if (
        updatedData.hasOwnProperty(key) &&
        originalData[key] != updatedData[key]
      ) {
        changes[key] = {
          original: originalData[key] ?? "",
          updated: updatedData[key] ?? "",
        };
      }
    }

    const documentDetailsResult = await documents.update(updateData, {
      where: { id: id, case_id: case_id },
    });
    if (documentDetailsResult) {
      if (changes) {
        for (const moduleName of caseModuleNames) {
          for (const [key, value] of Object.entries(changes)) {
            await insertModuleAuditLog(
              user_id,
              AUDIT_LOG_ACTIONS.EDITED,
              `{{User}} edited ${name}`,
              moduleName,
              key,
              id,
              value.original,
              value.updated,
              "",
              "",
              AUDIT_LOG_CASES_MODULE.DOCUMENTS,
              case_id,
            );
          }
        }
      }

      return res.status(200).json({
        status: 200,
        message: "Case file successfully updated",
        success: true,
      });
    }

    return res.status(200).json({
      status: 500,
      title: "Unable to update file details",
      message:
        "The file details could not be updated at this time. Please try again.",
      success: false,
    });
  } catch (error) {
    return res.status(200).json({
      status: 500,
      title: "Unable to update file details",
      message:
        "The file details could not be updated at this time. Please try again.",
      success: false,
    });
  }
};
