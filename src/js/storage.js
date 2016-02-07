'use strict';

const Chrometools = require('./chrometools.js');


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

const SCHEMA_VERSION = 1;
const MIGRATIONS = [
  // Migrations receive all items and transform them.
  migrateToOne,
];

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

    callback(playlists);
  }));
};

exports.importPlaylistsForUser = function importPlaylistsForUser(userId, playlists, callback) {
  exports.getPlaylistsForUser(userId, currentPlaylists => {
    // FIXME we should wait on all callbacks before calling back.
    for (let i = 0; i < currentPlaylists.length; i++) {
      exports.deletePlaylist(userId, currentPlaylists[i].localId, () => {});
    }

    for (let i = 0; i < playlists.length; i++) {
      console.log('saving', playlists[i]);
      if (i === playlists.length - 1) {
        exports.savePlaylist(playlists[i], callback);
      } else {
        exports.savePlaylist(playlists[i], () => {});
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
