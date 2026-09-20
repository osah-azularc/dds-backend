/*
  Created by  : Snehal Narkar
  Date        : 2026-08-31
  Description : Admin Invoice Settings helper (Time & Expense). Mirrors PHP
                TimeExpenseController's getinvoiceSettingsDetailsAction /
                uploadInvoiceTemplateAction, via Sequelize instead of raw SQL. Singleton
                row (id = 1) — no list/status-toggle, unlike the other Time & Expense
                admin entities.
                The logo file itself lives on EFS (EFS_BASE_PATH), same storage
                mechanism the docket-documents module uses (see storagePathUtils.js) —
                dev resolves to EFS_BASE_PATH/DEV-Data/invoice-template-manager, matching
                legacy's DOCUMENT_ROOT/upload/invoice-template-manager/ folder one env
                segment deeper.
*/
import fs from 'node:fs/promises';
import path from 'node:path';
import InvoiceTemplateManager from '../../../models/timeexpense/invoicing/InvoiceTemplateManager.js';
import { resolveStorageAbsolutePath } from '../../docketDetail/storagePathUtils.js';
import { logger } from '../../../../config/winstonLogger.js';

const SETTINGS_ROW_ID = 1;
const LOGO_STORAGE_FOLDER = '/invoice-template-manager';
const MIME_TYPE_BY_EXTENSION = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

// Magic-number signatures, checked against the actual decoded bytes — an extension or
// declared MIME type is just a claim about the file; this is what the file really is. Only
// PNG/JPEG are ever accepted for the logo, so only those two need a signature here.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

function isPngOrJpeg(buffer) {
  return (
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
    buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)
  );
}

/**
 * Reads the saved logo off EFS and returns it as a data URI, or null if missing. Exported for
 * reuse by invoicePdfTemplate.js - the invoice PDF's own header logo is this same admin-uploaded
 * file (invoice_template_manager.image), not a separate image, so it reads it the same way
 * rather than growing a second EFS-image-reading implementation.
 */
export async function readLogoAsDataUrl(filename) {
  if (!filename) return null;

  try {
    const { absolutePath } = resolveStorageAbsolutePath(`${LOGO_STORAGE_FOLDER}/${filename}`);
    if (!absolutePath) return null;

    const mimeType = MIME_TYPE_BY_EXTENSION[path.extname(filename).toLowerCase()];
    if (!mimeType) return null;

    // No separate existence check — a missing file throws ENOENT here, caught below the
    // same as any other read failure, and both resolve to the same "no logo" outcome.
    const buffer = await fs.readFile(absolutePath);
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    // ENOENT (nothing saved yet) is normal and expected; anything else (e.g. a broken EFS
    // mount or a permissions problem) would otherwise be silently indistinguishable from it.
    if (error.code !== 'ENOENT') {
      logger.warn(`[InvoiceSettings] Error reading logo "${filename}" from EFS:`, error);
    }
    return null;
  }
}

/** Deletes a logo file from EFS. Best-effort — logs and swallows failures. */
async function deleteLogoFile(filename) {
  if (!filename) return;

  try {
    const { absolutePath } = resolveStorageAbsolutePath(`${LOGO_STORAGE_FOLDER}/${filename}`);
    if (absolutePath) await fs.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`[InvoiceSettings] Error deleting logo "${filename}" from EFS:`, error);
    }
  }
}

/**
 * Writes a newly-picked logo to EFS. `filename` is basename-only to prevent path traversal.
 * Deliberately NOT called until "Update Template" is clicked (unlike legacy, whose Dropzone
 * uploads to postimageuploadAction the instant a file is dropped) — writing nothing to EFS
 * until the user actually saves means a cancelled or abandoned pick never leaves an
 * orphaned file behind, which matters here since it's real EFS storage, not a throwaway
 * local-disk artifact.
 */
async function writeLogoFile(filename, base64Data) {
  const safeFilename = path.basename(filename);
  const buffer = Buffer.from(base64Data, 'base64');

  // The extension/Joi checks only look at claimed metadata (filename, declared size) — this
  // checks what the bytes actually are, so a non-image renamed to end in .png can't reach EFS.
  if (!isPngOrJpeg(buffer)) {
    throw new Error('File content is not a valid PNG or JPEG image.');
  }

  const { absolutePath } = resolveStorageAbsolutePath(`${LOGO_STORAGE_FOLDER}/${safeFilename}`);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return safeFilename;
}

/**
 * Fetch the invoice settings singleton row. Returns null when the row doesn't exist yet.
 * Matches legacy's SELECT list (id,image,address,remit_information,tan_information,
 * case_referral_fee) — heading isn't part of this endpoint's response either, since the
 * settings tab never displays or edits it.
 */
export async function getInvoiceSettingsDetails() {
  const settings = await InvoiceTemplateManager.findByPk(SETTINGS_ROW_ID);
  if (!settings) return null;

  const plain = settings.toJSON();
  return {
    id: plain.id,
    image: plain.image || '',
    imageDataUrl: await readLogoAsDataUrl(plain.image),
    address: plain.address || '',
    remitInformation: plain.remitInformation || '',
    tanInformation: plain.tanInformation || '',
    // Read-only, same as `heading` above — nothing on the Invoice Settings tab displays or
    // edits this; saveInvoiceSettings never touches it.
    caseReferralFee: plain.caseReferralFee,
  };
}

/**
 * Update the invoice settings singleton row. Returns null when the row doesn't exist.
 * Nothing is required, matching legacy; `image` is only set when a new logo was picked
 * (written to EFS here — see writeLogoFile). Only bumps updatedDate, not createdDate,
 * unlike legacy's likely-unintentional reset of it on every save.
 *
 * A new logo is written to EFS before the DB row is updated (its generated filename has to
 * exist before it can go in `data.image`); if the DB update then fails, the just-written
 * file is deleted so it isn't left orphaned. Once the update succeeds, the *previous* logo
 * file (if replaced) is deleted too, so replacing a logo doesn't leak storage indefinitely.
 */
export async function saveInvoiceSettings(formData) {
  const settings = await InvoiceTemplateManager.findByPk(SETTINGS_ROW_ID);
  if (!settings) return null;

  const previousImage = settings.image;
  const data = {
    address: formData.address || '',
    remitInformation: formData.remitInformation || '',
    tanInformation: formData.tanInformation || '',
    updatedDate: new Date(),
  };

  let writtenFilename = null;
  if (formData.imageFileName && formData.imageBase64) {
    writtenFilename = await writeLogoFile(formData.imageFileName, formData.imageBase64);
    data.image = writtenFilename;
  }

  try {
    await settings.update(data);
  } catch (error) {
    if (writtenFilename) await deleteLogoFile(writtenFilename);
    throw error;
  }

  if (writtenFilename && previousImage && previousImage !== writtenFilename) {
    await deleteLogoFile(previousImage);
  }

  return { id: settings.id };
}
