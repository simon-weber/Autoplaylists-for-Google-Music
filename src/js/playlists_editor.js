'use strict';

const Qs = require('qs');

const Storage = require('./storage.js');

function initializeForm(userId, playlists) {
  $('#force-update').click(e => {
    e.preventDefault();
    chrome.runtime.sendMessage({action: 'forceUpdate', userId});
  });

  const $playlists = $('#playlists');
  for (let i = 0; i < playlists.length; i++) {
    const playlist = playlists[i];
    console.log(playlist);
    $playlists.append(
      $('<li>')
      .append($('<a>', {
        text: playlist.title,
        href: '/html/playlist.html?' + Qs.stringify({id: playlist.localId, userId})}))
    );
  }
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
