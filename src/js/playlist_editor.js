'use strict';

const Qs = require('qs');
const Sortable = require('sortablejs');

const Chrometools = require('./chrometools.js');
const Storage = require('./storage.js');
const Track = require('./track.js');
require('./raven.js');

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
    {name: 'match', label: 'contains', input_type: 'text'},
    {name: 'match-insensitive', label: 'contains (case ignored)', input_type: 'text'},
    {name: 'no-match', label: 'does not contain', input_type: 'text'},
    {name: 'no-match-insensitive', label: 'does not contain (case ignored)', input_type: 'text'},
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

function createSort(fields, isLocked) {
  const $sort = $('<li>');
  const $sortBy = $('<select class="sort-by">');
  const $sortByOrder = $(
    '<select class="sort-by-order">' +
    '   <option value="ASC">ascending</option>' +
    '   <option value="DESC">descending</option>' +
    '</select');
  const $remove = $('<a class="remove" href="javascript:void(0)">Remove</a>');
  $remove.click(e => {
    e.preventDefault();
    $sort.remove();
  });

  fields.forEach(field => {
    $('<option>').val(field.name).text(field.label).appendTo($sortBy);
  });

  $sort.append($sortBy);
  $sort.append($sortByOrder);
  if (!isLocked) {
    $sort.append($remove);
  } else {
    $sortBy.prop('disabled', true);
    $sortByOrder.prop('disabled', true);
  }

  return $sort;
}

function parseSorts($sorts) {
  const sorts = [];

  $sorts.children().each((idx, li) => {
    const sort = [];
    $(li).children('select').each((idx2, select) => {
      sort.push($(select).val());
    });
    sorts.push({sortBy: sort[0], sortByOrder: sort[1]});
  });

  return sorts;
}

function initializeForm(userId, playlistId, isLocked) {
  const initConditions = getRulesData();
  let initialPlaylist = null;
  const $conditions = $('#conditions');

  console.log(userId, playlistId);

  const $sorts = $('#sorts');
  if (!isLocked) {
    Sortable.create($sorts[0]);
  }
  const $explanations = $('#explanations');

  sortedFields.forEach(field => {
    if (field.explanation) {
      $('<li>').text(`${field.label}: ${field.explanation}`).appendTo($explanations);
    }
  });

  if (playlistId) {
    Storage.getPlaylist(userId, playlistId, loadedPlaylist => {
      initialPlaylist = loadedPlaylist;
      $('#playlist-title').val(loadedPlaylist.title);

      console.log('loading playlist', loadedPlaylist);
      initConditions.data = loadedPlaylist.rules;
      if (isLocked) {
        initConditions.disabled = true;
      }
      $conditions.conditionsBuilder(initConditions);

      $('#limit-to').val(loadedPlaylist.limit);

      for (let i = 0; i < loadedPlaylist.sorts.length; i++) {
        const sort = loadedPlaylist.sorts[i];
        const $sort = createSort(sortedFields, isLocked);
        $sort.children('.sort-by').val(sort.sortBy);
        $sort.children('.sort-by-order').val(sort.sortByOrder);
        $sorts.append($sort);
      }
    });
  } else {
    console.log('creating empty form');
    $conditions.conditionsBuilder(initConditions);
    $('#playlist-title').val('[auto] new playlist').focus();
    $sorts.append(createSort(sortedFields, isLocked));
    $('#delete').hide();
  }

  function readForm() {
    const playlist = initialPlaylist || {};
    const playlistRules = $('#conditions').conditionsBuilder('data');

    if (!('localId' in playlist)) {
      playlist.localId = `${new Date().getTime()}`;
    }

    playlist.title = $('#playlist-title').val() || '[untitled autoplaylist]';
    playlist.rules = playlistRules;
    playlist.userId = userId;
    playlist.limit = Math.min(1000, parseInt($('#limit-to').val(), 10));
    playlist.sorts = parseSorts($('#sorts'));

    return playlist;
  }


  $('#add-sort').click(e => {
    e.preventDefault();
    $('#sorts').append(createSort(sortedFields, isLocked));
  });

  $('#submit').click(e => {
    e.preventDefault();
    const playlist = readForm();

    console.log('writing', playlist);

    Storage.savePlaylist(playlist, () => {
      Chrometools.goToManager(userId);
    });
  });

  $('#test').click(e => {
    e.preventDefault();

    const playlist = readForm();
    console.log('testing', playlist);

    // When testing, show the total number of matched tracks.
    playlist.limit = null;

    $('#query-result').text('');
    chrome.runtime.sendMessage({action: 'query', playlist}, response => {
      const matchedNote = `Matched ${response.tracks.length} tracks.`;
      let trackDetails = '';

      if (response.tracks.length > 0) {
        trackDetails = `The first was:\n${Track.toString(response.tracks[0])}`;
      }

      $('#query-result').text(`${matchedNote}\n${trackDetails}`);
    });
  });

  $('#delete').click(e => {
    e.preventDefault();
    Storage.deletePlaylist(userId, playlistId, () => {
      Chrometools.goToManager(userId);
    });
  });

  if (isLocked) {
    $('#drag-explanation').remove();
    $('#limit-explanation').remove();
    $('input').prop('disabled', true);
    $('select').prop('disabled', true);
    $('a').remove();

    $('#submit, #test')
    .addClass('locked')
    .addClass('disabled')
    .wrap('<div class="hint--top" data-hint="The free version allows only one playlist.' +
         ' This one is locked to editing."/>');
  }
}

function main() {
  const qstring = Qs.parse(location.search.substring(1));
  initializeForm(qstring.userId, qstring.id, qstring.locked === 'true');
}

$(main);
