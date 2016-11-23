'use strict';

const Qs = require('qs');

const Chrometools = require('./chrometools');
const Storage = require('./storage');
const Reporting = require('./reporting');

function main() {
  Reporting.reportHit('settings.js');
  const userId = Qs.parse(location.search.substring(1)).userId;

  Storage.getSyncMs(syncMs => {
    $('#sync-minutes').val(syncMs / 1000 / 60);
  });

  Storage.getNewSyncEnabled(newSyncEnabled => {
    $('#enable-new-sync-api').prop('checked', newSyncEnabled);
  });

  $('#submit').click(e => {
    e.preventDefault();
    const newSyncEnabled = Boolean($('#enable-new-sync-api').prop('checked'));
    let syncMinutes = parseFloat($('#sync-minutes').val(), 10);

    if (syncMinutes <= 0) {
      syncMinutes = 0;
    } else if (syncMinutes < 1) {
      syncMinutes = 1;
    } else {
      syncMinutes = Math.ceil(syncMinutes);
    }

    const syncMs = syncMinutes * 1000 * 60;

    Storage.setSyncMs(syncMs, () => {
      Storage.setNewSyncEnabled(newSyncEnabled, () => {
        Chrometools.goToManager(userId);
      });
    });
  });
}

$(main);
