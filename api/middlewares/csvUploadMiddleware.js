import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { sanitizeFilename } from '../helpers/fileHelper.js';

/**
 * CSV Upload Middleware
 * Provides configurable multer middleware for CSV file uploads
 * Used by bulk upload routes for agency imports
 * 
 * @author Rizwan Hiroli
 * @see bulkUploadRoutes.js
 */

// File size limit: 10MB max to prevent DoS attacks via large file uploads
const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB in bytes

// Allowed MIME types for CSV uploads (covers values reported by major browsers/OS)
const ALLOWED_CSV_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
]);

/**
 * File filter that only accepts CSV files
 * Validates both the file extension and the reported MIME type to prevent
 * disguised payloads (e.g. an executable renamed to .csv).
 * @param {Request} _req - Express request object (unused)
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback function
 */
const csvFileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.csv') {
    return cb(new Error('Only CSV files are allowed'));
  }
  if (!ALLOWED_CSV_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error(`Invalid file type: ${file.mimetype}. Only CSV files are allowed`));
  }
  cb(null, true);
};

/**
 * Factory function to create storage configuration for an agency
 * @param {string} agencyFolder - The folder name for this agency (e.g., 'css', 'oig', 'dfcs')
 * @returns {multer.StorageEngine} Multer disk storage configuration
 */
const createStorage = (agencyFolder) => {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const uploadPath = `./uploads/${agencyFolder}/${Date.now()}`;
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (_req, file, cb) => {
      cb(null, sanitizeFilename(file.originalname));
    },
  });
};

/**
 * Factory function to create multer upload middleware for an agency
 * @param {string} agencyFolder - The folder name for this agency (e.g., 'css', 'oig', 'dfcs')
 * @returns {multer.Multer} Configured multer instance
 */
export const createCsvUpload = (agencyFolder) => {
  return multer({
    storage: createStorage(agencyFolder),
    fileFilter: csvFileFilter,
    limits: { fileSize: FILE_SIZE_LIMIT },
  });
};

// Pre-configured upload middleware for each agency type
export const cssUpload = createCsvUpload('css');
export const oigUpload = createCsvUpload('oig');
export const dfcsUpload = createCsvUpload('dfcs');

export default {
  createCsvUpload,
  cssUpload,
  oigUpload,
  dfcsUpload,
};

