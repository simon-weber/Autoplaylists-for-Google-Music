'use strict';

const Qs = require('qs');

const Utils = require('./utils');
const Storage = require('./storage');
const Reporting = require('./reporting');

function main() {
  Reporting.reportHit('settings.js');
  const userId = Qs.parse(window.location.search.substring(1)).userId;

  Storage.getSyncMs(syncMs => {
    $('#sync-minutes').val(syncMs / 1000 / 60);
  });

  Storage.getBatchingEnabled(batchingEnabled => {
    $('#batching-enabled').prop('checked', batchingEnabled);
  });

  $('#submit').click(e => {
    e.preventDefault();
    let syncMinutes = parseFloat($('#sync-minutes').val(), 10);

    if (syncMinutes <= 0) {
      syncMinutes = 0;
    } else if (syncMinutes < 1) {
      syncMinutes = 1;
    } else {
      syncMinutes = Math.ceil(syncMinutes);
    }

    const syncMs = syncMinutes * 1000 * 60;
    const batchingEnabled = $('#batching-enabled').prop('checked');

    Storage.setSyncMs(syncMs, () => {
      Storage.setBatchingEnabled(batchingEnabled, () => {
        Utils.goToManager(userId);
      });
    });
  });
}

$(main);
