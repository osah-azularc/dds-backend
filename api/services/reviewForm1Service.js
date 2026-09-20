/**
 * @module reviewForm1Service
 * @description Service for handling Form 1s related operations: single Form 1
 *              detail/review data (including party info, enhanced with
 *              auto-populate flags and DFCS-Car child-abuse detail records).
 */

import Form1Docket from '../models/Form1Docket.js';
import Form1Documents from '../models/Form1Documents.js';
import Form1Rejected from '../models/Form1Rejected.js';
import Form1DocketGeneralinfoOtherOption from '../models/Form1DocketGeneralinfoOtherOption.js';
import Casetypes from '../models/Casetypes.js';
import County from '../models/County.js';
import Form1Parties from '../models/Form1Parties.js';
import AgencyPlatformParties from '../models/AgencyPlatformParties.js';
import AllegedChildAbuser from '../models/AllegedChildAbuser.js';
import ChildAbuserAge from '../models/ChildAbuserAge.js';
import { logger } from '../../config/winstonLogger.js';
import { getNohTypesForForm1, getForm1205Data, getDocketAdditionalNotes } from './reviewForm1/reviewForm1DdsService.js';
import { getAdditionalInfoForForm1, getTollViolationsForForm1 } from './reviewForm1/reviewForm1FilterOptionsService.js';

// Filter-dropdown option lists and bulk clerk assignment now live in
// reviewForm1FilterOptionsService.js (kept re-exported here so existing
// imports from this module keep working).
export {
  getAgenciesList,
  getCaseTypesList,
  getCaseTypesByAgencies,
  getStatusesList,
  getClerksList,
  getAllFilterOptions,
  updateForm1ClerkAssignments,
} from './reviewForm1/reviewForm1FilterOptionsService.js';

// Preserves the existing snake_case payload shape the frontend
// (PartyInformationSection.jsx) already reads, while sourcing the data via
// the Form1Parties Sequelize model instead of a raw SQL string.
const toDisplayParty = (p) => ({
  party_id: p.partyId,
  typeofcontact: p.typeOfContact,
  lastname: p.lastName,
  firstname: p.firstName,
  middlename: p.middleName,
  address1: p.address1,
  address2: p.address2,
  city: p.city,
  state: p.state,
  zip: p.zip,
  email: p.email,
  fax: p.fax,
  phone: p.phone,
  position: p.position,
  georgia_bar_no: p.georgiaBarNo,
  is_new_contact: p.isNewContact,
  alt_address1: p.altAddress1,
  alt_address2: p.altAddress2,
  alt_city: p.altCity,
  alt_state: p.altState,
  alt_zip_code: p.altZipCode,
  attorneybar: p.attorneyBar,
  company: p.company,
  is_international_addr: p.isInternationalAddr,
  international_address: p.internationalAddress,
  title: p.title,
});

async function getAutopopulateTypes(agencyPlatformId) {
  if (agencyPlatformId == null) return [];
  const rows = await AgencyPlatformParties.findAll({
    where: { agencyPlatformId, isAutopopulate: '1' },
    attributes: ['ecourtTypeOfContact'],
    raw: true,
  });
  return rows.map((row) => row.ecourtTypeOfContact);
}

async function getChildAbuseDetails(partyId) {
  const abuse = await AllegedChildAbuser.findOne({
    where: { partyId },
    attributes: ['id', 'classificationOfChildAbuse', 'ageOfAllegedChildAbuser', 'numberOfChildren'],
    raw: true,
  });
  if (!abuse) return null;

  const ageRows = await ChildAbuserAge.findAll({
    where: { allegedChildAbuserId: abuse.id },
    attributes: ['age'],
    raw: true,
  });

  // Preserves the raw-SQL era's snake_case keys, matching PartyInformationSection.jsx's PropTypes.
  return {
    allegedChildAbuserId: abuse.id,
    classification_of_child_abuse: abuse.classificationOfChildAbuse,
    age_of_alleged_child_abuser: abuse.ageOfAllegedChildAbuser,
    number_of_children: abuse.numberOfChildren,
    age: ageRows.map((row) => row.age),
  };
}

/**
 * @param {number} form1Id
 * @param {number|string} agencyPlatformId
 * @returns {Promise<object[]>} party rows shaped for the review screen
 */
async function getEnhancedForm1Parties(form1Id, agencyPlatformId) {
  try {
    const rows = await Form1Parties.findAll({ where: { form1Id }, raw: true });
    if (!rows.length) return [];

    const autopopulateTypes = await getAutopopulateTypes(agencyPlatformId);
    // Mirrors Reviewform1Controller.php:333-345 — child-abuse detail is only
    // enhanced onto the Petitioner party, only for the DFCS-Car platform (4).
    const isChildAbusePlatform = String(agencyPlatformId || '') === '4';

    const enhanced = [];
    for (const row of rows) {
      const party = toDisplayParty(row);
      party.isautofill = autopopulateTypes.includes(party.typeofcontact) ? '1' : '0';

      if (isChildAbusePlatform && party.typeofcontact === 'Petitioner' && party.party_id) {
        try {
          const abuseDetails = await getChildAbuseDetails(party.party_id);
          if (abuseDetails) Object.assign(party, abuseDetails);
        } catch (abuseError) {
          logger.error('[ReviewForm1Service] Error fetching child abuse details for party:', abuseError);
        }
      }

      enhanced.push(party);
    }
    return enhanced;
  } catch (error) {
    logger.error('[ReviewForm1Service] Error fetching Form 1 party information:', error);
    return [];
  }
}

/**
 * Get full details for a single Form 1 docket record by primary key.
 *
 * @param {number} form1Id
 * @returns {Promise<object|null>}
 */
export const getForm1ById = async (form1Id) => {
  if (!form1Id) {
    return null;
  }

  try {
    const record = await Form1Docket.findOne({
      where: { form1Id },
      raw: true,
    });

    return record;
  } catch (error) {
    logger.error('[ReviewForm1Service] Error fetching Form 1 detail:', error);
    throw error;
  }
};

/**
 * Get review data for a single Form 1, mirroring the key pieces shown on the
 * legacy review page (docketinfo, attached documents, party info and
 * additional info / toll violations).
 *
 * @param {number} form1Id
 * @returns {Promise<{docketinfo: object, docketdoc: object[]}|null>}
 */
export const getForm1ReviewData = async (form1Id) => {
  if (!form1Id) {
    return null;
  }

  try {
    const docketinfo = await Form1Docket.findOne({
      where: { form1Id },
      raw: true,
    });

    if (!docketinfo) {
      return null;
    }

    const docketdoc = await Form1Documents.findAll({
      where: {
        form1Id,
        // Match legacy: only show scanned Form 1 documents
        isScanned: '1',
      },
      attributes: ['documentType', 'documentName', 'documentFilePath'],
      raw: true,
    });

    // Optional rejection reason, mirroring legacy review payload
    const rejectreason = await Form1Rejected.findOne({
      where: { form1Id },
      attributes: ['reason', 'reasonType'],
      raw: true,
    });

    const party = await getEnhancedForm1Parties(form1Id, docketinfo.agencyPlatformId);

    const { additionalinfo, additionalinfolabel } = await getAdditionalInfoForForm1(
      form1Id,
      docketinfo.agencyPlatformId,
    );

    // Toll violations – only for Toll platform
    if (String(docketinfo.agencyPlatformId || '') === '1') {
      const toll = await getTollViolationsForForm1(form1Id);
      if (toll) {
        docketinfo.no_of_violations = toll.no_of_violations;
        docketinfo.toll_fees = toll.toll_fees;
        docketinfo.statutory_fees = toll.statutory_fees;
      }
    }

    // DCH-specific general info (form1_docket_generalinfo_other_option) – only for DCH platform
    try {
      if (String(docketinfo.agencyPlatformId || '') === '7' && docketinfo.refAgency === 'DCH') {
        const dchInfo = await Form1DocketGeneralinfoOtherOption.findOne({
          where: { form1Id },
          raw: true,
        });

        if (dchInfo) {
          docketinfo.benefitscontinued = dchInfo.benefitsContinued;
          docketinfo.heringrequestagency = dchInfo.heringRequestAgency;
          docketinfo.date_appeal_received_osah = dchInfo.dateAppealReceivedOsah;
          docketinfo.benefites_continued_ans = dchInfo.benefitesContinuedAns;
          docketinfo.adverse_action_issue_date = dchInfo.adverseActionIssueDate;
          docketinfo.agency_action = dchInfo.agencyAction;
          docketinfo.expedited_appeal = dchInfo.expeditedAppeal;
        }
      }
    } catch (dchError) {
      logger.error('[ReviewForm1Service] Error fetching DCH general info for Form 1:', dchError);
    }

    // Resolves the casetype/county primary keys the approve flow's NOH hearing-slot
    // preview needs (mirrors the same lookups reviewForm1ApprovalService.js does at
    // approval time), so the frontend can call the existing getHearingInfoForDocket
    // preview endpoint before the docket exists.
    const caseTypeRow = await Casetypes.findOne({
      where: { caseCode: docketinfo.caseType, agencyCode: docketinfo.refAgency },
      attributes: ['caseTypeId'],
    });
    docketinfo.caseTypeId = caseTypeRow ? caseTypeRow.caseTypeId : null;

    const countyRow = await County.findOne({ where: { countyDescription: docketinfo.county } });
    docketinfo.countyId = countyRow ? countyRow.countyId : null;

    const nohInfo = await getNohTypesForForm1(docketinfo.refAgency, docketinfo.caseType);

    // DDS-specific offense data + notes (form1_dds_1205_offence, form1_summarytable)
    // – only for DDS platform, mirrors ddsreviewform1.phtml sections 3-4.
    let form1205data = {};
    let docketAdditonalNotes = [];
    if (String(docketinfo.agencyPlatformId || '') === '5') {
      try {
        form1205data = await getForm1205Data(form1Id);
        docketAdditonalNotes = await getDocketAdditionalNotes(form1Id);
      } catch (ddsError) {
        logger.error('[ReviewForm1Service] Error fetching DDS Form 1205/notes data:', ddsError);
      }
    }

    return {
      docketinfo,
      docketdoc,
      // Keep the same property name used in the legacy payload
      rejectreason: rejectreason || null,
      party,
      additionalinfo,
      additionalinfolabel,
      nohInfo,
      form1205data,
      docketAdditonalNotes,
    };
  } catch (error) {
    logger.error('[ReviewForm1Service] Error fetching Form 1 review data:', error);
    throw error;
  }
};