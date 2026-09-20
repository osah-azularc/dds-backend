/**
 * @module userHelpers
 * @description Shared validation helpers, normalizers, regex patterns, and
 * utility functions used across the user controller sub-modules.
 */

import qrcode from "qrcode";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const NAME_REGEX = /^[A-Za-z][A-Za-z\s'.-]{0,99}$/;
export const PHONE_FAX_REGEX = /^\+?[0-9()\-\s]{7,20}$/;
export const HEX_TOKEN_REGEX = /^[a-fA-F0-9]{32,128}$/;
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SAFE_TEXT_REGEX = /^[A-Za-z0-9 _.-]{1,100}$/;

/** Number of hours before an account-setup link expires. */
export const LINK_EXPIRATION_HOURS = 48;

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

/**
 * Trims whitespace from a string value; returns an empty string for
 * non-string inputs.
 * @param {*} value
 * @returns {string}
 */
export const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

/**
 * Normalises an email address to lower-case and trims surrounding whitespace.
 * @param {*} value
 * @returns {string}
 */
export const normalizeEmail = (value) => normalizeString(value).toLowerCase();

/**
 * Parses a positive integer from any value.  Returns `null` for anything that
 * is not a positive integer.
 * @param {*} value
 * @returns {number|null}
 */
export const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/** @param {string} value @returns {boolean} */
export const isValidEmail = (value) => EMAIL_REGEX.test(value);

/** @param {string} value @returns {boolean} */
export const isValidName = (value) => NAME_REGEX.test(value);

/**
 * Validates an optional phone/fax number.  An absent / empty value is
 * considered valid (the field is optional).
 * @param {*} value
 * @returns {boolean}
 */
export const isValidOptionalPhoneFax = (value) => {
  if (value === undefined || value === null || value === "") return true;
  return PHONE_FAX_REGEX.test(String(value).trim());
};

/** @param {string} value @returns {boolean} */
export const isValidUuid = (value) => UUID_REGEX.test(value);

/** @param {string} value @returns {boolean} */
export const isValidHexToken = (value) => HEX_TOKEN_REGEX.test(value);

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

/**
 * Extracts and deduplicates positive-integer IDs from an agency array
 * (each element may be `{ id: number, label: string }`).
 * @param {Array} agency
 * @returns {number[]}
 */
export const sanitizeAgencyIds = (agency) => {
  if (!Array.isArray(agency)) return [];
  const ids = agency
    .map((item) => parsePositiveInt(item?.id))
    .filter((id) => id !== null);
  return [...new Set(ids)];
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Generates a QR-code data URL for the given OTP auth URL.
 * @param {string} otpUrl
 * @returns {Promise<string>} Base-64 encoded data URL
 */
export function generateQrCode(otpUrl) {
  return new Promise((resolve, reject) => {
    qrcode.toDataURL(otpUrl, (error, imageUrl) => {
      if (error) {
        reject(error);
      } else {
        resolve(imageUrl);
      }
    });
  });
}
