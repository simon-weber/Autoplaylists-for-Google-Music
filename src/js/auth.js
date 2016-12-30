'use strict';

const Reporting = require('./reporting');

const TOKEN_VERIFY_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo';
const EXPECTED_SCOPE = 'https://www.googleapis.com/auth/chromewebstore.readonly https://www.googleapis.com/auth/skyjam';

exports.getToken = function getToken(interactive, reason, callback) {
  // On success, callback a token; on failure, callback null.
  //
  // When interactive, Chrome's token cache will be cleared first.
  // reason is used to report the result to GA.
  //
  // When not interactive, consider calling verifyToken before assuming token validity.

  const label = reason + (interactive ? 'I' : 'N');

  if (interactive) {
    chrome.identity.getAuthToken({interactive: false}, token => {
      if (token) {
        console.info('clearing cached token', token);
        chrome.identity.removeCachedAuthToken({token}, () => {
          _getToken(interactive, label, callback);
        });
      } else {
        _getToken(interactive, label, callback);
      }
    });
  } else {
    _getToken(interactive, label, callback);
  }
};

function _getToken(interactive, label, callback) {
  chrome.identity.getAuthToken({interactive}, token => {
    if (token) {
      Reporting.reportAuth('valid', label);
    } else {
      console.log('not authorized', label, chrome.runtime.lastError);
      Reporting.reportAuth('invalid', label);
    }

    callback(token || null);
  });
}

exports.verifyToken = function verifyToken(token, callback) {
  // Callback token if it's valid.
  // If it's not, revoke the token cache and callback null.
  if (token === null) {
    return callback(null);
  }

  const req = new XMLHttpRequest();
  req.open('GET', `${TOKEN_VERIFY_URL}?access_token=${token}`);
  req.onreadystatechange = () => {
    if (req.readyState === 4) {
      let response;
      try {
        response = JSON.parse(req.responseText);
      } catch (e) {
        console.warn('invalid response from token; revoking');
        Reporting.Raven.captureException(e, {
          level: 'warning',
          extra: {req},
        });
        chrome.identity.removeCachedAuthToken({token});
        return callback(null);
      }

      console.info('got verifyToken response:', response);
      if (response.scope === EXPECTED_SCOPE) {
        callback(token);
      } else {
        console.warn('invalid token detected; revoking');
        chrome.identity.removeCachedAuthToken({token});
        callback(null);
      }
    }
  };
  req.send();
};
