'use strict';

const Auth = require('./auth');
const Reporting = require('./reporting');

function main() {
  Reporting.reportHit('newsyncing.js');

  $('#get-auth').click(e => {
    e.preventDefault();

    Auth.getToken(true, 'upgrade', token => {
      console.log(token.slice(0, 10));
      chrome.tabs.getCurrent(tab => {
        chrome.tabs.remove(tab.id, () => {});
      });
    });
  });
}

$(main);
