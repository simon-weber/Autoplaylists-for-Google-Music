'use strict';

const Auth = require('./auth');
const Chrometools = require('./chrometools');

const CWS_LICENSE_API_URL = 'https://www.googleapis.com/chromewebstore/v1.1/userlicenses/';
const DEVELOPER_ID_WHITELIST = { // eslint-disable-line no-unused-vars
  '103350848301234480355': true,  // me
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

    chrome.storage.local.get('devForceFullLicense', Chrometools.unlessError(items => {
      devStatus.isFullForced = items.devForceFullLicense;
      callback(devStatus);
    }));
  });
};

exports.setFullForced = function setFullForced(enabled, callback) {
  chrome.storage.local.set({devForceFullLicense: enabled}, Chrometools.unlessError(() => {
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
        const license = JSON.parse(req.responseText);
        console.info('got license:', license);

        const expiration = new Date();
        expiration.setSeconds(expiration.getSeconds() + license.maxAgeSecs);
        const cachedLicense = {license, expiration};
        chrome.storage.sync.set({cachedLicense}, Chrometools.unlessError(() => {
          console.log('cached license', cachedLicense);
        }));
        callback(cachedLicense);
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

  chrome.storage.sync.get('cachedLicense', Chrometools.unlessError(items => {
    console.log('got cached license', items);
    if ('cachedLicense' in items) {
      callback(items.cachedLicense);
    } else {
      callback(null);
    }
  }));
}

exports.hasFullVersion = function hasFullVersion(interactive, callback) {
  // Callback a truthy value.

  exports.getDevStatus(devStatus => {
    if (devStatus.isFullForced) {
      return callback(true);
    }

    if (interactive) {
      // Always invalidate the cache on interactive checks.
      console.log('invalidating cached license');
      cacheLicense(interactive, cachedLicense => {
        callback(checkCachedLicense(cachedLicense));
      });
    } else {
      getCachedLicense(cachedLicense => {
        if (cachedLicense === null || cachedLicense.expiration > new Date()) {
          cacheLicense(interactive, newCachedLicense => {
            callback(checkCachedLicense(newCachedLicense));
          });
        } else {
          callback(checkCachedLicense(cachedLicense));
        }
      });
    }
  });
};
