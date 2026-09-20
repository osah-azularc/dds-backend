import { logger } from '../../../config/winstonLogger.js';
import { generateNOH } from '../../helpers/docketQuickAction/nohQuickActionHelper.js';
import { generateContinuance } from '../../helpers/docketQuickAction/continuanceQuickActionHelper.js';
import { generateDisposition } from '../../helpers/docketQuickAction/dispositionQuickActionHelper.js';
import { quickActionSchema, dispositionSchema } from '../../helpers/docketQuickAction/quickActionValidators.js';
import { insertModuleAuditLog } from '../../helpers/auditLogs.helper.js';
import { AUDIT_LOG_MODULE_NAME, AUDIT_LOG_ACTIONS } from '../../constants/constant-messages.js';

function createQuickActionController({ generateFn, actionLabel, auditModule, logPrefix, schema }) {
  return async (req, res) => {
    try {
      const userId = req.user.id;
      if (!userId) {
        return res.status(200).json({
          status: 401,
          success: false,
          title: 'Authentication required',
          message: 'Authentication required.',
        });
      }

      const validationSchema = schema || quickActionSchema;
      const { error, value: params } = validationSchema.validate(req.body, { abortEarly: false });
      if (error) {
        return res.status(200).json({
          status: 400,
          success: false,
          title: 'Invalid request',
          message: error.details.map((d) => d.message).join(', '),
        });
      }

      const username = req.user?.email?.split('@')[0] || 'system';
      const result = await generateFn(params, username, userId);

      if (!result.success) {
        return res.status(200).json({
          status: 400,
          success: false,
          title: `Unable to generate ${actionLabel}`,
          message: result.message || `${actionLabel} document could not be generated. Please try again.`,
        });
      }

      insertModuleAuditLog(
        userId,
        AUDIT_LOG_ACTIONS.CREATED,
        `{{User}} generated ${actionLabel} quick action for docket ${params.caseId} (${params.automationSubType})`,
        AUDIT_LOG_MODULE_NAME.CASES,
        auditModule,
        String(params.caseId),
        '',
        '',
        '',
      );

      return res.status(200).json({
        status: 200,
        success: true,
        message: result.message,
      });
    } catch (err) {
      logger.error(`[${logPrefix}] failed:`, err);
      return res.status(200).json({
        status: 500,
        success: false,
        message: 'An unexpected error occurred. Please try again.',
      });
    }
  };
}

export const generateNOHQuickAction = createQuickActionController({
  generateFn:  generateNOH,
  actionLabel: 'NOH',
  auditModule: 'noh_quick_action',
  logPrefix:   'NOHQuickActionController',
});

export const generateContinuanceQuickAction = createQuickActionController({
  generateFn:  generateContinuance,
  actionLabel: 'Continuance',
  auditModule: 'continuance_quick_action',
  logPrefix:   'ContinuanceController',
});

export const generateDispositionQuickAction = createQuickActionController({
  generateFn:  generateDisposition,
  actionLabel: 'Disposition',
  auditModule: 'disposition_quick_action',
  logPrefix:   'DispositionController',
  schema:      dispositionSchema,
});
