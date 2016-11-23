'use strict';

const Reporting = require('./reporting');

exports.getToken = function getToken(interactive, reason, callback) {
  // On success, callback a token; on failure, callback null.
  // reason is used to report the result to GA.
  // When interactive, Chrome's token cache will be cleared first.

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
