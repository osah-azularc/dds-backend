/*
  Created by  : Snehal Narkar
  Date        : 2026-05-28
  Description : Docket update and history helpers for the NOH Quick Action.
                Uses Sequelize ORM (no raw SQL).
*/

import moment from 'moment';
import Docket from '../../models/Docket.js';
import History from '../../models/History.js';
import { localNow } from '../timeUtils.js';

/**
 * Update docket hearingdate, hearingtime, and status for single NOH quick action.
 * Mirrors PHP NOHAutomation updateData: hearingdate + hearingtime + status = 'Hearing Scheduled'.
 */
export const updateDocketForNOH = async (caseid, newHearingDate, newHearingTime, transaction) => {
  await Docket.update(
    {
      hearingDate: newHearingDate,
      hearingTime: newHearingTime,
      status: 'Hearing Scheduled',
      modifiedDate: new Date(),
    },
    { where: { caseId: caseid }, transaction },
  );
};

/**
 * Insert a row into the `history` table (docket history tab in the UI).
 * Mirrors PHP NOHAutomation addHistory($db, $historyData, "history"):
 *   caseid, Docket_caseid, Modifiedby, Description, date, created_time.
 */
export const insertNOHDocketHistory = async (caseid, username, hearingDate, hearingTime, transaction) => {
  const formattedDate = hearingDate
    ? moment(hearingDate, ['YYYY-MM-DD', 'MM-DD-YYYY']).format('MM-DD-YYYY')
    : '';
  const formattedTime = hearingTime
    ? moment(hearingTime, 'HH:mm:ss').format('h:mm A')
    : '';

  const description =
    '<p class="history-title">Quick Action: A new notice of hearing has been added to the docket.</p>' +
    '<p class="history-title">Osah form has been updated:</p>' +
    `<p><span class="history-label">Hearing Date:</span><span class="history-data">${formattedDate}</span></p>` +
    `<p><span class="history-label">Hearing Time:</span><span class="history-data">${formattedTime}</span></p>`;

  const now = localNow();
  await History.create(
    {
      caseId: caseid,
      docketCaseId: caseid,
      description,
      modifiedBy: username || '',
      date: now.format('YYYY-MM-DD'),
      createdTime: now.format('HH:mm:ss'),
    },
    { transaction },
  );
};
