/*
  Created by  : Snehal Narkar
  Date        : 2026-08-27
  Description : Admin CRUD helpers for the Time & Expense entities whose Sequelize access
                is a plain single-table CRUD — Time Entry Tasks and Expense Types. Both
                are the same shape (see makeAdminCrudHelper.js), so they share one file
                instead of one file each. Mirrors PHP TimeExpenseController's
                timeEntryTasksAction/setTaskStatusAction/getUserDetailsAction (task-details
                variant) and saveExpenseEntryTasksFormAction/getExpenseDetailsAction/
                setExpenseTaskStatusAction. Search is client-side only (matches legacy
                Angular's `filter:search_users` over the full list) — no server-side
                search filter on either list endpoint.
*/
import TimeEntryTask from '../../../models/timeexpense/timeentry/TimeEntryTask.js';
import ExpenseType from '../../../models/timeexpense/timeentry/TimeEntryExpenseType.js';
import { makeAdminCrudHelper } from './makeAdminCrudHelper.js';

// ── Time Entry Tasks ──────────────────────────────────────────────────────────────
function mapTaskRow(row) {
  const plain = row?.toJSON ? row.toJSON() : row;
  return {
    id: plain.id,
    taskName: plain.taskName || '',
    taskAbbreviation: plain.taskAbbreviation || '',
    taskDescription: plain.taskDescription || '',
    isBillable: plain.isBillable || '0',
    isActive: plain.isActive ?? '1',
    createdDate: plain.createdDate,
    updatedDate: plain.updatedDate,
  };
}

function buildTaskData(formData) {
  return {
    taskName: formData.taskName,
    taskAbbreviation: formData.taskAbbreviation,
    taskDescription: formData.taskDescription || '',
    isBillable: formData.isBillable,
  };
}

const timeEntryTask = makeAdminCrudHelper(TimeEntryTask, {
  orderField: 'taskName',
  mapRow: mapTaskRow,
  buildData: buildTaskData,
});

export const getTimeEntryTaskList = timeEntryTask.getList;
export const getTimeEntryTaskDetails = timeEntryTask.getDetails;
export const saveTimeEntryTask = timeEntryTask.save;
export const setTimeEntryTaskStatus = timeEntryTask.setStatus;

// ── Expense Types ─────────────────────────────────────────────────────────────────
function mapExpenseTypeRow(row) {
  const plain = row?.toJSON ? row.toJSON() : row;
  return {
    id: plain.id,
    expenseType: plain.expenseType || '',
    description: plain.description || '',
    isBillable: plain.isBillable || '0',
    isActive: plain.isActive ?? '1',
    createdDate: plain.createdDate,
    updatedDate: plain.updatedDate,
  };
}

function buildExpenseTypeData(formData) {
  const data = {
    expenseType: formData.expenseType,
    description: formData.description || '',
    isBillable: formData.isBillable,
  };

  // Matches legacy: editing also sets Status to match Billable (TimeExpenseController.php:676),
  // but only on edit, not create — and only for Expense Types, not Time Entry Tasks.
  if (formData.id) {
    data.isActive = formData.isBillable;
  }

  return data;
}

const expenseType = makeAdminCrudHelper(ExpenseType, {
  orderField: 'expenseType',
  mapRow: mapExpenseTypeRow,
  buildData: buildExpenseTypeData,
});

export const getExpenseTypeList = expenseType.getList;
export const getExpenseTypeDetails = expenseType.getDetails;
export const saveExpenseType = expenseType.save;
export const setExpenseTypeStatus = expenseType.setStatus;
