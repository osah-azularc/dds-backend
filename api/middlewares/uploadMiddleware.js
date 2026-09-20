import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
// import { logger } from "../../config/winstonLogger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine the absolute path to the root directory of your backend
const rootDirectory = path.resolve(__dirname, "../../");

// Define the destination folder within the root directory
const destinationFolder = path.join(rootDirectory, "assets/sampleformdata");

// logger.info("PATH:", destinationFolder);

// Define storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, destinationFolder); // Specify the desired folder path here
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // Rename the file
  },
});

// Create multer middleware
const upload = multer({
  storage,
  limits: { fileSize: 102400 }, // 100KB file size limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true); // Accept PDF files
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

export default upload;
