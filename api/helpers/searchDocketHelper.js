import Docket from '../models/Docket.js';
import PeopleDetails from '../models/PeopleDetails.js';
import MinorDetails from '../models/MinorDetails.js';
import DocketDisposition from '../models/DocketDisposition.js';
import Casetypes from '../models/Casetypes.js';
import Agency from '../models/admin/agencyModel.js';
import CaseTypeStyling from '../models/admin/caseTypeStylingModel.js';
import CourtLocations from '../models/CourtLocations.js';

const normalizeText = (value) => String(value ?? '').trim();
const normalizeId = (value) => (value === undefined || value === null || value === '' ? null : String(value));

const mapDocketSearchRow = (docketRow, stylingData) => {
  const row = docketRow?.toJSON ? docketRow.toJSON() : docketRow;

  return {
    ...row,
    caseId: normalizeId(row?.caseId),
    hearingTimeId: normalizeId(row?.hearingTimeId),
    docketNumber: formatDisplayDocketNumber(row),
    petitionerName: hasMeaningfulValue(row?.petitionerName) ? row.petitionerName : (stylingData?.petitioner || ''),
    respondentName: hasMeaningfulValue(row?.respondentName) ? row.respondentName : (stylingData?.respondent || ''),
  };
};

const mapPeopleSearchRow = (peopleRow) => {
  const row = peopleRow?.toJSON ? peopleRow.toJSON() : peopleRow;

  return {
    ...row,
    peopleId: normalizeId(row?.peopleId),
    caseId: normalizeId(row?.caseId),
    docketCaseId: normalizeId(row?.docketCaseId),
    externalUserId: normalizeId(row?.externalUserId),
  };
};

const mapMinorSearchRow = (minorRow) => {
  const row = minorRow?.toJSON ? minorRow.toJSON() : minorRow;

  return {
    ...row,
    minorId: normalizeId(row?.minorId),
    caseId: normalizeId(row?.caseId),
    docketCaseId: normalizeId(row?.docketCaseId),
  };
};

const mapDispositionRow = (dispositionRow) => {
  const row = dispositionRow?.toJSON ? dispositionRow.toJSON() : dispositionRow;

  return {
    ...row,
    caseId: normalizeId(row?.caseId),
  };
};

const hasMeaningfulValue = (value) => {
  const normalized = normalizeText(value);
  return normalized !== '' && normalized.toLowerCase() !== '(null)';
};

const firstToken = (value) => normalizeText(value).split(/\s+/).find(Boolean) || '';

const resolveCaseIdPrefix = (docketNumberValue) => /^(\d{1,10})(?:-|$)/.exec(docketNumberValue)?.[1] || '';

const resolvePrefixedAgencyAndCaseType = ({ prefixParts, caseType, agency }) => {
  let resolvedCaseType = caseType;
  let resolvedAgency = agency;

  if (prefixParts.length === 0) {
    return { resolvedCaseType, resolvedAgency };
  }

  const firstPrefixPart = normalizeText(prefixParts[0]).toLowerCase();
  const lastPrefixPart = normalizeText(prefixParts.at(-1)).toLowerCase();
  const normalizedCaseType = caseType.toLowerCase();

  if (firstPrefixPart === normalizedCaseType) {
    resolvedCaseType = prefixParts[0];
    resolvedAgency = prefixParts.slice(1).join('-') || agency;
  } else if (lastPrefixPart === normalizedCaseType) {
    resolvedCaseType = prefixParts.at(-1);
    resolvedAgency = prefixParts.slice(0, -1).join('-') || agency;
  }

  return { resolvedCaseType, resolvedAgency };
};

export const extractCaseIdFromLookup = ({ docketnumber }) => {
  const docketNumberValue = normalizeText(docketnumber);

  if (docketNumberValue) {
    const leadingCaseId = resolveCaseIdPrefix(docketNumberValue);
    if (leadingCaseId) {
      return leadingCaseId;
    }

    if (/^\d{1,10}$/.test(docketNumberValue)) {
      return docketNumberValue;
    }
  }
};

export const formatDisplayDocketNumber = (row) => {
  const raw = normalizeText(row?.docketNumber || row?.docketnumber);
  const caseId = normalizeText(row?.caseId || row?.caseid);
  const caseType = normalizeText(row?.caseType || row?.casetype);
  const agency = normalizeText(row?.refAgency || row?.refagency);
  const judgeSegment = firstToken(row?.judge);

  if (raw && caseId) {
    const parts = raw.split('-').filter(Boolean);
    const caseIdIndex = parts.indexOf(caseId);

    if (caseIdIndex > 0) {
      const prefixParts = parts.slice(0, caseIdIndex);
      const suffixParts = parts.slice(caseIdIndex + 1);
      const { resolvedCaseType, resolvedAgency } = resolvePrefixedAgencyAndCaseType({ prefixParts, caseType, agency });

      const countySegment = suffixParts[0] || normalizeText(row?.county);
      const resolvedJudgeSegment = suffixParts.length > 1 ? suffixParts.slice(1).join('-') : judgeSegment;

      return [caseId, resolvedAgency || agency, resolvedCaseType || caseType, countySegment, resolvedJudgeSegment]
        .filter(Boolean)
        .join('-');
    }
  }

  return [caseId, agency, caseType, normalizeText(row?.county), judgeSegment]
    .filter(Boolean)
    .join('-');
};

export { hasMeaningfulValue };

const getCaseTypeStyling = async (firstDocketRow) => {
  if (!firstDocketRow?.refAgency || !firstDocketRow?.caseType) {
    return null;
  }

  const caseTypeRow = await Casetypes.findOne({
    where: {
      agencyCode: firstDocketRow.refAgency,
      caseCode: firstDocketRow.caseType,
    },
  });

  if (!caseTypeRow?.caseTypeId || !caseTypeRow?.agencyId) {
    return null;
  }

  return CaseTypeStyling.findOne({
    where: {
      agencyId: caseTypeRow.agencyId,
      caseTypeId: caseTypeRow.caseTypeId,
    },
  });
};

export const getSearchDocketInfoData = async (caseId) => {
  const [docketData, peopleData, minorData, custodialParentData, docketDisposition] = await Promise.all([
    Docket.findAll({
      where: { caseId },
      include: [
        {
          model: Agency,
          as: 'agency',
          attributes: ['agencyDescription', 'phone', 'email'],
          required: false,
        },
        {
          model: CourtLocations,
          as: 'courtLocation',
          attributes: ['locationName', 'tel', 'email'],
          required: false,
        },
      ],
    }),
    PeopleDetails.findAll({
      where: { caseId },
      order: [['modifiedDate', 'ASC']],
    }),
    MinorDetails.findAll({ where: { caseId } }),
    PeopleDetails.findAll({
      where: {
        caseId,
        typeOfContact: 'Custodial Parent',
      },
    }),
    DocketDisposition.findAll({ where: { caseId } }),
  ]);

  const firstDocketRow = docketData[0]?.toJSON ? docketData[0].toJSON() : docketData[0];
  const caseTypeStyling = await getCaseTypeStyling(firstDocketRow);
  const stylingData = caseTypeStyling?.toJSON ? caseTypeStyling.toJSON() : caseTypeStyling;

  const docketDataFormatted = Array.isArray(docketData)
    ? docketData.map((docketRow) => mapDocketSearchRow(docketRow, stylingData))
    : [];
  const peopleDataFormatted = Array.isArray(peopleData)
    ? peopleData.map((peopleRow) => mapPeopleSearchRow(peopleRow))
    : [];
  const minorDataFormatted = Array.isArray(minorData)
    ? minorData.map((minorRow) => mapMinorSearchRow(minorRow))
    : [];
  const custodialParentFormatted = Array.isArray(custodialParentData)
    ? custodialParentData.map((peopleRow) => mapPeopleSearchRow(peopleRow))
    : [];
  const docketDispositionFormatted = Array.isArray(docketDisposition)
    ? docketDisposition.map((dispositionRow) => mapDispositionRow(dispositionRow))
    : [];

  return {
    docketData: docketDataFormatted.length > 0 ? docketDataFormatted : [],
    peopleData: peopleDataFormatted.length > 0 ? peopleDataFormatted : '',
    minorData: minorDataFormatted.length > 0 ? minorDataFormatted : '',
    custodialParent: custodialParentFormatted.length > 0 ? custodialParentFormatted : '',
    docketDisposition: docketDispositionFormatted.length > 0 ? docketDispositionFormatted : null,
  };
};

