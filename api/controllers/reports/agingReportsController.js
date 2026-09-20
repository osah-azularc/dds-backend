import { agingReports } from "../../helpers/reports/agingReportsHelper.js";
import { Parser } from "@json2csv/plainjs";
import { validateAgingReports } from "../../helpers/reportValidators.js";
import { ValidationError } from "../../helpers/validators.js";
import { logger } from "../../../config/winstonLogger.js";

/*
    Created by  : Snehal Narkar
    Date        : 08-12-2024
    Description : Function is used to fetch aging reports with various filters
    Parameters  :
        - req : Express request object containing filter parameters in body
            - filter: Object containing:
                - refagency (Array): Reference agency filter
                - casetype (Array): Case type filter (can include agency||casetype format)
                - judge (Array): Judge filter
                - judgeassistant (Array): CMA filter
                - county (Array): County filter
                - dateReceivedFrom (String): Start date filter (MM-DD-YYYY) - only for open-cases
                - dateReceivedTo (String): End date filter (MM-DD-YYYY) - only for open-cases
                - stayed (String): '0' or '1' to include stayed cases
        - res : Express response object for sending the result

    Response    : Returns JSON with success status, message, merged data from all 6 report types, and error
*/
export const getAgingReports = async (req, res) => {
  try {
    const param = req.body || {};

    // ✅ Validate input using Joi schema
    const validatedParam = validateAgingReports(param);

    const view1Selected = validatedParam.view?.view1Selected;

    // Always fetch all 6 aging report types in parallel to get counts
    const [openCases, sop, noHearingDate, noDecision, decision, noNoh] = await Promise.all([
      agingReports(validatedParam, 'open-cases'),
      agingReports(validatedParam, 'sop'),
      agingReports(validatedParam, 'no-hearing-date'),
      agingReports(validatedParam, 'no-decision'),
      agingReports(validatedParam, 'decision'),
      agingReports(validatedParam, 'no-noh'),
    ]);

    // Combine all agencyCasetypeDropdown arrays from all 6 report types
    const allAgencyCasetypes = new Set();
    [openCases, sop, noHearingDate, noDecision, decision, noNoh].forEach(result => {
      if (result.agencyCasetypeDropdown && Array.isArray(result.agencyCasetypeDropdown)) {
        result.agencyCasetypeDropdown.forEach(item => allAgencyCasetypes.add(item));
      }
    });

	    // Build merged result with all 6 counts
	    const mergedResult = {
	      openCasesCount: openCases.openCasesCount || 0,
	      SOPCount: sop.SOPCount || 0,
	      noHearingDateCount: noHearingDate.noHearingDateCount || 0,
	      noDecisionCount: noDecision.noDecisionCount || 0,
	      DecisionCount: decision.DecisionCount || 0,
	      noNohCount: noNoh.noNohCount || 0,
	      // Provide an explicit compare function to make the sort criteria
	      // obvious while preserving the default lexicographical behavior.
	      agencyCasetypeDropdown: Array.from(allAgencyCasetypes).sort((a, b) => {
	        const aStr = String(a);
	        const bStr = String(b);
	        if (aStr < bStr) return -1;
	        if (aStr > bStr) return 1;
	        return 0;
	      }),
	    };

    // If a specific report type is requested, include its dashboard data or details
    // This allows a single API call to return both counts AND dashboard data
    if (view1Selected) {
      const reportTypeMap = {
        'open-cases': openCases,
        'sop': sop,
        'no-hearing-date': noHearingDate,
        'no-decision': noDecision,
        'decision': decision,
        'no-noh': noNoh,
      };
      const selectedReport = reportTypeMap[view1Selected];

      // Include dashboard data or details from the selected report type
      if (selectedReport.data) {
        mergedResult.data = selectedReport.data;
      }
      if (selectedReport.details) {
        mergedResult.details = selectedReport.details;
      }
      // Include pagination metadata if present (for server-side pagination)
      if (selectedReport.pagination) {
        mergedResult.pagination = selectedReport.pagination;
      }
      // Override with the selected report's agencyCasetypeDropdown (replaces the combined one)
      if (selectedReport.agencyCasetypeDropdown) {
        mergedResult.agencyCasetypeDropdown = selectedReport.agencyCasetypeDropdown;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Aging reports fetched successfully.",
      data: mergedResult,
      error: null,
    });
  } catch (error) {
    logger.error("Error in getAgingReports controller:", error);
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        data: null,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
      error: error.message,
    });
  }
};


/*
    Created by  : Snehal Narkar
    Date        : 08-12-2024
    Description: Export aging report as CSV
 */
export const exportAgingReport = async (req, res) => {
  try {
    const param = req.body.data ? JSON.parse(req.body.data) : (req.body || {});

    // ✅ Validate input using Joi schema
    const validatedParam = validateAgingReports(param);

    const reportType = validatedParam.view?.view1Selected || 'open-cases';
    const hasDetailsView = validatedParam.view?.detailsView;

    let data = [];
    let fields = [];
    let titleRow = null;

    if (hasDetailsView) {
      // DETAILS VIEW EXPORT - Export individual case records
      const exportParam = {
        ...validatedParam,
        view: {
          ...validatedParam.view,
          exportMode: true
        }
      };

      const result = await agingReports(exportParam, reportType);
      data = result.details || [];

      // Get the details view key and value for title row
      const detailsViewKey = Object.keys(hasDetailsView)[0]; // 'judge', 'caseType', 'judgeAssistant', etc.
      const detailsViewValue = hasDetailsView[detailsViewKey];

      // Validate detailsViewValue is a non-empty string
      if (!detailsViewValue || typeof detailsViewValue !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Invalid detailsView value. Expected a non-empty string.",
          data: null,
          error: "detailsViewValue must be a valid string"
        });
      }

      // Determine the name based on detailsView key
      // Added refAgency case (not in PHP) to fix export title when clicking on Agency tab items
      let name;
      switch(detailsViewKey) {
        case 'caseType':
          name = 'Case type';
          break;
        case 'staffAttorney':
          name = 'Staff Attorney';
          break;
        case 'judgeAssistant':
          name = 'CMA';
          break;
        case 'docketClerk':
          name = 'Clerk';
          break;
        case 'refAgency':
          name = 'Agency';
          break;
        case 'judge':
        default:
          name = 'Judge';
      }

      // Create title row: "Judge Smith, John - (45)"
      const formattedValue = detailsViewValue.replace(' ', ', ');
      titleRow = `${name} ${formattedValue} - (${data.length})`;

      // Details view columns - individual case records
      fields = [
        { label: "Docket", value: "caseId" },
        { label: "Case Name", value: "caseName" },
        { label: "Agency", value: "refAgency" },
        { label: "Case Type", value: "caseType" },
        { label: "Date Received", value: "dateReceived" },
        { label: "Hearing Date", value: "hearingDate" },
        { label: "Days Since Hearing", value: "daysSinceHearing" },
        { label: "County", value: "county" },
        { label: "Location", value: "hearingSite" },
        { label: "Judge", value: "judge" },
        { label: "CMA", value: "judgeAssistant" },
      ];
    } else {
      // DASHBOARD EXPORT - Export grouped/aggregated data
      const exportParam = {
        ...validatedParam,
        view: {
          ...validatedParam.view,
          exportDashboard: true
        }
      };

      const result = await agingReports(exportParam, reportType);
      const rawGroupedData = result.exportDashboard || [];

      // Map data to match PHP export format EXACTLY
      data = rawGroupedData.map(row => {
        return {
          judge: row.judge || 'UNASSIGNED',
          cma: row.judgeAssistant || 'UNASSIGNED',
          agency: row.refAgency || '',
          casetype: row.caseType || '',
          count: row.count || 0
        };
      });

      // ✅ Sort data by Judge name for ALL tabs (matching Angular behavior)
      // Export is always sorted by: Judge → Agency → Case Type
      // This ensures consistent export order regardless of which tab is active
      data.sort((a, b) => {
        // Primary sort: Judge (alphabetically, case-insensitive)
        const judgeCompare = (a.judge || '').toLowerCase().localeCompare((b.judge || '').toLowerCase());
        if (judgeCompare !== 0) return judgeCompare;

        // Secondary sort: Agency (alphabetically, case-insensitive)
        const agencyCompare = (a.agency || '').toLowerCase().localeCompare((b.agency || '').toLowerCase());
        if (agencyCompare !== 0) return agencyCompare;

        // Tertiary sort: Case Type (alphabetically, case-insensitive)
        return (a.casetype || '').toLowerCase().localeCompare((b.casetype || '').toLowerCase());
      });

      fields = [
        { label: "Judge", value: "judge" },
        { label: "CMA", value: "cma" },
        { label: "Agency", value: "agency" },
        { label: "Casetype", value: "casetype" },
        { label: "# of dockets", value: "count" },
      ];
    }

    const json2csvParser = new Parser({ fields });
    let csvData = json2csvParser.parse(data);

    // Add title row at the beginning for details view
    if (titleRow) {
      csvData = titleRow + '\n' + csvData;
    }

    const reportTypeNames = {
      'open-cases': 'open-cases',
      'sop': 'sop',
      'no-hearing-date': 'no-hearing-date',
      'no-decision': 'no-decision',
      'decision': 'decision',
      'no-noh': 'no-noh'
    };

    const now = new Date();
    const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`;
    const fileName = `agingReports-${reportTypeNames[reportType] || reportType}-${dateStr} ${timeStr}.csv`;

    res.setHeader("Pragma", "public");
    res.setHeader("Expires", "0");
    res.setHeader("Cache-Control", "must-revalidate, post-check=0, pre-check=0");
    res.setHeader("Cache-Control", "public");
    res.setHeader("Content-Description", "File Transfer");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.setHeader("Content-Transfer-Encoding", "binary");
    res.setHeader("Content-Length", Buffer.byteLength(csvData));
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    return res.send(csvData);
  } catch (error) {
    logger.error("Error in exportAgingReport controller:", error);
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        data: null,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to export aging report",
      data: null,
      error: error.message,
    });
  }
};

