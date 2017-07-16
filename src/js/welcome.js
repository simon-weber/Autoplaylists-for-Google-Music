'use strict';

const Auth = require('./auth');
const Storage = require('./storage');

const Reporting = require('./reporting');

function main() {
  Reporting.reportHit('welcome.js');
  Storage.setShouldNotWelcome(true, () => {
    $('#get-auth').click(e => {
      e.preventDefault();

      Auth.getToken(true, 'upgrade', token => {
        console.log((token || '<falsey>').slice(0, 10));

        $('#welcome').hide();
        $('#list').show();
      });
    });
  });
}

$(main);
