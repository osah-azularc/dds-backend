import nodemailer from "nodemailer";
import fs from "fs";

export const sendEmail = async (email, subject, text) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.HOST,
      service: process.env.SERVICE,
      port: Number(process.env.EMAIL_PORT),
      secure: process.env.SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      text: text,
    });
  } catch (error) {
    console.log("Email not sent:", error);
  }
};

export const formatDateToYYYYMMDD = (dateInput) => {
  // Create a Date object from the input date
  const date = new Date(dateInput);

  // Check if date is invalid
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date input");
  }

  // Format the date to YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    // 'en-CA' uses the YYYY-MM-DD format
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export const downloadPDF = (res, filePath, downloadName) => {
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.log("File does not exist");
      res.status(404).send("Requested file not found.");
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${downloadName}`,
    );
    fs.createReadStream(filePath).pipe(res);
  });
};
/**
 * Returns true when the request/host represents localhost (development).
 * Accepts either the Express `req` object or a host string.
 */
export const isLocalHost = (reqOrHost) => {
  try {
    let host = "";
    if (!reqOrHost) return false;
    if (typeof reqOrHost === "string") host = reqOrHost;
    else if (reqOrHost.hostname) host = reqOrHost.hostname;
    else if (reqOrHost.headers && reqOrHost.headers.host)
      host = reqOrHost.headers.host;

    if (!host) return false;

    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      (typeof host === "string" && host.includes("localhost"))
    );
  } catch (err) {
    return false;
  }
};

export const successResponse = (
  resOrMessage,
  message = "Success",
  data = null,
  status = 200,
) => {
  // Support Express response object usage
  if (
    resOrMessage &&
    typeof resOrMessage === "object" &&
    typeof resOrMessage.status === "function" &&
    typeof resOrMessage.json === "function"
  ) {
    return resOrMessage.status(status).json({
      success: true,
      message,
      data,
    });
  }

  // Legacy usage without Express response object
  return {
    success: true,
    message: resOrMessage || message,
    data,
  };
};

export const failureResponse = (
  resOrMessage,
  message = "Something went wrong",
  status = 500,
  error = null,
) => {
  // Support Express response object usage
  if (
    resOrMessage &&
    typeof resOrMessage === "object" &&
    typeof resOrMessage.status === "function" &&
    typeof resOrMessage.json === "function"
  ) {
    return resOrMessage.status(status).json({
      success: false,
      message,
      error,
      status,
    });
  }

  // Legacy usage without Express response object
  return {
    success: false,
    message: resOrMessage || message,
    error,
    status,
  };
};
