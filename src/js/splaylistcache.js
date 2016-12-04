'use strict';

const SortedMap = require('collections/sorted-map');

const Gm = require('./googlemusic');
const Gmoauth = require('./googlemusic_oauth');
const Storage = require('./storage');
const Reporting = require('./reporting');
const Splaylist = require('./splaylist');

// splaylists are cached locally to enable playlist linking.
// cache fields:
//   * splaylists: {id: splaylist}
// Cached splaylists contain additional fields:
//   * isAutoplaylist: bool
//   * legacyEntries: {entryId: trackId}
//   * entries: {entryId: {trackId, absolutePosition}}
//   * orderedEntries: SortedMap{absolutePosition: {entryId, trackId}}

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
        newSplaylist.legacyEntries = oldSplaylist.legacyEntries;
        newSplaylist.orderedEntries = oldSplaylist.orderedEntries;
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
          splaylist.legacyEntries = {};
          splaylist.orderedEntries = new SortedMap();
        }

        if (mutation.deleted) {
          const oldEntry = splaylist.entries[mutation.id];
          delete splaylist.entries[mutation.id];
          delete splaylist.legacyEntries[mutation.id];
          splaylist.orderedEntries.delete(oldEntry.absolutePosition);
        } else {
          if (mutation.id in splaylist.entries) {
            const oldPosition = splaylist.entries[mutation.id].absolutePosition;

            // This is fiddly. If we blindly delete oldPosition, we may delete a different entry
            // in the case that eg two entries swapped absolutePositions.
            // So, we need to also check that the oldPosition is what we expect it to be.
            const oldValue = splaylist.orderedEntries.get(oldPosition);
            if (oldValue && oldValue.entryId === mutation.id) {
              splaylist.orderedEntries.delete(oldPosition);
            }
          }

          splaylist.entries[mutation.id] = {trackId: mutation.trackId, absolutePosition: mutation.absolutePosition};
          splaylist.legacyEntries[mutation.id] = mutation.trackId;
          splaylist.orderedEntries.set(mutation.absolutePosition, {entryId: mutation.id, trackId: mutation.trackId});
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
          freshSplaylist.legacyEntries = entries;
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
