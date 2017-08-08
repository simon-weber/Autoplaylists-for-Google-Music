'use strict';

const Utils = require('./utils');
const Reporting = require('./reporting');

const START_TIME_MS = new Date().getTime();
const MIN_RELOAD_TIME_MS = 1000 * 60 * 10;  // 10m

// Internal health checks and monitoring.

// Promise a bool, true if this is an ok time to reload.
function safeToReload() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({url: 'chrome-extension://blbompphddfibggfmmfcgjjoadebinem/*'}, Utils.unlessError(tabs => {
      let safe = true;
      const sessionTime = new Date().getTime() - START_TIME_MS;
      if (tabs.length !== 0) {
        console.info('not safe to reload: manager active');
        safe = false;
      } else if (sessionTime < MIN_RELOAD_TIME_MS) {
        console.info('not safe to reload: too soon after load', sessionTime / 1000);
        safe = false;
      }
      resolve(safe);
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
      console.info('deauth reload requested, but not safe time; not reloading');
      Reporting.reportReload('failure', 'deauth');
    }
  });
};
