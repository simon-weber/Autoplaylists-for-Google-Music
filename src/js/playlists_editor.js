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
    location.reload(true);
  });

  License.getLicenseStatus(false, licenseStatus => {
    const $playlists = $('#playlists');

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
