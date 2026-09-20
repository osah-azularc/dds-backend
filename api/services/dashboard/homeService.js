import { Op, literal, fn, col } from 'sequelize';
import { mysqlSequelize } from '../../../connections/seqDB.js';
import Docket from '../../models/Docket.js';
import DocumentsTable from '../../models/DocumentsTable.js';
import JudgeAssistantClerk from '../../models/JudgeAssistantClerk.js';
import NotificationCaseTypes from '../../models/NotificationCaseTypes.js';
import PeopleDetails from '../../models/PeopleDetails.js';
import homeExportService from './homeExportService.js';
import { getCaseIdsWithDecision } from '../../helpers/dashboardQueryBuilder.js';
import CourtLocations from '../../models/CourtLocations.js';
import HearingTime from '../../models/calendar/HearingTimeModel.js';
import V2_5_Calendar_Hearing_Info from '../../models/admin/v2_5_calendar_hearing_infoModel.js';
import CasteTypeGroups from '../../models/admin/casteTypeGroupsModel.js';
import V2_5_Calendar from '../../models/admin/v2_5_calendarModel.js';
import { logger } from "../../../config/winstonLogger.js";

class HomeService {
  
  /**
   * Get user information by userId
   * @param {number} userId - User ID
   * @returns {Promise<Object>} User information
   */
  async getUserInfo(userId) {
    return await JudgeAssistantClerk.findOne({
      where: { userId },
      attributes: ['firstName', 'lastName', 'user_type'],
      raw: true,
    });
  }

  /**
   * Get Dockets Received (without NOH documents)
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Dockets received data
   */
  async getDocketsReceived(userId) {
    const user = await this.getUserInfo(userId);
    const username = `${user.lastName} ${user.firstName}`;

    const whereConditions = {
      telvOFive: '1',
      judgeAssistant: username,
      status: {
        [Op.notIn]: ['closed', 'stayed', 'Awaiting Closure', 'Reconsideration'],
      },
      caseId: {
        [Op.notIn]: literal(`(
          SELECT DISTINCT caseid 
          FROM ${DocumentsTable.tableName}
          WHERE DocumentType IN ('NOH', 'B-NOH', 'NOH-Motion', 'T-NOH', 'Notice Of Hearing')
        )`)
      },
    };

    const [dockets, totalCount] = await Promise.all([
      Docket.findAll({
        where: whereConditions,
        attributes: [
          ['caseid', 'caseId'],
          [mysqlSequelize.fn('IF',
            literal('casename IS NULL OR casename = "" OR casename = "(NULL)" OR TRIM(casename) = ","'),
            'No party Added',
            mysqlSequelize.col('casename')
          ), 'caseName'],
          ['casetype', 'caseType'],
          [mysqlSequelize.fn('DATE_FORMAT', mysqlSequelize.col('datereceivedbyOSAH'), '%m-%d-%Y'), 'dateReceivedByOSAH'],
        ],
        limit: 4,
        raw: true,
      }),
      Docket.count({ where: whereConditions }),
    ]);

    return {
      success: true,
      message: 'Dockets received retrieved successfully',
      count: totalCount,
      data: dockets,
    };
  }

  /**
   * Get Open Cases with Decision Documents
   * @param {number} userId - User ID
   * @param {boolean} seeAll - Whether to fetch all records or limit to 4
   * @returns {Promise<Object>} Open cases with decision data
   */
  async getOpenCasesWithDecision(userId, seeAll = false) {
    const user = await this.getUserInfo(userId);
    const username = `${user.lastName} ${user.firstName}`;

    const caseIdsWithDecision = await getCaseIdsWithDecision();

    if (caseIdsWithDecision.length === 0) {
      return {
        success: true,
        message: 'No open cases with decision found',
        count: 0,
        data: [],
      };
    }

    const whereConditions = {
      telvOFive: '1',
      judgeAssistant: username,
      status: {
        [Op.notIn]: ['closed', 'stayed', 'Awaiting Closure', 'Reconsideration'],
      },
      caseId: {
        [Op.in]: caseIdsWithDecision,
      },
    };

    const queryOptions = {
      attributes: [
        'caseId',
        [mysqlSequelize.fn('DATE_FORMAT', mysqlSequelize.col('hearingdate'), '%m-%d-%Y'), 'hearingDate'],
        [mysqlSequelize.fn('IF',
          literal('casename IS NULL OR casename = "" OR casename = "(NULL)" OR TRIM(casename) = ","'),
          'No party Added',
          mysqlSequelize.col('casename')
        ), 'caseName'],
        'judge',
      ],
      where: whereConditions,
    };

    if (!seeAll) {
      queryOptions.limit = 4;
    }

    const [cases, totalCount] = await Promise.all([
      Docket.findAll(queryOptions),
      Docket.count({ where: whereConditions }),
    ]);

    return {
      success: true,
      message: 'Open cases with decision retrieved successfully',
      count: totalCount,
      data: cases,
    };
  }

  /**
   * Get Upcoming Calendars
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Upcoming calendars data
   */
  async getUpcomingCalendars(userId) {
    const user = await this.getUserInfo(userId);
    const { user_type, firstName, lastName } = user;

    const userName = `${lastName} ${firstName}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const whereConditions = {
      hearingdate: { [Op.gte]: today },
      telvOFive: '1',
      status: { [Op.ne]: 'Closed' },
    };

    if (user_type === 'judge') {
      whereConditions.judge = userName;
    } else if (user_type === 'cma') {
      whereConditions.judgeAssistant = userName;
    }

    // Complete model-based query with all associations
    const calendars = await Docket.findAll({
      attributes: [
        'hearingdate',
        [fn('COUNT', col('Docket.hearingdate')), 'cnt'],
        [fn('DATE_FORMAT', col('Docket.hearingdate'), '%m-%d-%Y'), 'hearingdateDisplay'],
        'judge',
        'hearingtime',
        [fn('TIME_FORMAT', col('Docket.hearingtime'), '%h:%i %p'), 'hearingtimeDisplay'],
        [fn('GROUP_CONCAT', fn('DISTINCT', col('Docket.hearingsite'))), 'locations'],
        [fn('GROUP_CONCAT', fn('DISTINCT', col('courtLocation->calendarHearingInfo->calendar->casetypegroup.casetypegroup'))), 'casetypegroup'],
      ],
      include: [
        {
          model: JudgeAssistantClerk,
          as: 'judgeClerk',
          required: true,
          attributes: [],
        },
        {
          model: JudgeAssistantClerk,
          as: 'cmaClerk',
          required: true,
          attributes: [],
        },
        {
          model: HearingTime,
          as: 'hearingTimeDetails',
          required: true,
          attributes: [],
        },
        {
          model: CourtLocations,
          as: 'courtLocation',
          required: true,
          attributes: [],
          include: [
            {
              model: V2_5_Calendar_Hearing_Info,
              as: 'calendarHearingInfo',
              required: false,
              attributes: [],
              on: literal(`
                \`courtLocation->calendarHearingInfo\`.judge_id = \`judgeClerk\`.user_id
                AND \`courtLocation->calendarHearingInfo\`.cma_id = \`cmaClerk\`.user_id
                AND \`courtLocation->calendarHearingInfo\`.time_id = \`hearingTimeDetails\`.timeid
                AND \`courtLocation->calendarHearingInfo\`.hearing_date = \`Docket\`.hearingdate
              `),
              include: [
                {
                  model: V2_5_Calendar,
                  as: 'calendar',
                  required: false,
                  attributes: [],
                  include: [
                    {
                      model: CasteTypeGroups,
                      as: 'casetypegroup',
                      required: false,
                      attributes: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      where: whereConditions,
      group: ['Docket.hearingdate', 'Docket.judge', 'Docket.hearingtime'],
      order: [
        ['hearingdate', 'ASC'],
        ['hearingtime', 'ASC'],
      ],
      raw: true,
      nest: true,
      subQuery: false,
    });

    // Format the result set - remove duplicates from comma-separated strings
    const formattedData = calendars.map((cal, index) => ({
      id: `${cal.hearingdateDisplay}-${cal.hearingtimeDisplay}-${cal.judge}-${index}`,
      hearingDate: cal.hearingdateDisplay,
      hearingTime: cal.hearingtimeDisplay,
      judge: cal.judge,
      caseTypeGroup: cal.casetypegroup 
        ? [...new Set(cal.casetypegroup.split(','))].join(', ')
        : '',
      locations: cal.locations 
        ? [...new Set(cal.locations.split(','))].join(', ')
        : '',
      cnt: cal.cnt,
    }));

    return {
      success: true,
      message: formattedData.length > 0 ? 'Upcoming calendars fetched successfully' : 'No upcoming calendars found',
      data: formattedData,
      count: formattedData.length,
    };
  }

  /**
   * Get Open Complex Cases (Red Files) for Judge Dashboard
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Open complex cases data
   */
  async getOpenComplexCases(userId) {
    const user = await this.getUserInfo(userId);
    const { user_type, firstName, lastName } = user;

    // Only for judge users
    if (user_type !== 'judge') {
      return {
        success: true,
        message: 'No complex cases',
        data: [],
        count: 0,
      };
    }

    const judgeName = `${lastName} ${firstName}`;

    try {
      const whereConditions = {
        judge: judgeName,
        status: {
          [Op.notIn]: ['Closed', 'stayed'],
        },
      };

      const [cases, totalCount] = await Promise.all([
        Docket.findAll({
          where: whereConditions,
          attributes: [
            'caseId',
            ['casetype', 'caseType'],
            [mysqlSequelize.fn('DATE_FORMAT', mysqlSequelize.col('Docket.datereceivedbyOSAH'), '%m-%d-%Y'), 'dateReceived'],
            [mysqlSequelize.fn('DATE_FORMAT', mysqlSequelize.col('Docket.hearingdate'), '%m-%d-%Y'), 'hearingDate'],
            [
              mysqlSequelize.fn(
                'COALESCE',
                mysqlSequelize.fn('CONCAT', mysqlSequelize.col('petitioner_data.Lastname'), ', ', mysqlSequelize.col('petitioner_data.Firstname')),
                mysqlSequelize.fn('CONCAT', mysqlSequelize.col('respondent_data.Lastname'), ', ', mysqlSequelize.col('respondent_data.Firstname')),
                'No Party Added'
              ),
              'name'
            ],
          ],
          include: [
            {
              model: NotificationCaseTypes,
              as: 'notificationCaseType',
              required: true,
              attributes: [],
              on: mysqlSequelize.literal(
                '`notificationCaseType`.`case_type` = `Docket`.`casetype` AND `notificationCaseType`.`agency` = `Docket`.`refagency`'
              ),
            },
            {
              model: PeopleDetails,
              as: 'petitioner_data',
              required: false,
              attributes: [],
            },
            {
              model: PeopleDetails,
              as: 'respondent_data',
              required: false,
              attributes: [],
            },
          ],
          order: [['datereceivedbyOSAH', 'DESC']],
          subQuery: false,
          raw: true,
        }),
        Docket.count({
          where: whereConditions,
          include: [
            {
              model: NotificationCaseTypes,
              as: 'notificationCaseType',
              required: true,
              attributes: [],
              on: mysqlSequelize.literal(
                '`notificationCaseType`.`case_type` = `Docket`.`casetype` AND `notificationCaseType`.`agency` = `Docket`.`refagency`'
              ),
            },
          ],
          distinct: true,
        }),
      ]);

      return {
        success: true,
        message: cases.length > 0 ? 'Open complex cases retrieved successfully' : 'No open complex cases found',
        count: totalCount,
        data: cases,
      };
    } catch (error) {
      logger.error('Error fetching open complex cases:', error);
      throw error;
    }
  }

  /**
   * Export open complex cases to CSV
   * Delegates to homeExportService
   * @param {number} userId - User ID
   * @returns {Promise<Object>} { success: boolean, data: string|null }
   */
  async exportOpenComplexCases(userId) {
    try {
      const user = await this.getUserInfo(userId);
      const { user_type, firstName, lastName } = user;

      if (user_type !== 'judge') {
        return { success: false, data: null };
      }

      const judgeName = `${lastName} ${firstName}`;
      const csvData = await homeExportService.exportOpenComplexCases(judgeName);

      if (!csvData) {
        return { success: false, data: null };
      }

      return { success: true, data: csvData };
    } catch (error) {
      logger.error('Error exporting open complex cases:', error);
      throw error;
    }
  }
}

export default new HomeService();
