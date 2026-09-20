/**
 * CSV Escape Utility
 * Provides CSV escaping functionality to prevent CSV injection attacks
 * 
 * CSV Injection (Formula Injection) occurs when spreadsheet applications like Excel, 
 * LibreOffice Calc, or Google Sheets interpret cell values starting with special 
 * characters (=, +, -, @) as formulas and execute them.
 * 
 * This can lead to:
 * - Remote code execution
 * - Data exfiltration
 * - Malicious macro execution
 * 
 * References:
 * - OWASP: https://owasp.org/www-community/attacks/CSV_Injection
 * - CWE-1236: https://cwe.mitre.org/data/definitions/1236.html
 */

/**
 * Escape CSV values to prevent formula injection attacks
 * @param {*} value - Value to escape
 * @returns {String} - Escaped value safe from CSV injection
 * 
 * @example
 * escapeCsvValue('=1+1')        // Returns: '=1+1
 * escapeCsvValue('+SUM(A1:A10)') // Returns: '+SUM(A1:A10)
 * escapeCsvValue('@cmd|calc')   // Returns: '@cmd|calc
 * escapeCsvValue('Normal text') // Returns: Normal text
 * escapeCsvValue('Text, with comma') // Returns: "Text, with comma"
 */
export function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  let stringValue = String(value);

  // Prevent CSV formula injection by prefixing dangerous characters with single quote
  // Dangerous characters that can trigger formula execution:
  // = (equals)    - Formula start in Excel/Calc
  // + (plus)      - Formula start in some spreadsheet apps
  // - (minus)     - Formula start in some spreadsheet apps
  // @ (at)        - Formula start in Excel (implicit intersection operator)
  // \t (tab)      - Can be used to break out of cells
  // \r (carriage return) - Can be used for injection
  if (stringValue.length > 0) {
    const firstChar = stringValue[0];
    if (['=', '+', '-', '@', '\t', '\r'].includes(firstChar)) {
      stringValue = `'${stringValue}`;
    }
  }

  // Escape values containing special CSV characters (comma, quote, newline)
  // by wrapping in double quotes and escaping internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

