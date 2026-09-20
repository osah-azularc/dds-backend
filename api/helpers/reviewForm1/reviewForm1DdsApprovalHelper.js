/**
 * @module reviewForm1DdsApprovalHelper
 * @description Copies DDS-specific (agency_platform_id == 5) data to the newly
 *              created docket when a DDS Form 1 is approved — split out from
 *              reviewForm1ApprovalService.js to keep new code in its own file.
 *              Mirrors Reviewform1Controller::reviewformapproveAction()'s DDS
 *              block (Reviewform1Controller.php:843-878).
 */
import Form1Dds1205Offence from '../../models/Form1Dds1205Offence.js';
import Form1205Offence from '../../models/Form1205Offence.js';
import Form1DdsPermitEligibilityEffectivedate from '../../models/Form1DdsPermitEligibilityEffectivedate.js';
import PermitEligibilityEffectivedate from '../../models/PermitEligibilityEffectivedate.js';
import DDSHistory from '../../models/DDSHistory.js';
import Form1Summarytable from '../../models/Form1Summarytable.js';
import SummaryTable from '../../models/SummaryTable.js';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-14
  Description : Copies DDS-specific (agency_platform_id 5) data — 1205 offense,
                permit eligibility, history, summary notes — to the newly
                created docket when a DDS Form 1 is approved.
*/

/**
 * @param {number} form1Id
 * @param {number} docketId - the newly created docket's caseId
 * @param {import('sequelize').Transaction} transaction
 */
export async function copyDdsDataToDocket(form1Id, docketId, transaction) {
  const offence = await Form1Dds1205Offence.findOne({ where: { form1Id }, transaction });
  if (offence) {
    await Form1205Offence.create(
      {
        caseId: docketId,
        citiation: offence.citiation,
        countyOfOccurences: offence.countyOfOccurences,
        incidentDate: offence.incidentDate,
        incidentTime: offence.incidentTime,
        officerBadgeNumber: offence.officerBadgeNumber,
        commercialVehicle: offence.commercialVehicle,
        hazourdousVehicle: offence.hazourdousVehicle,
        stateOfIssue: offence.stateOfIssue,
        licenseClassId: offence.licenseClassId,
        dob: offence.dob,
        restrictions: offence.restrictions,
        gender: offence.gender,
        height: offence.height,
        weight: offence.weight,
        driverRequest: offence.driverRequest,
        telvOFive: offence.telvOFive,
      },
      { transaction },
    );
  }

  const permitEligibility = await Form1DdsPermitEligibilityEffectivedate.findOne({
    where: { form1Id },
    transaction,
  });
  if (permitEligibility) {
    await PermitEligibilityEffectivedate.create(
      {
        caseId: docketId,
        effectiveDate: permitEligibility.effectiveDate,
        eligibility: permitEligibility.eligibility,
        expiryDate: permitEligibility.expiryDate,
        permitPrintDate: permitEligibility.permitPrintDate,
        createdDate: permitEligibility.createdDate,
        modifiedDate: permitEligibility.modifiedDate,
      },
      { transaction },
    );
  }

  await DDSHistory.update(
    { docketCaseId: docketId, caseId: docketId },
    { where: { form1Id }, transaction },
  );

  const notes = await Form1Summarytable.findAll({ where: { form1Id }, transaction });
  if (notes.length) {
    await SummaryTable.bulkCreate(
      notes.map((note) => ({
        caseId: docketId,
        docketCaseId: docketId,
        date: note.date,
        summaryNotes: note.summaryNotes,
        updatedBy: note.updatedBy,
        deleted: note.deleted,
      })),
      { transaction },
    );
  }
}
