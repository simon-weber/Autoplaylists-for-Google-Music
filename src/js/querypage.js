'use strict';

// This script expects to have a config variable injected to it.

const Qs = require('qs');

const Reporting = require('./reporting');

const ID = config.id;  // eslint-disable-line no-undef
const ACTION = config.action; // eslint-disable-line no-undef

console.log('querypage', ID, ACTION);

// This only exists in a multi-login session.
const USER_INDEX = Qs.parse(location.search.substring(1)).u || '0';

// Inject some javascript (as a string) into the DOM.
function injectCode(code) {
  const script = document.createElement('script');
  script.textContent = code;
  (document.head || document.documentElement).appendChild(script);
  script.parentNode.removeChild(script);
}

function getInjectCode(id) {
  // context[12] is the email for authenticated users.
  // FIXME this should always send a response, even with not authed
  /* eslint-disable prefer-template,no-undef */
  const code = '(' + function inject() {
    if (window.USER_CONTEXT[12] !== '') {
      window.postMessage(
        {contentScriptId: contentScriptIdRepr,
          userId: window.USER_ID,
          tier: window.USER_CONTEXT[13],
          gaiaId: window.USER_CONTEXT[32],
          xt: window._GU_getCookie('xt')},
        '*');
    }
  } + ')()';
  /* eslint-enable prefer-template,no-undef */

  // We need to actually get the value of our variable into the string, not a reference to it.
  return code.replace('contentScriptIdRepr', `${id}`);
}

/*
 * Callback an object with gtracks (a list of jsproto tracks)
 * and timestamp keys from the local indexedDb.
 * Either may be null.
 */
function queryIDB(userId, callback) {
  console.log('queryIDB', userId);
  const dbName = `music_${userId}`;
  const DBOpenRequest = window.indexedDB.open(dbName, 6);

  DBOpenRequest.onerror = err => {
    console.error('could not open db', err);
    Reporting.Raven.captureMessage('DBOpenRequest.onerror', {
      extra: {err},
    });
    callback({gtracks: null, timestamp: null});
  };

  DBOpenRequest.onsuccess = event => { // eslint-disable-line no-unused-vars
    const db = DBOpenRequest.result;

    try {
      const transaction = db.transaction(['tracks', 'info'], 'readonly');
      queryInfo(transaction.objectStore('info'), timestamp => {
        queryTracks(transaction.objectStore('tracks'), gtracks => {
          callback({timestamp, gtracks});
        });
      });
    } catch (e) {
      // Sometimes the indexeddb just isn't written at all.
      // This happens for the very first load of Music, and maybe other cases.
      console.error(e);
      callback({gtracks: null, timestamp: null});
    }
  };
}

// Callback the timestamp from the info object store, or null.
function queryInfo(infoStore, callback) {
  const infoRequest = infoStore.get('sync_token');

  infoRequest.onerror = err => {
    console.error(err);
    Reporting.Raven.captureMessage('infoRequest.onerror', {
      extra: {err},
    });
    callback(null);
  };

  infoRequest.onsuccess = event => {
    callback(event.target.result);
  };
}

// Callback a list of jsproto tracks from the tracks object store, or null.
function queryTracks(tracksStore, callback) {
  const gtracks = [];
  const tracksRequest = tracksStore.openCursor();

  tracksRequest.onerror = err => {
    console.error(err);
    Reporting.Raven.captureMessage('tracksRequest.onerror', {
      extra: {err},
    });
    callback(null);
  };

  tracksRequest.onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const shard = JSON.parse(cursor.value);
      for (const id in shard) {
        gtracks.push(shard[id]);
      }

      cursor.continue();
    } else {
      callback(gtracks);
    }
  };
}

function eventListener(event) {
  // We only accept messages from ourselves
  if (event.source !== window || event.data.contentScriptId !== ID) {
    return;
  }

  console.log('received from page', event.data);

  const userId = event.data.userId;
  const tier = event.data.tier;
  const xt = event.data.xt;
  const gaiaId = event.data.gaiaId;

  window.removeEventListener('message', eventListener);


  new Promise(resolve => {
    if (ACTION === 'getUserInfo') {
      resolve({
        tier,
        xt,
        gaiaId,
        userId: `${userId}`,
        userIndex: parseInt(USER_INDEX, 10),
      });
    } else if (ACTION === 'getLocalTracks') {
      queryIDB(userId, resolve);
    }
  }).then(result => {
    /* eslint-disable no-param-reassign */
    result.action = 'postPageResponse';
    result.contentScriptId = ID;
    /* eslint-enable no-param-reassign */
    console.info('sending result', result);
    chrome.runtime.sendMessage(result);
  });
}

function main() {
  window.addEventListener('message', eventListener);
  injectCode(getInjectCode(ID));
}

main();
