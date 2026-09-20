/**
 * DFCS Calendar-Driven Hearing Assignment
 *
 * Legacy: CalendarModel::getHearingInfoForDocket (osah.repos, CalendarModel.php:1144-1264),
 * invoked from OsahformController::uploadDfcsMAction (OsahformController.php:9570-9761).
 *
 * For every DFCS row, legacy resolves a hearing slot from a pre-populated scheduling
 * calendar (keyed on casetype + county), with a capacity check against already-docketed
 * cases on that exact date/time/site. This is a lookup + capacity check, not a
 * rotation/scheduling algorithm — it's ported here as near-verbatim raw SQL (matching the
 * existing raw-query pattern for calendar data in adminCalendarController.js) rather than
 * reconstructed via Sequelize `include`/`having`, since there's no simpler ORM analogue for
 * a 9-way join with a HAVING-based capacity check and a dynamic sort direction.
 */
import moment from 'moment';
import { QueryTypes } from 'sequelize';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import JudgeAssistantClerk from '../../models/JudgeAssistantClerk.js';

const emptyAssignment = () => ({
  hearingSite: '',
  hearingDate: null,
  hearingTime: null,
  judge: '',
  judgeAssistant: '',
  judgeLastName: '',
  status: 'Pending',
});

// Legacy: cuttoffdate.cutoff_days_diffrence for the casetype (CalendarModel.php:1149-1161).
const getCutoffDaysDifference = async (caseTypeId) => {
  const rows = await mysqlSequelize.query(
    'SELECT cutoff_days_diffrence FROM cuttoffdate WHERE casetypeid = :caseTypeId',
    { replacements: { caseTypeId }, type: QueryTypes.SELECT },
  );
  return rows[0]?.cutoff_days_diffrence ?? null;
};

// Legacy: hearingdateskip lookup for the casetype (CalendarModel.php:1163-1175 and, separately,
// re-checked at OsahformController.php:9608-9610). Both call sites check the same condition —
// we query it once here and reuse the boolean for both the query-shaping and the blanking step.
const isSkipCasetype = async (caseTypeId) => {
  const rows = await mysqlSequelize.query(
    'SELECT casetypeid FROM hearingdateskip WHERE casetypeid = :caseTypeId',
    { replacements: { caseTypeId }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
};

/**
 * Ported from CalendarModel.php:1187-1254. Picks a single best-available hearing slot for a
 * casetype+county, or returns null if nothing matches / every matching slot is full.
 */
const findHearingSlot = async (caseTypeId, countyId, skipCasetype, cutoffDaysDifference) => {
  // Legacy: $order = "desc" by default, becomes "" (ascending) only when NOT a skip-casetype
  // (CalendarModel.php:1145,1177-1178) — i.e. inverted from what "skip" might suggest.
  let order = 'DESC';
  let dateFilter = '';
  let cutoffThreshold = null;
  if (!skipCasetype) {
    order = '';
    if (cutoffDaysDifference !== null) {
      cutoffThreshold = moment().add(Number(cutoffDaysDifference), 'days').format('YYYY-MM-DD');
      dateFilter = 'AND hr.hearing_date > :cutoffThreshold';
    } else {
      dateFilter = 'AND hr.cutoff_date > CURRENT_DATE';
    }
  }

  const sql = `
    SELECT
      COUNT(d.caseid) AS no_of_cases_docketed,
      hr.no_of_cases AS no_of_cases,
      hr.judge_id AS judge_id,
      CONCAT(judge.LastName, ' ', judge.FirstName) AS judge_name,
      hr.cma_id AS cma_id,
      CONCAT(assist.LastName, ' ', assist.FirstName) AS cma_name,
      hr.time_id AS time_id,
      ht.heringtimestored AS time,
      hr.court_location_id AS court_location_id,
      cloc.locationname AS court_location,
      DATE_FORMAT(hr.hearing_date, '%m-%d-%Y') AS hearing_date,
      hr.cutoff_date AS cutoff_date
    FROM v2_5_calendar cal
    JOIN v2_5_calendar_casetype calct ON cal.id = calct.calendar_id
    JOIN v2_5_county_circuit_map cn ON cal.circuit_id = cn.circuit_id
    JOIN v2_5_calendar_hearing_info hr ON cal.id = hr.calendar_id
    JOIN hearingtime ht ON hr.time_id = ht.timeid
    JOIN casetypegroups ctg ON cal.casetype_group_id = ctg.id
    JOIN casetypes ct ON calct.casetype_id = ct.Casetypeid
    JOIN courtlocations cloc ON hr.court_location_id = cloc.courtlocationid
    JOIN v2_5_circuit cr ON cn.circuit_id = cr.id
    JOIN judge_assistant_clerk assist ON hr.cma_id = assist.user_id
    JOIN judge_assistant_clerk judge ON hr.judge_id = judge.user_id
    LEFT JOIN docket d
      ON d.hearingdate = hr.hearing_date
      AND d.hearingtime = ht.heringtimestored
      AND d.hearingsite = cloc.locationname
    WHERE calct.casetype_id = :caseTypeId AND cn.county_id = :countyId ${dateFilter}
    GROUP BY hr.id
    HAVING (no_of_cases_docketed < no_of_cases OR no_of_cases_docketed = 0 OR no_of_cases IS NULL)
    ORDER BY hr.hearing_date ${order}, time
    LIMIT 1
  `;

  const rows = await mysqlSequelize.query(sql, {
    replacements: { caseTypeId, countyId, cutoffThreshold },
    type: QueryTypes.SELECT,
  });
  return rows[0] ?? null;
};

/**
 * Resolve the hearing assignment for one DFCS row. Must be called live, per row — the
 * capacity check counts already-committed docket rows, so prefetching this into the shared
 * lookup cache would go stale mid-batch (matches legacy, which queries per-row too).
 */
export async function resolveHearingAssignment(caseTypeId, countyId) {
  if (!caseTypeId || caseTypeId === '0' || !countyId || countyId === 'UNASSIGNED') {
    return emptyAssignment();
  }

  const skipCasetype = await isSkipCasetype(caseTypeId);
  const cutoffDaysDifference = skipCasetype ? null : await getCutoffDaysDifference(caseTypeId);
  const slot = await findHearingSlot(caseTypeId, countyId, skipCasetype, cutoffDaysDifference);

  if (!slot) return emptyAssignment();

  // Legacy: separate judge_assistant_clerk lookup for the docket-number suffix
  // (OsahformController.php:9600-9605) — not reused from slot.judge_name.
  const judgeRecord = slot.judge_id
    ? await JudgeAssistantClerk.findOne({ where: { userId: slot.judge_id }, attributes: ['lastName'] })
    : null;
  const judgeLastName = judgeRecord?.lastName || '';

  // Legacy: for a skip-casetype, hearingsite/time/hearing_date are blanked regardless of what
  // the slot query found — but judge/judgeassistant (and the docket-number judge suffix) stay
  // populated from the slot, since blanking only touches those three fields
  // (OsahformController.php:9614-9623).
  if (skipCasetype) {
    return {
      hearingSite: '',
      hearingDate: null,
      hearingTime: null,
      judge: slot.judge_name || '',
      judgeAssistant: slot.cma_name || '',
      judgeLastName,
      status: 'Pending',
    };
  }

  const hearingDate = slot.hearing_date
    ? moment(slot.hearing_date, 'MM-DD-YYYY').format('YYYY-MM-DD')
    : null;

  return {
    hearingSite: slot.court_location || '',
    hearingDate,
    hearingTime: slot.time || null,
    judge: slot.judge_name || '',
    judgeAssistant: slot.cma_name || '',
    judgeLastName,
    status: hearingDate ? 'Hearing Scheduled' : 'Pending',
  };
}
