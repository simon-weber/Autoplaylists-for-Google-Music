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

// Promise a list of messages from the page.
// Rejections are typically a failure to communicate with the tab.
function makePageQuery(action, expectSingleton) {
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
  }).then(tabId => _makePageQuery(action, tabId))
  .then(messages => {
    if (expectSingleton && messages.length !== 1) {
      throw new Error(`expected one message from ${action}, got ${messages.length}`);
    }
    return messages;
  });
}

function _makePageQuery(action, tabId) {
  // Run a script that looks at the page (through another script, see
  //  https://www.simonmweber.com/2013/06/05/chrome-extension-hacks.html).
  // Promise a list of messages received over the port.
  const scriptId = `${Date.now()}-${Math.random()}`;

  return new Promise((resolve, reject) => {
    const portListener = port => {
      if (port.name !== scriptId) {
        console.debug('page query portListener ignoring connect for', port, scriptId);
        return;
      }

      chrome.runtime.onConnect.removeListener(portListener);

      const messages = [];
      let sawFinalMessage = false;

      port.onMessage.addListener(message => {
        messages.push(message);
        if (message.isFinal) {
          sawFinalMessage = true;
        }
      });
      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError || !sawFinalMessage) {
          console.error('unexpected port disconnect:', action, chrome.runtime.lastError, sawFinalMessage, messages);
          Reporting.Raven.captureMessage('unexpected port disconnect', {
            extra: {
              action,
              messages,
              sawFinalMessage,
              error: chrome.runtime.lastError,
            },
            stacktrace: true,
          });
          reject(new Error('unexpected port disconnection'));
        } else {
          console.info(`resolving ${action} with`, messages);
          resolve(messages);
        }
      });
    };

    chrome.runtime.onConnect.addListener(portListener);

    const config = {
      action,
      id: scriptId,
    };

    const handleError = error => {
      chrome.runtime.onConnect.removeListener(portListener);
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
  return makePageQuery('getUserInfo', true)
  .then(messages => messages[0].xt);
};

// Promise an object with keys: tier, xt, gaiaId, userid, userIndex.
exports.getUserInfo = function getUserInfo() {
  return makePageQuery('getUserInfo', true)
  .then(messages => ({
    tier: messages[0].tier,
    xt: messages[0].xt,
    gaiaId: messages[0].gaiaId,
    userId: messages[0].userId,
    userIndex: messages[0].userIndex,
  }));
};

// Promise an object with gtracks (a list of jsproto tracks)
// and timestamp keys from the local indexedDb.
// Either may be null.
exports.getLocalTracks = function getLocalTracks() {
  return makePageQuery('getLocalTracks', false)
  .then(messages => {
    let gtracks = [];
    let sawTracks = false;
    let timestamp = null;
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if ('timestamp' in message) {
        timestamp = message.timestamp;
      }
      if (message.gtracks) {
        sawTracks = true;
        for (let j = 0; j < message.gtracks.length; j++) {
          gtracks.push(message.gtracks[j]);
        }
      }
    }

    if (!sawTracks) {
      gtracks = null;
    }
    return {gtracks, timestamp};
  });
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
