function parseAndValidateTemplateV2Mappings({
  mappings,
  scopeTypeValue,
  scopeTypeDecision,
  scopeTypeBoth,
}) {
  const fail = (status, title, message) => ({
    ok: false,
    response: { status, title, message, success: false },
  });

  let parsedMappings = mappings;
  if (typeof mappings === "string") {
    try {
      parsedMappings = JSON.parse(mappings);
    } catch (error) {
      return fail(400, "Validation error", "Mappings must be valid JSON.");
    }
  }

  if (!Array.isArray(parsedMappings)) {
    return fail(400, "Validation error", "Mappings must be an array.");
  }

  if ([scopeTypeDecision, scopeTypeBoth].includes(scopeTypeValue) && parsedMappings.length === 0) {
    return fail(
      400,
      "Validation error",
      "At least one agency/casetype mapping is required for Decision/Both scope types."
    );
  }

  const normalizedMappings = parsedMappings.map((row) => ({
    agency: typeof row.agency === "string" ? row.agency.trim() : "",
    casetype: typeof row.casetype === "string" ? row.casetype.trim() : "",
    automation_type: typeof row.automation_type === "string" ? row.automation_type.trim() : "",
    automation_sub_type:
      typeof row.automation_sub_type === "string" ? row.automation_sub_type.trim() : "",
  }));

  const agenciesWithAll = new Set();
  const agencyCasetypePairs = new Set();
  for (const row of normalizedMappings) {
    if (!row.agency || !row.casetype) {
      return fail(400, "Validation error", "Each mapping row must include agency and casetype.");
    }

    if (row.automation_type && !row.automation_sub_type) {
      return fail(
        400,
        "Validation error",
        "Automation sub-type is required when automation type is selected."
      );
    }

    if (row.casetype === "all") {
      if (agenciesWithAll.has(row.agency)) {
        return fail(
          409,
          "Duplicate template mapping",
          `This template already contains the mapping ${row.agency} + all case types.`
        );
      }
      if ([...agencyCasetypePairs].some((key) => key.startsWith(`${row.agency}:`))) {
        return fail(
          409,
          "Duplicate template mapping",
          `This template has conflicting mappings for ${row.agency}: cannot use "all case types" with specific case types.`
        );
      }
      agenciesWithAll.add(row.agency);
      continue;
    }

    if (agenciesWithAll.has(row.agency)) {
      return fail(
        409,
        "Duplicate template mapping",
        `This template has conflicting mappings for ${row.agency}: cannot use "all case types" with specific case types.`
      );
    }

    const key = `${row.agency}:${row.casetype}`;
    if (agencyCasetypePairs.has(key)) {
      return fail(
        409,
        "Duplicate template mapping",
        `This template already contains the mapping ${row.agency} + ${row.casetype}.`
      );
    }
    agencyCasetypePairs.add(key);
  }

  return { ok: true, normalizedMappings };
}

export { parseAndValidateTemplateV2Mappings };
