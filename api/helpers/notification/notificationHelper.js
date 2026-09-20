import { Op, fn, col, where as sequelizeWhere } from "sequelize";
import { mysqlSequelize } from "../../../connections/seqDB.js";
import {
  Notification,
  NotificationAction,
  DocketNotifications,
  Docket,
  DocumentsTable,
  CheckinCalendarTodayDate,
  TENotifications,
} from "../../models/index.js";

// Helper: Generate time difference attributes for notifications
// NOTE: alias must be the table alias used by Sequelize in the FROM clause
const timeAttributes = (alias) => [
  [
    mysqlSequelize.literal(
      `CONCAT(FLOOR(HOUR(TIMEDIFF(${alias}.created_date, NOW())) / 24), ' days ', MOD(HOUR(TIMEDIFF(${alias}.created_date, NOW())), 24), ' hours ', MINUTE(TIMEDIFF(${alias}.created_date, NOW())), ' minutes')`
    ),
    "notificationDetailTime",
  ],
  [
    mysqlSequelize.literal(
      `CASE WHEN FLOOR(HOUR(TIMEDIFF(${alias}.created_date, NOW())) / 24) >= 1 THEN CONCAT(FLOOR(HOUR(TIMEDIFF(${alias}.created_date, NOW())) / 24), ' days ') WHEN MOD(HOUR(TIMEDIFF(${alias}.created_date, NOW())), 24) >= 1 THEN CONCAT(MOD(HOUR(TIMEDIFF(${alias}.created_date, NOW())), 24), ' hours ') WHEN MINUTE(TIMEDIFF(${alias}.created_date, NOW())) >= 1 THEN CONCAT(MINUTE(TIMEDIFF(${alias}.created_date, NOW())), ' minutes') ELSE CONCAT(TIME_TO_SEC(TIMEDIFF(NOW(), ${alias}.created_date)), ' seconds') END`
    ),
    "notificationTime",
  ],
];

// Helper: Build follow date condition (reusable for both queries)
const buildFollowDateCondition = (filterCondition, userId) => ({
  [Op.or]: [
    {
      [Op.and]: [
        filterCondition,
        sequelizeWhere(col("docket_notifications.user_id"), Op.eq, col("notification_action.user_id")),
        // Base Notification model alias is "Notification" in the generated SQL
        sequelizeWhere(col("Notification.caseid"), Op.eq, col("docket_notifications.caseid")),
        { "$docket_notifications.user_id$": userId },
        { "$notification_action.user_id$": userId },
        { "$docket_notifications.users_following$": "1" },
        sequelizeWhere(
          fn("DATE", col("Notification.created_date")),
          Op.gte,
          fn("DATE", col("docket_notifications.updated_date"))
        ),
      ],
    },
    {
      [Op.and]: [
        filterCondition,
        sequelizeWhere(col("docket_notifications.user_id"), Op.eq, col("notification_action.user_id")),
        sequelizeWhere(col("Notification.caseid"), Op.eq, col("docket_notifications.caseid")),
        { "$docket_notifications.user_id$": userId },
        { "$notification_action.user_id$": userId },
        { "$docket_notifications.users_following$": "0" },
        sequelizeWhere(
          fn("DATE", col("Notification.created_date")),
          Op.lte,
          fn("DATE", col("docket_notifications.updated_date"))
        ),
      ],
    },
  ],
});


/*
 * Created by  : Snehal Narkar
 * Date        : 11-02-2026
 * Description : Service function used to fetch system notifications based on notification type
 * Parameters  :
 *    - userId (Number)            : User ID
 *    - notificationLimit (String) : Limit for notifications
 *    - notificationType (String)  : Type of notification (unread / viewed / starred / all)
 * Response    : Returns a Promise<Object> containing:
 *        - returnDate (Array)         : List of notifications
 *        - currentNotiCount (Number)  : Current notification count
 *        - resultDataCount (Number)   : Total result count
 */
export const getSystemNotifications = async (
  userId,
  notificationLimit,
  notificationType
) => {
  const normalizedLimit = String(notificationLimit ?? "").trim();
  const limit = normalizedLimit !== "" && Number.isInteger(Number(normalizedLimit))
    ? Number.parseInt(normalizedLimit, 10)
    : undefined;

  // Build filter condition based on notification type
  let filterCondition;
  if (notificationType === "unread") {
    filterCondition = { "$notification_action.is_viewed$": "0" };
  } else if (notificationType === "viewed") {
    filterCondition = { "$notification_action.is_viewed$": "1" };
  } else if (notificationType === "starred") {
    filterCondition = { "$notification_action.is_starred$": "1" };
  } else {
    filterCondition = { [Op.or]: [{ "$notification_action.is_viewed$": "0" }, { "$notification_action.is_viewed$": "1" }] };
  }

  const followDateCondition = buildFollowDateCondition(filterCondition, userId);

  const rows = await Notification.findAll({
    subQuery: false,
    where: followDateCondition,
    attributes: {
      // Base model alias is "Notification" (model name), not table name "notifications"
      include: [...timeAttributes("Notification")],
    },
    include: [
      {
        model: NotificationAction,
        as: "notification_action",
        required: true,
        attributes: ["isStarred", "isViewed", "isEmailSent"],
      },
      {
        model: DocketNotifications,
        as: "docket_notifications",
        required: true,
        attributes: ["usersFollowing", "updatedDate"],
      },
      {
        model: Docket,
        as: "docket",
        required: false,
        attributes: ["caseName", "caseType"],
      },
      {
        model: CheckinCalendarTodayDate,
        as: "checkin_calendar_today_date",
        required: false,
        attributes: [
          "caseTypeId",
          "circuitId",
          "docketCaseId",
          "id"
        ],
        where: sequelizeWhere(
          col("checkin_calendar_today_date.id"),
          Op.eq,
          mysqlSequelize.literal(`(
            SELECT c2.id
            FROM checkin_calendar_today_date c2
            WHERE c2.docket_caseid = checkin_calendar_today_date.docket_caseid
            ORDER BY c2.id DESC
            LIMIT 1
          )`)
        ),
      },
      {
        model: DocumentsTable,
        as: "documents_table",
        required: false,
        attributes: ["documentNameInAwsBucket"],
      },
    ],
    order: [["notificationId", "DESC"]],
    limit,
    distinct: true,
  });

  const returnDate = rows.map((row) => {
    const r = row.toJSON();

    // Format date as "YYYY-MM-DD HH:mm:ss" to match PHP format
    let formattedDate = r.createdDate;
    if (r.createdDate instanceof Date) {
      formattedDate = r.createdDate.toISOString().slice(0, 19).replace('T', ' ');
    } else if (typeof r.createdDate === 'string') {
      formattedDate = r.createdDate.replace('T', ' ').replace(/\.\d{3}Z$/, '');
    }

    return {
      notificationId: r.notificationId,
      notificationType: r.notificationType,
      actionTrigger: r.actionTrigger ?? "",
      caseId: r.caseId ?? "0",
      caseName: r.docket?.caseName ?? "",
      caseType: r.docket?.caseType ?? "",
      casetypeId: r.checkin_calendar_today_date?.caseTypeId ?? "0",
      circuitId: r.checkin_calendar_today_date?.circuitId ?? "0",
      createdBy: r.createdBy ?? "",
      createdDate: formattedDate,
      docId: r.docId ?? "0",
      documentNameInAwsBucket: r.documents_table?.documentNameInAwsBucket ?? null,
      isEmailSent: r.notification_action?.isEmailSent ?? "0",
      isStarred: r.notification_action?.isStarred ?? "0",
      isTeNotification: "0",
      isViewed: r.notification_action?.isViewed ?? "0",
      notificationDetailTime: r.notificationDetailTime,
      notificationTime: r.notificationTime,
      notificationMsg: r.notificationMsg,
      timeEntryId: "0",
      usersFollowing: r.docket_notifications?.usersFollowing ?? "0",
    };
  });

  // Count for current notification type and unread notifications
  const countInclude = [
    { model: NotificationAction, as: "notification_action", required: true },
    { model: DocketNotifications, as: "docket_notifications", required: true },
  ];

  const [currentNotiCount, resultDataCount] = await Promise.all([
    Notification.count({ where: followDateCondition, include: countInclude, distinct: true }),
    Notification.count({ where: buildFollowDateCondition({ "$notification_action.is_viewed$": "0" }, userId), include: countInclude, distinct: true }),
  ]);

  return { returnDate, currentNotiCount, resultDataCount };
};

/*
 * Created by  : Snehal Narkar
 * Date        : 11-02-2026
 * Description : Service function used to fetch time entry (TE) notifications based on notification type
 *               NOTE: PHP doesn't support "starred" filter for TE notifications
 * Parameters  :
 *    - userId (Number)            : User ID
 *    - notificationLimit (String) : Limit for notifications
 *    - notificationType (String)  : Type of notification (unread / viewed / all / te)
 * Response    : Returns a Promise<Object> containing:
 *        - returnDate (Array)         : List of notifications
 *        - currentNotiCount (Number)  : Current notification count
 *        - TEUnReadNotiCount (Number) : Total unread TE notifications count
 */
export const getTENotifications = async (
  userId,
  notificationLimit,
  notificationType
) => {
  const normalizedLimit = String(notificationLimit ?? "").trim();
  const limit = normalizedLimit !== "" && Number.isInteger(Number(normalizedLimit))
    ? Number.parseInt(normalizedLimit, 10)
    : undefined;

  const whereCondition = { userId };

  // Build isViewed condition based on notification type
  let isViewedCondition;
  if (notificationType === "unread") {
    isViewedCondition = 0;
  } else if (notificationType === "viewed") {
    isViewedCondition = 1;
  } else if (notificationType === "all" || notificationType === "te") {
    isViewedCondition = { [Op.or]: [0, 1] };
  } else {
    isViewedCondition = 0;
  }

  whereCondition.isViewed = isViewedCondition;

  const rows = await TENotifications.findAll({
    where: whereCondition,
    attributes: {
      include: [...timeAttributes("te_notifications")],
    },
    order: [["id", "DESC"]],
    limit,
    raw: true,
    subQuery: false,
  });

  const returnDate = rows.map((r) => {
    let formattedDate = r.createdDate;
    if (r.createdDate instanceof Date) {
      formattedDate = r.createdDate.toISOString().slice(0, 19).replace('T', ' ');
    } else if (typeof r.createdDate === 'string') {
      formattedDate = r.createdDate.replace('T', ' ').replace(/\.\d{3}Z$/, '');
    }

    return {
      notificationId: r.id,
      notificationType: r.notificationType,
      actionTrigger: "",
      caseId: "0",
      caseName: "",
      caseType: "",
      casetypeId: "0",
      circuitId: "0",
      createdBy: r.createdBy,
      createdDate: formattedDate,
      docId: "0",
      documentNameInAwsBucket: null,
      isEmailSent: "0",
      isStarred: r.isStarred ?? "0",
      isTeNotification: "1",
      isViewed: r.isViewed ?? "0",
      notificationDetailTime: r.notificationDetailTime,
      notificationTime: r.notificationTime,
      notificationMsg: r.notificationMsg,
      timeEntryId: r.timeEntryId,
      usersFollowing: "0",
    };
  });

	  const [currentNotiCount, TEUnReadNotiCount] = await Promise.all([
	    TENotifications.count({ where: whereCondition }),
	    TENotifications.count({ where: { userId, isViewed: 0 } }),
	  ]);
	
	  return { returnDate, currentNotiCount, TEUnReadNotiCount };
};
