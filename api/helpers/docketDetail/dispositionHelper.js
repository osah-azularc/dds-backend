import moment from 'moment';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import DocketDisposition from '../../models/DocketDisposition.js';
import DispositionType from '../../models/DispositionType.js';
import Docket from '../../models/Docket.js';
import DocketOpenCloseDetails from '../../models/DocketOpenCloseDetails.js';

const normalizeString = (value) => String(value ?? '').trim();

export async function getDispositionByCaseId(caseId) {
  const where = caseId ? { where: { caseId: Number(caseId) } } : {};
  return DocketDisposition.findAll(where);
}

export async function getDispositionTypesList() {
  return DispositionType.findAll();
}

export async function getDispositionCodeCount(dispositionCode) {
  return DispositionType.count({
    where: { dispositionCode: normalizeString(dispositionCode) },
  });
}

// Mirrors PHP adddispositionAction: DELETE existing record, INSERT new, close docket, log open/close.
// Must be called inside a controller that fires notifyDispositionAdded() non-fatally after commit.
export async function addDispositionByCaseId(caseId, dispositionData = {}, userId = 0) {
  const resolvedCaseId = Number(caseId);
  const t = await mysqlSequelize.transaction();
  try {
    await DocketDisposition.destroy({ where: { caseId: resolvedCaseId }, transaction: t });

    const record = await DocketDisposition.create({
      caseId: resolvedCaseId,
      dispositionCode:       normalizeString(dispositionData.dispositioncode ?? dispositionData.dispositionCode),
      dispositionDate:       normalizeString(dispositionData.dispositiondate ?? dispositionData.dispositionDate) || null,
      signedByJudge:         normalizeString(dispositionData.signedbyjudge   ?? dispositionData.signedByJudge)   || null,
      mailedDate:            normalizeString(dispositionData.mailedddate      ?? dispositionData.mailedDate)      || null,
      hearingYesNo:          normalizeString(dispositionData.hearingyesno     ?? dispositionData.hearingYesNo),
      boxNo:                 normalizeString(dispositionData.boxno            ?? dispositionData.boxNo),
      closingClerk:          String(userId || ''),
      docketDispositionDate: new Date(),
    }, { transaction: t });

    const today = moment().format('YYYY-MM-DD');
    await Docket.update(
      { status: 'Closed', closedDate: today, modifiedDate: new Date() },
      { where: { caseId: resolvedCaseId }, transaction: t },
    );

    await DocketOpenCloseDetails.create(
      { caseId: resolvedCaseId, docketStatus: 'closed', userId: userId || 0 },
      { transaction: t },
    );

    await t.commit();
    return record;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

export async function saveDispositionByCaseId(caseId, dispositionData = {}) {
  const resolvedCaseId = Number(caseId);
  const updatePayload = {
    dispositionCode: normalizeString(dispositionData.dispositionCode),
    dispositionDate: normalizeString(dispositionData.dispositionDate),
    signedByJudge: normalizeString(dispositionData.signedByJudge),
    mailedDate: normalizeString(dispositionData.mailedDate),
    hearingYesNo: normalizeString(dispositionData.hearingYesNo),
    boxNo: normalizeString(dispositionData.boxNo),
  };

  const existingDisposition = await DocketDisposition.findOne({ where: { caseId: resolvedCaseId } });

  if (existingDisposition) {
    await existingDisposition.update(updatePayload);
    return DocketDisposition.findOne({ where: { caseId: resolvedCaseId } });
  }

  return DocketDisposition.create({
    caseId: resolvedCaseId,
    ...updatePayload,
    closingClerk: '',
    docketDispositionDate: new Date(),
  });
}