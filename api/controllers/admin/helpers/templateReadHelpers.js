import { Op, Sequelize } from 'sequelize';

/**
 * SQL fragment for the "caseType" column on the V2 template list grid: an
 * agency-grouped, GROUP_CONCAT'd display string of every casetype mapped to
 * a template. This needs two levels of correlated GROUP_CONCAT, which has no
 * equivalent in Sequelize's attribute/include builder, so it is passed to
 * `findAll` as a single `Sequelize.literal()` computed column — the
 * documented Sequelize pattern for a virtual column backed by a subquery.
 * `DocumentTemplates` below is the alias Sequelize gives the base model's
 * table (confirmed via query logging), matching the correlated `dt.id` of
 * the previous raw query.
 */
export const CASE_TYPE_DISPLAY_LITERAL = Sequelize.literal(`COALESCE(
    (
      SELECT GROUP_CONCAT(
        CONCAT(agency_group, ': ', casetypes)
        ORDER BY agency_group
        SEPARATOR ' | '
      )
      FROM (
        SELECT
          m.agency as agency_group,
          GROUP_CONCAT(
            CASE WHEN m.casetype = 'all' THEN 'All' ELSE m.casetype END
            ORDER BY m.casetype
            SEPARATOR ', '
          ) as casetypes
        FROM document_template_casetype_mapping m
        WHERE m.template_id = \`DocumentTemplates\`.\`id\`
        GROUP BY m.agency
      ) agency_cases
    ),
    'N/A'
  )`);

/**
 * Builds a Sequelize `where` clause (as an array of conditions to AND
 * together) plus the named replacement map for the V2 template list
 * (getAllTemplatesV2) query, for use with DocumentTemplates.count()/findAll().
 *
 * The agency/casetype and automation-type filters are existence checks
 * ("does at least one matching mapping row exist for this template") that
 * would require de-duplicating join results if expressed as Sequelize
 * `include`s; EXISTS subqueries avoid that without changing row counts, so
 * they're kept as small, individually parameterised `Sequelize.literal()`
 * fragments rather than one large raw query string. All user-supplied
 * values are still bound as named replacements to prevent SQL injection.
 *
 * @param {object}   filters
 * @param {string[]} [filters.agencies=[]]
 * @param {string[]} [filters.caseTypes=[]]
 * @param {string}   [filters.scopeType]
 * @param {string}   [filters.documentName]
 * @param {string}   [filters.status='1']
 * @param {string[]} [filters.automationTypes=[]]
 * @returns {{ where: object, replacements: object }}
 */
export const buildFilterWhereClause = ({
  agencies = [],
  caseTypes = [],
  scopeType,
  documentName,
  status = '1',
  automationTypes = [],
}) => {
  const conditions = [];
  const replacements = {};

  // Status filter — empty string or 'all' means no filter (legacy parity)
  if (status && status !== '' && status !== 'all') {
    conditions.push({ active: status });
  }

  // Document Menu filter (based on documenttype column + scope_type)
  // 'all' / '' → no filter
  // 'decision'        → scope_type IN (0,3) AND documenttype = 'Decision'
  // 'nonDecision'     → scope_type IN (0,3) AND documenttype != 'Decision'
  // 'generalDocument' → scope_type IN (2,3)
  if (scopeType && scopeType !== '' && scopeType !== 'all') {
    if (scopeType === 'decision') {
      conditions.push({ scopeType: { [Op.in]: [0, 3] } });
      conditions.push(Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('documenttype')), 'decision'));
    } else if (scopeType === 'nonDecision') {
      conditions.push({ scopeType: { [Op.in]: [0, 3] } });
      conditions.push(Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('documenttype')), { [Op.ne]: 'decision' }));
    } else if (scopeType === 'generalDocument') {
      conditions.push({ scopeType: { [Op.in]: [2, 3] } });
    }
  }

  // Document Name — partial match on displayname or documentname
  if (documentName && documentName.trim() !== '') {
    const like = `%${documentName.trim()}%`;
    conditions.push({
      [Op.or]: [
        { displayname: { [Op.like]: like } },
        { documentname: { [Op.like]: like } },
      ],
    });
  }

  // Agency filter (with optional CaseType sub-filter) using EXISTS
  if (agencies.length > 0) {
    const agencyPlaceholders = agencies.map((_, i) => `:agencyVal${i}`).join(', ');
    agencies.forEach((a, i) => { replacements[`agencyVal${i}`] = a; });

    if (caseTypes.length > 0) {
      const ctPlaceholders = caseTypes.map((_, i) => `:ctVal${i}`).join(', ');
      caseTypes.forEach((c, i) => { replacements[`ctVal${i}`] = c; });
      conditions.push(Sequelize.literal(`EXISTS (
        SELECT 1 FROM document_template_casetype_mapping m
        WHERE m.template_id = \`DocumentTemplates\`.\`id\`
          AND m.agency IN (${agencyPlaceholders})
          AND (m.casetype IN (${ctPlaceholders}) OR m.casetype = 'all')
      )`));
    } else {
      conditions.push(Sequelize.literal(`EXISTS (
        SELECT 1 FROM document_template_casetype_mapping m
        WHERE m.template_id = \`DocumentTemplates\`.\`id\`
          AND m.agency IN (${agencyPlaceholders})
      )`));
    }
  }

  // Automation Type filter using EXISTS through mapping join
  if (automationTypes.length > 0) {
    const atPlaceholders = automationTypes.map((_, i) => `:atVal${i}`).join(', ');
    automationTypes.forEach((a, i) => { replacements[`atVal${i}`] = a; });
    conditions.push(Sequelize.literal(`EXISTS (
      SELECT 1 FROM document_template_mapping_automation a
      INNER JOIN document_template_casetype_mapping m ON m.id = a.mapping_id
      WHERE m.template_id = \`DocumentTemplates\`.\`id\`
        AND a.automation_type IN (${atPlaceholders})
        AND a.active = '1'
    )`));
  }

  const where = conditions.length > 0 ? { [Op.and]: conditions } : {};
  return { where, replacements };
};
