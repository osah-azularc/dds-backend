import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { v4 as uuidv4 } from "uuid";

import fs from "node:fs";
import util from "node:util";
import libre from "libreoffice-convert";
libre.convertAsync = util.promisify(libre.convert);
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const bucketName = process.env.AWS_ARCHIVE_BUCKET;
const region = process.env.AWS_REGION;
const daysArchiveCheck = Number.parseInt(process.env.AWS_ARCHIVE_DAYS || "1", 10);



/**
 * get ecourt prefix based on APP_URL in .env
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object.
 */
const getECourtPrefix = () => {
  const appUrl = process.env.APP_URL || "";
  if (appUrl.includes("dev")) return "eCourt-Dev/";
  if (appUrl.includes("stg")) return "eCourt-Stg/";
  if (appUrl.includes("uat")) return "eCourt-Uat/";
  // Default to prod
  return "eCourt-Prod/";
};

const s3Client = new S3Client({
  region,
});
const signedUrlExpirySeconds = Number.parseInt(process.env.AWS_ARCHIVE_SIGNED_URL_EXPIRES || "1800", 10);

// Assuming the environment is stored in a variable or can be determined dynamically
// For example, using NODE_ENV environment variable or a custom method to determine the environment
const environment = process.env.NODE_ENV || "local"; // Default to 'local' if not set

/**
 * Prepends the environment as a subfolder to the S3 key
 * @param {string} key - The original key for the object
 * @return {string} - The modified key including the environment subfolder
 */
const prependEnvironmentToKey = (key) => `${environment}/${key}`;

/**
 * Upload a file to an S3 bucket within a specific environment subfolder
 * @param {Buffer} fileContent - The content of the file to upload
 * @param {string} key - The key for the object to create in the bucket
 * Example of a key can be 'folder1/folder2/filename.jpg'
 */

const scanFileWithClamAV = (fileContent) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "clamavWorker.js"));

    worker.on("message", (message) => {
      if (message.error) {
        reject(message.error);
      } else {
        resolve(message.result);
      }
    });

    worker.on("error", (error) => {
      reject(`Worker error: ${error}`);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(`Worker stopped with exit code ${code}`);
      }
    });

    worker.postMessage(fileContent);
  });
};

const uploadFile = async (fileContent, key, scanFile = false) => {
  try {
    if (scanFile) {
      await scanFileWithClamAV(fileContent);
    }

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: prependEnvironmentToKey(key),
      Body: fileContent,
    };

    const upload = new Upload({
      client: s3Client,
      params,
      partSize: 10 * 1024 * 1024, // 10MB per part
      queueSize: 10, // Number of concurrent uploads
    });

    upload.on("httpUploadProgress", (evt) => {
      console.log(`Uploaded ${evt.loaded} of ${evt.total} bytes`);
    });

    const data = await upload.done();
    // check what is returned by this data as basically we want to store the key in the database to use it to get the object back from s3
    return data;
  } catch (err) {
    throw err;
  }
};

const uploadDocxFileToScan = async (fileContent, scanFile = false) => {
  try {
    if (scanFile) {
      const scanResult = await scanFileWithClamAV(fileContent);
      if (scanResult === "File is clean") {
        return scanResult;
      } else {
        return scanResult;
      }
    }
  } catch (err) {
    console.log("Error uploading DOCX file", err);
    return false;
  }
};

const doesFileExist = async (key) => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: prependEnvironmentToKey(key),
  };

  try {
    await s3Client.send(new HeadObjectCommand(params));
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Delete a file from an S3 bucket within a specific environment subfolder
 * @param {string} key - The key for the object to delete in the bucket
 */
const deleteFile = async (key) => {
  if (!(await doesFileExist(key))) return;

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: prependEnvironmentToKey(key),
  };

  try {
    const data = await s3Client.send(new DeleteObjectCommand(params));
    return data;
  } catch (err) {
    console.log("Error deleting file", err);
    throw err;
  }
};

/**
 * Get a file from an S3 bucket within a specific environment subfolder
 * @param {string} key - The key for the object to get in the bucket
 */
const getFile = async (key) => {
  if (!(await doesFileExist(key))) return;

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: prependEnvironmentToKey(key),
  };

  const response = await s3Client.send(new GetObjectCommand(params));
  return response.Body;
};

const getAlternativeStorageSignedDownloadUrl = async (key) => {
  const normalizedKey = String(key || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '');

  if (!normalizedKey) {
    return null;
  }

  const params = {
    Bucket: bucketName,
    Key: normalizedKey,
    ResponseContentType: 'binary/octet-stream',
    ResponseContentDisposition: `attachment; filename="${path.basename(normalizedKey)}"`,
  };

  return getSignedUrl(s3Client, new GetObjectCommand(params), {
    expiresIn: signedUrlExpirySeconds,
  });
};

const generateUniqueS3Key = (originalFileName) => {
  return `_${uuidv4()}_${originalFileName}`;
};

const extractOriginalFileName = (key) => {
  const parts = key.split("_");
  return parts.slice(2).join("_");
};

const convertDocToPdf = async (key) => {
  if (!(await doesFileExist(key))) return;
  let tmpDocPath, tmpPdfPath;
  try {
    // Set up the custom temporary directory
    const customTmpDir = path.join(
      __dirname,
      "..",
      "tmp",
      "template-documents",
    );

    // Ensure the custom directory exists
    if (!fs.existsSync(customTmpDir)) {
      fs.mkdirSync(customTmpDir, { recursive: true });
    }

    // Step 1: Define unique file names for DOCX and PDF
    const uniqueId = uuidv4(); // Generates a unique identifier
    tmpDocPath = path.join(customTmpDir, `${uniqueId}.docx`);
    tmpPdfPath = path.join(customTmpDir, `${uniqueId}.pdf`);

    // Step 2: Fetch file stream from S3 and save it as a DOCX file
    const s3Response = await s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: prependEnvironmentToKey(key),
      }),
    );
    const s3Stream = s3Response.Body;
    const writeStream = fs.createWriteStream(tmpDocPath);

    await new Promise((resolve, reject) => {
      s3Stream.pipe(writeStream).on("finish", resolve).on("error", reject);
    });

    // Step 3: Convert DOCX to PDF using libre.convertAsync
    const docBuffer = fs.readFileSync(tmpDocPath);
    const pdfBuffer = await libre.convertAsync(docBuffer, ".pdf", undefined);

    // Step 4: Write PDF buffer to the PDF file
    fs.writeFileSync(tmpPdfPath, pdfBuffer);

    // Step 5: Return PDF stream
    return {
      tmpDoc: tmpDocPath,
      tmpPdf: tmpPdfPath,
      streamPdf: fs.createReadStream(tmpPdfPath),
    };
  } catch (err) {
    console.error("Error during file conversion:", err);
    throw err;
  }
};

const convertDocxToPdfWithoutS3 = async (templateData) => {
  try {
    // Set up the custom temporary directory
    const customTmpDir = path.join(
      __dirname,
      "..",
      "tmp",
      "template-documents",
    );

    // Ensure the custom directory exists
    if (!fs.existsSync(customTmpDir)) {
      fs.mkdirSync(customTmpDir, { recursive: true });
    }

    // Define unique file names for the DOCX and PDF
    const uniqueId = uuidv4();
    const tmpDocxPath = path.join(customTmpDir, `${uniqueId}.docx`);
    const tmpPdfPath = path.join(customTmpDir, `${uniqueId}.pdf`);

    // Step 1: Save the DOCX file to the custom directory
    const docxBuffer = templateData.buffer;
    fs.writeFileSync(tmpDocxPath, docxBuffer);

    // Step 2: Perform the DOCX to PDF conversion using the file path
    const pdfBuffer = await new Promise((resolve, reject) => {
      libre.convert(
        fs.readFileSync(tmpDocxPath),
        ".pdf",
        undefined,
        (err, done) => {
          if (err) {
            return reject(
              new Error(`DOCX to PDF conversion failed: ${err.message}`),
            );
          }
          resolve(done);
        },
      );
    });

    // Step 3: Save the PDF file to the custom directory
    fs.writeFileSync(tmpPdfPath, pdfBuffer);

    // Return paths of both saved files
    return {
      tmpDocx: tmpDocxPath,
      tmpPdf: tmpPdfPath,
      streamPdf: pdfBuffer,
    };
  } catch (error) {
    console.error("Error during conversion:", error);
    throw error;
  }
};

const cleanupTempFiles = (...files) => {
  files.forEach((file) => {
    if (file && fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
};

// Archive helper expects documents shaped using our API contract (camelCase).
// Only documentId is supported; raw/legacy ids should be mapped earlier.
const resolveArchiveDocumentId = (doc) => doc.documentId;

/**
 * Author: Snehal Narkar
 * Checks if documents are archived in the alternative S3 bucket.
 * Adds a `docArchived` property to each document if archived.
 * @param {Array} documents - Array of document objects.
 * @returns {Promise<Array>} - Documents with docArchived property.
 */
const checkAwsArchivedDocuments = async (documents) => {
  const archiveS3Client = new S3Client({
    region,
  });
  const prefix = getECourtPrefix();

  try {
    const response = await archiveS3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: 1000,
      }),
    );

    const files = response.Contents || [];

    for (const file of files) {
      const headData = await archiveS3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: file.Key,
        }),
      );

      const metadata = headData.Metadata || {};

      for (const doc of documents) {
        const docId = resolveArchiveDocumentId(doc);
        const caseId = String(doc.caseId ?? '').trim();
        if (!docId) continue;

        const matchesDocumentId = metadata.docid && metadata.docid === docId;
        const matchesCaseId = !metadata.caseid || !caseId || metadata.caseid === caseId;

        if (matchesDocumentId && matchesCaseId) {
          const lastModifiedDate = new Date(file.LastModified);
          const today = new Date();
          const days = Math.floor(
            (today.setHours(0, 0, 0, 0) - lastModifiedDate.setHours(0, 0, 0, 0)) /
              (1000 * 60 * 60 * 24),
          );
          // DB has enum so keep it consistent here.
          doc.docArchived = days >= daysArchiveCheck ? '1' : '0';
        }
      }
    }
  } catch (err) {
    console.error('Error in checkAwsArchivedDocuments:', err);
  }

  return documents;
};

export {
  uploadFile,
  uploadDocxFileToScan,
  deleteFile,
  getFile,
  getAlternativeStorageSignedDownloadUrl,
  generateUniqueS3Key,
  convertDocToPdf,
  convertDocxToPdfWithoutS3,
  cleanupTempFiles,
  extractOriginalFileName,
  checkAwsArchivedDocuments
};
