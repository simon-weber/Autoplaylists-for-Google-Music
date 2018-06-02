'use strict';
const Track = require('./track');

// playlist fields:
//   * localId: id in our extension sync data
//   * remoteId: id in Google Music
//   * title
//   * rules: the query to find tracks with
//   * userId: Google Music user id
//   * sorts: [{sortBy, sortByOrder}]
//   * limit
//   * updatedAt: ms timestamp, used to trigger syncs of unchanged playlists when saved

function ruleToString(rule, linkedNames) {
  // Return a string representation of a rule, parenthesised if necessary.
  // linkedNames maps playlist rule values onto that playlist's title.
  if (rule.name === 'playlist') {
    const operators = Track.operators.select;
    const operator = operators.filter(o => o.name === rule.operator)[0];
    return `playlist ${operator.label} "${linkedNames[rule.value]}"`;
  } else if (rule.name === 'playlistTitle') {
    const operators = Track.operators.string;
    const operator = operators.filter(o => o.name === rule.operator)[0];
    return `playlist title ${operator.label} "${rule.value}"`;
  } else if (rule.name) {
    const field = Track.fieldsByName[rule.name];
    // FIXME this is duplicated in playlist_editor
    const type = field.is_datetime ? 'datetime' : Track.lfToBusinessTypes[field.type];
    const operators = Track.operators[type];
    const operator = operators.filter(o => o.name === rule.operator)[0];
    return `${field.label} ${operator.label} ${JSON.stringify(rule.value)}`;
  } else if (rule.all || rule.any) {
    const subRules = rule.all || rule.any;
    if (subRules.length === 1) {
      return ruleToString(subRules[0], linkedNames);
    } else if (subRules.length > 1) {
      const subRulesStr = subRules.map(r => ruleToString(r, linkedNames)).filter(s => s.length).join(rule.any ? ' or ' : ' and ');
      return `(${subRulesStr})`;
    }
  }
  return '';
}

function lfOrderToString(lfOrder) {
  let str = 'ascending';
  if (lfOrder === 'DESC') {
    str = 'descending';
  }

  return str;
}

function sortToString(sort) {
  // FIXME this should use a label (eg 'playlist count' instead of 'playlistCount')
  return `${sort.sortBy} ${lfOrderToString(sort.sortByOrder)}`;
}

exports.toString = function toString(playlist, playlists, splaylistcache) {
  const sorts = playlist.sorts.map(sortToString).join(', ');

  const linkedNames = {};
  for (let i = 0; i < playlists.length; i++) {
    const p = playlists[i];
    linkedNames[p.localId] = p.title;
  }

  for (const splaylistId in splaylistcache.splaylists) {
    const s = splaylistcache.splaylists[splaylistId];
    linkedNames['P' + s.id] = s.title;
  }

  return `${ruleToString(playlist.rules, linkedNames)} sorted by: ${sorts}`;
};

function involvedFieldNames(rule) {
  // Return an object mapping field names to true for any fields involved in this rule.
  const fieldNames = {};


  if (rule.name && rule.name !== 'playlist' && rule.name !== 'playlistTitle') {
    fieldNames[rule.name] = true;
  } else if (rule.all || rule.any) {
    const subRules = rule.all || rule.any;
    const allSubFieldNames = subRules.map(involvedFieldNames);

    for (let i = 0; i < allSubFieldNames.length; i++) {
      for (const fieldName in allSubFieldNames[i]) {
        fieldNames[fieldName] = true;
      }
    }
  }
  return fieldNames;
}

exports.involvedFields = function involvedFields(playlist) {
  // Return an object mapping field names to true for any fields involved in this playlist.
  const fieldNames = involvedFieldNames(playlist.rules);
  for (let i = 0; i < playlist.sorts.length; i++) {
    fieldNames[playlist.sorts[i].sortBy] = true;
  }

  return fieldNames;
};

function deleteReferences(id, rules) {
  // id is either a localID or a remoteId with P prepended.
  let newRules;

  if (Array.isArray(rules)) {
    newRules = [];
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!('name' in rule)) {
        // Recurse on compound rules.
        newRules.push(deleteReferences(id, rule));
      } else if (rule.name !== 'playlist' || rule.value !== id) {
        // Keep all atomic rules other than those matching the id.
        newRules.push(rule);
      }
    }
  } else if (rules.all) {
    /* eslint-disable no-param-reassign */
    rules.all = deleteReferences(id, rules.all);
    newRules = rules;
  } else {
    rules.any = deleteReferences(id, rules.any);
    newRules = rules;
    /* eslint-enable no-param-reassign */
  }

  return newRules;
}

exports.deleteAllReferences = function deleteAllReferences(id, playlists) {
  // id is either a localID or a remoteId with P prepended.
  for (let i = 0; i < playlists.length; i++) {
    const playlist = playlists[i];
    playlist.rules = deleteReferences(id, playlist.rules);
  }
};
