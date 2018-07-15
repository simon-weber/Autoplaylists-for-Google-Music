'use strict';

const Qs = require('qs');

const Utils = require('./utils');

const Reporting = require('./reporting');

// const GM_BASE_URL = 'htt[s://mclients.googleapis.com/sj/v1.11/';
const GM_BASE_URL = 'https://www.googleapis.com/sj/v2.5/';

function authedGMRequest(options, callback, onError) {
  // Call an endpoint and callback with it's parsed response.

  const endpoint = options.endpoint;
  const data = options.data;
  const method = options.method;
  const params = options.params;

  const qstring = Qs.stringify(params);

  const url = `${GM_BASE_URL}${endpoint}?${qstring}`;
  const dataType = 'json';

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

  chrome.identity.getAuthToken(Utils.unlessError(token => {
    const request = {
      type: method,
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      url,
      dataType,
    };

    if (data) {
      request.data = JSON.stringify(data);
    }

    $.ajax(request)
    .fail(ajaxOnError)
    .done(callback);
  }, ajaxOnError));
}

exports.buildPlaylistAdd = function buildPlaylistAdd(name, description) {
  // Return a playlist mutation to create a playlist.
  return {
    create: {
      name,
      description,
      creationTimestamp: '-1',
      deleted: false,
      lastModifiedTimestamp: '0',
      type: 'USER_GENERATED',
      shareState: 'PRIVATE',
    },
  };
};

exports.buildPlaylistUpdates = function buildPlaylistUpdates(updates) {
  // updates is a list of objects. Each must have 'id', and at least one of 'name', 'description', or 'shareState'.
  const mutations = [];
  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    mutations.push({update});
  }

  return mutations;
};

exports.buildPlaylistDeletes = function buildPlaylistDeletes(playlistIds) {
  const mutations = [];

  for (let i = 0; i < playlistIds.length; i++) {
    mutations.push({'delete': playlistIds[i]});
  }

  return mutations;
};

exports.runPlaylistMutations = function runPlaylistMutations(user, mutations) {
  // Promise an api response.
  Reporting.reportMutationBatch('playlist', mutations);

  if (mutations.length === 0) {
    console.info('skipping empty playlist sync');
    Reporting.reportNewSync('success', 'Playlist', 0);
    return Promise.resolve({mutate_response: []});
  }

  const details = {
    endpoint: 'playlistbatch',
    method: 'post',
    data: {mutations},
    params: {
      'dv': 0,
      'hl': 'en-US',
      'tier': user.tier,
    },
  };
  return new Promise((resolve, reject) => {
    authedGMRequest(details, response => {
      Reporting.reportNewSync('success', 'Playlist', mutations.length);
      resolve(response);
    }, err => {
      console.error('playlistbatch failed', err);
      Reporting.reportNewSync('failure', 'Playlist', mutations.length);
      reject(err);
    });
  });
};


// getNext: function(pageToken, callback) => callback(response)
// callback a list of items
function consumePages(getNext, pageToken, items, callback) {
  getNext(pageToken, response => {
    if (!response) {
      return callback(items);
    }

    if ('data' in response) {
      for (let i = 0; i < response.data.items.length; i++) {
        items.push(response.data.items[i]);
      }
    }

    const nextPageToken = response.nextPageToken;
    if (nextPageToken) {
      consumePages(getNext, nextPageToken, items, callback);
    } else {
      callback(items);
    }
  });
}

exports.getPlaylistChanges = function getPlaylistChanges(user, sinceTimestamp, callback) {
  console.debug('getPlaylistChanges', sinceTimestamp);
  const details = {
    endpoint: 'playlists',
    method: 'GET',
    data: null,
    params: {
      'dv': 0,
      'hl': 'en-US',
      'tier': user.tier,
      'max-results': 20000,
    },
  };

  if (sinceTimestamp !== null) {
    details.params['updated-min'] = sinceTimestamp;
  }

  function _getPlaylistChanges(pageToken, _callback) {
    if (pageToken) {
      details.params['start-token'] = pageToken;
    }

    authedGMRequest(details, response => {
      _callback(response);
    }, err => {
      console.error('getPlaylistChanges call failed:', err);
      _callback(undefined);
    });
  }

  consumePages(_getPlaylistChanges, null, [], items => {
    callback(items);
  });
};

exports.getEntryChanges = function getEntryChanges(user, sinceTimestamp, callback) {
  console.debug('getEntryChanges', sinceTimestamp);
  const details = {
    endpoint: 'plentries',
    method: 'GET',
    data: null,
    params: {
      'dv': 0,
      'hl': 'en-US',
      'tier': user.tier,
      'max-results': 20000,
    },
  };

  if (sinceTimestamp !== null) {
    details.params['updated-min'] = sinceTimestamp;
  }

  function _getEntryChanges(pageToken, _callback) {
    if (pageToken) {
      details.params['start-token'] = pageToken;
    }

    authedGMRequest(details, response => {
      _callback(response);
    }, err => {
      console.error('getEntryChanges call failed:', err);
      _callback(undefined);
    });
  }

  consumePages(_getEntryChanges, null, [], items => {
    callback(items);
  });
};

exports.buildEntryDeletes = function buildEntryDeletes(entryIds) {
  const mutations = [];

  for (let i = 0; i < entryIds.length; i++) {
    mutations.push({'delete': entryIds[i]});
  }

  return mutations;
};

exports.buildEntryReorders = function buildEntryReorders(reorders) {
  const mutations = [];

  for (let i = 0; i < reorders.length; i++) {
    mutations.push({'update': reorders[i]});
  }

  return mutations;
};

exports.buildEntryAppends = function buildEntryAppends(playlistId, trackIds) {
  const mutations = [];
  let prevId = null;
  let curId = Utils.uuidV1();
  let nextId = Utils.uuidV1();

  for (let i = 0; i < trackIds.length; i++) {
    const trackId = trackIds[i];
    const mutationBody = {
      'clientId': curId,
      'creationTimestamp': '-1',
      'deleted': false,
      'lastModifiedTimestamp': '0',
      'playlistId': playlistId,
      'source': 1,
      trackId,
    };

    if (trackId.startsWith('T')) {
      mutationBody.source = 2;
    }

    if (i > 0) {
      mutationBody.precedingEntryId = prevId;
    }
    if (i < trackIds.length - 1) {
      mutationBody.followingEntryId = nextId;
    }

    mutations.push({'create': mutationBody});
    prevId = curId;
    curId = nextId;
    nextId = Utils.uuidV1();
  }

  return mutations;
};

exports.runEntryMutations = function runEntryMutations(user, mutations) {
  // Promise an api response.
  Reporting.reportMutationBatch('entry', mutations);

  if (mutations.length === 0) {
    console.info('skipping empty entry sync');
    Reporting.reportNewSync('success', 'Entry', 0);
    return Promise.resolve({mutate_response: []});
  }

  const details = {
    endpoint: 'plentriesbatch',
    method: 'post',
    data: {mutations},
    params: {
      'dv': 0,
      'hl': 'en-US',
      'tier': user.tier,
    },
  };
  return new Promise((resolve, reject) => {
    authedGMRequest(details, response => {
      Reporting.reportNewSync('success', 'Entry', mutations.length);
      resolve(response);
    }, err => {
      console.error('playlistbatch failed', err);
      Reporting.reportNewSync('failure', 'Entry', mutations.length);
      reject(err);
    });
  });
};

exports.getConfig = function getConfig(user) {
  // Promise an api response.
  const details = {
    endpoint: 'config',
    method: 'get',
    params: {
      'dv': 0,
      'hl': 'en-US',
      'tier': user.tier,
    },
  };
  return new Promise((resolve, reject) => {
    authedGMRequest(details, response => {
      resolve(response);
    }, err => {
      console.error('config failed', err);
      reject(err);
    });
  });
};
