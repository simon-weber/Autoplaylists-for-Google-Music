'use strict';

const Qs = require('qs');
const moment = require('moment');

const Reporting = require('./reporting');

function onReady() {
  const userId = Qs.parse(location.search.substring(1)).userId;

  chrome.runtime.sendMessage({action: 'getStatus'}, status => {
    console.log('got status', status);
    $('#random-ts-ago').text(moment(new Date(status.randomCacheTS)).fromNow());
  });

  $('#sync-now').click(e => {
    e.preventDefault();
    chrome.runtime.sendMessage({action: 'forceUpdate', userId});
    location.reload(true);
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
