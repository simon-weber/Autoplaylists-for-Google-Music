'use strict';

const Qs = require('qs');

const Reporting = require('./reporting');

function onReady() {
  const userId = Qs.parse(location.search.substring(1)).userId;

  $('#sync-now').click(e => {
    e.preventDefault();
    chrome.runtime.sendMessage({action: 'forceUpdate', userId});
    location.reload(true);
  });
}

function main() {
  Reporting.reportHit('syncpage.js');
  $(onReady);
}

main();
