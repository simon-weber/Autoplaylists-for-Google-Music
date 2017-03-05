'use strict';

const Utils = require('./utils');

const Reporting = require('./reporting');


function playlistKey(userId, playlistLid) {
  return JSON.stringify(['playlist', userId, playlistLid]);
}

function isPlaylistKey(key) {
  return key.startsWith('["playlist');
}

function migrateToOne(items) {
  // Prep for multiple sorts by combining
  // sortBy/sortByOrder into an array of objects.

  /* eslint-disable no-param-reassign */
  for (const key in items) {
    if (isPlaylistKey(key)) {
      const sortBy = items[key].sortBy;
      const sortByOrder = items[key].sortByOrder;

      delete items[key].sortBy;
      delete items[key].sortByOrder;

      items[key].sorts = [{sortBy, sortByOrder}];
    }
  }
  /* eslint-enable no-param-reassign */

  return items;
}

function migrateToTwo(items) {
  // Enable new sync.

  /* eslint-disable no-param-reassign */
  items.newSyncEnabled = true;
  /* eslint-enable no-param-reassign */
  return items;
}

const SCHEMA_VERSION = 2;
const MIGRATIONS = [
  // Migrations receive all items and transform them.
  migrateToOne,
  migrateToTwo,
];

// Callback a bool.
exports.getBatchingEnabled = function getBatchingEnabled(callback) {
  chrome.storage.sync.get('batchingEnabled', Utils.unlessError(items => {
    callback(Boolean(items.batchingEnabled));
  }));
};

// batchingEnabled is a bool.
exports.setBatchingEnabled = function setBatchingEnabled(batchingEnabled, callback) {
  const storageItems = {};
  storageItems.batchingEnabled = batchingEnabled;

  chrome.storage.sync.set(storageItems, Utils.unlessError(callback));
};

// Callback a bool.
// Note that this is in local storage, since it's per machine.
exports.getShouldNotWelcome = function getShouldNotWelcome(callback) {
  chrome.storage.local.get('shouldNotWelcome', Utils.unlessError(items => {
    callback(Boolean(items.shouldNotWelcome));
  }));
};

// shouldNotWelcome is a bool.
exports.setShouldNotWelcome = function setShouldNotWelcome(shouldNotWelcome, callback) {
  const storageItems = {};
  storageItems.shouldNotWelcome = shouldNotWelcome;

  chrome.storage.local.set(storageItems, Utils.unlessError(callback));
};

// Callback an int.
exports.getSyncMs = function getSyncMs(callback) {
  chrome.storage.sync.get('syncMs', Utils.unlessError(items => {
    let syncMs = items.syncMs;

    if (!Number.isInteger(syncMs)) {
      syncMs = 60 * 1000 * 5;
      chrome.storage.sync.set({syncMs}, Utils.unlessError(() => {
        callback(syncMs);
      }));
    } else {
      callback(syncMs);
    }
  }));
};

// syncMs is an int of milliseconds.
exports.setSyncMs = function setSyncMs(syncMs, callback) {
  const storageItems = {};
  storageItems.syncMs = syncMs;

  chrome.storage.sync.set(storageItems, Utils.unlessError(callback));
};

exports.addSyncMsChangeListener = function addSyncMsChangeListener(callback) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
      for (const key in changes) {
        if (key === 'syncMs') {
          callback(changes[key]);
        }
      }
    }
  });
};

// Callback a ms timestamp.
exports.getLastPSync = function getLastPSync(callback) {
  chrome.storage.sync.get('lastPSync', Utils.unlessError(items => {
    let lastPSync = items.lastPSync;

    if (!Number.isInteger(lastPSync)) {
      lastPSync = 0;
      chrome.storage.sync.set({lastPSync}, Utils.unlessError(() => {
        console.info('init lastPSync to time 0');
        callback(lastPSync);
      }));
    } else {
      callback(lastPSync);
    }
  }));
};

exports.setLastPSync = function setLastPSync(lastPSync, callback) {
  const storageItems = {};
  storageItems.lastPSync = lastPSync;

  chrome.storage.sync.set(storageItems, Utils.unlessError(callback));
};


exports.getOrCreateReportingUUID = function getOrCreateReportingUUID(callback) {
  chrome.storage.sync.get('reportingUUID', Utils.unlessError(items => {
    let reportingUUID = items.reportingUUID;

    if (!reportingUUID) {
      reportingUUID = Utils.uuidV1();
      chrome.storage.sync.set({reportingUUID}, Utils.unlessError(() => {
        callback(reportingUUID);
      }));
    } else {
      callback(reportingUUID);
    }
  }));
};

exports.getPlaylist = function getPlaylist(userId, playlistLid, callback) {
  const key = playlistKey(userId, playlistLid);

  chrome.storage.sync.get(key, Utils.unlessError(items => {
    const playlist = items[key];
    callback(playlist);
  }));
};

exports.savePlaylist = function savePlaylist(playlist, callback) {
  const storageItems = {};
  storageItems[playlistKey(playlist.userId, playlist.localId)] = playlist;

  chrome.storage.sync.set(storageItems, Utils.unlessError(callback));
};

exports.deletePlaylist = function deletePlaylist(userId, playlistLid, callback) {
  chrome.storage.sync.remove(playlistKey(userId, playlistLid), Utils.unlessError(callback));
};

exports.addPlaylistChangeListener = function addPlaylistChangeListener(callback) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
      for (const key in changes) {
        if (isPlaylistKey(key)) {
          callback(changes[key]);
        }
      }
    }
  });
};

exports.getPlaylistsForUser = function getPlaylistsForUser(userId, callback) {
  chrome.storage.sync.get(null, Utils.unlessError(items => {
    const playlists = [];
    for (const key in items) {
      try {
        const parsedKey = JSON.parse(key);
        if (parsedKey[0] === 'playlist' && parsedKey[1] === userId) {
          playlists.push(items[key]);
        }
      } catch (e) {
        // eslint-disable-line no-empty
      }
    }

    Reporting.GATracker.set('dimension4', playlists.length);

    callback(playlists);
  }));
};

exports.importPlaylistsForUser = function importPlaylistsForUser(userId, playlists, callback) {
  exports.getPlaylistsForUser(userId, currentPlaylists => {
    // FIXME we should wait on all callbacks before calling back.
    for (let i = 0; i < currentPlaylists.length; i++) {
      exports.deletePlaylist(userId, currentPlaylists[i].localId, () => null);
    }

    for (let i = 0; i < playlists.length; i++) {
      console.log('saving', playlists[i]);
      if (i === playlists.length - 1) {
        exports.savePlaylist(playlists[i], callback);
      } else {
        exports.savePlaylist(playlists[i], () => null);
      }
    }
  });
};

exports.handleMigrations = function handleMigrations(callback) {
  chrome.storage.sync.get(null, Utils.unlessError(items => {
    /* eslint-disable no-param-reassign */
    if (!('schemaVersion' in items)) {
      items.schemaVersion = 0;
    }

    if (items.schemaVersion === SCHEMA_VERSION) {
      return callback();
    }

    for (let version = items.schemaVersion; version < MIGRATIONS.length; version++) {
      items = MIGRATIONS[version](items);
    }

    console.info('migrating from', items.schemaVersion, 'to', SCHEMA_VERSION);
    items.schemaVersion = SCHEMA_VERSION;
    /* eslint-disable no-param-reassign */

    console.info('migrated items:', items);
    chrome.storage.sync.set(items, Utils.unlessError(callback));
  }));
};
