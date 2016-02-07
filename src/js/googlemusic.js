'use strict';

const Lf = require('lovefield');
const Qs = require('qs');

const Chrometools = require('./chrometools.js');
const Track = require('./track.js');
const Trackcache = require('./trackcache.js');
const Playlist = require('./playlist.js');

const GM_BASE_URL = 'https://play.google.com/music/';
const GM_SERVICE_URL = `${GM_BASE_URL}services/`;

function authedGMRequest(endpoint, data, userIndex, method, callback, onError) {
  // Call an endpoint and callback with it's parsed response.

  chrome.cookies.get({name: 'xt', url: 'https://play.google.com/music'}, Chrometools.unlessError(cookie => {
    if (cookie === null) {
      // TODO alert user somehow
      console.error('unable to get xt cookie');
    } else {
      let format = '';
      let payload = {json: JSON.stringify(data)};
      if (data.constructor === Array || method === 'get') {
        format = 'format=jsarray&';
        if (method !== 'get') {
          payload = JSON.stringify(data);
        }
      }

      const url = `${GM_SERVICE_URL}${endpoint}?${format}${Qs.stringify({u: userIndex, xt: cookie.value})}`;

      // TODO this is stupid
      let dataType = 'json';
      if (method === 'get') {
        dataType = 'html';
      }

      if (typeof onError === 'undefined') {
        onError = res => {  // eslint-disable-line no-param-reassign
          console.error('request failed:', url, data, res);
        };
      }

      // TODO jquery should be injected with browserify?
      $[method](
        url,
        payload,
        res => {
          callback(res);
        },

        dataType
      )
      .fail(onError);
    }
  }));
}

exports.getTrackChanges = function getTrackChanges(userIndex, sinceTimestamp, callback) {
  // Callback {newTimestamp: 1234, upsertedTracks: [{}], deletedIds: ['']}
  // timestamps are in microseconds.
  const payload = {
    lastUpdated: sinceTimestamp,
    tier: 1, // TODO need proper tier?
    requestCause: 1,
    sessionId: '',
  };

  console.log('getTrackChanges', sinceTimestamp);

  // want arg to window.parent['slat_process']
  authedGMRequest('streamingloadalltracks', payload, userIndex, 'get', response => {
    const result = {newTimestamp: null, upsertedTracks: [], deletedIds: []};

    const parser = new DOMParser();
    const doc = parser.parseFromString(response, 'application/xml');

    // console.log(doc);
    const scripts = doc.getElementsByTagName('script');

    // console.log(scripts);
    const startMark = '\nwindow.parent[\'slat_process\'](';
    const endMark = '000]';
    for (let i = 0; i < scripts.length; i++) {
      let code = scripts[i].innerHTML;
      let start = code.indexOf(startMark);
      if (start === -1) {
        continue;
      }

      // console.log('chunk', i);
      // console.log('to slice', JSON.stringify(code));
      let end = code.lastIndexOf(endMark);

      // console.log(start, end);

      start = start + startMark.length;
      end = end + endMark.length;
      code = code.slice(start, end);

      // console.log('to eval', JSON.stringify(code));
      const parsed = eval(code);

      // console.log(parsed);

      // we just want the last chunk's timestamp
      result.newTimestamp = parsed[1];

      for (let j = 0; j < parsed[0].length; j++) {
        const gtrack = parsed[0][j];
        if (gtrack[19] === 1) {
          result.deletedIds.push(gtrack[0]);
        } else {
          result.upsertedTracks.push(Track.fromJsproto(gtrack));
        }
      }

      console.log(parsed[0].length, 'tracks');
    }

    console.log(result);
    callback(result);
  });
};

exports.updatePlaylist = function updatePlaylist(userIndex, id, title, playlist, callback) {
  // Callback no args after updating an existing playlist.
  const lastSync = new Date().toLocaleString();
  const description = Playlist.toString(playlist);
  const syncMsg = `Synced ${lastSync} by Autoplaylists for Google Music™ to contain: ${description}.`;

  const payload = [['', 1], [id, null, title, syncMsg]];
  console.log('updatePlaylist', playlist);

  authedGMRequest('editplaylist', payload, userIndex, 'post', response => {
    console.log(response);
    callback();
  });
};

exports.createRemotePlaylist = function createRemotePlaylist(userIndex, title, callback) {
  // Callback a playlist id for a new, empty playlist.
  const payload = [['', 1], [false, title, null, []]];

  console.log('createRemotePlaylist', title);

  // response:
  // [[0,2,0] ,["id","some long base64 string",null,timestamp]]
  authedGMRequest('createplaylist', payload, userIndex, 'post', response => {
    console.log(response);
    callback(response[1][0]);
  });
};

exports.deleteRemotePlaylist = function deleteRemotePlaylist(userIndex, remoteId, callback) {
  // Callback no args after deleting a playlist.

  const payload = {
    id: remoteId,
    requestCause: 1,
    requestType: 1,
    sessionId: '',
  };

  console.log('deleteRemotePlaylist', remoteId);

  authedGMRequest('deleteplaylist', payload, userIndex, 'post', response => {
    console.log('delete playlist response', response);
    callback();
  });
};

function addTracks(userIndex, playlistId, tracks, callback, onError) {
  // Append these tracks and callback the api response, or null if adding 0 tracks.

  if (tracks.length === 0) {
    console.log('skipping add of 0 tracks');
    return callback(null);
  }

  console.log('adding', tracks.length, 'tracks. first 5 are', JSON.stringify(tracks.slice(0, 5), null, 2));

  // [["<sessionid>",1],["<listid>",[["<store id or songid>",tracktype]]]]
  const payload = [['', 1],
    [
      playlistId, tracks.map(t => [Track.getPlaylistAddId(t), t.type]),
    ],
  ];
  authedGMRequest('addtrackstoplaylist', payload, userIndex, 'post', response => {
    console.log('add response', JSON.stringify(response, null, 2));
    callback(response);
  }, onError);
}

function deleteEntries(userIndex, playlistId, entries, callback, onError) {
  // Delete entries with id and entryId keys; callback the api response.
  console.log('deleting', entries.length, 'entries. first 5 are', JSON.stringify(entries.slice(0, 5), null, 2));
  const payload = {
    songIds: entries.map(entry => entry.id),

    entryIds: entries.map(entry => entry.entryId),

    listId: playlistId,
    sessionId: '',
  };
  authedGMRequest('deletesong', payload, userIndex, 'post', response => {
    console.log('delete response', JSON.stringify(response, null, 2));
    callback(response);
  }, onError);
}

function loadPlaylistContents(db, userIndex, playlistId, callback, onError) {
  // Callback a list of objects with entryId and track keys.

  const payload = [['', 1], [playlistId]];
  authedGMRequest('loaduserplaylist', payload, userIndex, 'post', response => {
    if (response.length < 2) {
      return onError(`unexpected loadPlaylistContents response: ${JSON.stringify(response, null, 2)}`);
    }

    const contents = [];

    if (response[1].length !== 0) {
      const gentries = response[1][0];
      console.log('playlist', playlistId, 'has', gentries.length, 'entries. first 3:',
                  JSON.stringify(gentries.slice(0, 3), null, 2));

      for (let i = 0; i < gentries.length; i++) {
        const gentry = gentries[i];
        const entryId = gentry[43];
        const track = Track.fromJsproto(gentry);
        contents.push({entryId, track});
      }
    }

    callback(contents);
  }, onError);
}

exports.setPlaylistContents = function setPlaylistContents(db, userIndex, playlistId, tracks, callback, onError) {
  // Update a remote playlist to contain only the given tracks, in any order.

  // This requires multiple requests:
  // 1) get playlist tracks
  // 2) delete current - desired
  // 3) add desired - current

  loadPlaylistContents(db, userIndex, playlistId, contents => {
    if (contents.length !== 0) {
      const idsToAdd = {};
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        idsToAdd[Track.getPlaylistAddId(track)] = track;
      }

      const deleteCandidates = {};
      for (let i = 0; i < contents.length; i++) {
        const remoteTrack = contents[i].track;
        const entryId = contents[i].entryId;

        if (!(Track.getPlaylistAddId(remoteTrack) in idsToAdd)) {
          deleteCandidates[remoteTrack.id] = entryId;
        } else {
          delete idsToAdd[Track.getPlaylistAddId(remoteTrack)];
        }
      }

      const tracksToAdd = [];
      for (const id in idsToAdd) {
        tracksToAdd.push(idsToAdd[id]);
      }

      const entriesToDelete = [];
      const deleteCandidateIds = Object.keys(deleteCandidates);
      if (deleteCandidateIds.length > 0) {
        // Don't delete tracks that may be currently playing.
        // This requires a query against the track cache, since the lastPlayed
        // for remote tracks is set to 0 for any recent plays!?
        // FIXME pull this out to Trackcache.
        const track = db.getSchema().table('Track');
        db.select().from(track).where(
          // We don't know if these entries name a library or store id.
          Lf.op.or(track.id.in(deleteCandidateIds),
                   track.storeId.in(deleteCandidateIds))
        ).exec().then(rows => {
          const nowMillis = new Date().getTime();
          const delayMillis = 0;

          rows.forEach(row => {
            if (delayMillis + row.lastPlayed / 1000 > nowMillis - row.durationMillis) {
              console.info('not deleting', row, 'since it may be playing.',
                           delayMillis + row.lastPlayed / 1000, nowMillis - row.durationMillis
                          );
              if (row.id in deleteCandidates) {
                delete deleteCandidates[row.id];
              } else {
                delete deleteCandidates[row.storeId];
              }
            }
          });

          for (const deleteId in deleteCandidates) {
            entriesToDelete.push({id: deleteId, entryId: deleteCandidates[deleteId]});
          }

          if (entriesToDelete.length > 0) {
            deleteEntries(userIndex, playlistId, entriesToDelete, deleteResponse => { // eslint-disable-line no-unused-vars
              // We log the delete response inside deleteEntries and have no other need for it here.
              addTracks(userIndex, playlistId, tracksToAdd, callback);
            }, onError);
          } else {
            console.log('no need to delete post-filter; adding');
            addTracks(userIndex, playlistId, tracksToAdd, callback, onError);
          }
        }).catch(console.error);
      } else {
        console.log('no need to delete pre-filter; adding');
        addTracks(userIndex, playlistId, tracksToAdd, callback, onError);
      }
    } else {
      console.log('adding to empty');
      addTracks(userIndex, playlistId, tracks, callback, onError);
    }
  }, onError);
};

exports.setPlaylistOrder = function setPlaylistOrder(db, userIndex, playlist, callback, onError) {
  // Set the remote ordering of a playlist according to playlist's sort order.
  // This trusts that the remote contents are already correct.

  // This approach handles the maybe-playing tracks that wouldn't be in our tracks
  // if we queried them locally.

  loadPlaylistContents(db, userIndex, playlist.remoteId, contents => {
    if (contents.length !== 0) {
      // Reordering calls deal in entry ids, not track ids.
      const currentOrdering = [];
      const desiredOrdering = [];
      const idToEntryId = {};

      for (let i = 0; i < contents.length; i++) {
        idToEntryId[contents[i].track.id] = contents[i].entryId;
        currentOrdering.push(contents[i].entryId);
      }

      const remoteTracks = contents.map(c => c.track);

      Trackcache.orderTracks(db, playlist, remoteTracks, orderedTracks => {
        for (let i = 0; i < orderedTracks.length; i++) {
          const track = orderedTracks[i];
          desiredOrdering.push(idToEntryId[track.id]);
        }

        // It's ridiculous that javascript doesn't have a builtin for this.
        // Thankfully we have simple items and can get away with this hack.
        if (JSON.stringify(currentOrdering) !== JSON.stringify(desiredOrdering)) {
          // The two empty strings are sentinels for "first track" and "last track".
          // This lets us send our entire reordering at once without calculating the relative movements.
          // I'm not sure if the interface was intended to be used this way, but it seems to work.
          const payload = [['', 1], [desiredOrdering, '', '']];
          authedGMRequest('changeplaylisttrackorder', payload, userIndex, 'post', response => {
            // TODO These should all be checked for errors.
            // It looks like responses will have [[0, 1, 1], [call-specific response]] on success.
            callback(response);
          }, onError);
        } else {
          // Avoid triggering a ui refresh on noop reorderings.
          console.log('no need to reorder playlist', playlist.title);
          callback(null);
        }
      }, onError);
    } else {
      console.log('no need to reorder empty playlist', playlist.title);
      callback(null);
    }
  }, onError);
};
