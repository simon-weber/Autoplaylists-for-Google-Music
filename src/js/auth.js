'use strict';

const Reporting = require('./reporting');

const Gmoauth = require('./googlemusic_oauth');

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
        // Try a GM request.
        // TODO get a user here?
        Gmoauth.getConfig({'tier': 'fr'}).then(res => {
          console.log('token is authed, got config', res);
          Reporting.reportAuth('valid', 'configN');
          callback(token);
        }).catch(err => {
          if (err && (err.status === 401 || err.status === 403)) {
            console.error('valid token not authed for GM; revoking', err);
            chrome.identity.removeCachedAuthToken({token});
            Reporting.reportAuth('invalid', 'configN');
            callback(null);
          } else {
            console.warn('non-4xx config error response; treating as valid', err);
            Reporting.Raven.captureMessage('non-4xx config error response', {
              level: 'warning',
              extra: {err, response},
            });
            Reporting.reportAuth('unknown', 'configN');
            callback(token);
          }
        });
      } else {
        console.warn('invalid token detected; revoking');
        chrome.identity.removeCachedAuthToken({token});
        callback(null);
      }
    }
  };
  req.send();
};
