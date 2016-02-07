'use strict';

const Qs = require('qs');

const Chrometools = require('./chrometools.js');
const Storage = require('./storage.js');

let userId = null;
let eventPlaylists = null;

function onDrag(event) {
  event.dataTransfer.setData('application/json', JSON.stringify(eventPlaylists));
}

function onDrop(event) {
  const playlists = JSON.parse(event.dataTransfer.getData('application/json'));
  console.log(playlists);

  const playlistNames = playlists.map(p => p.title).join('\n');
  const msg = `Overwrite current playlists with these ${playlists.length}?\n${playlistNames}`;

  if (confirm(msg)) {  // eslint-disable-line no-alert
    // Convert the playlists for this user.
    for (let i = 0; i < playlists.length; i++) {
      const playlist = playlists[i];

      // This is faster than getTime granularity, so use i to avoid duplicate ids.
      playlist.localId = `${new Date().getTime()}${i}`;
      playlist.userId = userId;
      delete playlist.remoteId;
    }

    Storage.importPlaylistsForUser(userId, playlists, () => {
      Chrometools.goToManager(userId);
    });
  } else {
    console.log('did not confirm');
  }
}

function main() {
  userId = Qs.parse(location.search.substring(1)).userId;
  const $target = $('#drag-target')[0];

  Storage.getPlaylistsForUser(userId, playlists => {
    eventPlaylists = playlists;
  });

  $target.addEventListener('dragstart', onDrag);
  $target.addEventListener('drop', onDrop);
  $target.addEventListener('dragover', event => {
    // prevent default to allow drop
    event.preventDefault();
  });
}

$(main);
