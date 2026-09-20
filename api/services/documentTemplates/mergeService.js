/**
 * mergeService.js
 *
 * Applies resolved merge-field values to a DOCX buffer using docxtemplater.
 * Returns the original buffer unchanged when caseId is absent or on any error,
 * preserving backward compatibility with callers that omit caseId.
 *
 * Token format: ${ValueN} (legacy OSAH format stored in document_template_fields_catalog.display_name)
 * Mapping:      document_template_fields_catalog  field_key → display_name → token_name
 * Unknown or unresolved tokens are kept as-is in the output document.
 */

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import DocumentTemplateFieldsCatalog from '../../models/DocumentTemplateFieldsCatalog.js';
import { buildCaseContext } from './contextBuilder/caseContextBuilderService.js';
import { resolveFields } from './resolvers/resolverEngine.js';

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Extracts the bare token name from a legacy display_name string.
 * '${Values1}' → 'Values1'    '${Value2}' → 'Value2'
 * Returns null for non-matching input.
 * @param {string} displayName
 * @returns {string|null}
 */
const extractTokenName = (displayName) => {
  if (!displayName || typeof displayName !== 'string') return null;
  const match = displayName.match(/^\$\{(.+)\}$/);
  return match ? match[1] : null;
};

/**
 * Queries document_template_fields_catalog and returns a map of
 * field_key → token_name for all active rows with a valid ${...} display_name.
 * e.g. { docket_number: 'Value2', petitioner_name: 'Values1', ... }
 * @returns {Promise<Record<string, string>>}
 */
const loadCatalogMap = async () => {
  const rows = await DocumentTemplateFieldsCatalog.findAll({
    attributes: ['fieldKey', 'displayName'],
    where: { isActive: true },
    raw: true,
  });
  const map = {};
  for (const row of rows) {
    const tokenName = extractTokenName(row.displayName);
    if (tokenName) map[row.fieldKey] = tokenName;
  }
  return map;
};

/**
 * docxtemplater parser that preserves ${tag} when the resolved value is
 * absent or empty, keeping unresolved tokens visible in the output document.
 */
const preservingParser = (tag) => ({
  get: (data) => {
    const value = data[tag];
    if (value === undefined || value === null || value === '') return `\${${tag}}`;
    return value;
  },
});

// ─── Line-break post-processor ───────────────────────────────────────────────
// Converts \n inside <w:t> text nodes to <w:br/> elements so multiline values
// (e.g. Value29 mailing list) render as real line breaks in the output PDF.
// Uses DOM Level 2 APIs only — xmldom does not support .remove() or .before().

const applyLineBreaksInXml = (xmlDoc) => {
  const texts = Array.from(xmlDoc.getElementsByTagName('w:t'));
  for (const textEl of texts) {
    const content = textEl.textContent;
    if (!content.includes('\n')) continue;
    const parts = content.split('\n');
    const parent = textEl.parentNode;
    const next = textEl.nextSibling;
    parent.removeChild(textEl); // NOSONAR — xmldom does not implement ChildNode.remove()
    parts.forEach((part, idx) => {
      if (idx > 0) {
        const br = xmlDoc.createElement('w:br');
        next ? parent.insertBefore(br, next) : parent.appendChild(br); // NOSONAR
      }
      const t = xmlDoc.createElement('w:t');
      t.setAttribute('xml:space', 'preserve');
      t.textContent = part;
      next ? parent.insertBefore(t, next) : parent.appendChild(t); // NOSONAR
    });
  }
};

// ─── Exported function ────────────────────────────────────────────────────────

/**
 * Merges resolved case-field values into a DOCX buffer.
 *
 * Catalog fields are resolved automatically from document_template_fields_catalog.
 * extraMergeData is merged on top — use it for document-specific fields not in the
 * catalog (e.g. NOH CMA details, location, mailing list) and to override catalog
 * values where the format differs.
 *
 * - When caseId is falsy: returns docxBuffer unchanged (no-op).
 * - On error: throws when throwOnError=true, otherwise returns docxBuffer unchanged.
 * - On success: returns a new Buffer with all ${ValueN} tokens replaced and \n
 *   converted to <w:br/> for multiline values.
 *
 * @param {Buffer}        docxBuffer      - Raw DOCX file content
 * @param {number|string} caseId          - Docket case ID; optional
 * @param {Object}        extraMergeData  - Additional / override merge fields
 * @param {Object}        options
 * @param {boolean}       options.throwOnError - Throw on failure instead of returning original buffer
 * @param {Array<{source: string, id: string|number}>} [options.selectedMailerParties] - Docket Mailer List selection; forwarded to buildCaseContext so ${Address1}-${Address6} reflect exactly these parties instead of the default Respondent/Petitioner/Officer set
 * @returns {Promise<Buffer>}
 */
export async function applyMergeFields(docxBuffer, caseId, extraMergeData = {}, { throwOnError = false, selectedMailerParties } = {}) {
  if (!caseId) return docxBuffer;

  try {
    const parsedId = parseInt(caseId, 10);

    // Load catalog mapping and case context concurrently
    const [catalogMap, context] = await Promise.all([
      loadCatalogMap(),
      buildCaseContext(parsedId, { selectedMailerParties }),
    ]);

    // Resolve all catalog field_keys; unknown keys return '' from resolverEngine
    const resolvedData = await resolveFields(Object.keys(catalogMap), context);

    // Build merge data from catalog; extraMergeData overrides catalog values
    const mergeData = {};
    for (const [fieldKey, tokenName] of Object.entries(catalogMap)) {
      mergeData[tokenName] = resolvedData[fieldKey] ?? '';
    }
    const finalMergeData = { ...mergeData, ...extraMergeData };

    const zip = new PizZip(docxBuffer);
    const doc = new Docxtemplater(zip, {
      delimiters: { start: '${', end: '}' },
      parser: preservingParser,
    });

    doc.render(finalMergeData);
    const renderedBuffer = doc.getZip().generate({ type: 'nodebuffer' });

    // Post-process: convert \n in text nodes to <w:br/> for multiline field values
    const jszip = await JSZip.loadAsync(renderedBuffer);
    const docXml = await jszip.file('word/document.xml').async('text');
    const xmlDoc = new DOMParser().parseFromString(docXml, 'text/xml');
    applyLineBreaksInXml(xmlDoc);
    jszip.file('word/document.xml', new XMLSerializer().serializeToString(xmlDoc));
    return await jszip.generateAsync({ type: 'nodebuffer' });
  } catch (err) {
    if (throwOnError) throw err;
    return docxBuffer;
  }
}
