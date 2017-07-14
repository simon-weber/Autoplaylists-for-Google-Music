'use strict';

const Utils = require('./utils');
const Reporting = require('./reporting');

// Internal health checks and monitoring.

// Promise a bool, true if this is an ok time to reload.
function safeToReload() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({url: 'chrome-extension://blbompphddfibggfmmfcgjjoadebinem/*'}, Utils.unlessError(tabs => {
      resolve(tabs.length === 0);
    }, e => {
      reject(e);
    }));
  });
}

exports.handleDeauth = function handleDeauth() {
  safeToReload().then(isSafe => {
    if (isSafe) {
      console.warn('deauth reload in 10s!');
      Reporting.reportReload('success', 'deauth');
      setTimeout(chrome.runtime.reload, 10000);
    } else {
      console.info('deauth reload requested, but manager in use; not reloading');
      Reporting.reportReload('failure', 'deauth');
    }
  });
};
