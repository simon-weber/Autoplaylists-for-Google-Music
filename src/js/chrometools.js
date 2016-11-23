'use strict';

const Qs = require('qs');

const Reporting = require('./reporting');

function unlessError(func, onError) {
  // Decorate chrome callbacks to notice errors.
  // If an error occurs, call onError.

  return function unlessErrorWrapper() {
    // can't use an arrow function here because we need our own `this`.
    if (chrome.extension.lastError) {
      console.error('unlessError:', chrome.extension.lastError.message);
      Reporting.Raven.captureMessage(chrome.extension.lastError.message, {
        tags: {
          funcName: func.name,
        },
        extra: {
          func,
          location: 'chrometools.unlessError',
          error: chrome.extension.lastError,
          this: this,
          arguments: arguments,  // eslint-disable-line object-shorthand
        },
        stacktrace: true,
      });
      if (typeof onError !== 'undefined') {
        onError(chrome.extension.lastError);
      }
    } else {
      func.apply(this, arguments);
    }
  };
}

exports.unlessError = unlessError;

exports.focusOrCreateExtensionTab = function focusOrCreateExtensionTab(url) {
  chrome.tabs.create({url, active: true}, unlessError(t => console.debug('created', t)));

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
