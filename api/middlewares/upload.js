import multer from "multer";
import fs from "node:fs";
import path from "node:path";

// Define storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = "upload/";
    // Ensure the directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix);
  },
});

// Define file filter
const fileFilter = (req, file, cb) => {
  // Accept only certain file types
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type"), false);
  }
};

// Define limits
const limits = {
  fileSize: 1024 * 1024 * 5, // 5 MB file size limit
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits,
});

export default upload;
