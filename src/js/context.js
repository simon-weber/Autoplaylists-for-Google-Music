'use strict';

const License = require('./license');
const Storage = require('./storage');

exports.get = function get(callback) {
  // Callback an object with user and tags keys for use with Raven.
  chrome.identity.getProfileUserInfo(userInfo => {
    chrome.management.getSelf(extensionInfo => {
      License.getDevStatus(devStatus => {
        License.getLicenseStatus(false, licenseStatus => {
          Storage.getOrCreateReportingUUID(reportingUUID => {
            callback({
              reportingUUID,
              user: userInfo,
              tags: {
                isDeveloper: devStatus.isDev,
                isFullForced: devStatus.isFullForced,
                hasFullVersion: licenseStatus.hasFullVersion,
                installType: extensionInfo.installType,
                licenseState: licenseStatus.state,
              },
            });
          });
        });
      });
    });
  });
};
