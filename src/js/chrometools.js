'use strict';

const Qs = require('qs');

const Reporting = require('./reporting.js');

function unlessError(func) {
  // Decorate chrome callbacks to notice errors.
  return function unlessErrorWrapper() {
    // can't use an arrow function here because we need our own `this`.
    if (chrome.extension.lastError) {
      console.error('unlessError:', chrome.extension.lastError.message);
      Reporting.Raven.captureMessage(chrome.extension.lastError.message, {
        extra: {location: 'chrometools.unlessError'},
      });
    } else {
      func.apply(this, arguments);
    }
  };
}

// FIXME unlessError should be used everywhere we use chrome.
exports.unlessError = unlessError;

exports.focusOrCreateExtensionTab = function focusOrCreateExtensionTab(url) {
  chrome.tabs.create({url, active: true}, unlessError(t => console.log('created', t)));

  // There seems to be a bug in Chrome preventing tabs.query from working as expected.
  // chrome.tabs.query({url}, unlessError(tabs => {
  //   console.info('tab query for', url, 'yields', JSON.stringify(tabs, null, '\t'));
  //   if (tabs.length) {
  //     chrome.tabs.update(tabs[0].id, {active: true}, unlessError(t => console.log('selected', t)));
  //   } else {
  //     chrome.tabs.create({url, active: true}, unlessError(t => console.log('created', t)));
  //   }
  // }));
};

exports.goToManager = function goToManager(userId) {
  window.location.href = `/html/playlists.html?${Qs.stringify({userId})}`;
};
