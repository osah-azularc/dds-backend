import { Op, Sequelize } from 'sequelize';

/*
  Created by  : Snehal Narkar
  Date        : 2026-07-15
  Description : Where-clause filter builders for the Assigned Form 1s list
                query — split out of reviewForm1AssignedController.js to keep
                the controller a thin HTTP handler.
*/

export const arrayOrStringHasValue = (value) =>
  (Array.isArray(value) && value.length > 0) ||
  (typeof value === 'string' && value);

// Mirrors legacy osah.repos (reviewform1controller.js:458-462): only chief
// clerks (review_form1s == 1) may browse other clerks' assigned Form 1s. A
// regular clerk is always scoped to their own queue, regardless of what the
// client requests.
export function resolveRequestedClerk(req, requestedClerk) {
  const isChiefClerk = Number(req.user?.review_form1s) === 1;
  const ownUserName = req.user?.email ? String(req.user.email).split('@')[0] : null;
  return isChiefClerk ? requestedClerk : (ownUserName || '__no_such_clerk__');
}

export function applyClerkFilter(whereConditions, clerk, hasAnyFilters) {
  if (!hasAnyFilters) {
    // No filters selected -> behave like legacy default: any assigned clerk, last 30 days, key statuses
    whereConditions.docketClerk = { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] };
    whereConditions.status = { [Op.in]: ['submitted', 'rejected', 'approved'] };
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    whereConditions.dateReceivedByOSAH = { [Op.gte]: thirtyDaysAgo };
    return;
  }
  if (Array.isArray(clerk) && clerk.length > 0) {
    whereConditions.docketClerk = { [Op.in]: clerk };
  } else if (typeof clerk === 'string' && clerk) {
    whereConditions.docketClerk = clerk;
  } else {
    whereConditions.docketClerk = { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] };
  }
}

// Matches legacy osah.repos exactly (agencyPlatformId, not refAgency).
export function applyAgencyFilter(whereConditions, agency) {
  if (Array.isArray(agency) && agency.length > 0) {
    whereConditions.agencyPlatformId = { [Op.in]: agency };
  } else if (typeof agency === 'string' && agency) {
    whereConditions.agencyPlatformId = agency;
  }
}

export function applyCaseTypeFilter(whereConditions, caseType) {
  if (Array.isArray(caseType) && caseType.length > 0) {
    whereConditions.caseType = { [Op.in]: caseType };
  } else if (typeof caseType === 'string' && caseType) {
    whereConditions.caseType = caseType;
  }
}

export function applyStatusFilter(whereConditions, status, hasAnyFilters, hasExplicitStatusFilter) {
  if (hasAnyFilters && hasExplicitStatusFilter) {
    if (Array.isArray(status) && status.length > 0) {
      whereConditions.status = { [Op.in]: status };
    } else if (typeof status === 'string' && status) {
      whereConditions.status = status;
    }
  } else if (hasAnyFilters) {
    // Legacy behavior: filters applied but status not specified -> exclude cloned/resubmitted/pending
    whereConditions.status = { [Op.notIn]: ['cloned', 'resubmitted', 'pending'] };
  }
}

export function applyDateFilter(whereConditions, dates, hasAnyFilters) {
  if (!hasAnyFilters) return;
  const { dateReceived, dateReceivedFrom, dateReceivedTo } = dates;
  const hasCustomDateRange = !!(dateReceivedFrom || dateReceivedTo);

  if (hasCustomDateRange) {
    const range = {};
    if (dateReceivedFrom) range[Op.gte] = new Date(dateReceivedFrom);
    if (dateReceivedTo) {
      const toDate = new Date(dateReceivedTo);
      toDate.setDate(toDate.getDate() + 1);
      range[Op.lt] = toDate;
    }
    // Op.gte/Op.lt are Symbol keys — Object.keys() can't see them, so it always reported
    // an empty range and this filter never got applied. Reflect.ownKeys() sees both.
    if (Reflect.ownKeys(range).length > 0) {
      whereConditions.dateReceivedByOSAH = range;
    }
  } else if (dateReceived) {
    const dayStart = new Date(dateReceived);
    const dayEnd = new Date(dateReceived);
    dayEnd.setDate(dayEnd.getDate() + 1);
    whereConditions.dateReceivedByOSAH = { [Op.gte]: dayStart, [Op.lt]: dayEnd };
  }
}

// Search across casetype, status, docket clerk, agency ref #, formatted date, case name.
export function buildSearchWhere(whereConditions, searchValue) {
  const where = { ...whereConditions };
  if (!searchValue) return where;

  const searchConditions = [
    { caseType: { [Op.like]: `%${searchValue}%` } },
    { status: { [Op.like]: `%${searchValue}%` } },
    { docketClerk: { [Op.like]: `%${searchValue}%` } },
    { agencyRefNumber: { [Op.like]: `%${searchValue}%` } },
    Sequelize.where(
      Sequelize.fn('DATE_FORMAT', Sequelize.col('dateReceivedByOSAH'), '%m-%d-%Y'),
      { [Op.like]: `%${searchValue}%` },
    ),
    { caseName: { [Op.like]: `%${searchValue}%` } },
  ];
  where[Op.and] = [...(where[Op.and] || []), { [Op.or]: searchConditions }];
  return where;
}
