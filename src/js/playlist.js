'use strict';

const Qs = require('qs');

const Storage = require('./storage.js');
const Track = require('./track.js');

const operators = {
  numeric: [
    {name: 'eq', label: 'equals', input_type: 'numeric'},
    {name: 'neq', label: 'does not equal', input_type: 'numeric'},
    {name: 'lt', label: 'less than', input_type: 'numeric'},
    {name: 'lte', label: 'less than or equal to', input_type: 'numeric'},
    {name: 'gt', label: 'greater than', input_type: 'numeric'},
    {name: 'gte', label: 'greater than or equal to', input_type: 'numeric'},
  ],
  string: [
    {name: 'eq', label: 'equals', input_type: 'text'},
    {name: 'neq', label: 'does not equal', input_type: 'text'},
    {name: 'match', label: 'matches regex', input_type: 'text'},
  ],
  datetime: [
    {name: 'lt', label: 'before', input_type: 'text'},
    {name: 'gt', label: 'after', input_type: 'text'},
  ],
};

function getRulesData() {
  const variables = [];
  Track.fields.forEach(field => {
    variables.push({
      name: field.name,
      label: field.label,
      field_type: field.is_datetime ? 'datetime' : Track.lfToBusinessTypes[field.type],
      options: [],
    });
  });

  return {
    variables: variables,
    actions: [],
    variable_type_operators: operators,
  };
}

function goToManager(userId) {
  window.location.href = '/html/manager.html?' + Qs.stringify({userId: userId});
}

function initializeForm(userId, playlistId) {
  const initConditions = getRulesData();
  let initialPlaylist = null;
  const $conditions = $('#conditions');

  console.log(userId, playlistId);

  const $sortBy = $('#sort-by');
  const $explanations = $('#explanations');


  Track.fields.forEach(field => {
    $('<option>').val(field.name).text(field.label).appendTo($sortBy);
    if (field.explanation) {
      $('<li>').text(field.label + ': ' + field.explanation).appendTo($explanations);
    }
  });

  if (playlistId) {
    Storage.getPlaylist(userId, playlistId, loadedPlaylist => {
      initialPlaylist = loadedPlaylist;
      $('#playlist-title').val(loadedPlaylist.title);

      console.log('loading playlist', loadedPlaylist);
      initConditions.data = loadedPlaylist.rules;
      $conditions.conditionsBuilder(initConditions);

      $sortBy.val(loadedPlaylist.sortBy);
      $('#sort-by-order').val(loadedPlaylist.sortByOrder);
      $('#limit-to').val(loadedPlaylist.limit);
    });
  } else {
    console.log('creating empty form');
    $conditions.conditionsBuilder(initConditions);
  }

  function readForm() {
    const playlist = initialPlaylist || {};
    const playlistRules = $('#conditions').conditionsBuilder('data');

    if (!('localId' in playlist)) {
      playlist.localId = '' + new Date().getTime();
    }

    playlist.title = $('#playlist-title').val() || '[untitled autoplaylist]';
    playlist.rules = playlistRules;
    playlist.userId = userId;
    playlist.sortBy = $('#sort-by').val();
    playlist.sortByOrder = $('#sort-by-order').val();
    playlist.limit = Math.min(1000, parseInt($('#limit-to').val(), 10));

    return playlist;
  }


  $('#submit').click(function submit(e) {
    e.preventDefault();
    const playlist = readForm();

    console.log('writing', playlist);

    Storage.savePlaylist(playlist, () => {
      goToManager(userId);
    });
  });

  $('#test').click(function deletePlaylist(e) {
    e.preventDefault();

    const playlist = readForm();

    chrome.runtime.sendMessage({action: 'query', playlist: playlist}, response => {
      $('#query-result').text('query found ' + response.tracks.length + ' first was\n' + JSON.stringify(response.tracks[0], null, 2));
    });
  });

  $('#delete').click(function deletePlaylist(e) {
    e.preventDefault();
    Storage.deletePlaylist(userId, playlistId, () => {
      goToManager(userId);
    });
  });
}

function main() {
  const qstring = Qs.parse(location.search.substring(1));
  initializeForm(qstring.userId, qstring.id);
}

$(main);
