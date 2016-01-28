'use strict';

const Chrometools = require('./chrometools.js');

const storeItemId = 'blbompphddfibggfmmfcgjjoadebinem';

exports.isDev = function isDev() {
  return chrome.runtime.id !== storeItemId;
};

exports.setFullForced = function setFullForced(enabled, callback) {
  chrome.storage.local.set({devForceFullLicense: enabled}, Chrometools.unlessError(items => {
    console.log('wrote fullForced', items);
    callback();
  }));
};

exports.isFullForced = function isFullForced(callback) {
  // Callback a truthy value.

  if (!exports.isDev()) {
    return callback(false);
  }

  chrome.storage.local.get('devForceFullLicense', Chrometools.unlessError(items => {
    callback(items.devForceFullLicense);
  }));
};

exports.fetch = function fetch(callback) {
  // Callback a chrome license object.

  exports.isFullForced(forced => {
    if (forced) {
      return callback({
        kind: 'chromewebstore#license',
        itemId: chrome.runime.id,
        createdTime: '1453982717000',
        result: true,
        accessLevel: 'FULL',
        maxAgeSecs: '1337',
      });
    }

    // TODO cache in sync storage
    callback({
      kind: 'chromewebstore#license',
      itemId: chrome.runime.id,
      createdTime: '1453982717000',
      result: true,
      accessLevel: 'TRIAL',
      maxAgeSecs: '1337',
    });
  });
};
