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
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

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

const uploadPublicFile = async (fileContent, key, scanFile = false) => {
  try {
    if (scanFile) {
      await scanFileWithClamAV(fileContent);
    }
    const params = {
      Bucket: process.env.S3_PUBLIC_BUCKET_NAME,
      Key: prependEnvironmentToKey(key),
      Body: fileContent,
      ACL: "public-read", // Make the file public
    };

    const upload = new Upload({
      client: s3Client,
      params: params,
    });

    const data = await upload.done();

    // Construct the URL of the uploaded file
    const fileUrl = data.Location;

    // Return the URL of the uploaded file and the data
    return { fileUrl, data, key: params.Key };
  } catch (err) {
    console.log("Error uploading file", err);
    throw err;
  }
};

const uploadPublicDocxFileToScan = async (fileContent, scanFile = false) => {
  try {
    if (scanFile) {
      const scanResult = await scanFileWithClamAV(fileContent);
      if (scanResult === "File is clean") {
        return scanResult;
      } else {
        console.log(`DOCX ${scanResult}, prohibiting upload`);
        return scanResult;
      }
    }
  } catch (err) {
    console.log("Error uploading DOCX file", err);
    return false;
  }
};

const doesPublicFileExist = async (key) => {
  key = key.replace(`${environment}/`, ""); // Trim the environment from the key
  const params = {
    Bucket: process.env.S3_PUBLIC_BUCKET_NAME,
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
const deletePublicFile = async (key) => {
  key = key.replace(`${environment}/`, ""); // Trim the environment from the key
  if (!(await doesPublicFileExist(key))) return;

  const params = {
    Bucket: process.env.S3_PUBLIC_BUCKET_NAME,
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
const getPublicFile = async (key) => {
  if (!(await doesPublicFileExist(key))) return;

  const params = {
    Bucket: process.env.S3_PUBLIC_BUCKET_NAME,
    Key: prependEnvironmentToKey(key),
  };

  const response = await s3Client.send(new GetObjectCommand(params));
  return response.Body;
};

const getPublicFileDetailsFromS3 = async (key) => {
  if (!(await doesPublicFileExist(key))) return;
  key = key.replace(`${environment}/`, ""); // Trim the environment from the key
  const params = {
    Bucket: process.env.S3_PUBLIC_BUCKET_NAME,
    Key: prependEnvironmentToKey(key),
  };
  try {
    const command = new GetObjectCommand(params);
    const metadata = await s3Client.send(command);

    // Construct the URL of the image
    const fileUrl = `https://${process.env.S3_PUBLIC_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${environment}/${key}`;

    return { metadata, fileUrl };
  } catch (error) {
    console.error("Error getting file metadata:", error);
    throw error;
  }
};

const generatePublicUniqueS3Key = (originalFileName) => {
  return `_${uuidv4()}_${originalFileName}`;
};

const convertPublicDocToPdf = async (key) => {
  if (!(await doesPublicFileExist(key))) return;
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
        Bucket: process.env.S3_PUBLIC_BUCKET_NAME,
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

const convertPublicDocxToPdfWithoutS3 = async (templateData) => {
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

const cleanupPublicTempFiles = (...files) => {
  files.forEach((file) => {
    if (file && fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
};

const getPublicImageFileDetailsFromS3 = async (key) => {
  key = key.replace(`${environment}/`, ""); // Trim the environment from the key
  if (!(await doesPublicFileExist(key))) return;

  const params = {
    Bucket: process.env.S3_PUBLIC_BUCKET_NAME,
    Key: prependEnvironmentToKey(key),
    ACL: "public-read", // Make the file public
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
  } catch (error) {
    console.error("Upload failed:", error);
  }
};

export {
  uploadPublicFile,
  uploadPublicDocxFileToScan,
  deletePublicFile,
  getPublicFile,
  getPublicFileDetailsFromS3,
  generatePublicUniqueS3Key,
  convertPublicDocToPdf,
  convertPublicDocxToPdfWithoutS3,
  cleanupPublicTempFiles,
  getPublicImageFileDetailsFromS3,
};
