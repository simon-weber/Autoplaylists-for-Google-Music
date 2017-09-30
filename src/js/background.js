'use strict';

const Qs = require('qs');
const SortedMap = require('collections/sorted-map');

const Auth = require('./auth');
const Lf = require('lovefield');  // made available for debugQuery eval
const License = require('./license');
const Page = require('./page');
const Splaylistcache = require('./splaylistcache');
const Storage = require('./storage');
const Syncing = require('./syncing');
const Track = require('./track');
const Trackcache = require('./trackcache');
const Utils = require('./utils');

const Context = require('./context');
const Reporting = require('./reporting');

const MUSIC_URL = 'https://play.google.com/music/listen';

const LIST_CREATION_MS = new Date(2017, 6, 16).getTime();  // July 17th

// {userId: {userIndex: int, tabId: int, xt: string, tier: string, gaiaId: string}}
const users = {};

// handle tabs.onUpdated firing duplicate events.
const TAB_COOLDOWN_MS = 10 * 1000;
const tabIdsInCooldown = new Set();

// {userId: <lovefield db>}
const dbs = {};

// {userId: splaylistCache}
const splaylistcaches = {};

// {userId: <timestamp>}
const pollTimestamps = {};

// set to a string at startup
let primaryGaiaId = null;

let syncsHaveStarted = false;

const manager = new Syncing.Manager(users, dbs, splaylistcaches, pollTimestamps);

function initSyncs(userId) {
  // Fill caches, then set the periodic sync schedule based on the last periodic sync.
  // This may also sync immediately if we're overdue for a sync.
  // now >= last-sync + sync-period: sync immediately. Next sync at now + sync-period.
  // now < last-sync + sync-period: don't sync. Next sync at last-sync + sync-period

  if (syncsHaveStarted) {
    console.log("request to init syncs, but they're already started");
    return;
  }

  new Promise(resolve => {
    Syncing.initLibrary(userId, resolve);
  }).then(() => {
    splaylistcaches[userId] = Splaylistcache.open();
    return Syncing.syncSplaylistcache(userId);
  }).then(() => {
    // This must be done after the caches are set up to avoid periodic updates racing them.
    Storage.getLastPSync(lastPSync => {
      console.log('initSyncSchedule. lastPSync was', new Date(lastPSync));
      Storage.getSyncMs(initSyncMs => {
        console.info(`sync interval initially ${initSyncMs}ms, ${initSyncMs / 1000 / 60}m`);
        const nextExpectedSync = new Date(lastPSync + initSyncMs);
        const now = new Date();
        let startDelayId = null;

        if (nextExpectedSync < now) {
          // We're overdue; sync now.
          console.info('sync overdue; starting periodic syncs now');
          startPeriodicSyncs();
        } else {
          // The next sync is in the future.
          const startDelay = nextExpectedSync.getTime() - now.getTime();
          console.info(`delaying syncs for ~${Math.round(startDelay / 1000 / 60)} minutes`);
          startDelayId = setTimeout(startPeriodicSyncs, startDelay);

          // Sync immediately if the startDelay if the sync period changes.
          // This isn't ideal, but it's much simpler than changing the delay.
          Storage.addSyncMsChangeListener(change => { // eslint-disable-line no-unused-vars
            clearTimeout(startDelayId);
            if (!syncsHaveStarted) {
              console.info('sync period updated during delay; syncing now');
              startPeriodicSyncs();
            }
          });
        }
      });
    });
  });
}

function startPeriodicSyncs() {
  if (syncsHaveStarted) {
    console.log("request to init syncs, but they're already started");
    return;
  }

  syncsHaveStarted = true;

  Storage.getSyncMs(initSyncMs => {
    let syncIntervalId = null;

    // Don't sync at 0 period or more often than one minute.
    // (The latter should also be prevented by the ui.)
    if (initSyncMs >= 60 * 1000) {
      periodicUpdate();
      syncIntervalId = setInterval(periodicUpdate, initSyncMs);
    }

    // Handle updates to the sync period.
    Storage.addSyncMsChangeListener(change => {
      const oldSyncMs = change.oldValue;
      const syncMs = change.newValue;
      console.info('sync interval changing to', syncMs);

      if (syncIntervalId !== null) {
        clearInterval(syncIntervalId);
      }

      syncIntervalId = null;
      if (syncMs >= 60 * 1000) {
        syncIntervalId = setInterval(periodicUpdate, syncMs);
        if (oldSyncMs === 0) {
          console.info('syncs turning back on; syncing now');
          periodicUpdate();
        }
      }
    });
  });
}

function periodicUpdate() {
  const now = new Date();
  Storage.setLastPSync(now.getTime(), () => {
    console.log('set lastPSync to', now);
  });

  for (const userId in users) {
    manager.requestSync({userId, action: 'update-all'});
  }
}

function showPageAction(request, tabId) {
  if (!(request.userId)) {
    console.warn('received falsey user id from page action');
    Reporting.Raven.captureMessage('received falsey user id from page action', {
      level: 'warning',
      extra: {user_id: request.userId},
    });

    return;
  }

  // In the case that an existing tab/index was changed to a new user,
  // remove the old entry.
  for (const userId in users) {
    if (users[userId].tabId === tabId ||
        users[userId].userIndex === request.userIndex) {
      delete users[userId];
    }
  }

  console.log('see user', request.userId, users);
  if (request.gaiaId !== primaryGaiaId) {
    console.warn('user is not the primary user');
    chrome.pageAction.show(tabId);
    return;
  }

  let tier = 'free';
  if (request.tier === 2) {
    tier = 'aa';
  }

  users[request.userId] = {userIndex: request.userIndex, tabId, xt: request.xt, tier};

  License.hasFullVersion(false, hasFullVersion => { console.log('precached license status:', hasFullVersion); });

  // FIXME store this in sync storage and include it in context?
  // That'd mean we wouldn't get it immediately, though, so maybe this is better.
  Reporting.Raven.setTagsContext({tier: request.tier});
  Reporting.GATracker.set('dimension3', request.tier);
  Reporting.reportHit('showPageAction');

  Auth.getToken(false, 'userDetected', token => {
    Auth.verifyToken(token, verifiedToken => {
      if (verifiedToken) {
        // Only start syncs if we already have auth.
        // If we don't, they'll be forced to provide it when clicking the page action.
        Track.resetRandomCache();
        initSyncs(request.userId);
      }
    });
  });

  chrome.pageAction.show(tabId);

  Storage.getShouldNotPlugList(shouldNotPlugList => {
    if (shouldNotPlugList) {
      return;
    }

    License.getLicense(false, cachedLicense => {
      if (cachedLicense !== null && parseInt(cachedLicense.license.createdTime, 10) < LIST_CREATION_MS) {
        chrome.notifications.create('plugList', {
          type: 'basic',
          title: 'Autoplaylists now has a mailing list!',
          message: 'Subscribe for occasional announcements, usually about new features.',
          iconUrl: 'icon-128.png',
          buttons: [{title: 'Sign up', iconUrl: 'email.svg'}],
        });
        Reporting.reportHit('plugListNotification');
        Storage.setShouldNotPlugList(true, () => {});
      }
    });
  });

  Storage.getShouldNotUpsell(shouldNotUpsell => {
    if (shouldNotUpsell) {
      return;
    }

    License.getLicenseStatus(false, licenseStatus => {
      if (licenseStatus.state === 'FREE_TRIAL_EXPIRED') {
        chrome.notifications.create('upsell', {
          type: 'basic',
          title: 'Your Autoplaylists trial has expired!',
          message: 'Buy the full version to continue using unlimited playlists.',
          iconUrl: 'icon-128.png',
          buttons: [{title: 'Buy now', iconUrl: 'key.svg'}],
        });
        Reporting.reportHit('upsellNotification');
        Storage.setShouldNotUpsell(true, () => {});
      }
    });
  });

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
}

function initTab(tabId) {
  tabIdsInCooldown.add(tabId);
  setTimeout(() => tabIdsInCooldown.delete(tabId), TAB_COOLDOWN_MS);

  console.info('injecting getuser for', tabId);

  Page.getUserInfo().then(userInfo => {
    showPageAction(userInfo, tabId);
  });
}

function main() {
  Storage.getBatchingEnabled(batchingEnabled => {
    console.log('batching on?', batchingEnabled);
    manager.batchingEnabled = batchingEnabled;
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url.startsWith(MUSIC_URL)) {
      console.log('noticed music tab', tabId);
      if (tabIdsInCooldown.has(tabId)) {
        console.info('tab in cooldown; not injecting for', tabId);
        return;
      }

      initTab(tabId);
    }
  });

  Auth.getToken(false, 'startup', token => {
    Auth.verifyToken(token, verifiedToken => {
      if (!verifiedToken) {
        Storage.getShouldNotWelcome(shouldNotWelcome => {
          if (!shouldNotWelcome) {
            console.info('welcoming');
            const url = chrome.extension.getURL('html/welcome.html');

            // Pause to give Chrome time to launch a window.
            setTimeout(Utils.focusOrCreateExtensionTab, 5 * 1000, url);
          }
        });
      }
    });
  });

  chrome.identity.getProfileUserInfo(userInfo => {
    primaryGaiaId = userInfo.id;
  });

  Storage.addPlaylistChangeListener(change => {
    const hasOld = 'oldValue' in change;
    const hasNew = 'newValue' in change;

    let action;
    let relevantChange;
    if (hasOld && !hasNew) {
      action = 'delete';
      relevantChange = change.oldValue;
    } else {
      action = 'update'; // or create
      relevantChange = change.newValue;
    }

    const syncDetails = {action, userId: relevantChange.userId, localId: relevantChange.localId};
    if (action === 'delete') {
      syncDetails.remoteId = change.oldValue.remoteId;
    }
    manager.requestSync(syncDetails);
  });

  chrome.pageAction.onClicked.addListener(tab => {
    console.log('page action click for', tab);
    chrome.notifications.clear('zeroPlaylists');

    Page.getUserInfo().then(userInfo => {
      const gaiaId = userInfo.gaiaId;
      if (gaiaId === primaryGaiaId) {
        const userId = Object.keys(users)[0];
        Auth.getToken(false, 'pageAction', token => {
          Auth.verifyToken(token, verifiedToken => {
            if (!verifiedToken) {
              console.info('asking for auth');
              Auth.getToken(true, 'pageAction', token2 => {
                if (token2) {
                  console.info('got auth on prompt', token2.slice(0, 10));
                  // FIXME the sync can race playlist creation.
                  initSyncs(userId);
                  const qstring = Qs.stringify({userId});
                  const url = chrome.extension.getURL('html/playlists.html');
                  Utils.focusOrCreateExtensionTab(`${url}?${qstring}`);
                }
              });
            } else {
              console.log('already had auth', verifiedToken.slice(0, 10));
              const qstring = Qs.stringify({userId});
              const url = chrome.extension.getURL('html/playlists.html');
              Utils.focusOrCreateExtensionTab(`${url}?${qstring}`);
            }
          });
        });
      } else {
        console.warn('multiuser page action click from', gaiaId, 'expected', primaryGaiaId);
        Reporting.Raven.captureMessage('multiuser page action click', {
          level: 'warning',
          extra: {gaiaId, primaryGaiaId, users},
        });
        Reporting.reportHit('multiuserPageActionClick');

        const url = chrome.extension.getURL('html/multi-user.html');
        Utils.focusOrCreateExtensionTab(url);
      }
    });
  });

  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId === 'zeroPlaylists') {
      chrome.tabs.create({url: 'https://autoplaylists.simon.codes/#usage'});
      chrome.notifications.clear(notificationId);
      Reporting.reportHit('zeroPlaylistsHelpButton');
    } else if (notificationId === 'plugList') {
      chrome.tabs.create({url: 'http://eepurl.com/cWe_bf'});
      chrome.notifications.clear(notificationId);
      Reporting.reportHit('plugListSignupButton');
    } else if (notificationId === 'upsell') {
      chrome.tabs.create({url: 'https://chrome.google.com/webstore/detail/autoplaylists-for-google/blbompphddfibggfmmfcgjjoadebinem'});
      chrome.notifications.clear(notificationId);
      Reporting.reportHit('upsellButton');
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
      // TODO this should probably be distinguished from normal periodic syncs.
      manager.requestSync({userId: request.userId, action: 'update-all'});
    } else if (request.action === 'query') {
      const db = dbs[request.playlist.userId];
      const splaylistcache = splaylistcaches[request.playlist.userId];
      Trackcache.queryTracks(db, splaylistcache, request.playlist, {}, tracks => {
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
      // FIXME the cache may not exist yet and we have no way of waiting for it.
      let cache = splaylistcaches[request.userId];
      if (!cache) {
        cache = Splaylistcache.open();
        Reporting.Raven.captureMessage('got getSplaylistcache, but cache not synced yet', {
          level: 'warning',
          extra: {request},
        });
      }
      sendResponse(cache);
      return;
    }
  });

  Page.getTabs().then(tabs => {
    if (tabs.length > 0) {
      console.info('detected startup tab', tabs[0]);
      initTab(tabs[0].id);
    }
  });

  Reporting.reportHit('load');
}

Storage.handleMigrations(main);
