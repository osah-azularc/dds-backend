import History from '../../models/History.js';
import DDSHistory from '../../models/DDSHistory.js';

const HISTORY_SORT_FIELD_MAP = {
  date: 'date',
  createdTime: 'createdTime',
  description: 'description',
  modifiedBy: 'modifiedBy',
};

const HISTORY_ATTRIBUTES = ['id', 'caseId', 'date', 'description', 'modifiedBy', 'createdTime'];

const getDefaultHistoryPagination = (limit = 10) => ({
  total: 0,
  page: 0,
  limit,
  totalPages: 0,
});

const normalizeHistoryDate = (rawDate) => {
  if (!rawDate) {
    return '';
  }

  if (rawDate instanceof Date) {
    return rawDate.toISOString().slice(0, 10);
  }

  const normalizedValue = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  const parsedDate = Date.parse(normalizedValue);
  return Number.isNaN(parsedDate) ? normalizedValue : new Date(parsedDate).toISOString().slice(0, 10);
};

const normalizeHistoryTime = (rawTime) => {
  if (!rawTime) {
    return '';
  }

  const normalizedValue = String(rawTime).trim();
  const timeRegex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  const matchedTime = timeRegex.exec(normalizedValue);

  if (!matchedTime) {
    return normalizedValue;
  }

  const [, hours = '0', minutes = '00', seconds = '00'] = matchedTime;
  return `${String(Number.parseInt(hours, 10) || 0).padStart(2, '0')}:${minutes}:${seconds}`;
};

const normalizeHistoryText = (value) => String(value ?? '').trim().toLowerCase();

const getNormalizedHistorySortOrder = (sortOrder = 'desc') => (
  String(sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'
);

const buildHistoryModelOrder = (sortBy = 'date', sortOrder = 'desc') => {
  const resolvedSortField = HISTORY_SORT_FIELD_MAP[sortBy] || HISTORY_SORT_FIELD_MAP.date;
  const direction = getNormalizedHistorySortOrder(sortOrder).toUpperCase();

  if (resolvedSortField === 'createdTime') {
    return [
      ['createdTime', direction],
      ['date', direction],
      ['id', 'DESC'],
    ];
  }

  if (resolvedSortField === 'description' || resolvedSortField === 'modifiedBy') {
    return [
      [resolvedSortField, direction],
      ['date', 'DESC'],
      ['createdTime', 'DESC'],
      ['id', 'DESC'],
    ];
  }

  return [
    ['date', direction],
    ['createdTime', direction],
    ['id', 'DESC'],
  ];
};

const mapHistoryRow = (row, sourceKey, sourceOrder) => ({
  id: `${sourceKey}-${row?.id ?? 'missing'}`,
  caseId: row?.caseId ?? null,
  date: normalizeHistoryDate(row?.date) || null,
  description: row?.description ?? '',
  modifiedBy: row?.modifiedBy ?? '',
  // Left as raw "HH:mm:ss" (America/New_York wall clock, per localNow()) rather than
  // pre-formatted 12-hour text — the frontend needs the raw value to combine with
  // `date` and convert to the viewer's local timezone before display-formatting it.
  createdTime: row?.createdTime ?? '',
  sourceKey,
  sourceOrder,
  sourceId: row?.id ?? 0,
  sortDate: normalizeHistoryDate(row?.date),
  sortCreatedTime: normalizeHistoryTime(row?.createdTime),
  sortDescription: normalizeHistoryText(row?.description),
  sortModifiedBy: normalizeHistoryText(row?.modifiedBy),
});

const compareByDirection = (leftValue, rightValue, direction) => {
  if (leftValue < rightValue) {
    return direction === 'asc' ? -1 : 1;
  }

  if (leftValue > rightValue) {
    return direction === 'asc' ? 1 : -1;
  }

  return 0;
};

const compareHistoryRows = (left, right, sortBy = 'date', sortOrder = 'desc') => {
  const resolvedSortField = HISTORY_SORT_FIELD_MAP[sortBy] || HISTORY_SORT_FIELD_MAP.date;
  const direction = getNormalizedHistorySortOrder(sortOrder);

  const compareField = (fieldLeft, fieldRight, order = direction) =>
    compareByDirection(fieldLeft ?? '', fieldRight ?? '', order);

  const compareSequence = (comparisons) => {
    for (const [leftValue, rightValue, order] of comparisons) {
      const result = compareField(leftValue, rightValue, order);

      if (result !== 0) {
        return result;
      }
    }

    return 0;
  };

  const sortComparisonsMap = {
    date: [
      [left?.sortDate, right?.sortDate],
      [left?.sortCreatedTime, right?.sortCreatedTime],
    ],
    createdTime: [
      [left?.sortCreatedTime, right?.sortCreatedTime],
      [left?.sortDate, right?.sortDate],
    ],
    description: [[left?.sortDescription, right?.sortDescription]],
    modifiedBy: [[left?.sortModifiedBy, right?.sortModifiedBy]],
  };

  const primaryCompare = compareSequence(sortComparisonsMap[resolvedSortField] || []);

  if (primaryCompare !== 0) {
    return primaryCompare;
  }

  return compareSequence([
    [left?.sortDate, right?.sortDate, 'desc'],
    [left?.sortCreatedTime, right?.sortCreatedTime, 'desc'],
    [left?.sourceOrder ?? 0, right?.sourceOrder ?? 0, 'asc'],
    [left?.sourceId ?? 0, right?.sourceId ?? 0, 'desc'],
  ]);
};

const serializeHistoryRow = (row) => ({
  id: row?.id ?? null,
  caseId: row?.caseId ?? null,
  date: row?.date ?? null,
  description: row?.description ?? '',
  modifiedBy: row?.modifiedBy ?? '',
  createdTime: row?.createdTime ?? '',
});

export const getDocketHistoryData = async ({ docketId, page = 0, limit = 10, sortBy = 'date', sortOrder = 'desc' }) => {
  const resolvedDocketId = Number.parseInt(String(docketId), 10);
  const resolvedPage = Math.max(Number.parseInt(page, 10) || 0, 0);
  const resolvedLimit = Math.max(Number.parseInt(limit, 10) || 10, 1);

  if (Number.isNaN(resolvedDocketId) || resolvedDocketId <= 0) {
    return {
      data: [],
      pagination: getDefaultHistoryPagination(resolvedLimit),
    };
  }

  const modelOrder = buildHistoryModelOrder(sortBy, sortOrder);
  const [historyRows, ddsHistoryRows] = await Promise.all([
    History.findAll({
      where: { caseId: resolvedDocketId },
      attributes: HISTORY_ATTRIBUTES,
      order: modelOrder,
      raw: true,
    }),
    DDSHistory.findAll({
      where: { caseId: resolvedDocketId },
      attributes: HISTORY_ATTRIBUTES,
      order: modelOrder,
      raw: true,
    }),
  ]);

  const allRows = [
    ...historyRows.map((row) => mapHistoryRow(row, 'history', 1)),
    ...ddsHistoryRows.map((row) => mapHistoryRow(row, 'ddsHistory', 2)),
  ].sort((left, right) => compareHistoryRows(left, right, sortBy, sortOrder));

  const total = allRows.length;
  const offset = resolvedPage * resolvedLimit;

  return {
    data: allRows.slice(offset, offset + resolvedLimit).map(serializeHistoryRow),
    pagination: {
      total,
      page: resolvedPage,
      limit: resolvedLimit,
      totalPages: Math.ceil(total / resolvedLimit),
    },
  };
};