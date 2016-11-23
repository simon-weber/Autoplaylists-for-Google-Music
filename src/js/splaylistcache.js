'use strict';

const Gm = require('./googlemusic');
const Gmoauth = require('./googlemusic_oauth');
const Storage = require('./storage');
const Reporting = require('./reporting');
const Splaylist = require('./splaylist');

// splaylists are cached locally to enable playlist linking.
// cache fields:
//   * splaylists: {id: splaylist}
// Cached splaylists contain additional fields:
//   * entries: {entryId: trackId}
//   * isAutoplaylist: bool

exports.open = function open() {
  // Return a new, empty cache.

  return {
    splaylists: {},
    _lastSyncMicros: null,
  };
};

exports.sync = function sync(cache, user, playlists, callback) {
  // Update a cache to reflect Google's state for this user.
  // Callback a set of deleted splaylist ids once the sync is done.
  console.log('syncing splaylist cache. current cache has:', Object.keys(cache.splaylists).length);

  Storage.getNewSyncEnabled(newSyncEnabled => {
    if (newSyncEnabled) {
      return newSync(cache, user, playlists, callback);
    }
    return legacySync(cache, user, playlists, callback);
  });
};

function newSync(cache, user, playlists, callback) {
  const deletedIds = new Set();
  const newTimestamp = new Date().getTime() * 1000;
  const autoPlaylistIds = new Set(playlists.map(p => p.remoteId));

  Gmoauth.getPlaylistChanges(user, cache._lastSyncMicros, mutations => {
    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (mutation.deleted) {
        delete cache.splaylists[mutation.id];  // eslint-disable-line no-param-reassign
        deletedIds.add(mutation.id);
      } else if (!(mutation.id in cache.splaylists)) {
        const splaylist = Splaylist.fromSJ(mutation);
        splaylist.isAutoplaylist = autoPlaylistIds.has(mutation.id);
        cache.splaylists[mutation.id] = splaylist;  // eslint-disable-line no-param-reassign
      } else {
        const oldSplaylist = cache.splaylists[mutation.id];
        const newSplaylist = Splaylist.fromSJ(mutation);
        newSplaylist.isAutoplaylist = autoPlaylistIds.has(mutation.id);
        newSplaylist.entries = oldSplaylist.entries;
        cache.splaylists[mutation.id] = newSplaylist;  // eslint-disable-line no-param-reassign
      }
    }

    Gmoauth.getEntryChanges(user, cache._lastSyncMicros, entryMutations => {
      for (let i = 0; i < entryMutations.length; i++) {
        const mutation = entryMutations[i];
        // This assumes that entries can't change playlists without a delete.
        const splaylist = cache.splaylists[mutation.playlistId];

        if (!splaylist) {
          // These orphaned entries usually belong to a playlist that was recently deleted.
          continue;
        }

        if (!('entries' in splaylist)) {
          splaylist.entries = {};
        }

        if (mutation.deleted) {
          delete splaylist.entries[mutation.id];
        } else {
          // I don't know if the update case is actually relevant to us.
          // I've only ever seen it signify reordering.
          splaylist.entries[mutation.id] = mutation.trackId;
        }
      }
      cache._lastSyncMicros = newTimestamp;   // eslint-disable-line no-param-reassign
      console.log('cache synced', cache, deletedIds);
      callback(deletedIds);
    });
  });
}

function legacySync(cache, user, playlists, callback) {
  console.log('syncing splaylist cache. current cache has:', Object.keys(cache.splaylists).length);
  const autoPlaylistIds = new Set(playlists.map(p => p.remoteId));

  Gm.getPlaylists(user, freshSplaylists => {
    console.debug('got splaylists', freshSplaylists);

    const oldSplaylistIds = new Set(Object.keys(cache.splaylists));

    for (let i = 0; i < freshSplaylists.length; i++) {
      const freshSplaylist = freshSplaylists[i];

      freshSplaylist.isAutoplaylist = autoPlaylistIds.has(freshSplaylist.id);

      // Mark as seen.
      const wasAdded = !(oldSplaylistIds.delete(freshSplaylist.id));

      // Sync added or modified splaylists.
      if (wasAdded || cache.splaylists[freshSplaylist.id].lastModified < freshSplaylist.lastModified) {
        console.debug(`sync splaylist "${freshSplaylist.title}"`);
        Gm.getPlaylistContents(user, freshSplaylist.id, freshEntries => {
          const entries = {};
          for (let j = 0; j < freshEntries.length; j++) {
            const entry = freshEntries[j];
            entries[entry.entryId] = entry.track.id;
          }
          freshSplaylist.entries = entries;
          cache.splaylists[freshSplaylist.id] = freshSplaylist; // eslint-disable-line no-param-reassign
        }, error => {
          Reporting.Raven.captureMessage('error during splaylistcache.sync.getContents', {
            tags: {playlistId: freshSplaylist.id},
            extra: {error},
            stacktrace: true,
          });
        });
      }
    }

    // Delete deleted splaylists (those not seen in the fresh splaylists).
    for (const oldSplaylistId of oldSplaylistIds) {
      const oldTitle = cache.splaylists[oldSplaylistId].title;
      console.debug(`splaylist "${oldTitle}" was deleted`);
      delete cache.splaylists[oldSplaylistId]; // eslint-disable-line no-param-reassign
    }

    callback(oldSplaylistIds);
  },
  error => {
    Reporting.Raven.captureMessage('error during splaylistcache.sync', {
      extra: {error},
      stacktrace: true,
    });

    callback(new Set());
  });
}
