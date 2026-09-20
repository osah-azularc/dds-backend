/**
 * Helper functions for generating PDF sections
 */

import { escapeHtml } from '../utilities/htmlEscape.js';

/**
 * Generate person section HTML
 * @param {String} title - Section title
 * @param {Object} person - Person data
 * @param {String} agencyRefNumber - Agency reference number
 * @returns {String} - HTML content
 */
export function generatePersonSection(title, person, agencyRefNumber) {
  return `
        <h3 style="font-family: 'Roboto', sans-serif; font-size: 16px; font-weight: bold; margin: 20px 0 5px 0; padding: 0 5px; display: table; width: 100%;">${escapeHtml(title)}</h3>
        <div style="display: table; width: 100%; margin: 0;">
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Last Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.lastName || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">First Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.firstName || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Middle Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.middleName || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Licence Number</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(agencyRefNumber || '')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 50%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Address Line 1</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.address1 || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 50%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Address Line 2</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.address2 || '')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">City</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.city || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">State</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.state || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Zip Code</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.zip || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Phone</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.phone || '-')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Email</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.email || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Fax</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(person.fax || '-')}</h4>
                    </div>
                </div>
            </div>
        </div>
        <hr/>`;
}

/**
 * Generate attorney section HTML
 * @param {String} title - Section title
 * @param {Object} attorney - Attorney data
 * @returns {String} - HTML content
 */
export function generateAttorneySection(title, attorney) {
  return `
        <h3 style="font-family: 'Roboto', sans-serif; font-size: 16px; font-weight: bold; margin: 20px 0 5px 0; padding: 0 5px; display: table; width: 100%;">${escapeHtml(title)}</h3>

        <div style="display: table; width: 100%; margin: 0;">
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Last Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.lastName || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">First Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.firstName || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Middle Name</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.middleName || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">GA Bar #</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.attorneyBar || attorney.AttorneyBar || '-')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 50%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Address Line 1</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.address1 || '')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 50%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Address Line 2</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.address2 || '')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">City</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.city || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">State</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.state || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Zip Code</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.zip || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Phone</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.phone || '-')}</h4>
                    </div>
                </div>
            </div>
            <div style="display: table; width: 100%; margin: 0;">
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Email</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.email || '-')}</h4>
                    </div>
                </div>
                <div style="float: left; width: 25%; margin: 0 0 10px 0;">
                    <div style="padding: 0 5px;">
                        <span style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: normal; margin: 0 0 10px 0; display: table; width: 100%;">Fax</span>
                        <h4 style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: bold; margin: 0; width: 100%;">${escapeHtml(attorney.fax || '-')}</h4>
                    </div>
                </div>
            </div>
        </div>
        <hr/>`;
}

