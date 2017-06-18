'use strict';

const Qs = require('qs');
const SortedArray = require('collections/sorted-array');

const Gm = require('./googlemusic');
const Gmoauth = require('./googlemusic_oauth');
const License = require('./license');
const Playlist = require('./playlist');
const Splaylistcache = require('./splaylistcache');
const Storage = require('./storage');
const Track = require('./track');
const Trackcache = require('./trackcache');
const Utils = require('./utils');

const Reporting = require('./reporting');

// This is being used to hold the old global state moving out of background.
const globalState = {};

const BACKOFF_MINS = 15;

class Manager {
  // A sync manager serializes access to both remote and local (cached) Music resources.
  constructor(users, dbs, splaylistcaches, pollTimestamps) {
    this.queue = [];
    this.syncing = false;
    this.backoffStart = null;
    this.batchingEnabled = false;

    globalState.users = users;
    globalState.dbs = dbs;
    globalState.splaylistcaches = splaylistcaches;
    globalState.pollTimestamps = pollTimestamps;
  }

  requestSync(details) {
    // Request that a sync be performed.
    // It may have to wait for other syncs to finish first.
    //
    // details is one of:
    // {action: 'update-all'} to sync the contents of all known playlists
    // {action: 'update', localId} to add+sync a (new) playlist
    // {action: 'delete', localId, remoteId} to delete a remote playlist (assumed to already be deleted locally)
    // userId must also be passed during the global state transition.

    if (Object.values(details).includes(undefined)) {
      // This can happen if playlists are operated on at weird times, like a delete before the create happens.
      console.warn('rejecting sync', details);
      Reporting.Raven.captureMessage('rejected sync', {
        level: 'warning',
        extra: {details},
      });
      return;
    }

    if (this.inBackoff() && details.action === 'update-all') {
      console.info('rejecting update-all while in backoff');
      return;
    }

    this.queue.push(details);
    console.log('queued sync', details, '.', 'queue is now', this.queue);
    this._doSyncs();
  }

  inBackoff() {
    if (!(this.backoffStart)) {
      return false;
    }

    const backoffMins = (new Date().valueOf() - this.backoffStart.valueOf()) / 1000 / 60;
    console.log('backoffMins', backoffMins);

    if (backoffMins > BACKOFF_MINS) {
      console.log('ending backoff; restarting syncs');
      this.backoffStart = null;
    }

    return this.backoffStart !== null;
  }

  _doSyncs() {
    // Drain the sync queue.

    if (this.inBackoff()) {
      console.info('in backoff; deferring');
      return;
    }

    if (this.syncing) {
      console.log('sync already in progress; deferring.', this.queue.length, 'waiting');
      return;
    }

    if (!this.queue.length) {
      console.warn('syncs requested, but queue empty.');
      return;
    }

    this.syncing = true;
    const details = this.queue.shift();
    const userId = details.userId;
    console.log('start sync', details);

    syncSplaylistcache(userId).then(() => {
      if (globalState.dbs[userId]) {
        return new Promise(resolve => {
          diffUpdateTrackcache(userId, globalState.dbs[userId], resolve);
        });
      }
      // Retry to init the library.
      Reporting.Raven.captureMessage('db not init at periodic sync', {
        level: 'warning',
        extra: {users: globalState.users},
      });
      return new Promise(resolve => {
        initLibrary(userId, resolve);
      }).then(() => Promise.reject('db not init at periodic sync'));
    }).then(res => {
      console.log('cache update res', res);
      return sync(details, this.batchingEnabled);
    }).catch(e => {
      console.error('sync for', details, 'failed:', e);
      Reporting.Raven.captureMessage('sync failed', {
        level: 'error',
        extra: {details, e},
      });
      if (e.status === 500 && !this.inBackoff()) {
        console.warn('entering backoff');
        this.backoffStart = new Date();
      }
    }).then(responses => {
      console.log('finished sync', details, '. responses', responses);
      this.syncing = false;
      if (this.queue.length) {
        // Yield to other callbacks.
        setTimeout(() => this._doSyncs(), 0);
      }
    });
  }
}

exports.Manager = Manager;

function sync(details, batchingEnabled) {
  // Promise a list of api responses.
  const userId = details.userId;

  if (details.action === 'update-all') {
    return syncPlaylists(userId, batchingEnabled);
  }

  if (details.action === 'update' || details.action === 'delete') {
    return new Promise(resolve => {
      Storage.getPlaylistsForUser(userId, resolve);
    }).then(playlists => {
      if (details.action === 'update') {
        const playlist = playlists.filter(p => p.localId === details.localId)[0];
        if (!playlist) {
          return Promise.reject(`update sync for ${details.localId} refers to a nonexistent playlist`);
        }
        return syncPlaylist(playlist, playlists);
      }

      // otherwise, delete
      return Gm.deleteRemotePlaylist(globalState.users[userId], details.remoteId)
      .then(response => {
        // TODO this should probably happen outside of syncing
        Playlist.deleteAllReferences(details.localId, playlists);
        const toSave = [];
        for (let i = 0; i < playlists.length; i++) {
          if (playlists[i].localId === details.localId || playlists[i].remoteId === details.remoteId) {
            // I'm not sure why this happens, since the playlist should be deleted before sync is even called.
            // Maybe Chrome just doesn't reflect the delete immediately.
            // This might also be fixed now -- it probably was a problem when syncs didn't wait on storage.
            continue;
          }
          toSave.push(playlists[i]);
        }

        return new Promise(resolve => {
          // It'd be ideal not to trigger an update of every playlist, but this is easier than doing a DFS to find
          // all playlists that could have changed.
          // It'd be easy to just not do this when it wasn't linked at all, though.
          Storage.savePlaylists(toSave, resolve);
        }).then(() => [response]);
      });
    });
  }

  return Promise.reject(`unrecognized action "${details.action}"`);
}

function deauthUser(userId) {
  console.info('deauthing', userId);
  delete globalState.users[userId];
  delete globalState.dbs[userId];
  delete globalState.pollTimestamps[userId];
  delete globalState.splaylistcaches[userId];
}

function initLibrary(userId, callback) {
  // Initialize our cache from Google's indexeddb, or fall back to a differential update from time 0.
  // Callback nothing when finished.
  Trackcache.openDb(userId, db => {
    const message = {action: 'getLocalTracks', userId};
    chrome.tabs.sendMessage(globalState.users[userId].tabId, message, response => {
      if (chrome.extension.lastError || response === null || response.gtracks === null ||
          response.gtracks.length === 0 || response.timestamp === null) {
        console.warn('local idb not helpful; falling back to diffUpdate(0).', response, chrome.extension.lastError);
        diffUpdateTrackcache(userId, db, diffResponse => {
          if (diffResponse.success) {
            globalState.dbs[userId] = db;
          } else {
            console.warn('failed to init library after diffupdate fallback');
            Reporting.Raven.captureMessage('failed to init library', {
              extra: {response, lastError: chrome.extension.lastError},
              tags: {hadToFallback: true},
            });
          }
          callback();
        }, 0);
      } else {
        console.log('got idb gtracks:', response.gtracks.length);
        const tracks = response.gtracks.map(Track.fromJsproto);
        Trackcache.upsertTracks(db, userId, tracks, () => {
          diffUpdateTrackcache(userId, db, diffResponse => {
            if (diffResponse.success) {
              globalState.dbs[userId] = db;
            } else {
              console.warn('failed to init library after successful idb read');
              Reporting.Raven.captureMessage('failed to init library', {
                extra: {response},
                tags: {hadToFallback: false},
              });
            }
            callback();
          }, response.timestamp);
        });
      }
    });
  });
}

function diffUpdateTrackcache(userId, db, callback, timestamp) {
  // Update our cache with any changes since timestamp.
  // Callback an object with success = true if we were able to retrieve changes.

  // If timestamp is not provided, use the last stored timestamp.
  // If there is no stored timestamp, use 0 (a full sync).

  const user = globalState.users[userId];
  if (!Number.isInteger(timestamp)) {
    timestamp = globalState.pollTimestamps[userId] || 0;  // eslint-disable-line no-param-reassign
  }

  console.log('checking for remote track changes');
  Gm.getTrackChanges(user, timestamp, changes => {
    if (!changes.success) {
      console.warn('failed to getTrackChanges:', JSON.stringify(changes));
      if (changes.reloadXsrf) {
        chrome.tabs.sendMessage(user.tabId, {action: 'getXsrf'}, Utils.unlessError(r => {
          console.info('requested xsrf refresh', r);
        },
        e => {
          console.warn('failed to request xsrf refresh; deauthing', JSON.stringify(e));
          deauthUser(userId);
        }));
      } else if (changes.unauthed) {
        console.info('unauthed', userId);
        deauthUser(userId);
      } else {
        console.error('unexpected getTrackChanges response', changes);
        Reporting.Raven.captureMessage('unexpected getTrackChanges response', {
          extra: {changes, timestamp},
        });
      }
      return callback({success: false});
    }

    Trackcache.upsertTracks(db, userId, changes.upsertedTracks, () => {
      Trackcache.deleteTracks(db, userId, changes.deletedIds, () => {
        if (changes.newTimestamp) {
          globalState.pollTimestamps[userId] = changes.newTimestamp;
          console.log('poll timestamp now Google-provided', changes.newTimestamp);
        } else if (timestamp === 0) {
          // if we're updating from 0 and didn't get a new timestamp, we want to avoid updating from 0 again.
          // so, use the current time minus a minute to avoid race conditions from when the sync started.
          globalState.pollTimestamps[userId] = (new Date().getTime() * 1000) - (60 * 1000);
          console.info('no new poll timestamp; using one minute ago');
        } else {
          // This happens when the diff update had no changes.
          // We can just use the same timestamp again next time.
          globalState.pollTimestamps[userId] = timestamp;
          console.log('no new poll timestamp; reusing', timestamp);
        }

        callback({success: true});
      });
    });
  });
}

function getDescription(playlist, splaylistcache, playlists) {
  const rulesRepr = Playlist.toString(playlist, playlists, splaylistcache);
  return `Synced ${new Date().toLocaleString()} by Autoplaylists for Google Music™ to contain: ${rulesRepr}.`;
}

function getPlaylistMutations(playlist, splaylistcache, playlists) {
  // Return [mutations].
  const description = getDescription(playlist, splaylistcache, playlists);
  const update = Gmoauth.buildPlaylistUpdates([{id: playlist.remoteId, name: playlist.title, description}]);
  return update;
}

function getEntryMutations(playlist, splaylistcache) {
  // Promise {mutations: [], mixedReorders: int} or reject.
  let currentOrderedEntries = new SortedArray();
  if (playlist.remoteId in splaylistcache.splaylists) {
    currentOrderedEntries = splaylistcache.splaylists[playlist.remoteId].orderedEntries;
  } else {
    console.warn('playlist.remoteId', playlist.remoteId, 'not yet cached; assuming empty');
  }

  // We'll make three kinds of mutations:
  //   1) delete tracks we don't want
  //   2) add tracks we're missing
  //   3) reorder the resulting tracks
  // These can all be batched.
  // As opposed to a simpler delete-all+add-all approach, this:
  //   * reduces our request sizes and the work for Google
  //   * avoids deleting tracks that are currently playing but we don't know about

  const db = globalState.dbs[playlist.userId];
  const mutations = [];
  const desiredOrdering = [];
  let tracksToAdd;
  let entryIdsToDelete;
  let entriesToKeep;
  const postDeleteEntryIds = [];
  let mixedReorders = 0;

  return new Promise(resolve => {
    Trackcache.queryTracks(db, splaylistcache, playlist, {}, resolve);
  }).then(tracks => {
    const desiredTracks = tracks.slice(0, 1000);

    // We'll reorder these later.
    tracksToAdd = new Set(desiredTracks.map(t => t.id));
    console.debug('query found', tracksToAdd);

    entryIdsToDelete = [];
    entriesToKeep = {};
    currentOrderedEntries.forEach(entry => {
      const entryId = entry.entryId;
      const remoteTrackId = entry.trackId;

      if (tracksToAdd.has(remoteTrackId)) {
        tracksToAdd.delete(remoteTrackId);
        entriesToKeep[remoteTrackId] = entryId;
        postDeleteEntryIds.push(entryId);
      } else {
        entryIdsToDelete.push(entryId);
      }
    });

    const trackIdsRemaining = Object.keys(entriesToKeep);
    for (const id of tracksToAdd) {
      trackIdsRemaining.push(id);
    }

    return new Promise(resolve => {
      Trackcache.orderTracks(db, playlist, trackIdsRemaining, resolve);
    });
  }).then(orderedTracks => {
    console.debug('to add', tracksToAdd.size, tracksToAdd);
    console.debug('to keep', Object.keys(entriesToKeep).length, entriesToKeep);
    console.debug('to delete', entryIdsToDelete.length, entryIdsToDelete);

    const deletes = Gmoauth.buildEntryDeletes(entryIdsToDelete);
    for (let i = 0; i < deletes.length; i++) {
      mutations.push(deletes[i]);
    }

    const appends = Gmoauth.buildEntryAppends(playlist.remoteId, Array.from(tracksToAdd));
    const appendsByTrackId = {};
    for (let i = 0; i < appends.length; i++) {
      const append = appends[i];
      mutations.push(append);
      appendsByTrackId[append.create.trackId] = append.create;
    }

    const idToDesiredPosition = {};
    for (let i = 0; i < orderedTracks.length; i++) {
      const track = orderedTracks[i];
      let clientId;
      let type;
      let entryId;
      let append;
      const trackId = track.id;

      if (track.id in entriesToKeep || track.storeId in entriesToKeep) {
        type = 'existing';
        clientId = Utils.uuidV1();
        entryId = entriesToKeep[track.id] || entriesToKeep[track.storeId];
      } else {
        // We only build appends with library id.
        append = appendsByTrackId[track.id];
        type = 'append';
        clientId = append.clientId;
      }
      desiredOrdering.push({type, clientId, entryId, append, trackId});
      if (entryId) {
        idToDesiredPosition[entryId] = i;
      }
    }

    const postDeletePositions = [];
    for (let i = 0; i < postDeleteEntryIds.length; i++) {
      postDeletePositions.push(idToDesiredPosition[postDeleteEntryIds[i]]);
    }

    const maxIncSubPositions = Utils.maximumIncreasingSubsequenceIndices(postDeletePositions);
    const maxIncSubEntryIds = new Set();
    for (let i = 0; i < maxIncSubPositions.length; i++) {
      maxIncSubEntryIds.add(postDeleteEntryIds[maxIncSubPositions[i]]);
    }
    console.debug('maxIncSub is', maxIncSubEntryIds.size, 'of', postDeletePositions.length);

    const reorderings = [];
    for (let i = 0; i < desiredOrdering.length; i++) {
      const ordering = desiredOrdering[i];

      const entryId = ordering.entryId;
      if (entryId && maxIncSubEntryIds.has(entryId)) {
        // Only move entries not in the maxIncSub.
        continue;
      }

      let target;
      if (ordering.type === 'existing') {
        target = {id: ordering.entryId, clientId: ordering.clientId};
        reorderings.push(target);
      } else {
        // Edit the position the track will be added to.
        target = ordering.append;
      }

      let surroundingType = null;
      target.source = 1;
      target.trackId = ordering.trackId;
      if (i > 0) {
        const preceding = desiredOrdering[i - 1];
        surroundingType = preceding.type;
        let id = preceding.entryId;
        if (preceding.type === 'append') {
          id = preceding.clientId;
        }
        target.precedingEntryId = id;
      }
      if (i < desiredOrdering.length - 1) {
        const following = desiredOrdering[i + 1];

        if (surroundingType && surroundingType !== following.type) {
          // There's nothing we can do about this unless we send a no-op reorder and switch to client ids.
          // It doesn't seem worth it given that the reorders are already eventually consistent.
          console.debug('mixed reorder detected for', ordering, desiredOrdering[i - 1], following);
          mixedReorders++;
        } else {
          surroundingType = following.type;
        }

        let id = following.entryId;
        if (following.type === 'append') {
          id = following.clientId;
        }
        target.followingEntryId = id;
      }
      target.relativePositionIdType = (surroundingType === 'existing' ? 1 : 2);
    }

    const reorders = Gmoauth.buildEntryReorders(reorderings);
    for (let i = 0; i < reorders.length; i++) {
      mutations.push(reorders[i]);
    }

    console.debug(mutations.length, 'mutations');
    return {mutations, mixedReorders};
  }).catch(e => {
    console.error('getEntryMutations error', e, e.stack);
    Reporting.Raven.captureMessage('getEntryMutations error', {
      extra: {e, playlist, stack: e.stack},
      stacktrace: true,
    });
    return Promise.reject(e);
  });
}

function syncPlaylist(playlist, playlists) {
  // Sync a playlist's metadata and contents.
  // A remote playlist will be created if one does not exist yet.
  // Promise a list of api responses.

  console.log('syncPlaylist', playlist.title);
  const user = globalState.users[playlist.userId];
  const splaylistcache = globalState.splaylistcaches[playlist.userId];

  if (!('remoteId' in playlist)) {
    // The remote playlist doesn't exist yet.
    const add = Gmoauth.buildPlaylistAdd(playlist.title, getDescription(playlist, splaylistcache, playlists));
    return Gmoauth.runPlaylistMutations(user, [add])
    .then(response => {
      console.log('postCreate', response);
      // TODO this will crash on an error response
      const remoteId = response.mutate_response[0].id;
      console.log('created remote playlist', remoteId);
      const playlistToSave = JSON.parse(JSON.stringify(playlist));
      playlistToSave.remoteId = remoteId;

      // Nothing else to do. The listener will see the change and recall to sync the contents.
      // We do need to wait on the id to be saved, though.
      // Otherwise, syncs could be called on a playlist without a remoteId.
      return new Promise(resolve => {
        Storage.savePlaylist(playlistToSave, resolve);
      }).then(() => response);
    });
  }

  // Sync the contents for a playlist that exists.
  return syncSplaylistcache(playlist.userId).then(() => {
    // Unfortunately playlist and entry updates can't be batched.
    // They don't need to run synchronously here, though, since the target playlist already exists.
    // FIXME this code is very similar to the playlists case.
    const playlistMutations = getPlaylistMutations(playlist, splaylistcache, playlists);
    const playlistSyncPromise = Gmoauth.runPlaylistMutations(user, playlistMutations);

    const entrySyncPromise = getEntryMutations(playlist, splaylistcache).then(({mutations, mixedReorders}) => {
      Reporting.reportMixedReorders(mixedReorders);
      return Gmoauth.runEntryMutations(user, mutations);
    });

    return Promise.all([entrySyncPromise, playlistSyncPromise]);
  });
}

function syncEntryMutations(hasFullVersion, splaylistcache, user, playlists, batchingEnabled) {
  // Promise a parsed api response.
  const mutationBatchPromises = [];
  for (let i = 0; i < playlists.length; i++) {
    const playlist = playlists[i];

    if (i > (License.FREE_PLAYLIST_COUNT - 1) && !hasFullVersion) {
      // TODO can this be combined with License.isLocked?
      console.info('skipping (entry) sync of locked playlist', playlist.title);
      continue;
    }

    if (!playlist || !playlist.remoteId) {
      // This can happen if playlists are operated on at weird times, like a delete before the create happens.
      console.warn('rejecting from syncEntryMutations', playlist);
      Reporting.Raven.captureMessage('rejected from syncEntryMutations', {
        level: 'warning',
        extra: {playlist},
      });
      continue;
    }

    mutationBatchPromises.push(getEntryMutations(playlist, splaylistcache));
  }

  return Promise.all(mutationBatchPromises).then(mutationBatches => {
    if (batchingEnabled) {
      // Sync each batch on its own, serially.
      return mutationBatches.reduce((promise, mutationBatch) => { // eslint-disable-line arrow-body-style
        return promise.then(() => {
          Reporting.reportMixedReorders(mutationBatch.mixedReorders);
          return Gmoauth.runEntryMutations(user, mutationBatch.mutations).then(res => {
            console.log('batch response', res);
            return res;
          });
        });
      }, Promise.resolve());
    }
    // Combine batches into one and sync in one request.
    const mutations = [];
    let sumMixedReorders = 0;
    for (let i = 0; i < mutationBatches.length; i++) {
      const {mutations: mutationBatch, mixedReorders} = mutationBatches[i];
      mutationBatch.each(mutation => mutations.push(mutation));
      sumMixedReorders += mixedReorders;
    }
    Reporting.reportMixedReorders(sumMixedReorders);
    return Gmoauth.runEntryMutations(user, mutations);
  });
}

function syncPlaylistMutations(hasFullVersion, splaylistcache, user, playlists) {
  const mutations = [];
  for (let i = 0; i < playlists.length; i++) {
    const playlist = playlists[i];

    if (i > (License.FREE_PLAYLIST_COUNT - 1) && !hasFullVersion) {
      console.info('skipping (playlist) sync of locked playlist', playlist.title);
      continue;
    }

    if (!playlist || !playlist.remoteId) {
      // This can happen if playlists are operated on at weird times, like a delete before the create happens.
      console.warn('rejecting from syncPlaylistMutations', playlist);
      Reporting.Raven.captureMessage('rejected from syncPlaylistMutations', {
        level: 'warning',
        extra: {playlist},
      });
      continue;
    }

    getPlaylistMutations(playlist, splaylistcache, playlists).each(mutation => {
      mutations.push(mutation);
    });
  }

  return Gmoauth.runPlaylistMutations(user, mutations);
}

function syncPlaylists(userId, batchingEnabled) {
  // Promise something when done. Reject if the sync couldn't happen.
  console.log('syncPlaylists', userId);
  const db = globalState.dbs[userId];
  const splaylistcache = globalState.splaylistcaches[userId];
  const user = globalState.users[userId];

  if (!db) {
    console.warn('refusing syncPlaylists because db is not init');

    Reporting.Raven.captureMessage('refusing forceUpdate because db is not init', {
      level: 'warning',
      extra: {users: globalState.users},
    });
    return Promise.reject('refusing syncPlaylists because db is not init');
  }

  return new Promise((resolve, reject) => {
    License.hasFullVersion(false, hasFullVersion => {
      Storage.getPlaylistsForUser(userId, playlists => {
        // These don't need to be ordered/synchronous; the containing playlist already exists.
        const entrySyncPromise = syncEntryMutations(hasFullVersion, splaylistcache, user, playlists, batchingEnabled);
        const playlistSyncPromise = syncPlaylistMutations(hasFullVersion, splaylistcache, user, playlists);
        Promise.all([entrySyncPromise, playlistSyncPromise]).then(resolve).catch(reject);
      });
    });
  });
}

function syncSplaylistcache(userId) {
  // Promise nothing when the cache is updated.
  const splaylistcache = globalState.splaylistcaches[userId];

  const playlistsP = new Promise(resolve => {
    Storage.getPlaylistsForUser(userId, resolve);
  });

  const deletedIdsP = playlistsP.then(playlists =>
    new Promise(resolve => {
      Splaylistcache.sync(splaylistcache, globalState.users[userId], playlists, resolve);
    })
  );

  return Promise.all([playlistsP, deletedIdsP])
  .then(params => {
    const playlists = params[0];
    const deletedIds = params[1];
    for (const deletedId of deletedIds) {
      Playlist.deleteAllReferences('P' + deletedId, playlists);
    }

    if (deletedIds.size > 0) {
      return new Promise(resolve => {
        Storage.savePlaylists(playlists, resolve);
      });
    }
  });
}

// These will eventually get exposed through the manager.
exports.syncSplaylistcache = syncSplaylistcache;
exports.initLibrary = initLibrary;
