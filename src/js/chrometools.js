'use strict';

function unlessError(func) {
  // Decorate chrome callbacks to notice errors.
  return function unlessErrorWrapper() {
    // can't use an arrow function here because we need our own `this`.
    if (chrome.extension.lastError) {
      console.error(chrome.extension.lastError.message);
    } else {
      func.apply(this, arguments);
    }
  };
}

// FIXME unlessError should be used everywhere
exports.unlessError = unlessError;

exports.focusOrCreateTab = function focusOrCreateTab(url) {
  chrome.windows.getAll({populate: true}, windows => {
    let existingTab = null;
    for (const i in windows) {
      const tabs = windows[i].tabs;
      for (const j in tabs) {
        const tab = tabs[j];
        if (tab.url === url) {
          existingTab = tab;
          break;
        }
      }
    }

    if (existingTab) {
      chrome.tabs.update(existingTab.id, {selected: true});
    } else {
      chrome.tabs.create({url, selected: true});
    }
  });
};
