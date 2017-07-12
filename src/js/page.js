'use strict';

const Utils = require('./utils');
const Reporting = require('./reporting');

// Support interactions with the dom of a Google Music tab.
// Instead of a normal long-running content script, this is done by injecting one-time use code
// that responds via temporarily attached listeners.
// This allows for easy reloads of the extension (since the content script doesn't need to be reloaded as well).

// Promise the full response from the page.
// Rejections are typically a failure to communicate with the tab.
function makePageQuery(action, tabId) {
  // Eventually this should replace the tab id, but I want to first find out how often
  // the query finds more than one tab.
  chrome.tabs.query({url: '*://play.google.com/music/*'}, Utils.unlessError(tabs => {
    console.debug('tab query yields', JSON.stringify(tabs, null, '\t'));
    Reporting.reportTabQuery('success', tabs.length);
  }, e => {
    console.warn('tab query failed', e);
    Reporting.Raven.captureMessage('tab query failed', {
      level: 'warning',
      extra: {action, tabId, e},
    });
    Reporting.reportTabQuery('failure');
  }));

  const scriptId = Date.now();

  return new Promise((resolve, reject) => {
    const listener = response => {
      if (response.action !== 'postPageResponse' || response.contentScriptId !== scriptId) {
        console.debug('page query listener ignoring', response, response.contentScriptID, scriptId);
        return;
      }

      chrome.runtime.onMessage.removeListener(listener);
      resolve(response);
    };

    chrome.runtime.onMessage.addListener(listener);

    const config = {
      action,
      id: scriptId,
    };

    const handleError = error => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(error);
    };

    // Adapted from https://stackoverflow.com/a/17591250, this works since repeated calls
    // execute in the same context.
    // I have no idea why that doesn't break more stuff, though.
    chrome.tabs.executeScript(tabId, {
      code: `config = ${JSON.stringify(config)};`,
    }, Utils.unlessError(() => {
      chrome.tabs.executeScript(tabId, {
        file: 'js-built/querypage.js',
      }, Utils.unlessError(() => console.log('injected query', action, tabId), handleError));
    }, handleError));
  });
}

// Promise the value of the xt cookie.
exports.getXsrf = function getXsrf(tabId) {
  return makePageQuery('getUserInfo', tabId)
  .then(response => response.xt);
};

// Promise an object with keys: tier, xt, gaiaId, userid, userIndex.
exports.getUserInfo = function getUserInfo(tabId) {
  return makePageQuery('getUserInfo', tabId)
  .then(response => ({
    tier: response.tier,
    xt: response.xt,
    gaiaId: response.gaiaId,
    userId: response.userId,
    userIndex: response.userIndex,
  }));
};

// Promise an object with gtracks (a list of jsproto tracks)
// and timestamp keys from the local indexedDb.
// Either may be null.
exports.getLocalTracks = function getLocalTracks(tabId) {
  return makePageQuery('getLocalTracks', tabId)
  .then(response => ({
    gtracks: response.gtracks,
    timestamp: response.timestamp,
  }));
};
