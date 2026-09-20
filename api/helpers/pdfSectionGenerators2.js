/**
 * Additional PDF section generators
 */

import { escapeHtml } from '../utilities/htmlEscape.js';

/**
 * Generate agency case worker section HTML
 * @param {String} title - Section title
 * @param {Object} worker - Worker data
 * @returns {String} - HTML content
 */
export function generateAgencyCaseWorkerSection(title, worker) {
  return `
        <h3 style="font-family: 'Roboto', sans-serif; font-size: 16px; font-weight: bold; margin: 10px 0 5px 0; padding: 0 5px; display: table; width: 100%;">${escapeHtml(title)}</h3>
        <div style="display: table; width: 100%; margin: 0;">
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Last Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.lastName || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">First Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.firstName || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Middle Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.middleName || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Title</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.title || '')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 50%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Address Line 1</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.address1 || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 50%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Address Line 2</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.address2 || '')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">City</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.city || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">State</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.state || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Zip Code</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.zip || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Phone</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.phone || '-')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Email</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.email || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Fax</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(worker.fax || '-')}</h4>
                    </div>
                </div>
            </div>
        </div>
        <hr/>`;
}

/**
 * Generate minor section HTML
 * @param {Object} minor - Minor data
 * @returns {String} - HTML content
 */
export function generateMinorSection(minor) {
  const isNewOfficer = minor.is_new_officer === '1' ? 'Yes' : 'No';

  return `
        <h3 style="font-family: 'Roboto', sans-serif; font-size: 16px; font-weight: bold; margin: 10px 0 5px 0; padding: 0 5px; display: table; width: 100%;">Minor Information</h3>
        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 10px 0 10px 0; padding: 0 5px; display: table; width: 100%;">Is this a new party or new address? <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 0 10px;">${isNewOfficer}</span></h4>
        <div style="display: table; width: 100%; margin: 0;">
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Last Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(minor.lastName || '')}</h4>
                    </div>
                </div>

                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">First Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(minor.firstName || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Middle Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(minor.middleName || '-')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 50%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Address Line 1</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(minor.address1 || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 50%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Address Line 2</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(minor.address2 || '')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">City</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(minor.city || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">State</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(minor.state || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Zip Code</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(minor.zip || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Phone</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(minor.phone || '-')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Email</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(minor.email || '-')}</h4>
                    </div>
                </div>
            </div>
        </div>
        <hr/>`;
}
