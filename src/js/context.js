'use strict';

const License = require('./license.js');
const Storage = require('./storage.js');

exports.get = function get(callback) {
  // Callback an object with user and tags keys for use with Raven.
  chrome.identity.getProfileUserInfo(userInfo => {
    chrome.management.getSelf(extensionInfo => {
      License.getDevStatus(devStatus => {
        License.hasFullVersion(false, hasFullVersion => {
          Storage.getOrCreateReportingUUID(reportingUUID => {
            callback({
              reportingUUID,
              user: userInfo,
              tags: {
                isDeveloper: devStatus.isDev,
                isFullForced: devStatus.isFullForced,
                hasFullVersion,
                installType: extensionInfo.installType,
              },
            });
          });
        });
      });
    });
  });
};
