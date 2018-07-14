'use strict';

const Qs = require('qs');
const moment = require('moment');

const Reporting = require('./reporting');

/* eslint-disable */
// https://gist.github.com/kerimdzhanov/f6f0d2b2a57720426211
function poll(fn, callback, timeout, interval) {
  var endTime = Number(new Date()) + (timeout || 2000);
  interval = interval || 100;

  (function p() {
    fn(r => {
      if (r) {
        callback();
      }
      else if (Number(new Date()) < endTime) {
        setTimeout(p, interval);
      }
      else {
        callback(new Error('timed out for ' + fn + ': ' + arguments));
      }
    });
  })();
}
/* eslint-enable */

function onReady() {
  const userId = Qs.parse(location.search.substring(1)).userId;

  chrome.runtime.sendMessage({action: 'getStatus'}, status => {
    console.log('got status', status);
    $('#random-ts-ago').text(moment(new Date(status.randomCacheTS)).fromNow());
    $('#lastsync-type').text(status.lastSyncInfo.syncType);
    $('#lastsync-ago').text(moment(new Date(status.lastSyncInfo.ts)).fromNow());

    let nextSyncInfo = 'Periodic syncing is disabled.';
    if (status.inBackoff) {
      nextSyncInfo = 'Periodic syncing has been temporarily disabled since your account is showing signs of being overloaded.'
      + ' Syncing will resume in 30 minutes.';
      $('#sync-now').attr('disabled', true);
    } else if (status.nextExpectedSync) {
      nextSyncInfo = `The next full sync is expected ${moment(new Date(status.nextExpectedSync)).fromNow()}.`;
    }
    $('#next-sync-info').text(nextSyncInfo);
  });

  $('#sync-now').click(e => {
    e.preventDefault();
    $('#sync-now').hide();
    $('#sync-spinner').show();
    chrome.runtime.sendMessage({action: 'forceUpdate', userId});

    // The manager doesn't tell us when (or if) our sync happened, so poll lastSyncInfo to see if the last sync was recent.
    // This isn't perfect, but it's good enough for now.
    poll(callback => {
      chrome.runtime.sendMessage({action: 'getStatus'}, status => callback(new Date().getTime() - status.lastSyncInfo.ts < 60000));
    }, err => {
      if (err) {
        console.error(err);
      } else {
        location.reload(true);
      }
    }, 15000, 2000);
  });

  $('#reset-random').click(e => {
    e.preventDefault();
    chrome.runtime.sendMessage({action: 'resetRandomCache', userId}, () => {
      location.reload(true);
    });
  });
}

function main() {
  Reporting.reportHit('syncpage.js');
  $(onReady);
}

main();
