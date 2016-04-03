'use strict';

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
 * Return a list of jsproto tracks from the local indexedDb.
 */
function getGtracks(callback) {
  const dbName = `music_${userId}`;
  const DBOpenRequest = window.indexedDB.open(dbName, 6);

  DBOpenRequest.onerror = err => {
    console.error('could not open db', err);
    Reporting.Raven.captureException(err);
    return callback(null);
  };

  DBOpenRequest.onsuccess = event => { // eslint-disable-line no-unused-vars
    console.log('opened');
    const db = DBOpenRequest.result;

    let objectStore = null;
    try {
      const transaction = db.transaction(['tracks'], 'readonly');
      objectStore = transaction.objectStore('tracks');
    } catch (e) {
      // Sometimes the indexeddb just isn't written at all.
      // This happens for the very first load of Music, and maybe other cases.
      console.error(e);
      Reporting.Raven.captureException(e);
      return callback(null);
    }

    const gtracks = [];
    let cursorRequest;
    try {
      cursorRequest = objectStore.openCursor();
    } catch (e) {
      console.error(e);
      Reporting.Raven.captureException(e);
      return callback(null);
    }

    cursorRequest.onsuccess = event2 => {
      const cursor = event2.target.result;
      if (cursor) {
        const shard = JSON.parse(cursor.value);
        for (const id in shard) {
          gtracks.push(shard[id]);
        }

        cursor.continue();
      } else {
        console.log('all done');
        callback(gtracks);
      }
    };

    cursorRequest.onerror = err => {
      console.error(err);
      Reporting.Raven.captureException(err);
      return callback(null);
    };
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
      getGtracks(gtracks => {
        if (gtracks === null) {
          console.log('sending null');
          sendResponse({tracks: null});
        } else {
          console.log('sending', gtracks.length);
          sendResponse({tracks: gtracks.map(Track.fromJsproto)});
        }
      });
      return true;
    } else if (request.action === 'getXsrf') {
      injectCode(getInjectCode(false));
    }
  });

  injectCode(getInjectCode(true));
}

main();
