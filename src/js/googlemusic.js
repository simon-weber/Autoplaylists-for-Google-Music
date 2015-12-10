'use strict';

const Qs = require('qs');

const Chrometools = require('./chrometools.js');
const Track = require('./track.js');
const Playlist = require('./playlist.js');

const GM_BASE_URL = 'https://play.google.com/music/';
const GM_SERVICE_URL = GM_BASE_URL + 'services/';

function authedGMRequest(endpoint, data, userIndex, method, callback) {
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

      const url = GM_SERVICE_URL + endpoint + '?' + format + Qs.stringify({u: userIndex, xt: cookie.value});

      // TODO this is stupid
      let dataType = 'json';
      if (method === 'get') {
        dataType = 'html';
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
      .fail(res => { console.error('request failed:', url, data, res); });
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
  const description = 'Managed by Autoplaylists for Google Music™ to contain: ' + Playlist.toString(playlist);
  const payload = [['', 1], [id, null, title, description]];
  authedGMRequest('editplaylist', payload, userIndex, 'post', response => {
    console.log(response);
    callback();
  });
};

exports.createRemotePlaylist = function createRemotePlaylist(userIndex, title, callback) {
  // Callback a playlist id for a new, empty playlist.
  const payload = [['', 1], [false, title, null, []]];

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

  authedGMRequest('deleteplaylist', payload, userIndex, 'post', response => {
    console.log('delete playlist response', response);
    callback();
  });
};

function addTracks(userIndex, playlistId, tracks, callback) {
  // Append these tracks and callback the api response, or null if adding 0 tracks.

  if (tracks.length === 0) {
    console.log('skipping add of 0 tracks');
    return callback(null);
  }

  console.log('adding', tracks.length);

  // [["<sessionid>",1],["<listid>",[["<store id or songid>",tracktype]]]]
  const payload = [['', 1],
    [
      playlistId, tracks.map(t => {return [Track.getPlaylistAddId(t), t.type];}),
    ],
  ];
  authedGMRequest('addtrackstoplaylist', payload, userIndex, 'post', response => {
    console.log('add response', response);
    callback(response);
  });
}

exports.setPlaylistTo = function setPlaylistTo(userIndex, playlistId, tracks, callback) {
  // Update a remote playlist to contain only the given ordering of tracks.

  // inefficient three step process:
  // 1) get playlist tracks
  // 2) delete current - desired
  // 3) add desired - current
  const payload = [['', 1], [playlistId]];
  authedGMRequest('loaduserplaylist', payload, userIndex, 'post', response => {
    console.log('load response', response);
    if (response[1].length !== 0) {
      const gentries = response[1][0];

      const idsToAdd = {};
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        idsToAdd[Track.getPlaylistAddId(track)] = track;
      }

      const entriesToDelete = [];
      for (let i = 0; i < gentries.length; i++) {
        const gentry = gentries[i];
        const remoteTrack = Track.fromJsproto(gentry);

        if (!(Track.getPlaylistAddId(remoteTrack) in idsToAdd)) {
          // tracks that can only be added with store ids can be deleted with library ids.
          entriesToDelete.push({id: remoteTrack.id, entryId: gentry[43]});
        } else {
          delete idsToAdd[Track.getPlaylistAddId(remoteTrack)];
        }
      }

      const tracksToAdd = [];
      for (const id in idsToAdd) {
        tracksToAdd.push(idsToAdd[id]);
      }

      if (entriesToDelete.length > 0) {
        console.log('deleting', entriesToDelete.length);
        const payload2 = {
          songIds: entriesToDelete.map(entry => {return entry.id;}),

          entryIds: entriesToDelete.map(entry => {return entry.entryId;}),

          listId: playlistId,
          sessionId: '',
        };
        authedGMRequest('deletesong', payload2, userIndex, 'post', response2 => {
          console.log('delete response', response2);
          addTracks(userIndex, playlistId, tracksToAdd, callback);
        });
      } else {
        console.log('no need to delete; adding');
        addTracks(userIndex, playlistId, tracksToAdd, callback);
      }
    } else {
      console.log('adding to empty');
      addTracks(userIndex, playlistId, tracks, callback);
    }
  });
};
