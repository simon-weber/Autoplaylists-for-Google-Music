'use strict';

const Qs = require('qs');

const Chrometools = require('./chrometools');
const Gm = require('./googlemusic');
const Lf = require('lovefield');  // made available for debugQuery eval
const License = require('./license');
const Playlist = require('./playlist');
const Storage = require('./storage');
const Track = require('./track');
const Trackcache = require('./trackcache');
const Splaylistcache = require('./splaylistcache');

const Context = require('./context');
const Reporting = require('./reporting');


// {userId: {userIndex: int, tabId: int, xt: string}}
const users = {};

// {userId: <lovefield db>}
const dbs = {};

// {userId: splaylistCache}
const splaylistcaches = {};

// {playlistId: <bool>}, locks playlists during some updates
const playlistIsUpdating = {};

// {userId: <timestamp>}
const pollTimestamps = {};

function userIdForTabId(tabId) {
  for (const userId in users) {
    if (users[userId].tabId === tabId) {
      return userId;
    }
  }
}

function deauthUser(userId) {
  console.info('deauthing', userId);
  delete users[userId];
  delete dbs[userId];
  delete pollTimestamps[userId];
  delete splaylistcaches[userId];
}


function diffUpdateLibrary(userId, db, timestamp, callback) {
  // Update our cache with any changes since our last poll.
  // Callback an object with success = true if we were able to retrieve changes.

  const user = users[userId];

  Gm.getTrackChanges(user, timestamp, changes => {
    if (!changes.success) {
      console.warning('failed to getTrackChanges:', JSON.stringify(changes));
      if (changes.reloadXsrf) {
        chrome.tabs.sendMessage(user.tabId, {action: 'getXsrf'}, Chrometools.unlessError(r => {
          console.log('requested xsrf refresh', r);
        },
        e => {
          console.warning('failed to request xsrf refresh; deauthing', JSON.stringify(e));
          Reporting.Raven.captureMessage('failed to request xsrf refresh; deauthing', {
            level: 'warning',
            extra: {changes, timestamp, e: JSON.stringify(e)},
          });
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
      console.log('done with diff upsert of', changes.upsertedTracks.length);
      Trackcache.deleteTracks(db, userId, changes.deletedIds, () => {
        console.log('done with diff delete of', changes.deletedIds.length);

        if (changes.newTimestamp) {
          pollTimestamps[userId] = changes.newTimestamp;
        } else if (timestamp === 0) {
          // if we're updating from 0 and didn't get a new timestamp, we want to avoid updating from 0 again.
          // so, use the current time minus a minute to avoid race conditions from when the sync started.
          pollTimestamps[userId] = (new Date().getTime() * 1000) - (60 * 1000);
        } else {
          // The safest option is to just use the same timestamp again next time, since we can't race that way.
          pollTimestamps[userId] = timestamp;
        }

        callback({success: true});
      });
    });
  });
}

function syncPlaylistContents(playlist, attempt) {
  // Sync a playlist's tracks and ordering.
  // A remote playlist must already exist.

  const user = users[playlist.userId];
  const _attempt = attempt || 0;
  const db = dbs[playlist.userId];
  const splaylistcache = splaylistcaches[playlist.userId];

  console.log('syncPlaylistContents, attempt', _attempt);

  Trackcache.queryTracks(db, splaylistcache, playlist, tracks => {
    if (tracks === null) {
      Reporting.reportSync('failure', 'failed-query');
      return;
    }

    console.log('lock', playlist.title);
    playlistIsUpdating[playlist.remoteId] = true;
    console.log(playlist.title, 'found', tracks.length);
    if (tracks.length > 0) {
      console.log('first is', tracks[0]);
    }
    if (tracks.length > 1000) {
      console.warn('attempting to sync over 1000 tracks; only first 1k will sync');
    }

    const desiredTracks = tracks.slice(0, 1000);

    Gm.setPlaylistContents(db, user, playlist.remoteId, desiredTracks, response => {
      if (response !== null) {
        // large updates seem to only apply partway sometimes.
        // retrying like this seems to make even 1k playlists eventually consistent.
        if (_attempt < 2) {
          Reporting.reportSync('retry', `retry-${_attempt}`);
          console.log('not a 0-track add; retrying syncPlaylistContents', response);
          setTimeout(syncPlaylistContents, 10000 * (_attempt + 1), playlist, _attempt + 1);
        } else {
          Reporting.reportSync('failure', 'gave-up');
          console.warn('giving up on syncPlaylistContents!', response);
          // Never has the need for promises been so clear.
          Gm.setPlaylistOrder(db, user, playlist, orderResponse => {
            console.log('reorder response', orderResponse);
            console.log('unlock', playlist.title);
            playlistIsUpdating[playlist.remoteId] = false;
          }, err => {
            Reporting.reportSync('failure', 'failed-reorder');
            console.error('failed to reorder playlist', playlist.title, err);
            Reporting.Raven.captureMessage('sync setPlaylistOrder', {
              tags: {playlistId: playlist.remoteId},
              extra: {playlist, err},
            });
            console.log('unlock', playlist.title);
            playlistIsUpdating[playlist.remoteId] = false;
          });
        }
      } else {
        Gm.setPlaylistOrder(db, user, playlist, orderResponse => {
          Reporting.reportSync('success', `success-${_attempt}`);
          console.log('reorder response', orderResponse);
          console.log('unlock', playlist.title);
          playlistIsUpdating[playlist.remoteId] = false;
        }, err => {
          Reporting.reportSync('failure', 'failed-reorder');
          console.error('failed to reorder playlist', playlist.title, err);
          Reporting.Raven.captureMessage('sync setPlaylistOrder', {
            tags: {playlistId: playlist.remoteId},
            extra: {playlist, err},
          });
          console.log('unlock', playlist.title);
          playlistIsUpdating[playlist.remoteId] = false;
        });
      }
    }, err => {
      Reporting.reportSync('failure', 'failed-set');
      console.error('failed to sync playlist', playlist.title, err);
      Reporting.Raven.captureMessage('sync setPlaylistContents', {
        tags: {playlistId: playlist.remoteId},
        extra: {playlist, err},
      });
      console.log('unlock', playlist.title);
      playlistIsUpdating[playlist.remoteId] = false;
    });
  });
}

function syncPlaylist(playlist, playlists) {
  // Sync a playlist's metadata and contents.
  // A remote playlist will be created if one does not exist yet.
  console.log('syncing', playlist.title);
  const user = users[playlist.userId];
  const splaylistcache = splaylistcaches[playlist.userId];

  if (!('remoteId' in playlist)) {
    // The remote playlist doesn't exist yet.
    Gm.createRemotePlaylist(user, playlist.title, remoteId => {
      console.log('created remote playlist', remoteId);
      const playlistToSave = JSON.parse(JSON.stringify(playlist));
      playlistToSave.remoteId = remoteId;

      Storage.savePlaylist(playlistToSave, () => {
        // nothing else to do. listener will see the change and recall.
        console.log('wrote remote id');
      });
    });
  } else {
    Gm.updatePlaylist(user, playlist.remoteId, playlist.title, playlist, playlists, splaylistcache, () => {
      syncPlaylistContents(playlist);
    });
  }
}

function syncPlaylists(userId) {
  const db = dbs[userId];
  const timestamp = pollTimestamps[userId] || 0;

  if (!db) {
    console.warn('refusing syncPlaylists because db is not init');

    Reporting.Raven.captureMessage('refusing forceUpdate because db is not init', {
      level: 'warning',
      extra: {timestamp, users},
    });
    return;
  }

  diffUpdateLibrary(userId, db, timestamp, response => {
    if (response.success) {
      License.hasFullVersion(false, hasFullVersion => {
        Storage.getPlaylistsForUser(userId, playlists => {
          for (let i = 0; i < playlists.length; i++) {
            if (i > 0 && !hasFullVersion) {
              console.log('skipping sync of locked playlist', playlists[i].title);
              continue;
            }
            // This locking prevents two things:
            //   * slow periodic syncs from stepping on later periodic syncs
            //   * periodic syncs from stepping on manual syncs
            if (playlistIsUpdating[playlists[i].remoteId]) {
              console.warn('skipping sync since playlist is being updated:', playlists[i].title);
            } else {
              syncPlaylist(playlists[i], playlists);
            }
          }
        });
      });
    }
  });
}

function syncSplaylistcache(userId) {
  const splaylistcache = splaylistcaches[userId];

  Storage.getPlaylistsForUser(userId, playlists => {
    Splaylistcache.sync(splaylistcache, users[userId], playlists, deletedIds => {
      for (const deletedId of deletedIds) {
        Playlist.deleteAllReferences('P' + deletedId, playlists);
        for (let i = 0; i < playlists.length; i++) {
          Storage.savePlaylist(playlists[i], () => {});
        }
      }
    });
  });
}

function periodicUpdate() {
  for (const userId in users) {
    console.log('periodic update for', userId);

    syncSplaylistcache(userId);

    if (dbs[userId]) {
      syncPlaylists(userId);
    } else {
      initLibrary(userId);
    }
  }
}

function initLibrary(userId) {
  // Initialize our cache from Google's indexeddb, or fall back to a differential update from time 0.
  Track.resetRandomCache();
  Trackcache.openDb(userId, db => {
    const message = {action: 'getLocalTracks', userId};
    chrome.tabs.sendMessage(users[userId].tabId, message, response => {
      if (chrome.extension.lastError || response === null || response.gtracks === null ||
          response.gtracks.length === 0 || response.timestamp === null) {
        console.warn('local idb not helpful; falling back to diffUpdate(0).', response, chrome.extension.lastError);
        diffUpdateLibrary(userId, db, 0, diffResponse => {
          if (diffResponse.success) {
            dbs[userId] = db;
            syncPlaylists(userId);
          } else {
            console.warn('failed to init library after diffupdate fallback');
            Reporting.Raven.captureMessage('failed to init library', {
              extra: {response, lastError: chrome.extension.lastError},
              tags: {hadToFallback: true},
            });
          }
        });
      } else {
        console.log('got idb gtracks:', response.gtracks.length);
        const tracks = response.gtracks.map(Track.fromJsproto);
        Trackcache.upsertTracks(db, userId, tracks, () => {
          diffUpdateLibrary(userId, db, response.timestamp, diffResponse => {
            if (diffResponse.success) {
              dbs[userId] = db;
              syncPlaylists(userId);
            } else {
              console.warn('failed to init library after successful idb read');
              Reporting.Raven.captureMessage('failed to init library', {
                extra: {response},
                tags: {hadToFallback: false},
              });
            }
          });
        });
      }
    });
  });
}


function main() {
  Storage.addPlaylistChangeListener(change => {
    const hasOld = 'oldValue' in change;
    const hasNew = 'newValue' in change;

    let operation;
    let userId;
    if (hasOld && !hasNew) {
      operation = 'delete';
      userId = change.oldValue.userId;
    } else {
      operation = 'create-or-update';
      userId = change.newValue.userId;
    }

    Storage.getPlaylistsForUser(userId, playlists => {
      if (operation === 'delete') {
        Gm.deleteRemotePlaylist(users[userId], change.oldValue.remoteId, () => null);

        Playlist.deleteAllReferences(change.oldValue.localId, playlists);
        for (let i = 0; i < playlists.length; i++) {
          Storage.savePlaylist(playlists[i], () => {});
        }
      } else {
        syncPlaylist(change.newValue, playlists);
      }
    });
  });

  // Update periodically.
  Storage.getSyncMs(initSyncMs => {
    console.info('sync interval initially', initSyncMs);
    let syncIntervalId = null;
    if (initSyncMs >= 60 * 1000) {
      syncIntervalId = setInterval(periodicUpdate, initSyncMs);
    }

    Storage.addSyncMsChangeListener(change => {
      const hasNew = 'newValue' in change;

      if (!hasNew) {
        return;
      }

      const syncMs = change.newValue;
      console.info('sync interval changing to', syncMs);

      if (syncIntervalId !== null) {
        clearInterval(syncIntervalId);
      }

      syncIntervalId = null;
      if (syncMs >= 60 * 1000) {
        syncIntervalId = setInterval(periodicUpdate, syncMs);
      }
    });
  });

  chrome.pageAction.onClicked.addListener(tab => {
    const managerUrl = chrome.extension.getURL('html/playlists.html');
    const qstring = Qs.stringify({userId: userIdForTabId(tab.id)});
    Chrometools.focusOrCreateExtensionTab(`${managerUrl}?${qstring}`);
    chrome.notifications.clear('zeroPlaylists');
  });

  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId === 'zeroPlaylists') {
      chrome.tabs.create({url: 'https://autoplaylists.simon.codes/#usage'});
      chrome.notifications.clear(notificationId);
      Reporting.reportHit('zeroPlaylistsHelpButton');
    } else {
      Reporting.Raven.captureMessage('unknown notificationId button click', {
        level: 'warning',
        extra: {notificationId, buttonIndex, users},
      });
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // respond to manager / content script requests.

    if (request.action === 'forceUpdate') {
      syncPlaylists(request.userId);
    } else if (request.action === 'setXsrf') {
      console.info('updating xt:', request);
      users[request.userId].xt = request.xt;
      syncPlaylists(request.userId);
    } else if (request.action === 'showPageAction') {
      if (!(request.userId)) {
        console.warn('received falsey user id from page action');
        Reporting.Raven.captureMessage('received falsey user id from page action', {
          level: 'warning',
          extra: {user_id: request.userId},
        });

        return false;
      }

      // In the case that an existing tab/index was changed to a new user,
      // remove the old entry.
      for (const userId in users) {
        if (users[userId].tabId === sender.tab.id ||
            users[userId].userIndex === request.userIndex) {
          delete users[userId];
        }
      }

      users[request.userId] = {userIndex: request.userIndex, tabId: sender.tab.id, xt: request.xt};
      console.log('see user', request.userId, users);
      License.hasFullVersion(false, hasFullVersion => { console.log('precached license status:', hasFullVersion); });

      // FIXME store this in sync storage and include it in context?
      // That'd mean we wouldn't get it immediately, though, so maybe this is better.
      Reporting.Raven.setTagsContext({tier: request.tier});
      Reporting.GATracker.set('dimension3', request.tier);
      Reporting.reportHit('showPageAction');

      // init the caches.
      initLibrary(request.userId);
      splaylistcaches[request.userId] = Splaylistcache.open();
      syncSplaylistcache(request.userId);

      chrome.pageAction.show(sender.tab.id);

      Storage.getPlaylistsForUser(request.userId, playlists => {
        if (playlists.length === 0) {
          chrome.notifications.create('zeroPlaylists', {
            type: 'basic',
            title: 'Create your first autoplaylist!',
            message: "To get started, click the extension's page action (to the right of the url bar).",
            iconUrl: 'icon-128.png',
            buttons: [{title: "Click here if you don't see the page action.", iconUrl: 'question_mark.svg'}],
          });
          Reporting.reportHit('zeroPlaylistsNotification');
        }
      });
    } else if (request.action === 'query') {
      Trackcache.queryTracks(dbs[request.playlist.userId], splaylistcaches[request.playlist.userId], request.playlist, tracks => {
        sendResponse({tracks});
      });
      return true; // wait for async response
    } else if (request.action === 'debugQuery') {
      const query = eval(request.query);

      query.exec()
      .then(rows => {
        sendResponse({tracks: rows});
      })
      .catch(e => {
        console.warn(JSON.stringify(e));
      });
      return true;
    } else if (request.action === 'getContext') {
      Context.get(sendResponse);
      return true;
    } else if (request.action === 'getSplaylistcache') {
      sendResponse(splaylistcaches[request.userId]);
      return;
    } else {
      console.warn('received unknown request', request);
      Reporting.Raven.captureMessage('received unknown request', {
        level: 'warning',
        extra: {request},
      });
    }
  });

  Reporting.reportHit('load');
}

Storage.handleMigrations(main);
