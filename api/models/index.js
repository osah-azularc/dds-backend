import Docket from './Docket.js';
import BulkDocReport from './reports/BulkDocReport.js';
import JudgeAssistantClerk from './JudgeAssistantClerk.js';
import DecisionAutomationReport from './reports/DecisionAutomationReport.js';
import Agency from './admin/agencyModel.js';
import Casetypes from './Casetypes.js';
import Form1Docket from './Form1Docket.js';
import CasetypeRestriction from './CasetypeRestriction.js';
import Holidays from './Holidays.js';
import DocketOpenCloseDetails from './DocketOpenCloseDetails.js';
import EcourtExternalDocuments from './EcourtExternalDocuments.js';
import Form1Documents from './Form1Documents.js';
import PublicAccessUser from './PublicAccessUser.js';
import User from './User.js';
import AgencyPlatform from './admin/agencyPlatformModel.js';
import ExternalDocuments from "./ExternalDocuments.js";
import EfilingHistory from "./EfilingHistory.js";
import PeopleDetails from "./PeopleDetails.js";
import AgencyCaseworkerByCase from "./AgencyCaseworkerByCase.js";
import AttorneyByCase from "./AttorneyByCase.js";
import MinorDetails from "./MinorDetails.js";
import DocketDisposition from "./DocketDisposition.js";
import Notification from "./Notification.js";
import NotificationAction from "./NotificationAction.js";
import DocketNotifications from "./DocketNotifications.js";
import DocumentsTable from "./DocumentsTable.js";
import DDSHistory from './DDSHistory.js';
import CheckinCalendarTodayDate from "./CheckinCalendarTodayDate.js";
import TENotifications from "./TeNotifications.js";
import AttachmentPaths from "./AttachmentPathsModel.js";
import NotificationCaseTypes from './NotificationCaseTypes.js';
import CourtLocations from './CourtLocations.js';
import HearingTime from './calendar/HearingTimeModel.js';
import V2_5_Calendar_Hearing_Info from './admin/v2_5_calendar_hearing_infoModel.js';
import CasteTypeGroups from './admin/casteTypeGroupsModel.js';
import V2_5_Calendar from './admin/v2_5_calendarModel.js';
import V2_5_Circuit from './admin/v2_5_circuitModel.js';
import BulkEmailTemplate from './BulkEmailTemplate.js';
import BulkEmailMapping from './BulkEmailMapping.js';
import CaseTypeDocuments from './CaseTypeDocuments.js';
import DocumentsAutomation from './DocumentsAutomation.js';
import CaseTypeStyling from './admin/caseTypeStylingModel.js';
import caseTypes from './admin/caseTypesModel.js';
import Invoice from './timeexpense/invoicing/Invoice.js';
import BillableAgency from './timeexpense/invoicing/BillableAgency.js';
import BulkInvoice from './timeexpense/invoicing/BulkInvoice.js';
import InvoiceItem from './timeexpense/invoicing/InvoiceItem.js';
import InvoiceTemplate from './timeexpense/invoicing/InvoiceTemplate.js';
import InvLog from './timeexpense/invoicing/InvLog.js';
import InvoicePartialPayment from './timeexpense/invoicing/InvoicePartialPayment.js';
import InvoiceWrittenOff from './timeexpense/invoicing/InvoiceWrittenOff.js';
import TimeEntry from './timeexpense/timeentry/TimeEntry.js';
import ExpenseEntry from './timeexpense/timeentry/ExpenseEntry.js';
import TimeEntryTask from './timeexpense/timeentry/TimeEntryTask.js';
import TimeEntryExpenseType from './timeexpense/timeentry/TimeEntryExpenseType.js';
import TimeEntryPeriod from './timeexpense/timeentry/TimeEntryPeriod.js';
import TimeEntryPeriodStatus from './timeexpense/timeentry/TimeEntryPeriodStatus.js';
import TimeEntryActivityLog from './timeexpense/timeentry/TimeEntryActivityLog.js';

// Import notification associations setup function
import { setupNotificationAssociations } from "./associations/notificationAssociations.js";

Docket.hasMany(BulkDocReport, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "bulkdoc"
});

BulkDocReport.belongsTo(Docket, {
  foreignKey: "caseid",
  targetKey: "caseId",
  as: "docket"
});

BulkDocReport.belongsTo(JudgeAssistantClerk, {
  foreignKey: "userid",
  targetKey: "userId",
  as: "user"
});

DecisionAutomationReport.belongsTo(Agency, {
  foreignKey: "agencyid",
  targetKey: "agencyId",
  as: "agn"
});

DecisionAutomationReport.belongsTo(Casetypes, {
  foreignKey: "casetypeid",
  targetKey: "caseTypeId",
  as: "casetype"
});

Docket.hasMany(Form1Docket, {
  foreignKey: "ecourt_caseid",
  sourceKey: "caseId",
  as: "form1docket"
});

Form1Docket.belongsTo(Docket, {
  foreignKey: "ecourt_caseid",
  targetKey: "caseId",
  as: "docket"
});

// Docket to JudgeAssistantClerk association for form1 approval report
// Note: This uses a custom join condition with SUBSTRING_INDEX
Docket.belongsTo(JudgeAssistantClerk, {
  foreignKey: "docketclerk",
  targetKey: "email",
  as: "clerkForm1"
});

// Docket to JudgeAssistantClerk association for monthly reports (docketclerk)
// Note: This uses a custom join condition with LEFT(email, LOCATE('@', email) - 1)
Docket.belongsTo(JudgeAssistantClerk, {
  foreignKey: "docketclerk",
  targetKey: "email",
  as: "jac"
});

// Docket to DocketOpenCloseDetails association for monthly reports
Docket.hasMany(DocketOpenCloseDetails, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "doc_count"
});

DocketOpenCloseDetails.belongsTo(Docket, {
  foreignKey: "caseid",
  targetKey: "caseId",
  as: "docket"
});

// JudgeAssistantClerk to DocketOpenCloseDetails association (for opened/closed by filters)
JudgeAssistantClerk.hasMany(DocketOpenCloseDetails, {
  foreignKey: "user_id",
  sourceKey: "userId",
  as: "docketOpenCloseDetails"
});

DocketOpenCloseDetails.belongsTo(JudgeAssistantClerk, {
  foreignKey: "user_id",
  targetKey: "userId",
  as: "user"
});

// ========================================
// REJECTED DOCUMENTS ASSOCIATIONS
// ========================================

// EcourtExternalDocuments to Docket association
EcourtExternalDocuments.belongsTo(Docket, {
  foreignKey: "caseid",
  targetKey: "caseId",
  as: "docket"
});

// EcourtExternalDocuments to JudgeAssistantClerk association (created_by)
EcourtExternalDocuments.belongsTo(JudgeAssistantClerk, {
  foreignKey: "created_by",
  targetKey: "userId",
  as: "clerk"
});

// EcourtExternalDocuments to PublicAccessUser association (eportal_created_by)
EcourtExternalDocuments.belongsTo(PublicAccessUser, {
  foreignKey: "eportal_created_by",
  targetKey: "userId",
  as: "ecourtUser"
});

// Form1Documents to Form1Docket association
Form1Documents.belongsTo(Form1Docket, {
  foreignKey: "form1_id",
  targetKey: "form1Id",
  as: "form1Docket"
});

// Form1Documents to User association (created_by)
Form1Documents.belongsTo(User, {
  foreignKey: "created_by",
  targetKey: "userId",
  as: "clerk"
});

// Form1Docket to AgencyPlatform association
Form1Docket.belongsTo(AgencyPlatform, {
  foreignKey: "agency_platform_id",
  targetKey: "id",
  as: "platform"
});

// EfilingHistory belongs to JudgeAssistantClerk (created_by)
EfilingHistory.belongsTo(JudgeAssistantClerk, {
  foreignKey: "created_by",
  targetKey: "userId",
  as: "JudgeAssistantClerk",
});

JudgeAssistantClerk.hasMany(EfilingHistory, {
  foreignKey: "created_by",
  sourceKey: "userId",
  as: "EfilingHistory",
});

// Docket has many PeopleDetails (for petitioner and respondent)
Docket.hasMany(PeopleDetails, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "PetitionerDetails",
  scope: {
    typeofcontact: "Petitioner",
  },
});

Docket.hasMany(PeopleDetails, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "RespondentDetails",
  scope: {
    typeofcontact: "Respondent",
  },
});
// Dashboard search associations - Docket with detail tables
// These associations are used for complex search with INNER JOIN
Docket.hasMany(PeopleDetails, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "peopledetails",
});

PeopleDetails.belongsTo(Docket, {
  foreignKey: "caseid",
  targetKey: "caseId",
  as: "Docket",
});

// E-filing Associations : START
// ExternalDocuments belongs to PublicAccessUser (created_by)
ExternalDocuments.belongsTo(PublicAccessUser, {
  foreignKey: "created_by",
  as: "PublicAccessUser",
});

PublicAccessUser.hasMany(ExternalDocuments, {
  foreignKey: "created_by",
  as: "ExternalDocuments",
});

// ExternalDocuments belongs to Docket (caseid)
ExternalDocuments.belongsTo(Docket, {
  foreignKey: "caseid",
  targetKey: "caseId",
  as: "Docket",
});

Docket.hasMany(ExternalDocuments, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "ExternalDocuments",
});

Docket.hasMany(AgencyCaseworkerByCase, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "agencycaseworkerbycase",
});

AgencyCaseworkerByCase.belongsTo(Docket, {
  foreignKey: "caseid",
  targetKey: "caseId",
  as: "docket",
});

Docket.hasMany(AttorneyByCase, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "attorneybycase",
});

AttorneyByCase.belongsTo(Docket, {
  foreignKey: "caseid",
  targetKey: "caseId",
  as: "docket",
});

Docket.hasMany(MinorDetails, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "minordetails",
});

MinorDetails.belongsTo(Docket, {
  foreignKey: "caseid",
  targetKey: "caseId",
  as: "docket",
});

Docket.hasMany(DocketDisposition, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "docketdisposition",
});

DocketDisposition.belongsTo(Docket, {
  foreignKey: "caseid",
  targetKey: "caseId",
  as: "docket",
});

Docket.hasMany(DocumentsTable, {
  foreignKey: "caseid",
  sourceKey: "caseId",
  as: "documents",
});

DocumentsTable.belongsTo(Docket, {
  foreignKey: "caseid",
  targetKey: "caseId",
  as: "docket",
});

// Docket to NotificationCaseTypes association
Docket.belongsTo(NotificationCaseTypes, {
  foreignKey: 'casetype',
  targetKey: 'caseType',
  as: 'notificationCaseType',
  constraints: false,
});

NotificationCaseTypes.hasMany(Docket, {
  foreignKey: 'casetype',
  sourceKey: 'caseType',
  as: 'dockets',
  constraints: false,
});

// Docket to PeopleDetails association for Petitioner
Docket.hasMany(PeopleDetails, {
  foreignKey: 'caseid',
  sourceKey: 'caseId',
  as: 'petitioner',
  scope: {
    typeofcontact: 'Petitioner',
  },
});

// Docket to PeopleDetails association for Respondent
Docket.hasMany(PeopleDetails, {
  foreignKey: 'caseid',
  sourceKey: 'caseId',
  as: 'respondent',
  scope: {
    typeofcontact: 'Respondent',
  },
});

// Docket to PeopleDetails association for Petitioner (alternative alias used in caseHelper)
Docket.hasMany(PeopleDetails, {
  foreignKey: 'caseid',
  sourceKey: 'caseId',
  as: 'petitioner_data',
  scope: {
    typeofcontact: 'Petitioner',
  },
});

// Docket to PeopleDetails association for Respondent (alternative alias used in caseHelper)
Docket.hasMany(PeopleDetails, {
  foreignKey: 'caseid',
  sourceKey: 'caseId',
  as: 'respondent_data',
  scope: {
    typeofcontact: 'Respondent',
  },
});

// Setup notification associations AFTER all imports
setupNotificationAssociations();

// Docket to Agency association
Docket.belongsTo(Agency, {
  foreignKey: 'refAgency',
  targetKey: 'agencyCode',
  as: 'agency',
  constraints: false,
});

Agency.hasMany(Docket, {
  foreignKey: 'refAgency',
  sourceKey: 'agencyCode',
  as: 'dockets',
  constraints: false,
});

// Docket to CourtLocations association
Docket.belongsTo(CourtLocations, {
  foreignKey: 'hearingsite',
  targetKey: 'locationName',
  as: 'courtLocation',
  constraints: false,
});

CourtLocations.hasMany(Docket, {
  foreignKey: 'hearingsite',
  sourceKey: 'locationName',
  as: 'dockets',
  constraints: false,
});

// Docket to HearingTime association
Docket.belongsTo(HearingTime, {
  foreignKey: 'hearingtime',
  targetKey: 'hearingTimeStored',
  as: 'hearingTimeDetails',
  constraints: false,
});

HearingTime.hasMany(Docket, {
  foreignKey: 'hearingtime',
  sourceKey: 'hearingTimeStored',
  as: 'dockets',
  constraints: false,
});

// Docket to JudgeAssistantClerk association for judge
Docket.belongsTo(JudgeAssistantClerk, {
  foreignKey: 'judge',
  targetKey: 'judgeAssistantClerkConcat',
  as: 'judgeClerk',
  constraints: false,
});

// Docket to JudgeAssistantClerk association for CMA
Docket.belongsTo(JudgeAssistantClerk, {
  foreignKey: 'judgeAssistant',
  targetKey: 'judgeAssistantClerkConcat',
  as: 'cmaClerk',
  constraints: false,
});

// V2_5_Calendar_Hearing_Info to JudgeAssistantClerk (judge), CMA, HearingTime, and CourtLocations
// are now defined in api/models/associations/calendarAssociations.js

// CourtLocations to V2_5_Calendar_Hearing_Info (reverse)
CourtLocations.hasMany(V2_5_Calendar_Hearing_Info, {
  foreignKey: 'court_location_id',
  sourceKey: 'courtLocationId',
  as: 'calendarHearingInfo',
  constraints: false,
});

// V2_5_Calendar_Hearing_Info <-> V2_5_Calendar ('calendar' / 'hearingInfos') are now
// defined in api/models/associations/calendarAssociations.js

// V2_5_Calendar to CasteTypeGroups
V2_5_Calendar.belongsTo(CasteTypeGroups, {
  foreignKey: 'casetype_group_id',
  targetKey: 'id',
  as: 'casetypegroup',
  constraints: false,
});

CasteTypeGroups.hasMany(V2_5_Calendar, {
  foreignKey: 'casetype_group_id',
  sourceKey: 'id',
  as: 'calendars',
  constraints: false,
});

// V2_5_Calendar <-> V2_5_Circuit ('circuit') is now defined in
// api/models/associations/calendarAssociations.js

// CaseTypeDocuments has many DocumentsAutomation
// Used for fetching NOH, Continuance, and Decision templates for Quick Actions
CaseTypeDocuments.hasMany(DocumentsAutomation, {
  foreignKey: 'document_id',
  sourceKey: 'id',
  as: 'documentAutomations',
});

DocumentsAutomation.belongsTo(CaseTypeDocuments, {
  foreignKey: 'document_id',
  targetKey: 'id',
  as: 'caseTypeDocument',
});

// CaseTypeStyling to caseTypes association
CaseTypeStyling.belongsTo(caseTypes, {
  foreignKey: 'caseTypeId',
  targetKey: 'Casetypeid',
  as: 'caseType',
  constraints: false,
});

caseTypes.hasMany(CaseTypeStyling, {
  foreignKey: 'caseTypeId',
  sourceKey: 'Casetypeid',
  as: 'styling',
  constraints: false,
});

// CaseTypeDocuments to DocumentsAutomation association (for NOH automation)
CaseTypeDocuments.hasMany(DocumentsAutomation, {
  foreignKey: 'document_id',
  sourceKey: 'id',
  as: 'automation',
  constraints: false,
});

// ========================================
// INVOICING / BILLABLE ACTIVITY ASSOCIATIONS
// ========================================

// Invoice to BillableAgency - used by invoiceController.js::getInvoiceList to include the
// agency code (mirrors legacy's `tebr.agency_code` join).
Invoice.belongsTo(BillableAgency, {
  foreignKey: 'agency',
  targetKey: 'id',
  as: 'billableAgency',
});

// TimeEntry associations - used by billableActivityHelpers.js. constraints:false throughout:
// these tables are externally managed (no Sequelize sync/migrations against them), and
// TimeEntry.task specifically is a text column joined against an integer PK via implicit
// coercion (same as legacy's raw SQL) - not a real FK relationship.
TimeEntry.belongsTo(TimeEntryTask, {
  foreignKey: 'task',
  targetKey: 'id',
  as: 'taskDetail',
  constraints: false,
});

TimeEntry.belongsTo(JudgeAssistantClerk, {
  foreignKey: 'userId',
  targetKey: 'userId',
  as: 'employee',
  constraints: false,
});

// ExpenseEntry associations - same rationale as TimeEntry's above.
ExpenseEntry.belongsTo(TimeEntryExpenseType, {
  foreignKey: 'expenseTypeId',
  targetKey: 'id',
  as: 'expenseTypeDetail',
  constraints: false,
});

ExpenseEntry.belongsTo(JudgeAssistantClerk, {
  foreignKey: 'userId',
  targetKey: 'userId',
  as: 'employee',
  constraints: false,
});

// ========================================
// TIME ENTRY / REVIEW & POST ASSOCIATIONS
// ========================================

// TimeEntryPeriod to TimeEntryPeriodStatus - real FK (see db/time_entry_periods_schema.sql).
TimeEntryPeriod.belongsTo(TimeEntryPeriodStatus, {
  foreignKey: 'fkPeriodStatusId',
  targetKey: 'id',
  as: 'status',
});

// TimeEntryActivityLog to TimeEntry - the audit trail for one entry (day form's activity
// panel, Review & Post has no equivalent panel). constraints:false to match TimeEntry's own
// externally-managed-table treatment above.
TimeEntryActivityLog.belongsTo(TimeEntry, {
  foreignKey: 'timeEntryId',
  targetKey: 'id',
  as: 'timeEntry',
  constraints: false,
});

// TimeEntryActivityLog to JudgeAssistantClerk - the acting user's name/initials shown per
// activity row (mirrors legacy's getTimeEntryActivityByIdAction join).
TimeEntryActivityLog.belongsTo(JudgeAssistantClerk, {
  foreignKey: 'createdBy',
  targetKey: 'userId',
  as: 'actor',
  constraints: false,
});

// ExpenseEntry to CourtLocations - used by expenseEntryController.js::getExpenseEntryList to
// include the location name (mirrors legacy's `LEFT JOIN courtlocations ON
// courtlocations.courtlocationid = expense_entry.location`).
ExpenseEntry.belongsTo(CourtLocations, {
  foreignKey: 'location',
  targetKey: 'courtLocationId',
  as: 'courtLocation',
  constraints: false,
});

// BulkInvoice to JudgeAssistantClerk - used by bulkInvoiceController.js::getBulkInvoiceList to
// include the creator's name (mirrors legacy's `jac.user_id = bk.created_by` join).
BulkInvoice.belongsTo(JudgeAssistantClerk, {
  foreignKey: 'createdBy',
  targetKey: 'userId',
  as: 'creator',
  constraints: false,
});

// Invoice to InvoiceItem - one invoice has many line items (saveInvoiceAction inserts one
// invoice_items row per item; used by view/edit invoice to load them back).
Invoice.hasMany(InvoiceItem, {
  foreignKey: 'invId',
  sourceKey: 'id',
  as: 'items',
});

// View Invoice's "View Invoice Details" CSV export - used by
// invoiceDetailController.js::exportInvoiceItems (mirrors legacy's
// OsahDbReporting::invoiceItems's `invoice_items.created_by = user.user_id` join).
InvoiceItem.belongsTo(JudgeAssistantClerk, {
  foreignKey: 'createdBy',
  targetKey: 'userId',
  as: 'creator',
  constraints: false,
});

// View Invoice's Payment History panel and Activity Log - used by
// invoiceDetailController.js::getInvoicePaymentHistory/getInvoiceActivityLogs.
Invoice.hasMany(InvoicePartialPayment, {
  foreignKey: 'invId',
  sourceKey: 'id',
  as: 'partialPayments',
});

InvoicePartialPayment.belongsTo(JudgeAssistantClerk, {
  foreignKey: 'createdBy',
  targetKey: 'userId',
  as: 'creator',
  constraints: false,
});

Invoice.hasMany(InvLog, {
  foreignKey: 'invId',
  sourceKey: 'id',
  as: 'logs',
});

InvLog.belongsTo(JudgeAssistantClerk, {
  foreignKey: 'createdBy',
  targetKey: 'userId',
  as: 'creator',
  constraints: false,
});

export {
  Docket,
  BulkDocReport,
  JudgeAssistantClerk,
  DecisionAutomationReport,
  Agency,
  Casetypes,
  Form1Docket,
  CasetypeRestriction,
  Holidays,
  DocketOpenCloseDetails,
  EcourtExternalDocuments,
  Form1Documents,
  PublicAccessUser,
  User,
  AgencyPlatform,
  PeopleDetails,
  AgencyCaseworkerByCase,
  AttorneyByCase,
  MinorDetails,
  DocketDisposition,
  Notification,
  NotificationAction,
  DocketNotifications,
  DocumentsTable,
  DDSHistory,
  AttachmentPaths,
  CheckinCalendarTodayDate,
  TENotifications,
  NotificationCaseTypes,
  CourtLocations,
  HearingTime,
  V2_5_Calendar_Hearing_Info,
  CasteTypeGroups,
  V2_5_Calendar,
  V2_5_Circuit,
  BulkEmailTemplate,
  BulkEmailMapping,
  CaseTypeDocuments,
  DocumentsAutomation,
  CaseTypeStyling,
  caseTypes,
  Invoice,
  BillableAgency,
  BulkInvoice,
  InvoiceItem,
  InvoiceTemplate,
  InvLog,
  InvoicePartialPayment,
  InvoiceWrittenOff,
  TimeEntry,
  ExpenseEntry,
  TimeEntryTask,
  TimeEntryExpenseType,
  TimeEntryPeriod,
  TimeEntryPeriodStatus,
  TimeEntryActivityLog,
};

