import crypto from 'node:crypto';
import { generateBulkExportDocHelper } from '../helpers/bulkExportDocHelper.js';
import { validateGenerateBulkExportDoc } from '../helpers/bulkExportDocValidators.js';
import { logger } from '../../config/winstonLogger.js';

/**
 * Created by  : Snehal Narkar
 * Date        : 29-07-2026
 * Description : Bulk Export Doc Controller — Node port of PHP Osahform::exportdocsfuncAction()
 * (the "Export Bulk Doc" screen, PHP class ExportBulkDoc). Given an agency + casetype +
 * date-received criteria, generates a mail-merge NOH/decision document for every matching
 * docket. See helpers/bulkExportDocHelper.js for the full flow.
 * No audit log entry — legacy never wrote one for this action either.
 */

/**
 * Generate bulk export documents.
 * Expects POST body: {
 *   refAgencyId, caseType?, documentId?, documentVariant?, dateReceived, ninetyOneDay?,
 *   mailerContacts: [], mailerCount?, partyContacts?: [], caseIds?: [],
 * }
 * caseType/documentId/mailerCount are accepted for parity with legacy's docketinfo shape but
 * aren't authoritative (documentVariant drives template resolution; the helper re-derives/
 * recomputes the rest). partyContacts (legacy's "Parties Copied" list) is appended onto
 * mailerContacts by the helper, mirroring legacy's mailer_contact+party_contact concatenation
 * — see bulkExportDocHelper.js.
 *
 * No userId in the body by design — legacy trusts a client-supplied base64 user id here
 * (spoofable, not real security), which we deliberately don't replicate. userId always comes
 * from req.userId (the JWT the auth middleware already verified), never from the request body.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const generateBulkExportDoc = async (req, res) => {
  try {
    // Auth: getLoggedInUserId (route middleware) already verified the JWT; userId just confirms it ran.
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        data: null,
        error: 'Authentication required',
      });
    }

    // Full payload shape validation; resolveExportDocConfig (called inside the helper) still
    // does the deeper agency/variant/91-day-eligibility validation against DB-backed config.
    const {
      refAgencyId, caseType, documentId, documentVariant, dateReceived, ninetyOneDay,
      mailerContacts, mailerCount, partyContacts, caseIds,
    } = validateGenerateBulkExportDoc(req.body || {});

    // All the real work (docket query, PDF generation, DB writes, folder drops) happens here.
    const result = await generateBulkExportDocHelper(
      { refAgencyId, caseType, documentId, documentVariant, dateReceived, ninetyOneDay, mailerContacts, mailerCount, partyContacts, caseIds },
      userId,
    );

    return res.status(200).json({
      success: !result.noRecordsFound && !result.templateMissing,
      message: result.message,
      data: result,
      error: null,
    });
  } catch (error) {
    if (error.isValidationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        data: null,
        error: error.message,
      });
    }
    // Full error (including message/stack, which can leak file paths, SQL, etc.) stays
    // server-side; the client only gets a reference ID to quote when contacting support.
    const referenceId = crypto.randomUUID();
    logger.error(`Error in generateBulkExportDoc controller [ref: ${referenceId}]:`, error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      data: null,
      error: `Reference ID: ${referenceId}`,
    });
  }
};
