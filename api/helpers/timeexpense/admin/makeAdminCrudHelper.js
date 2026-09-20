/*
  Created by  : Snehal Narkar
  Date        : 2026-08-27
  Description : Factory for the standard list/details/save/status-toggle CRUD helper
                shared by the Time & Expense admin entities whose Sequelize access is a
                plain single-table CRUD with no extra business logic (Time Entry Tasks,
                Expense Types) — previously each entity copy-pasted the same four function
                bodies, differing only in the Model and its field list. Billable Agency
                stays on its own (its list/details row-mapping differ, and save has the
                billing-contact-section logic on top), and Billing Roles stays on its own
                (edit-only — no add or status-toggle to give this shape).
*/

/**
 * @param {import('sequelize').Model} Model
 * @param {object} config
 * @param {string} config.orderField - camelCase model attribute to order the list by
 * @param {(row: import('sequelize').Model) => object} config.mapRow - row -> API shape,
 *   used for both the list and the details response
 * @param {(formData: object) => object} config.buildData - form payload -> the fields to
 *   create/update (updatedDate is added by this factory, not buildData)
 * @returns {{getList, getDetails, save, setStatus}}
 */
export function makeAdminCrudHelper(Model, { orderField, mapRow, buildData }) {
  async function getList() {
    const rows = await Model.findAll({ order: [[orderField, 'ASC']] });
    return rows.map(mapRow);
  }

  async function getDetails(id) {
    const row = await Model.findByPk(id);
    return row ? mapRow(row) : null;
  }

  /**
   * Create or update depending on whether formData.id is present. The frontend re-fetches
   * the list after a save rather than reading the saved row back, so this returns just the
   * id — not the full mapped row.
   */
  async function save(formData) {
    const data = { ...buildData(formData), updatedDate: new Date() };

    if (formData.id) {
      const row = await Model.findByPk(formData.id);
      if (!row) return null;

      await row.update(data);
      return { id: row.id };
    }

    const row = await Model.create({ ...data, createdDate: new Date() });
    return { id: row.id };
  }

  /**
   * Toggle active status. Returns null when not found. The frontend updates its row from
   * the requested status on a successful response, so this returns just id/isActive — not
   * the full mapped row.
   */
  async function setStatus(id, statusActiveInActive) {
    const row = await Model.findByPk(id);
    if (!row) return null;

    await row.update({ isActive: statusActiveInActive });
    return { id: row.id, isActive: row.isActive };
  }

  return { getList, getDetails, save, setStatus };
}
