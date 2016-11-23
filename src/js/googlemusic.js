'use strict';

const Lf = require('lovefield');
const Qs = require('qs');

const Track = require('./track');
const Trackcache = require('./trackcache');
const Playlist = require('./playlist');
const Splaylist = require('./splaylist');

const Reporting = require('./reporting');

const GM_BASE_URL = 'https://play.google.com/music/';
const GM_SERVICE_URL = `${GM_BASE_URL}services/`;

function authedGMRequest(endpoint, data, user, method, callback, onError) {
  // Call an endpoint and callback with it's parsed response.

  let format = '';
  let payload = {json: JSON.stringify(data)};
  if (data.constructor === Array || method === 'get') {
    format = 'format=jsarray&';
    if (method !== 'get') {
      payload = JSON.stringify(data);
    }
  }

  const url = `${GM_SERVICE_URL}${endpoint}?${format}${Qs.stringify({u: user.userIndex, xt: user.xt})}`;

  // TODO this is stupid
  let dataType = 'json';
  if (method === 'get') {
    dataType = 'html';
  }

  let ajaxOnError = onError;
  if (typeof onError === 'undefined') {
    ajaxOnError = res => {
      console.error('request failed:', url, data, res);
      Reporting.Raven.captureMessage(`request to ${endpoint} failed`, {
        extra: {url, data, res},
        stacktrace: true,
      });
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
  .fail(ajaxOnError);
}

exports.getTrackChanges = function getTrackChanges(user, sinceTimestamp, callback) {
  // Callback {success: true, newTimestamp: 1234, upsertedTracks: [{}], deletedIds: ['']}, or {success: false, ...} on failure.
  // timestamps are in microseconds.
  const payload = {
    lastUpdated: sinceTimestamp,
    tier: 1, // TODO need proper tier?
    requestCause: 1,
    sessionId: '',
  };

  console.debug('getTrackChanges', sinceTimestamp);

  authedGMRequest('streamingloadalltracks', payload, user, 'get', response => {
    // Try to parse a json response first, which is sent for errors.
    try {
      const jsonResponse = JSON.parse(response);

      console.warn('received json response from streamingloadalltracks:', response);

      if (!(jsonResponse.success === false && jsonResponse.reloadXsrf)) {
        Reporting.Raven.captureMessage('unexpected json response from streamingloadalltracks', {
          extra: {jsonResponse},
          stacktrace: true,
        });
      }

      return callback(jsonResponse);
    } catch (SyntaxError) {
      // eslint-disable-line no-empty
    }

    // Otherwise, parse the javascript from the html response.
    const result = {newTimestamp: null, upsertedTracks: [], deletedIds: []};

    const parser = new DOMParser();
    const doc = parser.parseFromString(response, 'application/xml');

    const scripts = doc.getElementsByTagName('script');

    // want arg to window.parent['slat_process']
    const startMark = '\nwindow.parent[\'slat_process\'](';
    const endMark = '000]';
    for (let i = 0; i < scripts.length; i++) {
      let code = scripts[i].innerHTML;
      let start = code.indexOf(startMark);
      if (start === -1) {
        continue;
      }

      let end = code.lastIndexOf(endMark);

      start += startMark.length;
      end += endMark.length;
      code = code.slice(start, end);

      const parsed = eval(code);

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

      console.debug(parsed[0].length, 'tracks');
    }

    result.success = true;
    const summary = {
      success: result.success,
      newTimestamp: result.newTimestamp,
      numUpsertedTracks: result.upsertedTracks.length,
      numDeletedIds: result.deletedIds.length,
    };
    console.debug('getTrackChanges success:', JSON.stringify(summary));
    callback(result);
  }, ajaxError => {
    const result = {success: false};
    if (ajaxError.status === 403) {
      result.unauthed = true;
    } else {
      console.error('unexpected streamingload response', JSON.stringify(ajaxError));
      Reporting.Raven.captureMessage('unexpected streamingload response', {
        extra: {ajaxError, payload, user},
        stacktrace: true,
      });
    }
    console.debug('getTrackChanges failure:', JSON.stringify(result));
    callback(result);
  });
};

exports.updatePlaylist = function updatePlaylist(user, id, title, playlist, playlists, splaylistcache, callback) {
  // Callback no args after updating an existing playlist.
  const description = Playlist.toString(playlist, playlists, splaylistcache);
  const syncMsg = `Synced ${new Date().toLocaleString()} by Autoplaylists for Google Music™ to contain: ${description}.`;

  const payload = [['', 1], [id, null, title, syncMsg]];
  console.debug('updatePlaylist', playlist);

  authedGMRequest('editplaylist', payload, user, 'post', response => {
    console.debug('editPlaylist response:', JSON.stringify(response));
    callback();
  });
};

exports.createRemotePlaylist = function createRemotePlaylist(user, title, callback) {
  // Callback a playlist id for a new, empty playlist.
  const payload = [['', 1], [false, title, null, []]];

  console.debug('createRemotePlaylist', title);

  // response:
  // [[0,2,0] ,["id","some long base64 string",null,timestamp]]
  authedGMRequest('createplaylist', payload, user, 'post', response => {
    console.debug('createplaylist response:', JSON.stringify(response));
    callback(response[1][0]);
  });
};

exports.deleteRemotePlaylist = function deleteRemotePlaylist(user, remoteId, callback) {
  // Callback no args after deleting a playlist.

  const payload = {
    id: remoteId,
    requestCause: 1,
    requestType: 1,
    sessionId: '',
  };

  console.debug('deleteRemotePlaylist', remoteId);

  authedGMRequest('deleteplaylist', payload, user, 'post', response => {
    console.debug('delete playlist response', response);
    callback();
  });
};

function addTracks(user, playlistId, tracks, callback, onError) {
  // Append these tracks and callback the api response, or null if adding 0 tracks.

  if (tracks.length === 0) {
    console.debug('skipping add of 0 tracks');
    return callback(null);
  }

  console.debug('adding', tracks.length, 'tracks. first 5 are', JSON.stringify(tracks.slice(0, 5), null, 2));

  // [["<sessionid>",1],["<listid>",[["<store id or songid>",tracktype]]]]
  const payload = [['', 1],
    [
      // Google always sends [id, type] pairs, but that's caused problems for me around AA and store ids and types.
      // Just sending an id seems to work, so maybe that'll fix everything?
      playlistId, tracks.map(t => [t.id]),
    ],
  ];
  authedGMRequest('addtrackstoplaylist', payload, user, 'post', response => {
    console.debug('add response', JSON.stringify(response, null, 2));
    if (response.length <= 1 || response[1].length <= 0 || response[1][0] === 0) {
      // I used to think a [0] response array of 0, 2, 0 signaled errors,
      // but I've seen some successful responses with that recently.
      // 0 instead of the update timestamp seems a better indicator of errors.
      let responseArray = null;
      if (response.length > 0) {
        responseArray = JSON.stringify(response[0]);
      }

      Reporting.Raven.captureMessage('probable error from addTracks', {
        tags: {playlistId, responseArray},
        extra: {response, playlistId, tracks},
        stacktrace: true,
      });
    }
    callback(response);
  }, onError);
}

function deleteEntries(user, playlistId, entries, callback, onError) {
  // Delete entries with id and entryId keys; callback the api response.
  console.debug('deleting', entries.length, 'entries. first 5 are', JSON.stringify(entries.slice(0, 5), null, 2));
  const payload = [
    ['', 1],
    [playlistId, entries.map(entry => entry.id), entries.map(entry => entry.entryId)],
  ];
  authedGMRequest('deleteplaylisttrack', payload, user, 'post', response => {
    console.debug('delete response', JSON.stringify(response, null, 2));
    callback(response);
  }, onError);
}

exports.getPlaylistContents = function getPlaylistContents(user, playlistId, callback, onError) {
  // Callback a list of objects with entryId and track keys.

  const payload = [['', 1], [playlistId]];
  authedGMRequest('loaduserplaylist', payload, user, 'post', response => {
    if (response.length < 2) {
      return onError(`unexpected getPlaylistContents response: ${JSON.stringify(response, null, 2)}`);
    }

    const contents = [];

    if (response[1].length !== 0) {
      const gentries = response[1][0];
      console.debug('playlist', playlistId, 'has', gentries.length, 'entries. first 3:',
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
};

exports.getPlaylists = function getPlaylists(user, callback, onError) {
  // Callback a list of splaylists.

  const payload = [['', 1], []];
  authedGMRequest('loadplaylists', payload, user, 'post', response => {
    if (response.length < 2 || !Array.isArray(response[1][0])) {
      return onError(`unexpected loadplaylists response: ${JSON.stringify(response, null, 2)}`);
    }

    const splaylists = [];
    const gplaylists = response[1][0];

    for (let i = 0; i < gplaylists.length; i++) {
      splaylists.push(Splaylist.fromJsproto(gplaylists[i]));
    }

    callback(splaylists);
  }, error => {
    onError(error);
  });
};

exports.setPlaylistContents = function setPlaylistContents(db, user, playlistId, tracks, callback, onError) {
  // Update a remote playlist to contain only the given tracks, in any order.

  // This requires multiple requests:
  // 1) get playlist tracks
  // 2) delete current - desired
  // 3) add desired - current

  exports.getPlaylistContents(user, playlistId, contents => {
    if (contents.length !== 0) {
      const idsToAdd = {};
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        idsToAdd[track.id] = track;
      }

      const entriesToDelete = [];
      for (let i = 0; i < contents.length; i++) {
        const remoteTrack = contents[i].track;
        const entryId = contents[i].entryId;

        if (!(remoteTrack.id in idsToAdd)) {
          entriesToDelete.push({id: remoteTrack.id, entryId});
        } else {
          delete idsToAdd[remoteTrack.id];
        }
      }

      const tracksToAdd = [];
      for (const id in idsToAdd) {
        tracksToAdd.push(idsToAdd[id]);
      }

      if (entriesToDelete.length > 0) {
        console.debug('deleting');
        deleteEntries(user, playlistId, entriesToDelete, deleteResponse => { // eslint-disable-line no-unused-vars
          // We log the delete response inside deleteEntries and have no other need for it here.
          console.debug('adding post-delete');
          addTracks(user, playlistId, tracksToAdd, callback);
        });
      } else {
        console.debug('no need to delete; adding');
        addTracks(user, playlistId, tracksToAdd, callback, onError);
      }
    } else {
      console.debug('adding to empty');
      addTracks(user, playlistId, tracks, callback, onError);
    }
  }, onError);
};

exports.setPlaylistOrder = function setPlaylistOrder(db, user, playlist, callback, onError) {
  // Set the remote ordering of a playlist according to playlist's sort order.
  // This trusts that the remote contents are already correct.

  // This approach handles the maybe-playing tracks that wouldn't be in our tracks
  // if we queried them locally.

  exports.getPlaylistContents(user, playlist.remoteId, contents => {
    if (contents.length !== 0) {
      // Reordering calls deal in entry ids, not track ids.
      const currentOrdering = [];
      const desiredOrdering = [];
      const idToEntryId = {};

      for (let i = 0; i < contents.length; i++) {
        idToEntryId[contents[i].track.id] = contents[i].entryId;
        currentOrdering.push(contents[i].entryId);
      }

      const remoteTrackIds = contents.map(c => c.track.id);

      Trackcache.orderTracks(db, playlist, remoteTrackIds, orderedTracks => {
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
          authedGMRequest('changeplaylisttrackorder', payload, user, 'post', response => {
            // TODO These should all be checked for errors.
            // It looks like responses will have [[0, 1, 1], [call-specific response]] on success.
            callback(response);
          }, onError);
        } else {
          // Avoid triggering a ui refresh on noop reorderings.
          console.debug('no need to reorder playlist', playlist.title);
          callback(null);
        }
      }, e => {
        console.error(e);
        onError(e);
      });
    } else {
      console.debug('no need to reorder empty playlist', playlist.title);
      callback(null);
    }
  }, onError);
};
