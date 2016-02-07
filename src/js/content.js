'use strict';

const Qs = require('qs');

const Track = require('./track.js');

let userId;

function getGtracks(callback) {
  const dbName = `music_${userId}`;
  const DBOpenRequest = window.indexedDB.open(dbName, 6);

  DBOpenRequest.onerror = err => {
    console.error('could not open db', err);
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
      // sometimes the indexeddb just isn't written at all, though
      // i can't figure out why.
      console.error(e);
      return callback(null);
    }

    const gtracks = [];
    objectStore.openCursor().onsuccess = event2 => {
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

    objectStore.openCursor().onerror = err => {
      console.error(err);
      return callback(null);
    };
  };
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

    chrome.runtime.sendMessage({
      action: 'showPageAction',
      userId: `${userId}`,
      userIndex: parseInt(userIndex, 10),
    });

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
      }

      return true;
    });
  }, false);

  /* eslint-disable prefer-template */
  const code = '(' + function inject() {
    window.postMessage({userId: window.USER_ID}, '*');
  } + ')()';
  /* eslint-enable prefer-template */

  injectCode(code);
}

main();
