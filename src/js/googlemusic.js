'use strict';

const Qs = require('qs');

const Track = require('./track');
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
  // sinceTimestamp of 0 can be used to retrieve the entire library.
  // (There's no difference when omitting it, unlike https://github.com/simon-weber/gmusicapi/issues/513).
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

exports.deleteRemotePlaylist = function deleteRemotePlaylist(user, remoteId) {
  // Promise an api response after deleting a playlist.

  const payload = {
    id: remoteId,
    requestCause: 1,
    requestType: 1,
    sessionId: '',
  };

  console.debug('deleteRemotePlaylist', remoteId);

  return new Promise((resolve, reject) => {
    authedGMRequest('deleteplaylist', payload, user, 'post', resolve, reject);
  });
};
