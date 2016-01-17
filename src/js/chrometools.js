'use strict';

const Qs = require('qs');

function unlessError(func) {
  // Decorate chrome callbacks to notice errors.
  return function unlessErrorWrapper() {
    // can't use an arrow function here because we need our own `this`.
    if (chrome.extension.lastError) {
      console.error('unlessError:', chrome.extension.lastError.message);
    } else {
      func.apply(this, arguments);
    }
  };
}

// FIXME unlessError should be used everywhere we use chrome.
exports.unlessError = unlessError;

exports.focusOrCreateExtensionTab = function focusOrCreateExtensionTab(url) {
  chrome.tabs.query({url}, tabs => {
    if (tabs.length) {
      chrome.tabs.update(tabs[0].id, {selected: true});
    } else {
      chrome.tabs.create({url, selected: true});
    }
  });
};

exports.goToManager = function goToManager(userId) {
  window.location.href = '/html/playlists.html?' + Qs.stringify({userId});
};
