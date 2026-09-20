import { Op, literal } from "sequelize";
import { JudgeAssistantClerk, DocketOpenCloseDetails } from "../../models/index.js";
import moment from "moment";
import { getMonthlyReportsDashboardView } from "./monthlyReportsDashboardView.js";
import { getMonthlyReportsDetailsView } from "./monthlyReportsDetailsView.js";
import { logger } from "../../../config/winstonLogger.js";

/**
 * Helper function to normalize filter values to arrays
 * @param {string|Array} value - Filter value
 * @returns {Array} Normalized array
 */
function normalizeFilterToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

const isDateAfterFeaturesDeployment = (view1Selected, toValue) => (
  view1Selected === 'docketclerk'
  && toValue
  && moment(toValue, 'MMM YYYY').isSameOrAfter(moment('2019-11-01'))
);

const applyStaffAttorneyViewFilter = (whereConditions, view1Selected) => {
  if (view1Selected === 'staffattorney') {
    whereConditions.push(
      literal(
        "`Docket`.`staffattorney` != '' AND `Docket`.`staffattorney` != '0'",
      ),
    );
  }
};

const applyDocketclerkFilter = (
  whereConditions,
  filter,
  isDateAfter2_5FeaturesDeployed,
) => {
  const docketclerkValue = normalizeFilterToArray(filter.docketclerk);
  if (!docketclerkValue.length) return;

  if (isDateAfter2_5FeaturesDeployed) {
    whereConditions.push({ '$doc_count.user_id$': { [Op.in]: docketclerkValue } });
  } else {
    whereConditions.push({ '$jac.user_id$': { [Op.in]: docketclerkValue } });
  }
};

const applyDateRangeFilter = (whereConditions, filter) => {
  if (filter.from && filter.to) {
    const fromDate = moment(filter.from, 'MMM YYYY')
      .startOf('month')
      .format('YYYY-MM-DD');
    const toDate = moment(filter.to, 'MMM YYYY')
      .endOf('month')
      .format('YYYY-MM-DD');

    whereConditions.push({
      dateReceivedByOSAH: {
        [Op.between]: [fromDate, toDate],
      },
    });
  }
};

const applyActorFilters = (whereConditions, filter) => {
  const refagencyValue = normalizeFilterToArray(filter.refagency);
  if (refagencyValue.length) {
    whereConditions.push({ refAgency: { [Op.in]: refagencyValue } });
  }

  const judgeValue = normalizeFilterToArray(filter.judge);
  if (judgeValue.length) {
    whereConditions.push({ judge: { [Op.in]: judgeValue } });
  }

  const judgeassistantValue = normalizeFilterToArray(filter.judgeassistant);
  if (judgeassistantValue.length) {
    whereConditions.push({ judgeAssistant: { [Op.in]: judgeassistantValue } });
  }

  const staffattorneyValue = normalizeFilterToArray(filter.staffattorney);
  if (staffattorneyValue.length) {
    whereConditions.push({ staffAttorney: { [Op.in]: staffattorneyValue } });
  }
};

const normalizeStatus = (filter) => {
  let status = filter.status || filter.reportType;
  if (Array.isArray(status) && status.length === 1) {
    status = status[0];
  }
  return status;
};

const pushDocStatusFilter = (whereConditions, statuses) => {
	whereConditions.push({
	  '$doc_count.docket_status$': { [Op.in]: statuses },
	});
};

const applyStatusFilter = (
	whereConditions,
	status,
	excludeCases,
	isDateAfter2_5FeaturesDeployed,
) => {
	if (!status) {
	  return;
	}

	// For dates before 2.5 features, rely on the legacy status field.
	if (!isDateAfter2_5FeaturesDeployed) {
	  if (status === 'open') {
	    whereConditions.push({ status: { [Op.ne]: 'closed' } });
	  } else if (status === 'closed') {
	    whereConditions.push({ status: 'closed' });
	  }
	  // For status === 'all' or any other value, no filter is applied (backward compatible).
	  return;
	}

	// From here on, we are in the "new" status-tracking mode
	if (status === 'open') {
	  const allowedStatuses = excludeCases
	    ? ['open', 're_opened', 'sys_generated']
	    : ['open', 're_opened', 'sys_generated', '91_days'];
	  pushDocStatusFilter(whereConditions, allowedStatuses);
	  return;
	}

	if (status === 'closed') {
	  pushDocStatusFilter(whereConditions, ['closed', 'sys_closed']);
	  return;
	}

	if (status === 'all') {
	  const allowedStatuses = excludeCases
	    ? ['open', 're_opened', 'sys_generated', 'closed', 'sys_closed']
	    : ['open', 're_opened', 'sys_generated', '91_days', 'closed', 'sys_closed'];
	  pushDocStatusFilter(whereConditions, allowedStatuses);
	}
};

const applyFilterCaseTypes = (whereConditions, filterCasetype, agencyCasetypeList) => {
  if (!filterCasetype || !Array.isArray(filterCasetype)) return;

  const caseTypeConditions = [];

  for (const data of filterCasetype) {
    const agencyFlag = data.includes('||');
    if (agencyFlag) {
      const [agency, casetype] = data.split('||');
      caseTypeConditions.push({
        [Op.and]: [
          { refAgency: agency },
          { caseType: casetype },
        ],
      });
      if (!agencyCasetypeList.includes(casetype)) {
        agencyCasetypeList.push(casetype);
      }
    } else {
      caseTypeConditions.push({ caseType: data });
    }
  }

  if (caseTypeConditions.length) {
    whereConditions.push({ [Op.or]: caseTypeConditions });
  }
};

const applyDetailsViewCaseType = (whereConditions, detailsView, agencyCasetypeList) => {
  if (!detailsView?.casetype) return;

  const agencyFlag = detailsView.casetype.includes('||');
  if (agencyFlag) {
    const [agency, casetype] = detailsView.casetype.split('||');
    whereConditions.push({
      [Op.and]: [
        { refAgency: agency },
        { caseType: casetype },
      ],
    });
    if (!agencyCasetypeList.includes(casetype)) {
      agencyCasetypeList.push(casetype);
    }
  } else {
    whereConditions.push({ caseType: detailsView.casetype });
  }
};

const buildInclude = (view1Selected, isDateAfter2_5FeaturesDeployed) => {
  const include = [];

  if (view1Selected === 'docketclerk') {
    include.push({
      model: JudgeAssistantClerk,
      as: 'jac',
      required: true,
      attributes: [],
      on: literal(
        '`Docket`.`docketclerk` = LEFT(`jac`.`email`, LOCATE("@", `jac`.`email`) - 1)',
      ),
    });

    if (isDateAfter2_5FeaturesDeployed) {
      include.push({
        model: DocketOpenCloseDetails,
        as: 'doc_count',
        required: true,
        attributes: ['docketStatus'],
      });
    }
  }

  return include;
};

/**
 * Monthly Reports - Dashboard or details view with filters
 * @param {Object} request - { filter: { from, to, judge, judgeassistant, staffattorney, docketclerk, refagency, casetype }, view: { view1Selected, view2Selected, detailsView }, responseType, get }
 * @returns {Promise<Object>} { data, details, totalCount, clerkActivitiesCount, exportDashboard }
 */
export async function monthlyReports(request) {
  try {
    const filter = request.filter || {};
    const view = request.view || {};

    // ✅ Frontend already sends backend values (judgeassistant, docketclerk)
    // No normalization needed - validator accepts these values directly
    const view1Selected = view.view1Selected;

    const detailsView = view.detailsView;
    const responseType = request.responseType; // 'export' or undefined
    const get = request.get || {};

	    const agencyCasetypeList = [];

	    // Build where conditions
	    const whereConditions = [];
	    whereConditions.push({ telvOFive: '1' });

	    const isDateAfter2_5FeaturesDeployed = isDateAfterFeaturesDeployment(
	      view1Selected,
	      filter.to,
	    );

	    applyStaffAttorneyViewFilter(whereConditions, view1Selected);
	    applyDocketclerkFilter(
	      whereConditions,
	      filter,
	      isDateAfter2_5FeaturesDeployed,
	    );
	    applyDateRangeFilter(whereConditions, filter);
	    applyActorFilters(whereConditions, filter);

	    const excludeCases = filter.exclude_cases === '1';
	    const status = normalizeStatus(filter);
	    applyStatusFilter(
	      whereConditions,
	      status,
	      excludeCases,
	      isDateAfter2_5FeaturesDeployed,
	    );

	    applyFilterCaseTypes(whereConditions, filter.casetype, agencyCasetypeList);
	    applyDetailsViewCaseType(whereConditions, detailsView, agencyCasetypeList);

	    const include = buildInclude(view1Selected, isDateAfter2_5FeaturesDeployed);

	    if (detailsView) {
	      return await getMonthlyReportsDetailsView(
	        whereConditions,
	        include,
	        detailsView,
	        responseType,
	        isDateAfter2_5FeaturesDeployed,
	      );
	    }

	    return await getMonthlyReportsDashboardView(
	      whereConditions,
	      include,
	      view,
	      responseType,
	      get,
	      agencyCasetypeList,
	      isDateAfter2_5FeaturesDeployed,
	    );

  } catch (error) {
    logger.error("Error in monthlyReports helper:", error);
    throw error;
  }
}
