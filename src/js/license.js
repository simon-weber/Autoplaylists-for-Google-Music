'use strict';

const Auth = require('./auth');
const Utils = require('./utils');

const Reporting = require('./reporting');

const CWS_LICENSE_API_URL = 'https://www.googleapis.com/chromewebstore/v1.1/userlicenses/';
const DEVELOPER_ID_WHITELIST = { // eslint-disable-line no-unused-vars
  '103350848301234480355': true,  // me
};

// TODO update this before release
TRIAL_MIN_ISSUE_MS = moment('2017-09-30').valueOf();

exports.FREE_PLAYLIST_COUNT = 1;
exports.FREE_PLAYLIST_REPR = 'one playlist';
exports.FREE_TRIAL_DAYS = 7;

exports.isLocked = function isLocked(playlistId, playlists) {
  // Promise a bool.
  return new Promise(resolve => {
    exports.hasFullVersion(false, resolve);
  }).then(hasFullVersion => {
    if (hasFullVersion) {
      return false;
    }

    let locked = true;
    for (let i = 0; i < playlists.length; i++) {
      if (i > (exports.FREE_PLAYLIST_COUNT - 1)) {
        break;
      }
      if (playlists[i].localId === playlistId) {
        locked = false;
        break;
      }
    }
    return locked;
  });
};

function isDeveloper(callback) {
  // Callback a truthy value for whether the current user is a developer.
  chrome.management.getSelf(extensionInfo => {
    if (extensionInfo.installType === 'development') {
      return callback(true);
    }

    chrome.identity.getProfileUserInfo(userInfo => {
      const isDev = DEVELOPER_ID_WHITELIST[userInfo.id];
      console.log('user id:', userInfo.id, 'isDev:', isDev);
      return callback(isDev);
    });
  });
}

exports.getDevStatus = function getDevStatus(callback) {
  // Callback an object with isDev and isFullForced fields.

  const devStatus = {isDev: false, isFullForced: false};

  isDeveloper(isDev => {
    devStatus.isDev = isDev;

    if (!isDev) {
      return callback(devStatus);
    }

    chrome.storage.local.get('devForceFullLicense', Utils.unlessError(items => {
      devStatus.isFullForced = items.devForceFullLicense;
      callback(devStatus);
    }));
  });
};

exports.setFullForced = function setFullForced(enabled, callback) {
  chrome.storage.local.set({devForceFullLicense: enabled}, Utils.unlessError(() => {
    console.log('wrote fullForced to', enabled);
    callback();
  }));
};

function cacheLicense(interactive, callback) {
  // Retrieve and callback a cachedLicense, or null if we can't right now.

  Auth.getToken(interactive, 'license', token => {
    if (!token) {
      return callback(null);
    }

    const req = new XMLHttpRequest();
    req.open('GET', CWS_LICENSE_API_URL + chrome.runtime.id);
    req.setRequestHeader('Authorization', `Bearer ${token}`);
    req.onreadystatechange = () => {
      if (req.readyState === 4) {
        let response;
        try {
          response = JSON.parse(req.responseText);
        } catch (e) {
          console.warn('invalid response from license');
          Reporting.Raven.captureException(e, {
            level: 'warning',
            extra: {req},
          });
          return callback(null);
        }

        console.info('got license response:', response);
        if (response.error) {
          // The token was likely invalid.
          Reporting.Raven.captureMessage('license api error response', {
            level: 'warning',
            extra: {response, interactive},
          });
          chrome.identity.removeCachedAuthToken({token});
          callback(null);
        } else {
          const expiration = new Date();
          // maxAgeSecs is sometimes very short (eg 2), so set a minimum of 30m.
          expiration.setSeconds(expiration.getSeconds() + response.maxAgeSecs + (60 * 30));
          const expirationMs = expiration.getTime();
          const cachedLicense = {license: response, expirationMs};
          chrome.storage.sync.set({cachedLicense}, Utils.unlessError(() => {
            console.log('cached license', cachedLicense);
          }));
          callback(cachedLicense);
        }
      }
    };
    req.send();
  });
}

function checkCachedLicense(cachedLicense) {
  const hasFull = cachedLicense !== null && cachedLicense.license.accessLevel === 'FULL';
  return hasFull;
}

function getCachedLicense(callback) {
  // Callback a license, or null if one hasn't been cached.

  chrome.storage.sync.get('cachedLicense', Utils.unlessError(items => {
    console.log('got cached license', items);
    if ('cachedLicense' in items) {
      const cachedLicense = items.cachedLicense;
      if (!cachedLicense.expirationMs) {
        // Hanldle migration from old expiration field.
        cachedLicense.expirationMs = 0;
      }
      callback(cachedLicense);
    } else {
      callback(null);
    }
  }));
}

exports.getLicense = function getLicense(interactive, callback) {
  // Callback a cached license, or null if one is not available.
  // hasFullVersion should be used instead when interested in the version status.
  // A cached license looks like:
  //   {
  //     "expirationMs": int, // ms since epoch after which license should be re-queried from api
  //     "license": {
  //       "kind": "chromewebstore#license",
  //       "itemId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  //       "createdTime": "1377660091254",
  //       "result": true,
  //       "accessLevel": "FULL",
  //       "maxAgeSecs": "2052"
  //     }
  //   }
  if (interactive) {
    // Always invalidate the cache on interactive checks.
    console.log('invalidating cached license for interative check');
    cacheLicense(interactive, cachedLicense => {
      callback(cachedLicense);
    });
  } else {
    getCachedLicense(cachedLicense => {
      if (cachedLicense === null || cachedLicense.expirationMs < new Date().getTime()) {
        cacheLicense(interactive, newCachedLicense => {
          callback(newCachedLicense);
        });
      } else {
        callback(cachedLicense);
      }
    });
  }
};

exports.hasFullVersion = function hasFullVersion(interactive, callback) {
  // Callback a truthy value. Truthy can signal a purchase or an active trial.

  exports.getDevStatus(devStatus => {
    if (devStatus.isFullForced) {
      return callback(true);
    }

    exports.getLicense(interactive, cachedLicense => {
      callback(checkCachedLicense(cachedLicense));
    });
  });
};

exports.getLicenseStatus = function getLicenseStatus(interactive, callback) {
  // Callback one of 'FULL', 'FULL_FORCED', 'FREE_TRIAL', 'FREE_TRIAL_EXPIRED', or 'NONE'.
  // Adapted from https://developer.chrome.com/webstore/one_time_payments#trial-limited-time.

  exports.getDevStatus(devStatus => {
    if (devStatus.isFullForced) {
      return callback('FULL_FORCED');
    }

    exports.getLicense(interactive, cachedLicense => {
      const license = cachedLicense.license;
      let licenseStatus = 'NONE';

      if (license && license.accessLevel == "FULL") {
        licenseStatus = "FULL";
      } else if (license && license.accessLevel == "FREE_TRIAL") {
        let issueMs = parseInt(license.createdTime, 10);
        if (issueMs < TRIAL_MIN_ISSUE_MS) {
          // Give the free trial to existing unpaid users who missed it.
          issueMs = TRIAL_MIN_ISSUE_MS;
        }

        const msSinceIssued = Date.now() - issueMs;
        const daysSinceIssued = msSinceIssued / 1000 / 60 / 60 / 24;
        if (daysSinceIssued <= TRIAL_PERIOD_DAYS) {
          licenseStatus = "FREE_TRIAL";
        } else {
          licenseStatus = "FREE_TRIAL_EXPIRED";
        }
      } else {
        console.warn('No license ever issued.');
      }

      console.log('license status', licenseStatus);
      callback(licenseStatus);
    });
  });
};
