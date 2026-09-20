import Role from "../models/Role.js";
import Permission from "../models/Permission.js";
// Not used directly below (the query goes through the belongsToMany
// association instead) - imported purely for its side effect: this file
// is what calls Role.belongsToMany(Permission, { through: RolePermission,
// as: "permissions" }), which is what makes `as: "permissions"` below
// resolve at all. Nothing else in the normal request path imports this
// model, so dropping this import reintroduces "permissions is not
// associated to roles!" at the first login after boot.
import "../models/RolePermission.js";

/**
 * Single source of truth for "what permissions does this role have" — used
 * by rbacMiddleware.js's requirePermission()/requireAnyPermission() on every
 * gated request, and by authController.js / userManagementProfileController.js
 * when they build the `permissions` array returned to the frontend on
 * login/session-restore. All three used to run their own copy of this lookup
 * (two of them a slower two-query RolePermission -> Permission join done by
 * hand); this is the one implementation, so a fix or the cache only has to
 * happen once.
 *
 * Permissions change rarely, and are edited by hand directly in the database
 * (no app write path exists to hook a cache-invalidation call into), so a
 * short TTL is used instead of invalidate-on-write: a manually-added
 * permission takes up to this long to take effect, in exchange for
 * eliminating the repeat DB round-trip on every gated request in between.
 */
const PERMISSION_CACHE_TTL_MS = 60_000;

// roleId -> { names: Set<string>, expiresAt: number }
const rolePermissionCache = new Map();

/** Exposed for tests / a future admin action that edits permissions through the app. */
export const clearPermissionCache = (roleId) => {
  if (roleId === undefined) {
    rolePermissionCache.clear();
  } else {
    rolePermissionCache.delete(roleId);
  }
};

/**
 * All active permission names for a role, via the
 * Role.belongsToMany(Permission, { through: RolePermission, as: "permissions" })
 * association — one query per cache miss instead of a separate
 * RolePermission lookup followed by a Permission lookup keyed off an
 * IN (...) list of ids.
 *
 * @returns {Promise<Set<string>>}
 */
export const getPermissionNamesForRole = async (roleId) => {
  const cached = rolePermissionCache.get(roleId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.names;
  }

  const roleWithPermissions = await Role.findByPk(roleId, {
    include: [
      {
        model: Permission,
        as: "permissions",
        attributes: ["name"],
        where: { is_active: true },
        required: false,
        through: { attributes: [] },
      },
    ],
  });

  const names = new Set((roleWithPermissions?.permissions ?? []).map((p) => p.name));
  rolePermissionCache.set(roleId, { names, expiresAt: Date.now() + PERMISSION_CACHE_TTL_MS });
  return names;
};
