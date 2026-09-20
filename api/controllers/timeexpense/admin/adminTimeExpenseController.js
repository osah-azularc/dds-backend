/*
  Created by  : Snehal Narkar
  Date        : 2026-08-27
  Description : Admin controllers for the Time & Expense CRUD entities — Billable
                Agencies, Time Entry Tasks, Expense Types. All three are the same 4-handler
                shape (list/details/save/status-toggle), so they share one file built on
                makeAdminEntityController instead of one file each. Matches PHP
                TimeExpenseController's getBillableAgencyListAction/...,
                timeEntryTasksAction/..., saveExpenseEntryTasksFormAction/... — see the
                corresponding *Helper.js files.
*/
import * as billableAgencyHelper from '../../../helpers/timeexpense/admin/billableAgencyHelper.js';
import * as adminTimeExpenseHelper from '../../../helpers/timeexpense/admin/adminTimeExpenseHelper.js';
import { makeAdminEntityController } from './makeAdminEntityController.js';

const billableAgency = makeAdminEntityController(
  {
    getList: billableAgencyHelper.getBillableAgencyList,
    getDetails: billableAgencyHelper.getBillableAgencyDetails,
    save: billableAgencyHelper.saveBillableAgency,
    setStatus: billableAgencyHelper.setBillableAgencyStatus,
  },
  { entityLabel: 'billable agency', entityLabelPlural: 'billable agencies' },
);

export const getBillableAgencyList = billableAgency.getList;
export const getBillableAgencyDetails = billableAgency.getDetails;
export const saveBillableAgency = billableAgency.save;
export const setBillableAgencyStatus = billableAgency.setStatus;

const timeEntryTask = makeAdminEntityController(
  {
    getList: adminTimeExpenseHelper.getTimeEntryTaskList,
    getDetails: adminTimeExpenseHelper.getTimeEntryTaskDetails,
    save: adminTimeExpenseHelper.saveTimeEntryTask,
    setStatus: adminTimeExpenseHelper.setTimeEntryTaskStatus,
  },
  { entityLabel: 'time entry task', entityLabelPlural: 'time entry tasks' },
);

export const getTimeEntryTaskList = timeEntryTask.getList;
export const getTimeEntryTaskDetails = timeEntryTask.getDetails;
export const saveTimeEntryTask = timeEntryTask.save;
export const setTimeEntryTaskStatus = timeEntryTask.setStatus;

const expenseType = makeAdminEntityController(
  {
    getList: adminTimeExpenseHelper.getExpenseTypeList,
    getDetails: adminTimeExpenseHelper.getExpenseTypeDetails,
    save: adminTimeExpenseHelper.saveExpenseType,
    setStatus: adminTimeExpenseHelper.setExpenseTypeStatus,
  },
  { entityLabel: 'expense type', entityLabelPlural: 'expense types' },
);

export const getExpenseTypeList = expenseType.getList;
export const getExpenseTypeDetails = expenseType.getDetails;
export const saveExpenseType = expenseType.save;
export const setExpenseTypeStatus = expenseType.setStatus;
