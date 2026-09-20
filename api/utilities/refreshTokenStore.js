/**
 * @module refreshTokenStore
 * @description MySQL-backed persistent store for refresh tokens.
 *
 * Only the SHA-256 hash of the raw token is persisted — the plaintext token
 * is never written to the database.
 *
 * Public API (all async):
 *   saveToken(userId, rawToken, ttlMs?)  – persists a new token record
 *   revokeToken(rawToken)                – marks a token revoked (soft-delete)
 *   isTokenRevoked(rawToken)             – true when token is absent, expired, or revoked
 *   getTokenOwner(rawToken)              – returns userId or null
 *   pruneExpired()                       – hard-deletes expired/revoked rows (run via cron)
 */

import crypto from "crypto";
import { Op } from "sequelize";
import RefreshToken from "../models/RefreshToken.js";

/** @returns {string} SHA-256 hex digest of the raw token */
const hashToken = (rawToken) =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

/** Default TTL: 7 days (must match the JWT refresh token expiry). */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Persists a new refresh token record.
 * If a record for the same hash already exists it is replaced.
 * @param {number} userId
 * @param {string} rawToken
 * @param {number} [ttlMs]
 * @returns {Promise<void>}
 */
const saveToken = async (userId, rawToken, ttlMs = DEFAULT_TTL_MS) => {
  const token_hash = hashToken(rawToken);
  const expires_at = new Date(Date.now() + ttlMs);

  await RefreshToken.upsert({ user_id: userId, token_hash, expires_at, revoked_at: null });
};

/**
 * Soft-revokes a refresh token by stamping `revoked_at`.
 * Silently succeeds if the token is not found.
 * @param {string} rawToken
 * @returns {Promise<void>}
 */
const revokeToken = async (rawToken) => {
  const token_hash = hashToken(rawToken);

  await RefreshToken.update(
    { revoked_at: new Date() },
    { where: { token_hash } }
  );
};

/**
 * Returns `true` when a token should be considered invalid (absent, expired,
 * or explicitly revoked).
 * @param {string} rawToken
 * @returns {Promise<boolean>}
 */
const isTokenRevoked = async (rawToken) => {
  const token_hash = hashToken(rawToken);

  const record = await RefreshToken.findOne({
    where: {
      token_hash,
      revoked_at: null,
      expires_at: { [Op.gt]: new Date() },
    },
  });

  return record === null;
};

/**
 * Returns the `user_id` associated with a valid token, or `null` if the token
 * is absent, expired, or revoked.
 * @param {string} rawToken
 * @returns {Promise<number|null>}
 */
const getTokenOwner = async (rawToken) => {
  const token_hash = hashToken(rawToken);

  const record = await RefreshToken.findOne({
    where: {
      token_hash,
      revoked_at: null,
      expires_at: { [Op.gt]: new Date() },
    },
    attributes: ["user_id"],
  });

  return record ? record.user_id : null;
};

/**
 * Hard-deletes all expired or revoked token rows.
 * Call this from a scheduled cron job (e.g. nightly) to keep the table small.
 * @returns {Promise<number>} Number of rows deleted
 */
const pruneExpired = async () => {

  const deleted = await RefreshToken.destroy({
    where: {
      [Op.or]: [
        { expires_at: { [Op.lte]: new Date() } },
        { revoked_at: { [Op.not]: null } },
      ],
    },
  });

  return deleted;
};

export {
  saveToken,
  revokeToken,
  isTokenRevoked,
  getTokenOwner,
  pruneExpired,
};
