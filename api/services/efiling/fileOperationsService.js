import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import fsSync from "fs";
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import { logger } from '../../../config/winstonLogger.js';

class FileOperationsService {
  /**
   * Format dates to match legacy format exactly: MM-DD-YYYY HH:MM:SS AM/PM
   */
  formatDateTime(date) {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    hours = String(hours).padStart(2, '0');
    
    return `${month}-${day}-${year} ${hours}:${minutes}:${seconds} ${ampm}`;
  }

  /** 
      Created by  : Rizwan Hiroli 
      Date        : 2025-12-08 
      Description : Copies a file from source path to destination path
      Parameters  : 
          - sourcePath (String): Full path to the source file to be copied
          - destinationPath (String): Full path where the file should be copied to
   
      Response    : Returns true on successful copy. Throws error if copy operation fails
      
      Example     : 
          await fileOperationsService.copyFileLocal(
              '/upload/temp/document.pdf',
              '/upload/case123/approved/document.pdf'
          );
  */
  async copyFileLocal(sourcePath, destinationPath) {
    try {
      const destDir = path.dirname(destinationPath);
      if (!fsSync.existsSync(destDir)) {
        await fs.mkdir(destDir, { recursive: true });
      }
      await fs.copyFile(sourcePath, destinationPath);
      return true;
    } catch (error) {
      logger.error('Error copying file:', { error: error.message, sourcePath, destinationPath });
      throw error;
    }
  }

  /** 
      Created by  : Rizwan Hiroli 
      Date        : 2025-12-08 
      Description : Adds a timestamp stamp to the first page of a PDF file with user information. Skips non-PDF files without error
      Parameters  : 
          - filePath (String): Full path to the PDF file to be stamped
          - stampData (Object): Data to include in the stamp
              - userId (Number): ID of the user performing the action
              - action (String): Action being performed (e.g., 'Approved', 'Rejected')
              - documentType (String): Type of document being stamped
   
      Response    : Modifies the PDF file in place by adding timestamp text at bottom right of first page. Logs info for non-PDF files. Logs error but does not throw on failure
      
      Example     : 
          await fileOperationsService.addTimestampToFile(
              '/upload/case123/document.pdf',
              { userId: 456, action: 'Approved', documentType: 'Motion' }
          );
          // Adds stamp: "E-Filed: 12/08/2025, 02:30:45 PM | User: 456"
  */
  async addTimestampToFile(filePath, stampData) {
    try {
      const fileExtension = path.extname(filePath).toLowerCase();
      
      if (fileExtension === '.pdf') {
        await this.addTimestampToPdf(filePath, stampData);
      } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(fileExtension)) {
        await this.addTimestampToImage(filePath, stampData);
      } else {
        logger.info(`Skipping timestamp for unsupported file type: ${filePath}`);
      }
    } catch (error) {
      logger.error('Error adding timestamp to file:', { error: error.message, filePath });
    }
  }

  async addTimestampToPdf(filePath, stampData) {
    try {
      const existingPdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();
      
      const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const fontSize = 10;
      
      // Use formatted dateSubmitted directly (already formatted as MM-DD-YYYY HH:MM:SS AM/PM)
      const submittedDateAndTime = stampData.dateSubmitted;
      const acceptedDateAndTime = this.formatDateTime(new Date());
      
      const username = stampData.username || 'Unknown User';
      
      // Match legacy format exactly - multi-line stamp at top-right
      const line1 = 'Office of State Administrative Hearings';
      const line2 = `Submitted: ${submittedDateAndTime}`;
      const line3 = `eFiled and Accepted: ${acceptedDateAndTime}`;
      const line4 = username;
      
      // Position at top-right corner with right alignment
      const rightMargin = 10;
      const topMargin = 10;
      const lineHeight = 15;
      
      firstPage.drawText(line1, {
        x: width - rightMargin - font.widthOfTextAtSize(line1, fontSize),
        y: height - topMargin,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      firstPage.drawText(line2, {
        x: width - rightMargin - font.widthOfTextAtSize(line2, fontSize),
        y: height - topMargin - lineHeight,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      firstPage.drawText(line3, {
        x: width - rightMargin - font.widthOfTextAtSize(line3, fontSize),
        y: height - topMargin - (lineHeight * 2),
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      firstPage.drawText(line4, {
        x: width - rightMargin - font.widthOfTextAtSize(line4, fontSize),
        y: height - topMargin - (lineHeight * 3),
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(filePath, pdfBytes);
      
      logger.info(`Timestamp added to PDF: ${filePath}`, { username: username });
    } catch (error) {
      logger.error('Error adding timestamp to PDF:', { error: error.message, filePath });
      throw error;
    }
  }

  async addTimestampToImage(filePath, stampData) {
    try {
      // Use formatted dateSubmitted directly (already formatted as MM-DD-YYYY HH:MM:SS AM/PM)
      const submittedDateAndTime = stampData.dateSubmitted;
      const acceptedDateAndTime = this.formatDateTime(new Date());
      
      const username = stampData.username || `${stampData.firstName} ${stampData.lastName}` || 'Unknown User';
      
      const stampText = `Office of State Administrative Hearings\nSubmitted: ${submittedDateAndTime}\neFiled and Accepted: ${acceptedDateAndTime}\n${username}`;
      
      const image = await loadImage(filePath);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      
      ctx.drawImage(image, 0, 0);
      
      // Dynamic font sizing based on image width (matching legacy logic)
      let fontSize = 10;
      if (image.width >= 1 && image.width <= 1000) {
        fontSize = 6;
      } else if (image.width > 2000) {
        fontSize = 20;
      }
      
      ctx.font = `${fontSize}px Times New Roman`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      
      // Split text into lines
      const lines = stampText.split('\n');
      const lineHeight = fontSize + 2;
      
      // Draw each line at top-right corner
      lines.forEach((line, index) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillText(line, image.width - 10, 10 + (index * lineHeight));
      });
      
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(filePath, buffer);
      
      logger.info(`Timestamp added to image: ${filePath}`, { username: username });
    } catch (error) {
      logger.error('Error adding timestamp to image:', { error: error.message, filePath });
    }
  }

  /** 
      Created by  : Rizwan Hiroli 
      Date        : 2025-12-08 
      Description : Generates a new file path structure for approved documents with timestamp-based folder organization
      Parameters  : 
          - caseId (Number): Case ID to organize the document under
          - documentType (String): Type of document (e.g., 'Motion', 'Order', 'Pleading')
          - documentName (String): Name of the document file including extension
   
      Response    : Returns object containing three path properties:
          - folderPath (String): Absolute path to the folder where document will be stored
          - filePath (String): Absolute path to the document file
          - relativePath (String): Relative path from project root with forward slashes
      
      Example     : 
          const paths = fileOperationsService.generateApprovedDocumentPath(
              12345,
              'Motion',
              'motion-to-dismiss.pdf'
          );
          // Returns:
          // {
          //   folderPath: '/project/upload/12345/Motion/1702051200000',
          //   filePath: '/project/upload/12345/Motion/1702051200000/motion-to-dismiss.pdf',
          //   relativePath: 'upload/12345/Motion/1702051200000/motion-to-dismiss.pdf'
          // }
  */
  generateApprovedDocumentPath(caseId, documentType, documentName) {
    const timestamp = Date.now();
    const nodeEnv = process.env.NODE_ENV || 'dev';
    let uploadBaseDir;

    if (['dev', 'stag', 'uat', 'prod'].includes(nodeEnv)) {
      // Server environments use EFS mount from environment variable
      const efsBasePath = process.env.EFS_BASE_PATH;
      uploadBaseDir = path.join(efsBasePath, 'upload');
    } else {
      // Local development
      uploadBaseDir = path.join(process.cwd(), 'public', 'upload');
    }

    const newFolderPath = path.join(uploadBaseDir, caseId.toString(), documentType, timestamp.toString());
    const newFilePath = path.join(newFolderPath, documentName);
    
    return {
      folderPath: newFolderPath,
      filePath: newFilePath,
      relativePath: path.join('/upload', caseId.toString(), documentType, timestamp.toString(), documentName).replace(/\\/g, '/')
    };
  }
}

export default new FileOperationsService();
