/**
 * Builds the parameterised SQL WHERE clause and named replacement map for the
 * V2 template list (getAllTemplatesV2) query.
 * All user-supplied values are bound as named replacements to prevent SQL injection.
 *
 * @param {object}   filters
 * @param {string[]} [filters.agencies=[]]
 * @param {string[]} [filters.caseTypes=[]]
 * @param {string}   [filters.scopeType]
 * @param {string}   [filters.documentName]
 * @param {string}   [filters.status='1']
 * @param {string[]} [filters.automationTypes=[]]
 * @returns {{ whereSQL: string, replacements: object }}
 */
export const buildFilterWhereClause = ({
  agencies = [],
  caseTypes = [],
  scopeType,
  documentName,
  status = '1',
  automationTypes = [],
}) => {
  const whereClauses = [];
  const replacements = {};

  // Status filter — empty string or 'all' means no filter (legacy parity)
  if (status && status !== '' && status !== 'all') {
    whereClauses.push('dt.active = :status');
    replacements.status = status;
  }

  // Document Menu filter (based on documenttype column + scope_type)
  // 'all' / '' → no filter
  // 'decision'        → scope_type IN (0,3) AND documenttype = 'Decision'
  // 'nonDecision'     → scope_type IN (0,3) AND documenttype != 'Decision'
  // 'generalDocument' → scope_type IN (2,3)
  if (scopeType && scopeType !== '' && scopeType !== 'all') {
    if (scopeType === 'decision') {
      whereClauses.push('dt.scope_type IN (0, 3)');
      whereClauses.push('LOWER(dt.documenttype) = :decisionType');
      replacements.decisionType = 'decision';
    } else if (scopeType === 'nonDecision') {
      whereClauses.push('dt.scope_type IN (0, 3)');
      whereClauses.push('LOWER(dt.documenttype) != :decisionType');
      replacements.decisionType = 'decision';
    } else if (scopeType === 'generalDocument') {
      whereClauses.push('dt.scope_type IN (2, 3)');
    }
  }

  // Document Name — partial match on displayname or documentname
  if (documentName && documentName.trim() !== '') {
    whereClauses.push('(dt.displayname LIKE :docName OR dt.documentname LIKE :docName)');
    replacements.docName = `%${documentName.trim()}%`;
  }

  // Agency filter (with optional CaseType sub-filter) using EXISTS
  if (agencies.length > 0) {
    const agencyPlaceholders = agencies.map((_, i) => `:agencyVal${i}`).join(', ');
    agencies.forEach((a, i) => { replacements[`agencyVal${i}`] = a; });

    if (caseTypes.length > 0) {
      const ctPlaceholders = caseTypes.map((_, i) => `:ctVal${i}`).join(', ');
      caseTypes.forEach((c, i) => { replacements[`ctVal${i}`] = c; });
      whereClauses.push(`EXISTS (
        SELECT 1 FROM document_template_casetype_mapping m
        WHERE m.template_id = dt.id
          AND m.agency IN (${agencyPlaceholders})
          AND (m.casetype IN (${ctPlaceholders}) OR m.casetype = 'all')
      )`);
    } else {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM document_template_casetype_mapping m
        WHERE m.template_id = dt.id
          AND m.agency IN (${agencyPlaceholders})
      )`);
    }
  }

  // Automation Type filter using EXISTS through mapping join
  if (automationTypes.length > 0) {
    const atPlaceholders = automationTypes.map((_, i) => `:atVal${i}`).join(', ');
    automationTypes.forEach((a, i) => { replacements[`atVal${i}`] = a; });
    whereClauses.push(`EXISTS (
      SELECT 1 FROM document_template_mapping_automation a
      INNER JOIN document_template_casetype_mapping m ON m.id = a.mapping_id
      WHERE m.template_id = dt.id
        AND a.automation_type IN (${atPlaceholders})
        AND a.active = '1'
    )`);
  }

  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSQL, replacements };
};
