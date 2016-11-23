'use strict';

const Chrometools = require('./chrometools');

const Reporting = require('./reporting');


function playlistKey(userId, playlistLid) {
  return JSON.stringify(['playlist', userId, playlistLid]);
}

function isPlaylistKey(key) {
  return key.startsWith('["playlist');
}

/* eslint-disable */
// Source: https://gist.github.com/jed/982883.
function uuidV1(a){
  return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, uuidV1)
}
/* eslint-enable */

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

const SCHEMA_VERSION = 1;
const MIGRATIONS = [
  // Migrations receive all items and transform them.
  migrateToOne,
];

// Callback a bool.
exports.getNewSyncEnabled = function getNewSyncEnabled(callback) {
  chrome.storage.sync.get('newSyncEnabled', Chrometools.unlessError(items => {
    callback(Boolean(items.newSyncEnabled));
  }));
};

// newSyncEnabled is a bool.
exports.setNewSyncEnabled = function setNewSyncEnabled(newSyncEnabled, callback) {
  const storageItems = {};
  storageItems.newSyncEnabled = newSyncEnabled;

  chrome.storage.sync.set(storageItems, Chrometools.unlessError(callback));
};


// Callback an int.
exports.getSyncMs = function getSyncMs(callback) {
  chrome.storage.sync.get('syncMs', Chrometools.unlessError(items => {
    let syncMs = items.syncMs;

    if (!Number.isInteger(syncMs)) {
      syncMs = 60 * 1000;
      chrome.storage.sync.set({syncMs}, Chrometools.unlessError(() => {
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

  chrome.storage.sync.set(storageItems, Chrometools.unlessError(callback));
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
  chrome.storage.sync.get('lastPSync', Chrometools.unlessError(items => {
    let lastPSync = items.lastPSync;

    if (!Number.isInteger(lastPSync)) {
      lastPSync = 0;
      chrome.storage.sync.set({lastPSync}, Chrometools.unlessError(() => {
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

  chrome.storage.sync.set(storageItems, Chrometools.unlessError(callback));
};


exports.getOrCreateReportingUUID = function getOrCreateReportingUUID(callback) {
  chrome.storage.sync.get('reportingUUID', Chrometools.unlessError(items => {
    let reportingUUID = items.reportingUUID;

    if (!reportingUUID) {
      reportingUUID = uuidV1();
      chrome.storage.sync.set({reportingUUID}, Chrometools.unlessError(() => {
        callback(reportingUUID);
      }));
    } else {
      callback(reportingUUID);
    }
  }));
};

exports.getPlaylist = function getPlaylist(userId, playlistLid, callback) {
  const key = playlistKey(userId, playlistLid);

  chrome.storage.sync.get(key, Chrometools.unlessError(items => {
    const playlist = items[key];
    callback(playlist);
  }));
};

exports.savePlaylist = function savePlaylist(playlist, callback) {
  const storageItems = {};
  storageItems[playlistKey(playlist.userId, playlist.localId)] = playlist;

  chrome.storage.sync.set(storageItems, Chrometools.unlessError(callback));
};

exports.deletePlaylist = function deletePlaylist(userId, playlistLid, callback) {
  chrome.storage.sync.remove(playlistKey(userId, playlistLid), Chrometools.unlessError(callback));
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
  chrome.storage.sync.get(null, Chrometools.unlessError(items => {
    const playlists = [];
    for (const key in items) {
      try {
        const parsedKey = JSON.parse(key);
        if (parsedKey[0] === 'playlist' && parsedKey[1] === userId) {
          playlists.push(items[key]);
        }
      } catch (SyntaxError) {
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
  chrome.storage.sync.get(null, Chrometools.unlessError(items => {
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
    chrome.storage.sync.set(items, Chrometools.unlessError(callback));
  }));
};
