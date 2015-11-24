'use strict';

const Qs = require('qs');

const Storage = require('./storage.js');
const Track = require('./track.js');

// jscs:disable requireCamelCaseOrUpperCaseIdentifiers
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

// jscs:enable requireCamelCaseOrUpperCaseIdentifiers

function getRulesData() {
  const variables = [];
  Track.fields.forEach(field => {
    variables.push({
      name: field.name,
      label: field.label,
      field_type: field.is_datetime ? 'datetime' : Track.lfToBusinessTypes[field.type],  // jscs:ignore requireCamelCaseOrUpperCaseIdentifiers
      options: [],
    });
  });

  return {
    variables: variables,
    actions: [],
    variable_type_operators: operators,  // jscs:ignore requireCamelCaseOrUpperCaseIdentifiers
  };
}

function goToManager(userId) {
  window.location.href = '/html/manager.html?' + Qs.stringify({userId: userId});
}

function initializeForm(userId, playlistId) {
  const initConditions = getRulesData();
  let playlist = {};
  let localId = playlistId;
  const conditions = $('#conditions');

  console.log(userId, localId);

  if (localId) {
    Storage.getPlaylist(userId, localId, loadedPlaylist => {
      playlist = loadedPlaylist;
      $('#playlist-title').val(playlist.title);

      console.log('loading playlist', playlist);
      initConditions.data = playlist.rules;
      conditions.conditionsBuilder(initConditions);
    });
  } else {
    console.log('creating empty form');
    conditions.conditionsBuilder(initConditions);
  }

  $('#submit').click(function submit(e) {
    e.preventDefault();
    const playlistRules = conditions.conditionsBuilder('data');

    if (!localId) {
      localId = '' + new Date().getTime();
      playlist.localId = localId;
    }

    playlist.title = $('#playlist-title').val();
    playlist.rules = playlistRules;
    playlist.userId = userId;

    console.log('writing', playlist);

    Storage.savePlaylist(playlist, () => {
      goToManager(userId);
    });
  });

  $('#delete').click(function deletePlaylist(e) {
    e.preventDefault();
    Storage.deletePlaylist(userId, localId, () => {
      goToManager(userId);
    });
  });
}

function main() {
  const qstring = Qs.parse(location.search.substring(1));
  initializeForm(qstring.userId, qstring.id);
}

$(main);
