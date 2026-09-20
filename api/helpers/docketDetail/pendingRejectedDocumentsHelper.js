import ExternalDocuments from "../../models/ExternalDocuments.js";
import { Op, Sequelize } from "sequelize";

/**
   * Get rejected / pending documents for docket detail with reports-style pagination and sorting.
   */

export const getRejectedPendingDocumentsHelper = async ({
  caseId,
  page = 0,
  limit = 20,
  sortBy = "dateSubmitted",
  sortOrder = "desc",
}) => {
    const normalizedPage = Math.max(Number.parseInt(page, 10) || 0, 0);
    const normalizedLimit = Math.max(Number.parseInt(limit, 10) || 20, 1);
    const normalizedSortBy = sortBy || "dateSubmitted";
    const normalizedSortOrder = String(sortOrder || "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";

    const sortFieldMap = {
      documentType: Sequelize.col("document_type"),
      documentName: Sequelize.col("document_name"),
      dateSubmitted: Sequelize.fn("DATE", Sequelize.col("date_submitted")),
      status: Sequelize.col("status"),
      description: Sequelize.col("description"),
      rejectedReason: Sequelize.col("form_status_desc"),
    };

    const orderBy = [
      [sortFieldMap[normalizedSortBy] || Sequelize.fn("DATE", Sequelize.col("date_submitted")), normalizedSortOrder],
      [Sequelize.col("document_id"), "DESC"],
    ];

    const { count, rows } = await ExternalDocuments.findAndCountAll({
      where: {
        caseId,
        status: { [Op.ne]: "Approved" },
        isFileScanned: "1",
      },
      attributes: [
        "documentId",
        "documentType",
        [Sequelize.fn("DATE_FORMAT", Sequelize.col("date_submitted"), "%m-%d-%Y"), "dateSubmitted"],
        "caseId",
        "status",
        "description",
        "documentName",
        "isAddedFrom",
        "formStatusDesc",
        "rejectedReason",
      ],
      order: orderBy,
      limit: normalizedLimit,
      offset: normalizedPage * normalizedLimit,
    });

    const data = rows.map((document) => {
      const rawDocument = document.get({ plain: true });
      const rawRejectedReason = String(
        rawDocument.formStatusDesc ?? rawDocument.rejectedReason ?? "",
      ).trim();

      return {
        documentId:
          rawDocument.documentId === null || rawDocument.documentId === undefined
            ? ""
            : String(rawDocument.documentId),
        documentType: rawDocument.documentType || "-",
        dateSubmitted: rawDocument.dateSubmitted || "-",
        caseId:
          rawDocument.caseId === null || rawDocument.caseId === undefined
            ? ""
            : String(rawDocument.caseId),
        status: rawDocument.status || "",
        description: rawDocument.description || "",
        documentName: rawDocument.documentName || "-",
        isAddedFrom:
          rawDocument.isAddedFrom === null || rawDocument.isAddedFrom === undefined
            ? ""
            : String(rawDocument.isAddedFrom),
        rejectedReason: rawRejectedReason || "-",
      };
    });

    return {
      data,
      pagination: {
        total: count,
        page: normalizedPage,
        limit: normalizedLimit,
        totalPages: Math.ceil(count / normalizedLimit),
      },
    };
  }