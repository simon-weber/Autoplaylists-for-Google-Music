'use strict';

const Qs = require('qs');

const Storage = require('./storage.js');
const License = require('./license.js');

//TODO push lengthy ops into the background script

function initializeForm(userId, playlists) {
  $('#force-update').click(e => {
    e.preventDefault();
    chrome.runtime.sendMessage({action: 'forceUpdate', userId});
  });

  $('#check-license').click(e => {
    e.preventDefault();
    License.hasFullVersion(true, hasFullVersion => {
      let msg = 'Sorry, either the Chrome licensing api is unavailable' +
       " or it reported that you haven't purchased the full version.";
      if (hasFullVersion) {
        msg = "Thanks for purchasing the full version! You've been upgraded.";
      }

      alert(msg);

      if (hasFullVersion) {
        location.reload(true);
      }
    });
  });

  License.hasFullVersion(false, hasFullVersion => {
    const $playlists = $('#playlists');

    if (!hasFullVersion) {
      $('#add-playlist')
      .addClass('locked')
      .wrap('<div class="hint--right" data-hint="The free version allows only one playlist. Upgrade to add more."/>');
    } else {
      $('#check-license-wrapper').hide();
    }

    for (let i = 0; i < playlists.length; i++) {
      const playlist = playlists[i];
      let $link = $('<a>', {
        text: playlist.title,
        href: '/html/playlist.html?' + Qs.stringify({id: playlist.localId, userId})});

      if (i > 0 && !hasFullVersion) {
        $link.addClass('locked')
        .wrap('<div class="hint--right" data-hint="The free version allows only one playlist,' +
              ' so this playlist will not be synced."/>');
        $link = $link.parent();
      }

      console.log(playlist);
      $playlists.append($('<li>').append($link));
    }
  });

  License.isDev(isDev => {
    if (isDev) {
      License.isFullForced(forced => {
        let verb = 'enable';
        if (forced) {
          verb = 'disable';
        }

        $('#dev-tools').append(
          $(`<button id="force-full-license">${verb} full license</button>`)
          .click(e => {
            e.preventDefault();
            License.setFullForced(!forced, () => {
              document.location.reload(true);
            });
          })
        );
      });
    }
  });
}

function onReady() {
  const userId = Qs.parse(location.search.substring(1)).userId;

  $('#add-playlist').attr('href', '/html/playlist.html?' + Qs.stringify({userId}));
  $('#import-export').attr('href', '/html/port.html?' + Qs.stringify({userId}));

  Storage.getPlaylistsForUser(userId, playlists => {
    initializeForm(userId, playlists);
  });
}

function main() {
  $(onReady);
}

main();
