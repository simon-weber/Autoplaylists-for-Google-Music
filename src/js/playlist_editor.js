'use strict';
const Qs = require('qs');
const Sortable = require('sortablejs');

const License = require('./license');
const Playlist = require('./playlist');
const Reporting = require('./reporting');
const Storage = require('./storage');
const Track = require('./track');
const Utils = require('./utils');


const sortedFields = Track.fields.filter(e => !e.hidden);
function compareByLabel(a, b) {
  const aName = a.label.toLowerCase();
  const bName = b.label.toLowerCase();
  return ((aName < bName) ? -1 : ((aName > bName) ? 1 : 0)); // eslint-disable-line no-nested-ternary
}
sortedFields.sort(compareByLabel);

function getRulesData(playlists, playlistId, splaylistcache) {
  const variables = [];
  sortedFields.forEach(field => {
    let fieldType = Track.lfToBusinessTypes[field.type];
    let options = [];
    if (field.is_datetime) {
      fieldType = 'datetime';
    } else if (field.is_boolean) {
      fieldType = 'boolean';
      options = [{label: 'true', value: 'true'}, {label: 'false', value: 'false'}];
    }

    variables.push({
      name: field.name,
      label: field.label,
      field_type: fieldType,
      options,
    });
  });

  const otherPlaylists = playlists.filter(p => p.localId !== playlistId);
  if (otherPlaylists.length > 0 || Object.keys(splaylistcache.splaylists).length > 0) {
    const playlistOptions = [];

    // Playlists and splaylists are stored under the same label.
    // They can be distinguished by the first letter of the value:
    //   splaylists: 'P' (prepended to the remoteId)
    //   playlists: a digit (localIds are timestamps)
    // If splaylist support works out, we can unify them by treating them all like splaylists.
    for (let i = 0; i < otherPlaylists.length; i++) {
      const playlist = otherPlaylists[i];
      playlistOptions.push({label: playlist.title, value: playlist.localId});
    }

    for (const splaylistId in splaylistcache.splaylists) {
      const splaylist = splaylistcache.splaylists[splaylistId];
      if (!(splaylist.isAutoplaylist)) {
        playlistOptions.push({label: splaylist.title, value: 'P' + splaylist.id});
      }
    }

    playlistOptions.sort(compareByLabel);

    variables.push({
      name: 'playlist',
      label: 'playlist',
      field_type: 'select',
      options: playlistOptions,
    });
    variables.push({
      name: 'playlistTitle',
      label: 'playlist title',
      field_type: 'string',
      options: [],
    });
  }

  variables.sort(compareByLabel);

  return {
    variables,
    actions: [],
    variable_type_operators: Track.operators,
  };
}

function createSort(fields, isLocked) {
  const $sort = $('<li>');
  const $sortBy = $('<select class="sort-by form-control">');
  const $sortByOrder = $(
    '<select class="sort-by-order form-control">' +
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
  $('<option>').val('random').text('random (explanation below)').appendTo($sortBy);

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

function initializeForm(userId, playlistId, isLocked, playlists, splaylistcache, duplicating) {
  const initConditions = getRulesData(playlists, playlistId, splaylistcache);
  let initialPlaylist = null;
  const $conditions = $('#conditions');


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
  $('<li>').text('playlist: a playlist whose contents will be included or excluded.' +
                ' Hidden if no other playlists are available.').appendTo($explanations);
  $('<li>').html('random sort: a random total ordering, different on each refresh of the Music tab.' +
                ' See <a target="_blank" href="https://github.com/simon-weber/' +
                'Autoplaylists-for-Google-Music/wiki/Tips-and-Tricks#random-sorting">' +
                ' the wiki</a> for more details.').appendTo($explanations);

  if (playlistId) {
    const loadedPlaylist = playlists.filter(p => p.localId === playlistId)[0];
    initialPlaylist = loadedPlaylist;
    $('#playlist-title').val(loadedPlaylist.title);

    console.log('loading playlist', loadedPlaylist);
    initConditions.data = loadedPlaylist.rules;
    $conditions.conditionsBuilder(initConditions);

    $('#limit-to').val(loadedPlaylist.limit);

    for (let i = 0; i < loadedPlaylist.sorts.length; i++) {
      const sort = loadedPlaylist.sorts[i];
      const $sort = createSort(sortedFields, isLocked);
      $sort.children('.sort-by').val(sort.sortBy);
      $sort.children('.sort-by-order').val(sort.sortByOrder);
      $sorts.append($sort);
    }
  } else {
    console.log('creating empty form');
    $conditions.conditionsBuilder(initConditions);
    $('#playlist-title').val('[auto] new playlist').focus();
    $sorts.append(createSort(sortedFields, isLocked));
    $('#delete').hide();
    $('#duplicate').hide();
  }

  if (duplicating) {
    $('#delete').hide();
    $('#duplicate').hide();
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

  $('#pl-submit').click(e => {
    e.preventDefault();
    const playlist = readForm();
    playlist.updatedAt = new Date().getTime();

    console.log('writing', playlist);

    Storage.savePlaylist(playlist, () => {
      Utils.goToManager(userId);
    });
  });

  $('#test').click(e => {
    e.preventDefault();

    const playlist = readForm();
    console.log('testing', playlist);

    // Query the entire resultset, then limit it afterwards.
    const limit = playlist.limit;
    playlist.limit = null;

    chrome.runtime.sendMessage({action: 'query', playlist}, response => {
      const fullResults = response.tracks;
      const limitedResults = response.tracks.slice(0, limit);

      const columnNames = new Set();
      columnNames.add('title');
      columnNames.add('artist');
      columnNames.add('album');


      for (const fieldName in Playlist.involvedFields(playlist)) {
        if (fieldName !== 'random') {
          columnNames.add(fieldName);
        }
      }

      const columns = [];
      const datetimeRender = val => new Date(val / 1000).toLocaleString();
      for (const name of columnNames) {
        const field = Track.fieldsByName[name];
        const column = {data: name, title: field.label};
        if (field.is_datetime) {
          column.render = datetimeRender;
        }
        columns.push(column);
      }

      if ($.fn.DataTable.isDataTable('#query-result')) {
        // option destroy: true does not work when changing the number of columns,
        // so clear the table and the dom manually.
        $('#query-result').dataTable().fnDestroy();
        $('#query-result').empty();
      }

      $('#query-result').DataTable({ // eslint-disable-line new-cap
        data: limitedResults,
        dom: 'lBfrtip',
        columns,
        aaSorting: [],
        buttons: [
          {
            text: 'Ignore limit',
            action: function action(buttonE, dt, node, config) {
              config.applyLimit = !config.applyLimit; // eslint-disable-line no-param-reassign

              dt.clear();
              if (config.applyLimit) {
                dt.rows.add(limitedResults);
                this.text('Ignore limit');
              } else {
                dt.rows.add(fullResults);
                this.text('Apply limit');
              }
              dt.draw();
            },
            applyLimit: true,
          },
        ],
      });
      $('#query-modal').modal({modalClass: 'jqmodal'});
    });
  });

  $('#delete').click(e => {
    e.preventDefault();
    Storage.deletePlaylist(userId, playlistId, () => {
      Utils.goToManager(userId);
    });
  });

  $('#duplicate').click(e => {
    e.preventDefault();
    Utils.goToPlaylistEditor(userId, playlistId, true);
  });

  $('#back').click(e => {
    e.preventDefault();
    Utils.goToManager(userId);
  });

  if (isLocked) {
    $('#drag-explanation').remove();
    $('#limit-explanation').remove();
    $('input').prop('disabled', true);
    $('select').prop('disabled', true);
    $('#editor-row a').remove();

    $('#pl-submit, #test')
    .addClass('locked')
    .addClass('disabled')
    .wrap(`<div class="hint--top" data-hint="The free version allows only ${License.FREE_PLAYLIST_REPR}.` +
         ' This one is locked to editing."/>');
  }

  License.hasFullVersion(false, hasFullVersion => {
    if (!hasFullVersion && (playlists.length >= License.FREE_PLAYLIST_COUNT)) {
      $('#duplicate')
      .addClass('locked')
      .addClass('disabled')
      .wrap(`<div class="hint--right" data-hint="The free version allows only ${License.FREE_PLAYLIST_REPR}.` +
           ' Upgrade to add more."/>');
    }
  });
}

function main() {
  Reporting.reportHit('playlist_editor.js');
  const qstring = Qs.parse(location.search.substring(1));

  Storage.getPlaylistsForUser(qstring.userId, playlists => {
    chrome.runtime.sendMessage({action: 'getSplaylistcache', userId: qstring.userId}, splaylistcache => {
      if (qstring.id) {
        License.isLocked(qstring.id, playlists).then(isLocked => {
          initializeForm(qstring.userId, qstring.id, isLocked, playlists, splaylistcache, false);
        });
      } else {
        License.hasFullVersion(false, hasFullVersion => {
          const isLocked = (!hasFullVersion && (playlists.length >= License.FREE_PLAYLIST_COUNT));
          let playlistId = null;
          if (qstring.duplicateId) {
            const originalPlaylist = playlists.filter(p => p.localId === qstring.duplicateId)[0];
            const duplicatePlaylist = JSON.parse(JSON.stringify(originalPlaylist));
            duplicatePlaylist.title = `copy of ${duplicatePlaylist.title}`;
            playlistId = `${new Date().getTime()}`;
            duplicatePlaylist.localId = playlistId;
            delete duplicatePlaylist.remoteId;
            playlists.push(duplicatePlaylist);
          }

          initializeForm(qstring.userId, playlistId, isLocked, playlists, splaylistcache, Boolean(playlistId));
        });
      }
    });
  });
}

$(main);
