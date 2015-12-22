'use strict';

const Qs = require('qs');

const Storage = require('./storage.js');

let userId = null;
let eventPlaylists = null;

function onDrag(event) {
  event.dataTransfer.setData('application/json', JSON.stringify(eventPlaylists));
}

function onDrop(event) {
  console.log(event.dataTransfer.getData('application/json'));
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
