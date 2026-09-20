/**
 * Created by  : Snehal Narkar
 * Date        : 29-07-2026
 * Description : Bulk Export Docs — agency/document configuration.
 * Node port of the agency switch in PHP ExportBulkDoc::generateBulkDocuments().
 *
 * Legacy never used the automationType/automationSubType mapping tables here (that
 * system is exclusive to NOHAutomation/dispositionAutomation/continuanceAutomation and
 * their bulk wrappers) — it hardcoded a literal .docx filename per agency (or took it
 * straight from the Angular frontend's own hardcoded documentlist, for CSS/OIG) and
 * loaded it directly off disk. documentName below mirrors that exactly, so the strings
 * are copied 1:1 from ExportBulkDoc.php — no guessing involved, unlike the previous
 * automationSubType-based version of this file.
 */
import { ValidationError } from '../helpers/validators.js';

// Legacy: base64_encode('329') — the fixed "Osah Clerk" system user id used only by the
// DDS 91-day letter cron (OsahformController::bulkDocAutomationAction).
export const BULK_EXPORT_DOC_SYSTEM_CLERK_USER_ID = 329;

// Legacy: hardcoded $data[0]['docketinfo'] payload in bulkDocAutomationAction — the DDS/ALS
// 91-day letter cron always runs with these exact parameters.
export const DDS_NINETY_ONE_DAY_CRON_PAYLOAD = {
  refAgencyId: 199,
  documentVariant: 'ninetyOneDay',
  ninetyOneDay: 'yes',
  mailerContacts: ['Petitioner', 'Petitioner Attorney'],
};

// Mirrors PHP's hardcoded 91-day-letter constants (ExportBulkDoc.php:1083-1139), consumed by
// ninetyOneDayLetterService.js.
export const NINETY_ONE_DAY_DISPOSITION_CODE = 'Closed-91-Day Letter';
export const NINETY_ONE_DAY_DOCUMENT_TYPE = 'Decision';
export const NINETY_ONE_DAY_CMA_ID = 264;
export const NINETY_ONE_DAY_DOCUMENT_PAGES = 2;
export const NINETY_ONE_DAY_FILE_RETENTION_DAYS = 2;

export const EXPORT_DOC_AGENCY_CONFIG = {
  // CSS — Child Support Services / EST
  7: {
    agencyCode: 'CSS',
    caseType: 'EST',
    defaultVariant: 'default',
    variants: {
      default: { documentName: 'CSS-EST NOH.docx', ninetyOneDayEligible: false },
    },
  },

  // DDS — Driver Services / ALS. Legacy exposed 3 documents selected by documentId
  // (81, 85, else); only the 91-day letter (documentId 82) is reachable from the
  // current Angular UI (the other two are commented out there), but all three are
  // kept here for parity.
  199: {
    agencyCode: 'DDS',
    caseType: 'ALS',
    defaultVariant: 'ninetyOneDay',
    variants: {
      noh: { documentName: 'ALS NOH.docx', ninetyOneDayEligible: false },
      decisionNotMailed: { documentName: 'ALS_NOH_decision not mailed_code.docx', ninetyOneDayEligible: false },
      ninetyOneDay: { documentName: 'ALS_91-day letter.docx', ninetyOneDayEligible: true },
    },
  },

  // DPS — Public Safety / ALS
  125: {
    agencyCode: 'DPS',
    caseType: 'ALS',
    defaultVariant: 'default',
    variants: {
      default: { documentName: 'ALS NOH.docx', ninetyOneDayEligible: false },
    },
  },

  // OIG — Inspector General / EBTFSF. Legacy queues these into the mail-vendor
  // automation pipeline (ecourt_mailvendor_documents) in addition to the normal
  // Bulkdocs/Clerkdocs drop.
  237: {
    agencyCode: 'OIG',
    caseType: 'EBTFSF',
    defaultVariant: 'default',
    enableMailVendorQueue: true,
    variants: {
      default: { documentName: 'EBT_NOH.docx', ninetyOneDayEligible: false },
    },
  },
};

Object.freeze(EXPORT_DOC_AGENCY_CONFIG);
for (const agencyConfig of Object.values(EXPORT_DOC_AGENCY_CONFIG)) {
  Object.freeze(agencyConfig.variants);
  Object.freeze(agencyConfig);
}

/**
 * Resolve an agency + document variant to its full config, or throw a descriptive error.
 * @param {number|string} refAgencyId - Legacy numeric agency code (7, 199, 125, 237)
 * @param {string} [documentVariant] - Key into agencyConfig.variants; defaults to defaultVariant
 */
export const resolveExportDocConfig = (refAgencyId, documentVariant) => {
  // Legacy agency IDs are numeric; callers may send them as either a number or a string.
  const agencyConfig = EXPORT_DOC_AGENCY_CONFIG[Number(refAgencyId)];
  if (!agencyConfig) {
    throw new ValidationError(`Unsupported agency for bulk document export: ${refAgencyId}`, 'refAgencyId');
  }

  // No variant chosen (single-document agencies) → fall back to that agency's only option.
  const variantKey = documentVariant || agencyConfig.defaultVariant;
  // hasOwn guards against variantKey resolving to an inherited property (e.g. '__proto__',
  // 'constructor') instead of undefined, since variantKey comes from caller input.
  const variant = Object.hasOwn(agencyConfig.variants, variantKey) ? agencyConfig.variants[variantKey] : undefined;
  if (!variant) {
    throw new ValidationError(`Unsupported document variant '${variantKey}' for agency ${refAgencyId}`, 'documentVariant');
  }

  return {
    agencyCode: agencyConfig.agencyCode,
    caseType: agencyConfig.caseType,
    enableMailVendorQueue: !!agencyConfig.enableMailVendorQueue,
    variantKey,
    variant,
  };
};
