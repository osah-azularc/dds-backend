import Joi from 'joi';
import moment from 'moment';
import { ValidationError, hasAtLeastOneFilterValue, stringArraySchema, numberArraySchema, dateStringSchema, monthYearSchema } from './validators.js';


// Bulk Doc Reports validation schema
const bulkDocReportsSchema = Joi.object({
  refagency: stringArraySchema,
  casetype: stringArraySchema,
  judge: stringArraySchema,
  cma: stringArraySchema,
  dateGeneratedFrom: dateStringSchema,
  dateGeneratedTo: dateStringSchema,
  page: Joi.number().integer().min(0).optional().default(0),
  limit: Joi.number().integer().min(1).max(500).optional().default(20),
  sortBy: Joi.string().valid('caseId', 'caseName', 'refAgency', 'caseType', 'dateReceived', 'hearingDate', 'county', 'hearingSite', 'judge', 'judgeAssistant').optional().default('dateReceived'),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').optional().default('desc'),
  exportMode: Joi.boolean().optional().default(false),
}).unknown(false);

// Bulk Designation Reports validation schema
const bulkDesignationReportsSchema = Joi.object({
  agency: stringArraySchema,
  casetype: stringArraySchema,
  judge: stringArraySchema,
  cma: stringArraySchema,
  dateDesignatedFrom: dateStringSchema,
  dateDesignatedTo: dateStringSchema,
  page: Joi.number().integer().min(0).optional().default(0),
  limit: Joi.number().integer().min(1).max(500).optional().default(20),
  sortBy: Joi.string().valid('caseId', 'caseName', 'agencyCode', 'caseCode', 'dateReceived', 'hearingDate', 'decisionAutomationDate', 'judge', 'cma').optional().default('decisionAutomationDate'),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').optional().default('desc'),
  exportMode: Joi.boolean().optional().default(false),
}).unknown(false);

// Agency Form1 Approval Reports validation schema
const agencyForm1ApprovalReportsSchema = Joi.object({
  clerk: stringArraySchema,
  county: stringArraySchema,
  agency: stringArraySchema,
  casetypes: stringArraySchema,
  judge: stringArraySchema,
  judgeassistant: stringArraySchema,
  staffattorney: stringArraySchema,
  status: stringArraySchema,
  hearingdatefrom: dateStringSchema,
  hearingdateto: dateStringSchema,
  dateReceivedfrom: dateStringSchema,
  dateReceivedto: dateStringSchema,
  page: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(500).default(20),
  sortBy: Joi.string().valid('caseId', 'caseName', 'refAgency', 'caseType', 'dateReceived', 'hearingDate', 'county', 'hearingSite', 'status', 'judge', 'judgeAssistant', 'staffAttorney', 'docketClerk').default('caseId'),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('desc'),
  exportMode: Joi.boolean().default(false),
}).unknown(false);

// Decision Automation Reports validation schema
const decisionAutomationReportsSchema = Joi.object({
  automation_flag: Joi.string().valid('decision', 'continuance', 'noh').allow('').optional(),
  casetypes: stringArraySchema,
  judge: stringArraySchema,
  cma: stringArraySchema,
  agency: stringArraySchema,
  automation_sub_type: stringArraySchema,
  dateReceivedfrom: dateStringSchema,
  dateReceivedto: dateStringSchema,
  automationdatefrom: dateStringSchema,
  automationdateto: dateStringSchema,
  hearingdatefrom: dateStringSchema,
  hearingdateto: dateStringSchema,
  page: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(500).default(20),
  sortBy: Joi.string().valid('caseId', 'caseName', 'agencyCode', 'caseCode', 'dateReceived', 'hearingDate', 'decisionAutomationDate', 'automationSubType', 'judge', 'cma').default('decisionAutomationDate'),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('desc'),
  exportMode: Joi.boolean().default(false),
}).unknown(false);

// Rejected Documents Reports validation schema
const rejectedDocumentsSchema = Joi.object({
  reportType: Joi.string().valid('agency', 'ecourt').allow('').optional().default('ecourt'),
  agency: stringArraySchema,
  casetypes: stringArraySchema,
  platform: stringArraySchema,
  judge: stringArraySchema,
  judgeassistant: stringArraySchema,
  clerk: stringArraySchema,
  dateReceivedfrom: dateStringSchema,
  dateReceivedto: dateStringSchema,
  page: Joi.number().integer().min(0).optional().default(0),
  limit: Joi.number().integer().min(1).max(500).optional().default(20),
  sortBy: Joi.string().valid('docketNo', 'documentName', 'uploadedBy', 'uploadedDate', 'platform').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc'),
}).unknown(false);

// Aging Reports filter validation schema
const agingReportsFilterSchema = Joi.object({
  refagency: stringArraySchema,
  casetype: stringArraySchema,
  judge: stringArraySchema,
  judgeassistant: stringArraySchema,
  county: stringArraySchema,
  dateReceivedFrom: dateStringSchema,
  dateReceivedTo: dateStringSchema,
  stayed: Joi.string().valid('0', '1').allow('').optional(),
}).unknown(false);

// Aging Reports view validation schema
const agingReportsViewSchema = Joi.object({
  view1Selected: Joi.string().valid('open-cases', 'sop', 'no-hearing-date', 'no-decision', 'decision', 'no-noh').optional()
    .messages({ 'string.empty': 'Required fields view1Selected should not be empty.' }),
  view2Selected: Joi.string().valid('judges', 'agency', 'cma', 'case-types').optional().default('judges')
    .messages({ 'string.empty': 'Required fields view2Selected should not be empty.' }),
  detailsView: Joi.object({
    caseType: Joi.string().optional(),
    judge: Joi.string().optional(),
    refAgency: Joi.string().optional(),
    judgeAssistant: Joi.string().optional(),
    page: Joi.number().integer().min(0).optional().default(0),
    limit: Joi.number().integer().min(1).max(500).optional().default(20),
    sortBy: Joi.string().valid('docket', 'caseName', 'agency', 'caseType', 'county', 'location', 'judge', 'cma', 'dateReceived', 'hearingDate', 'dateSinceHearing', 'status').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional(),
  }).optional(),
  exportMode: Joi.boolean().optional(),
  exportDashboard: Joi.boolean().optional(),
}).unknown(false);

// Complete Aging Reports validation schema
const agingReportsSchema = Joi.object({
  filter: agingReportsFilterSchema.optional().default({}),
  view: agingReportsViewSchema.optional().default({}),
}).unknown(false);

// Monthly Reports filter validation schema
const monthlyReportsFilterSchema = Joi.object({
  from: monthYearSchema.required().messages({
    'any.required': 'Start date (from) is required. Please select a start date',
  }),
  to: monthYearSchema.required().messages({
    'any.required': 'End date (to) is required. Please select an end date',
  }),
  refagency: stringArraySchema, // ✅ Changed from string to array to match frontend
  casetype: stringArraySchema,
  judge: stringArraySchema, // ✅ Added judge filter
  judgeassistant: stringArraySchema, // ✅ Added judgeassistant (CMA) filter
  staffattorney: stringArraySchema, // ✅ Added staffattorney filter
  docketclerk: stringArraySchema, // ✅ Changed from string to array to match frontend
  status: Joi.string().valid('open', 'closed', 'all').allow('').optional(),
  reportType: Joi.string().valid('open', 'closed', 'all').allow('').optional(),
  exclude_cases: Joi.string().valid('0', '1').allow('').optional(),
  stayed: Joi.string().valid('0', '1').allow('').optional(),
}).unknown(false);

// Monthly Reports view validation schema
const monthlyReportsViewSchema = Joi.object({
  view1Selected: Joi.string().valid('judge', 'staffattorney', 'judgeassistant', 'docketclerk').required().messages({
    'any.required': 'view1Selected is required. Please specify the report type (judge, staffattorney, judgeassistant, or docketclerk)',
  }),
  view2Selected: Joi.string().valid('judges', 'case-types', 'default').allow('').optional(),
  detailsView: Joi.object({
    judge: Joi.string().optional(),
    judgeassistant: Joi.string().optional(),
    staffattorney: Joi.string().optional(),
    docketclerk: Joi.string().optional(),
    casetype: Joi.string().optional(),
    page: Joi.number().integer().min(0).optional().default(0),
    limit: Joi.number().integer().min(1).max(500).optional().default(20),
    // Sorting parameters for details view (using frontend field names that match DataGrid columns)
    sortBy: Joi.string().valid('caseId', 'caseName', 'refAgency', 'caseType', 'county', 'hearingSite', 'judge', 'judgeAssistant', 'dateReceivedByOSAH', 'dateReceivedDisplay', 'hearingDate', 'hearingDateDisplay', 'daysSinceHearing').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional(),
  }).optional(),
}).unknown(false);

// Complete Monthly Reports validation schema
const monthlyReportsSchema = Joi.object({
  filter: monthlyReportsFilterSchema.optional().default({}),
  view: monthlyReportsViewSchema.optional().default({}),
  responseType: Joi.string().valid('export').allow('').optional(),
  get: Joi.object({
    clerksList: Joi.boolean().optional(),
  }).optional().default({}),
}).unknown(false);

// Custom Reports validation schema
const customReportsFiltersSchema = Joi.object({
  county: stringArraySchema,
  agency: stringArraySchema,
  caseType: stringArraySchema,
  status: stringArraySchema,
  hearingDateFrom: dateStringSchema,
  hearingDateTo: dateStringSchema,
  dateReceivedFrom: dateStringSchema,
  dateReceivedTo: dateStringSchema,
  judge: stringArraySchema,
  judgeAssistant: stringArraySchema,
  staffAttorney: stringArraySchema,
  clerk: numberArraySchema,
  openedBy: numberArraySchema,
  closedBy: numberArraySchema,
}).optional().default({}).unknown(false);;

const customReportsDetailsViewSchema = Joi.object({
  itemName: Joi.string().required(),
  page: Joi.number().integer().min(0).optional().default(0),
  limit: Joi.number().integer().min(1).max(500).optional().default(20),
  // Sorting parameters - using frontend field names that match DataGrid columns
  sortBy: Joi.string().valid('caseId', 'caseName', 'agency', 'caseType', 'dateReceived', 'hearingDate', 'daysSinceHearing', 'county', 'location', 'judge', 'cma').optional(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').optional(),
}).optional();

const customReportsSchema = Joi.object({
  filters: customReportsFiltersSchema,
  viewType: Joi.string().valid('judges', 'casetypes').optional().default('judges'),
  detailsView: customReportsDetailsViewSchema,
  exportMode: Joi.boolean().optional().default(false),
}).min(1) // ✅ at least one field required


function validateBulkDocReports(data) {
  const { error, value } = bulkDocReportsSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'bulkDocReports');
  }
  return value;
}

function validateBulkDesignationReports(data) {
  const { error, value } = bulkDesignationReportsSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'bulkDesignationReports');
  }
  return value;
}

function validateAgencyForm1ApprovalReports(data) {
  const { error, value } = agencyForm1ApprovalReportsSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'agencyForm1ApprovalReports');
  }
  return value;
}

function validateDecisionAutomationReports(data) {
  const { error, value } = decisionAutomationReportsSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'decisionAutomationReports');
  }
  return value;
}

function validateAgingReports(data) {
  const { error, value } = agingReportsSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'agingReports');
  }
  return value;
}

// Extracted helper to keep validateMonthlyReports below the cognitive-complexity limit.
function validateMonthlyReportDates(fromDate, toDate, view1Selected) {
  const currentMonth = moment().startOf('month');

  if (fromDate.isAfter(currentMonth, 'month')) {
    throw new ValidationError('Start Date (From) cannot be a future month', 'monthlyReports');
  }
  if (toDate.isAfter(currentMonth, 'month')) {
    throw new ValidationError('End Date (To) cannot be a future month', 'monthlyReports');
  }
  if (fromDate.isAfter(toDate)) {
    throw new ValidationError('Start Date (From) should not be greater than End Date (To)', 'monthlyReports');
  }
  if (toDate.diff(fromDate, 'months', true) > 12) {
    throw new ValidationError('Please select up to 12 months at a time', 'monthlyReports');
  }

  // For clerks route: validate minimum date is Jan 2020
  if (view1Selected === 'clerks') {
    const minDate = moment('2020-01-01');
    if (fromDate.isBefore(minDate, 'month')) {
      throw new ValidationError('For Clerks route, Start Date must be January 2020 or later', 'monthlyReports');
    }
    if (toDate.isBefore(minDate, 'month')) {
      throw new ValidationError('For Clerks route, End Date must be January 2020 or later', 'monthlyReports');
    }
  }
}

function validateMonthlyReports(data) {
  const { error, value } = monthlyReportsSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'monthlyReports');
  }

  if (value.filter?.from && value.filter?.to) {
    validateMonthlyReportDates(
      moment(value.filter.from, 'MMM YYYY'),
      moment(value.filter.to, 'MMM YYYY'),
      value.view?.view1Selected,
    );
  }

  return value;
}

function validateRejectedDocuments(data) {
  const { error, value } = rejectedDocumentsSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'rejectedDocuments');
  }
  return value;
}

function validateCustomReports(data) {
  const { error, value } = customReportsSchema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError(error.details.map((err) => err.message).join(', '), 'customReports');
  }

  if (!hasAtLeastOneFilterValue(value.filters)) {
    throw new ValidationError(
      'Please select at least one filter to view the report',
      'customReports'
    );
  }

  const filters = value.filters || {};

  if (filters.hearingDateFrom && filters.hearingDateTo) {
    const fromDate = moment(filters.hearingDateFrom, 'MM-DD-YYYY');
    const toDate = moment(filters.hearingDateTo, 'MM-DD-YYYY');
    if (fromDate.isValid() && toDate.isValid() && fromDate.isAfter(toDate)) {
      throw new ValidationError('Hearing Date (From) should not be greater than Hearing Date (To)', 'customReports');
    }
  }

  if (filters.dateReceivedFrom && filters.dateReceivedTo) {
    const fromDate = moment(filters.dateReceivedFrom, 'MM-DD-YYYY');
    const toDate = moment(filters.dateReceivedTo, 'MM-DD-YYYY');
    if (fromDate.isValid() && toDate.isValid() && fromDate.isAfter(toDate)) {
      throw new ValidationError('Date Received (From) should not be greater than Date Received (To)', 'customReports');
    }
  }

  return value;
}


export {
  // Report validation functions
  validateBulkDocReports,
  validateBulkDesignationReports,
  validateAgencyForm1ApprovalReports,
  validateDecisionAutomationReports,
  validateAgingReports,
  validateMonthlyReports,
  validateRejectedDocuments,
  validateCustomReports,
  // Report validation schemas (for direct use if needed)
  bulkDocReportsSchema,
  bulkDesignationReportsSchema,
  agencyForm1ApprovalReportsSchema,
  decisionAutomationReportsSchema,
  agingReportsSchema,
  monthlyReportsSchema,
  rejectedDocumentsSchema,
  customReportsSchema,
};
