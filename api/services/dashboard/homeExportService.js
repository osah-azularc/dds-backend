import { Op, fn, col, literal } from 'sequelize';
import Docket from '../../models/Docket.js';
import NotificationCaseTypes from '../../models/NotificationCaseTypes.js';
import PeopleDetails from '../../models/PeopleDetails.js';
import AttorneyByCase from '../../models/AttorneyByCase.js';
import AgencyCaseWorkerByCase from '../../models/AgencyCaseworkerByCase.js';
import DocketDisposition from '../../models/DocketDisposition.js';
import { buildCsvFields } from '../../controllers/reports/shared/controllerUtils.js';
import { Parser } from '@json2csv/plainjs';
import { logger } from "../../../config/winstonLogger.js";

class HomeExportService {
  
  /**
   * Transform case data for CSV export
   * @param {Object} caseData - Raw case data from database
   * @param {string} caseOfficialName - Case official name
   * @returns {Object} Transformed case data
   */
  transformCaseForExport(caseData, caseOfficialName) {
    return {
      caseId: caseData.caseId,
      caseName: caseData.casename === '' || caseData.casename === '(NULL)' 
        ? 'No party Added' 
        : caseData.casename,
      refAgency: caseData.refAgency,
      caseType: caseData.caseType,
      judge: caseData.judge,
      dateRequested: caseData.daterequesteddisplay,
      dateReceived: caseData.datereceiveddisplay,
      hearingDate: caseData.hearingdateDisplay,
      hearingTime: caseData.hearingtimeDisplay,
      hearingLocation: caseData.hearingSite,
      county: caseData.county,
      status: caseData.status,
      agencyRefNumber: caseData.agencyRefNumber,
      petitionerAttorney: caseData.attorneybycase?.attorneyName || '...',
      petitioner: caseData.petitioner_data?.petitionerName || '...',
      caseOfficial: caseOfficialName,
      judgeAssistant: caseData.judgeAssistant,
      dispositionOutcome: caseData.docketdisposition?.dispositioncode || '...',
      dispositionDate: caseData.docketdisposition?.dispositiondate 
        ? new Date(caseData.docketdisposition.dispositiondate).toLocaleDateString('en-US') 
        : '...',
    };
  }

  /**
   * Build Sequelize query for open complex cases export
   * @param {string} judgeName - Judge's full name
   * @returns {Object} Sequelize query configuration
   */
  buildExportQuery(judgeName) {
    return {
      attributes: [
        'caseId',
        ['caseName', 'casename'],
        'refAgency',
        'caseType',
        'judge',
        [fn('DATE_FORMAT', col('daterequested'), '%m-%d-%Y'), 'daterequesteddisplay'],
        [fn('DATE_FORMAT', col('dateReceivedByOSAH'), '%m-%d-%Y'), 'datereceiveddisplay'],
        [fn('DATE_FORMAT', col('hearingDate'), '%m-%d-%Y'), 'hearingdateDisplay'],
        [fn('IF', col('hearingTime'), fn('TIME_FORMAT', col('hearingTime'), '%h:%i %p'), '...'), 'hearingtimeDisplay'],
        'hearingSite',
        'county',
        [fn('REPLACE', col('status'), 'Hearing Re-scheduled', 'Rescheduled'), 'status'],
        'agencyRefNumber',
        'judgeAssistant',
      ],
      include: [
        {
          model: NotificationCaseTypes,
          as: 'notificationCaseType',
          attributes: [],
          on: literal(
            '`notificationCaseType`.`case_type` = `Docket`.`caseType` AND `notificationCaseType`.`agency` = `Docket`.`refAgency`'
          ),
          required: true,
        },
        {
          model: DocketDisposition,
          as: 'docketdisposition',
          attributes: ['dispositioncode', 'dispositiondate'],
          required: false,
        },
        {
          model: PeopleDetails,
          as: 'petitioner_data',
          attributes: [
            [fn('CONCAT', col('petitioner_data.Lastname'), ', ', col('petitioner_data.Firstname')), 'petitionerName']
          ],
          where: { typeofcontact: 'Petitioner' },
          required: false,
        },
        {
          model: AttorneyByCase,
          as: 'attorneybycase',
          attributes: [
            [fn('CONCAT', col('attorneybycase.Lastname'), ', ', col('attorneybycase.Firstname')), 'attorneyName']
          ],
          where: { typeofcontact: 'Petitioner Attorney' },
          required: false,
        },
      ],
      where: {
        judge: judgeName,
        telv_o_five: '1',
        status: {
          [Op.notIn]: ['closed', 'stayed'],
        },
      },
      raw: true,
      nest: true,
    };
  }

  /**
   * Batch fetch case officials for multiple cases
   * @param {Array} cases - Array of case objects with caseId and caseType
   * @returns {Promise<Map>} Map of caseId to case official name
   */
  async batchGetCaseOfficials(cases) {
    if (cases.length === 0) return new Map();

    // Create a map of caseId to expected typeofcontact
    const caseTypeMap = new Map(
      cases.map(c => {
        let typeOfContact;
        switch (c.caseType) {
          case 'ALS':
            typeOfContact = 'Officer';
            break;
          case 'CSS':
            typeOfContact = 'Case Worker';
            break;
          case 'OIG':
            typeOfContact = 'Investigator';
            break;
          default:
            typeOfContact = null;
        }
        return [c.caseId, typeOfContact];
      })
    );

    // Get case IDs that need specific typeofcontact filter
    const specificTypeCaseIds = [];
    const defaultCaseIds = [];
    
    caseTypeMap.forEach((typeOfContact, caseId) => {
      if (typeOfContact) {
        specificTypeCaseIds.push(caseId);
      } else {
        defaultCaseIds.push(caseId);
      }
    });

    const officialsMap = new Map();

    // Query for cases with specific typeofcontact (ALS, CSS, OIG)
    if (specificTypeCaseIds.length > 0) {
      const specificOfficials = await AgencyCaseWorkerByCase.findAll({
        attributes: [
          'caseid',
          'typeofcontact',
          [fn('CONCAT', col('Lastname'), ', ', col('Firstname')), 'name']
        ],
        where: {
          caseid: { [Op.in]: specificTypeCaseIds },
          typeofcontact: { [Op.in]: ['Officer', 'Case Worker', 'Investigator'] }
        },
        raw: true,
      });

      // Map officials to their cases based on expected typeofcontact
      specificOfficials.forEach(official => {
        const expectedType = caseTypeMap.get(official.caseid);
        if (official.typeofcontact === expectedType) {
          officialsMap.set(official.caseid, official.name);
        }
      });
    }

    // Query for cases with unknown case types (no typeofcontact filter)
    if (defaultCaseIds.length > 0) {
      const defaultOfficials = await AgencyCaseWorkerByCase.findAll({
        attributes: [
          'caseid',
          [fn('CONCAT', col('Lastname'), ', ', col('Firstname')), 'name']
        ],
        where: {
          caseid: { [Op.in]: defaultCaseIds }
        },
        raw: true,
      });

      // Map first official found for each case
      defaultOfficials.forEach(official => {
        if (!officialsMap.has(official.caseid)) {
          officialsMap.set(official.caseid, official.name);
        }
      });
    }

    return officialsMap;
  }

  /**
   * Export open complex cases to CSV
   * @param {string} judgeName - Judge's full name
   * @returns {Promise<string>} CSV data
   */
  async exportOpenComplexCases(judgeName) {
    const query = this.buildExportQuery(judgeName);
    const cases = await Docket.findAll(query);

    if (cases.length === 0) {
      return null;
    }
    
    // Deduplicate by caseId (keep first occurrence)
    const uniqueCasesMap = new Map();
    cases.forEach(caseData => {
      if (!uniqueCasesMap.has(caseData.caseId)) {
        uniqueCasesMap.set(caseData.caseId, caseData);
      }
    });
    
    const uniqueCases = Array.from(uniqueCasesMap.values());

    // Batch fetch all case officials at once (fixes N+1 query)
    const officialsMap = await this.batchGetCaseOfficials(uniqueCases);

    // Transform data using the pre-fetched officials map
    const transformedCases = uniqueCases.map((caseData) => {
      const caseOfficialName = officialsMap.get(caseData.caseId) || '...';
      return this.transformCaseForExport(caseData, caseOfficialName);
    });

    // Sort case-sensitively by caseName to match legacy PHP usort+strcmp behaviour
    transformedCases.sort((a, b) => (a.caseName < b.caseName ? -1 : a.caseName > b.caseName ? 1 : 0));

    // Build CSV fields using shared utility
    const fields = buildCsvFields([
      'docket',
      'caseName',
      { label: 'Agency', value: 'refAgency' },
      { label: 'Case Type', value: 'caseType' },
      { label: 'Date Received', value: 'dateReceived' },
      { label: 'Date Requested', value: 'dateRequested' },
      { label: 'Hearing Date', value: 'hearingDate' },
      { label: 'Hearing Time', value: 'hearingTime' },
      { label: 'Hearing Location', value: 'hearingLocation' },
      'county',
      'status',
      'judge',
      { label: 'Judge Assistant', value: 'judgeAssistant' },
      { label: 'Agency Reference Number', value: 'agencyRefNumber' },
      { label: 'Petitioner Attorney', value: 'petitionerAttorney' },
      { label: 'Petitioner', value: 'petitioner' },
      { label: 'Case Official', value: 'caseOfficial' },
      { label: 'Disposition Outcome', value: 'dispositionOutcome' },
      { label: 'Disposition Date', value: 'dispositionDate' },
    ]);

    try {
      const parser = new Parser({ fields });
      return parser.parse(transformedCases);
    } catch (error) {
      logger.error('Error generating CSV:', error);
      throw new Error('Failed to generate CSV export');
    }
  }
}

export default new HomeExportService();

