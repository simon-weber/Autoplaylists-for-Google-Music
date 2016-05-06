
const Qs = require('qs');

const Track = require('./track.js');
const Reporting = require('./reporting.js');

let userId;

/*
 * Return a string of javascript that will post a message to us.
 * isInitial should be true for the very first message, false afterwards.
 */
function getInjectCode(isInitial) {
  const isInitialRepr = isInitial ? 'true' : 'false';

  /* eslint-disable prefer-template */
  const code = '(' + function inject() {
    window.postMessage(
      {isInitial: isInitialRepr,
        userId: window.USER_ID, tier: window.USER_CONTEXT[13], xt: window._GU_getCookie('xt')}, '*');
  } + ')()';
  /* eslint-enable prefer-template */

  // We need to actually get the value of our variable into the string, not a reference to it.
  return code.replace('isInitialRepr', isInitialRepr);
}

/*
 * Inject some javascript (as a string) into the DOM.
 */
function injectCode(code) {
  const script = document.createElement('script');
  script.textContent = code;
  (document.head || document.documentElement).appendChild(script);
  script.parentNode.removeChild(script);
}

/*
 * Callback an object with tracks (a list of jsproto tracks)
 * and timestamp keys from the local indexedDb.
 * Either may be null.
 */
function queryIDB(callback) {
  const dbName = `music_${userId}`;
  const DBOpenRequest = window.indexedDB.open(dbName, 6);

  DBOpenRequest.onerror = err => {
    console.error('could not open db', err);
    Reporting.Raven.captureMessage('DBOpenRequest.onerror', {
      extra: {err},
    });
    callback(null);
  };

  DBOpenRequest.onsuccess = event => { // eslint-disable-line no-unused-vars
    const db = DBOpenRequest.result;

    try {
      const transaction = db.transaction(['tracks', 'info'], 'readonly');
      queryInfo(transaction.objectStore('info'), timestamp => {
        queryTracks(transaction.objectStore('tracks'), tracks => {
          callback({timestamp, tracks});
        });
      });
    } catch (e) {
      // Sometimes the indexeddb just isn't written at all.
      // This happens for the very first load of Music, and maybe other cases.
      console.error(e);
      Reporting.Raven.captureException(e);
      callback(null);
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

function main() {
  // This only exists in a multi-login session.
  const userIndex = Qs.parse(location.search.substring(1)).u || '0';

  // Pull the user id from the page before showing the page action.
  // Since we can't read window here, we inject code, then post a message back.

  window.addEventListener('message', event => {
    // We only accept messages from ourselves
    if (event.source !== window) {
      return;
    }

    console.log('received from page', event.data);

    userId = event.data.userId;
    const tier = event.data.tier;
    const xt = event.data.xt;
    const action = event.data.isInitial ? 'showPageAction' : 'setXsrf';

    chrome.runtime.sendMessage({
      action,
      tier,
      xt,
      userId: `${userId}`,
      userIndex: parseInt(userIndex, 10),
    });
  }, false);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('got message', request);
    if (request.action === 'getLocalTracks') {
      queryIDB(result => {
        if (result.tracks !== null) {
          result.tracks = result.tracks.map(Track.fromJsproto); // eslint-disable-line no-param-reassign
        }

        sendResponse(result);
      });
      return true;
    } else if (request.action === 'getXsrf') {
      injectCode(getInjectCode(false));
    }
  });

  injectCode(getInjectCode(true));
}

main();
