/*
  Created by  : Snehal Narkar
  Date        : 2026-08-11
  Description : Admin Billing Roles helper (Time & Expense).
                Mirrors PHP TimeExpenseController's getTimeEntryBillingRolesListAction /
                getBillingRolesDetailsAction — same judge_assistant_clerk-driven judgeCount and
                all-null placeholder-row behavior, via Sequelize instead of raw SQL.
*/
import { Op, fn, col } from 'sequelize';
import TimeEntryBillingRole from '../../../models/timeexpense/timeentry/TimeEntryBillingRole.js';
import JudgeAssistantClerk from '../../../models/JudgeAssistantClerk.js';

// judgeCount is scoped to these four roles, mirroring legacy's getTimeEntryBillingRolesListAction.
const JUDGE_COUNT_SUB_TYPE_ROLES = ['judge', 'sa', 'saalj', 'law_clerk'];

const billableAccessText = (billableAccess) =>
  String(billableAccess) === '1' ? 'Billable' : 'Non-Billable';

function mapBillingRoleRow(row) {
  const plain = row?.toJSON ? row.toJSON() : row;
  return {
    id: String(plain.id),
    role: plain.role || '',
    subTypeRole: plain.subTypeRole || '',
    ratePerHour: plain.ratePerHour === null ? '' : String(plain.ratePerHour),
    billableAccess: plain.billableAccess || '0',
    expenseEntryAccess: plain.expenseEntryAccess || '0',
    invoicingAccess: plain.invoicingAccess || '0',
    createdDate: plain.createdDate,
    updatedDate: plain.updatedDate,
    billableAccessText: billableAccessText(plain.billableAccess),
  };
}

/**
 * Count active judge_assistant_clerk users per sub_type_role, keyed by that role.
 * Replaces legacy's four separate per-role queries with one grouped aggregate query.
 */
async function getJudgeCountsBySubTypeRole() {
  const counts = await JudgeAssistantClerk.findAll({
    attributes: ['subTypeRole', [fn('COUNT', col('sub_type_role')), 'judgeCount']],
    where: { subTypeRole: { [Op.in]: JUDGE_COUNT_SUB_TYPE_ROLES } },
    group: ['subTypeRole'],
    raw: true,
  });

  return new Map(counts.map((row) => [row.subTypeRole, row.judgeCount]));
}

// All-null placeholder legacy returns for a sub_type_role with zero currently-assigned users:
// its query is a bare COUNT() with no GROUP BY, which always emits exactly one row — with every
// non-aggregate column NULL when nothing matches — rather than omitting the row.
function buildEmptySubTypeRow(subTypeRole) {
  return {
    id: null,
    role: null,
    subTypeRole: null,
    ratePerHour: null,
    billableAccess: null,
    expenseEntryAccess: null,
    invoicingAccess: null,
    createdDate: null,
    updatedDate: null,
    billableAccessText: 'Non-Billable',
    judgeCount: '0',
    // Frontend-only key so the grid can render this row (id is null, matching legacy).
    rowKey: `empty-${subTypeRole}`,
  };
}

/**
 * Fetch one row per sub-type role (judge, sa, saalj, law_clerk), each with a judgeCount of
 * currently active judge_assistant_clerk users sharing that role. Always returns exactly four
 * rows — mirrors legacy's four separate per-role queries, which always emit one row apiece,
 * falling back to an all-null placeholder row when a role currently has no assigned users.
 */
export async function getBillingRolesList() {
  const [roles, judgeCountsBySubTypeRole] = await Promise.all([
    TimeEntryBillingRole.findAll(),
    getJudgeCountsBySubTypeRole(),
  ]);

  const roleBySubType = new Map(roles.map((role) => [role.subTypeRole, role]));

  return JUDGE_COUNT_SUB_TYPE_ROLES.map((subTypeRole) => {
    if (!judgeCountsBySubTypeRole.has(subTypeRole)) return buildEmptySubTypeRow(subTypeRole);

    const role = roleBySubType.get(subTypeRole);
    if (!role) return buildEmptySubTypeRow(subTypeRole);

    const mapped = mapBillingRoleRow(role);
    return { ...mapped, judgeCount: String(judgeCountsBySubTypeRole.get(subTypeRole)), rowKey: mapped.id };
  });
}

/** Fetch a single billing role's details by id. Returns null when not found. */
export async function getBillingRoleDetails(id) {
  const role = await TimeEntryBillingRole.findByPk(id);
  if (!role) return null;

  return mapBillingRoleRow(role);
}

/**
 * Update a billing role's rate per hour. Scoped to this one field on purpose — legacy's
 * saveBillabletasksformAction also writes `role`, but reads it from formData.role, a key the
 * edit modal never actually populates (it only sets sub_type_role), so every legacy edit
 * silently blanks that column. Not replicating that; only ratePerHour is writable here.
 * Returns null when not found.
 */
export async function updateBillingRoleRate(id, ratePerHour) {
  const role = await TimeEntryBillingRole.findByPk(id);
  if (!role) return null;

  await role.update({ ratePerHour: String(ratePerHour), updatedDate: new Date() });
  return mapBillingRoleRow(role);
}
