'use strict';

const Qs = require('qs');
const moment = require('moment');

const Storage = require('./storage');
const License = require('./license');
const Reporting = require('./reporting');

// TODO push lengthy ops into the background script

function initializeForm(userId, playlists) {
  $('#sync-now').click(e => {
    e.preventDefault();
    chrome.runtime.sendMessage({action: 'forceUpdate', userId});
  });

  $('#check-license').click(e => {
    e.preventDefault();
    License.getLicenseStatus(true, licenseStatus => {
      let reportAction = 'invalid';
      let msg = 'Sorry, either the Chrome licensing api is unavailable' +
       " or it reported that you haven't purchased the full version.";
      if (licenseStatus.state === 'FULL') {
        reportAction = 'valid';
        msg = "Thanks for purchasing the full version! You've been upgraded." +
          ' Please consider rating the extension if you like it.';
      }

      Reporting.reportActivation(reportAction);
      alert(msg);

      if (licenseStatus.state === 'FULL') {
        // don't upsell users who downgrade later on
        Storage.setShouldNotUpsell(true, () => {
          location.reload(true);
        });
      }
    });
  });

  License.getLicenseStatus(false, licenseStatus => {
    const $playlists = $('#playlists');

    if (licenseStatus.state === 'FULL' || licenseStatus.state === 'FULL_FORCED') {
      $('#version-header').text('Version: full');
      $('#upgrade-wrapper').hide();
    } else if (licenseStatus.state === 'FREE_TRIAL') {
      const expiresRepr = moment().to(moment(licenseStatus.expiresMs));
      $('#version-header').text(`Version: trial (expires ${expiresRepr})`);
    } else {
      $('#version-header').text('Version: free');
    }

    const $links = [];
    for (let i = 0; i < playlists.length; i++) {
      const playlist = playlists[i];
      const isLocked = (!licenseStatus.hasFullVersion && (i > (License.FREE_PLAYLIST_COUNT - 1)));
      const qs = {
        userId,
        id: playlist.localId,
      };
      const href = `/html/playlist.html?${Qs.stringify(qs)}`;
      let $link = $('<a>', {href, text: playlist.title});

      if (isLocked) {
        $link
        .addClass('locked')
        .wrap(`<div class="hint--right" data-hint="The free version allows only ${License.FREE_PLAYLIST_REPR}.` +
              ' This playlist is not being synced."/>');
        $link = $link.parent();
      }

      console.log(playlist);
      $links.push($link);
    }

    // Present sorted playlists, but don't use that to determine which get locked.
    $links.sort((a, b) => (a.text() < b.text() ? -1 : 1));
    for (let i = 0; i < $links.length; i++) {
      $playlists.append($('<li>').append($links[i]));
    }

    if (!licenseStatus.hasFullVersion && (playlists.length >= License.FREE_PLAYLIST_COUNT)) {
      $('#add-playlist')
      .addClass('locked')
      .addClass('disabled')
      .wrap(`<div class="hint--right" data-hint="The free version allows only ${License.FREE_PLAYLIST_REPR}.` +
           ' Upgrade to add more."/>');
    }
  });

  License.getDevStatus(devStatus => {
    if (devStatus.isDev) {
      let verb = 'enable';
      if (devStatus.isFullForced) {
        verb = 'disable';
      }

      $('#dev-tools').append(
        $(`<button id="force-full-license" class="menu-button">${verb} full license</button>`)
        .click(e => {
          e.preventDefault();
          License.setFullForced(!devStatus.isFullForced, () => {
            document.location.reload(true);
          });
        })
      );
    }
  });
}

function onReady() {
  const userId = Qs.parse(location.search.substring(1)).userId;

  $('#add-playlist').attr('href', `/html/playlist.html?${Qs.stringify({userId})}`);
  $('#import-export').attr('href', `/html/port.html?${Qs.stringify({userId})}`);
  $('#settings').attr('href', `/html/settings.html?${Qs.stringify({userId})}`);

  Storage.getPlaylistsForUser(userId, playlists => {
    initializeForm(userId, playlists);
  });
}

function main() {
  Reporting.reportHit('playlists_editor.js');
  $(onReady);
}

main();
