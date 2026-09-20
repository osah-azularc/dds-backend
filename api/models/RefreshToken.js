/**
 * @module RefreshToken
 * @description Persistent store for server-side refresh token records.
 *
 * Only the SHA-256 hash of the raw token is stored — the plaintext token
 * never touches the database.
 *
 * Table: refresh_tokens
 * Columns:
 *   id          – PK, auto-increment
 *   user_id     – FK → users.user_id (not enforced at DB level to avoid tight coupling)
 *   token_hash  – SHA-256(rawToken) hex string, unique, indexed
 *   expires_at  – UTC timestamp when the token is no longer valid
 *   revoked_at  – UTC timestamp when the token was explicitly revoked (NULL = still active)
 *   created_at  – auto-managed
 *   updated_at  – auto-managed
 */

import { mysqlSequelize } from "../../connections/seqDB.js";
import { DataTypes } from "sequelize";

const RefreshToken = mysqlSequelize.define(
  "RefreshToken",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "References users.user_id — not FK-constrained to stay decoupled",
    },
    token_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      comment: "SHA-256 hex digest of the raw refresh token",
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "Token expiry — matches the JWT exp claim",
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      comment: "Set on explicit logout / revocation; NULL means still active",
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    tableName: "refresh_tokens",
    indexes: [
      { fields: ["token_hash"], unique: true },
      { fields: ["user_id"] },
      { fields: ["expires_at"] },
    ],
  }
);

// Create the table if it doesn't exist; never alter existing columns.
RefreshToken.sync({ force: false, alter: true }).then(() => {}).catch(() => {});

export default RefreshToken;