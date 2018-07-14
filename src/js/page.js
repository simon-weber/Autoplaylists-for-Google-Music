'use strict';

const Utils = require('./utils');
const Reporting = require('./reporting');

// Support interactions with the dom of a Google Music tab.
// Instead of a normal long-running content script, this is done by injecting one-time use code
// that responds via temporarily attached listeners.
// This allows for easy reloads of the extension (since the content script doesn't need to be reloaded as well).

// Promise a list of Tabs.
exports.getTabs = function getTabs() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({url: '*://play.google.com/music/*'}, Utils.unlessError(tabs => {
      console.debug('tab query yields', JSON.stringify(tabs, null, '\t'));
      resolve(tabs);
    }, e => {
      reject(e);
    }));
  });
};

// Promise the full response from the page.
// Rejections are typically a failure to communicate with the tab.
function makePageQuery(action) {
  return exports.getTabs().then(tabs => {
    Reporting.reportTabQuery('success', tabs.length);

    if (tabs.length === 0) {
      throw new Error('no tabs matched');
    }

    if (tabs.length > 1) {
      console.warn('found multiple tabs but using first');
    }

    return tabs[0].id;
  }).catch(e => {
    console.warn('tab query failed', e);
    Reporting.reportTabQuery('failure');
    throw e;
  }).then(tabId => _makePageQuery(action, tabId));
}

function _makePageQuery(action, tabId) {
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
exports.getXsrf = function getXsrf() {
  return makePageQuery('getUserInfo')
  .then(response => response.xt);
};

// Promise an object with keys: tier, xt, gaiaId, userid, userIndex.
exports.getUserInfo = function getUserInfo() {
  return makePageQuery('getUserInfo')
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
exports.getLocalTracks = function getLocalTracks() {
  return makePageQuery('getLocalTracks')
  .then(response => ({
    gtracks: response.gtracks,
    timestamp: response.timestamp,
  }));
};

// This is a bit weird.
// The problem is that we want to detect the first time Music tabs load,
// but tabs.onUpdated will fire much more often than that.
// This solves it by storing state on the tab (fixing first loads and refreshes)
// that also distinguishes between executions of the extension (fixing startup tabs on extension reloads).

// Promise a truthy value if the tab has been init before.
// id must be an int.
exports.checkInit = function checkInit(tabId, id) {
  return new Promise(resolve => {
    chrome.tabs.executeScript(tabId, {
      code: `window._AUTOPLAYLISTS_INIT === ${id}`,
    }, Utils.unlessError(frameResults => resolve(frameResults[0])));
  });
};

// Promise nothing after marking the page as init.
// id must be an int.
exports.setInit = function checkInit(tabId, id) {
  return new Promise(resolve => {
    chrome.tabs.executeScript(tabId, {
      code: `window._AUTOPLAYLISTS_INIT = ${id}`,
    }, Utils.unlessError(resolve));
  });
};
