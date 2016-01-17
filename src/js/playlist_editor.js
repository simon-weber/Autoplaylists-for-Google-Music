'use strict';

const Qs = require('qs');

const Chrometools = require('./chrometools.js');
const Storage = require('./storage.js');
const Track = require('./track.js');

const operators = {
  numeric: [
    {name: 'eq', label: 'equals', input_type: 'numeric'},
    {name: 'neq', label: "doesn't equal", input_type: 'numeric'},
    {name: 'lt', label: 'less than', input_type: 'numeric'},
    {name: 'lte', label: 'less than or equal', input_type: 'numeric'},
    {name: 'gt', label: 'greater than', input_type: 'numeric'},
    {name: 'gte', label: 'greater than or equal', input_type: 'numeric'},
  ],
  string: [
    {name: 'eq', label: 'equals', input_type: 'text'},
    {name: 'eq-insensitive', label: 'equals (case ignored)', input_type: 'text'},
    {name: 'neq', label: "doesn't equal", input_type: 'text'},
    {name: 'neq-insensitive', label: "doesn't equal (case ignored)", input_type: 'text'},
    {name: 'match', label: 'has regex', input_type: 'text'},
    {name: 'match-insensitive', label: 'has regex (case ignored)', input_type: 'text'},
  ],
  datetime: [
    {name: 'lt', label: 'before', input_type: 'text'},
    {name: 'gt', label: 'after', input_type: 'text'},
  ],
};


const sortedFields = [...Track.fields];
function compareByLabel(a, b) {
  const aName = a.label.toLowerCase();
  const bName = b.label.toLowerCase();
  return ((aName < bName) ? -1 : ((aName > bName) ? 1 : 0)); // eslint-disable-line no-nested-ternary
}
sortedFields.sort(compareByLabel);

function getRulesData() {
  const variables = [];
  sortedFields.forEach(field => {
    variables.push({
      name: field.name,
      label: field.label,
      field_type: field.is_datetime ? 'datetime' : Track.lfToBusinessTypes[field.type],
      options: [],
    });
  });

  variables.sort(compareByLabel);

  return {
    variables,
    actions: [],
    variable_type_operators: operators,
  };
}

function initializeForm(userId, playlistId) {
  const initConditions = getRulesData();
  let initialPlaylist = null;
  const $conditions = $('#conditions');

  console.log(userId, playlistId);

  const $sortBy = $('#sort-by');
  const $explanations = $('#explanations');


  sortedFields.forEach(field => {
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
    $('#playlist-title').val('[auto] new playlist').focus();
    $('#delete').hide();
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
      Chrometools.goToManager(userId);
    });
  });

  $('#test').click(function deletePlaylist(e) {
    e.preventDefault();

    const playlist = readForm();

    // When testing, show the total number of matched tracks.
    playlist.limit = null;

    $('#query-result').text('');
    chrome.runtime.sendMessage({action: 'query', playlist}, response => {
      const matchedNote = 'Matched ' + response.tracks.length + ' tracks.';
      let trackDetails = '';

      if (response.tracks.length > 0) {
        trackDetails = 'The first was:\n' + Track.toString(response.tracks[0]);
      }

      $('#query-result').text(matchedNote + '\n' + trackDetails);
    });
  });

  $('#delete').click(function deletePlaylist(e) {
    e.preventDefault();
    Storage.deletePlaylist(userId, playlistId, () => {
      Chrometools.goToManager(userId);
    });
  });
}

function main() {
  const qstring = Qs.parse(location.search.substring(1));
  initializeForm(qstring.userId, qstring.id);
}

$(main);
