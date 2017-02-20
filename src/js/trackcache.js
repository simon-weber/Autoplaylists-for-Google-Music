'use strict';

const Lf = require('lovefield');
require('sugar'); // monkeypatches Date

const Track = require('./track');
const Storage = require('./storage');

const Reporting = require('./reporting');

// {userId: <lovefield db>}
// lovefield docs say to avoid multiple calls to connect, even with a close in between.
// so, dbs are treated like singletons.
const _dbs = {};

// Return a lovefield db for this user.
// Will always return the same reference for a user on multiple calls.
exports.openDb = function openDb(userId, callback) {
  if (_dbs[userId]) {
    callback(_dbs[userId]);
    return;
  }

  console.log('opening db');
  const schemaBuilder = Lf.schema.create(`ltracks_${userId}`, 1);

  let table = schemaBuilder.createTable('Track');

  Track.fields.forEach(field => {
    table = table.addColumn(field.name, field.type);

    if (field.name === 'id') {
      table = table.addPrimaryKey(['id']);
    } else {
      table = table.addNullable([field.name]);
      if (!field.hidden) {
        table = table.addIndex(`idx_${field.name}`, [field.name], false, Lf.Order.DESC);
      }
    }
  });

  schemaBuilder.connect({storeType: Lf.schema.DataStoreType.MEMORY})
  .then(db => {
    _dbs[userId] = db;
    callback(db);
  })
  .catch(err => {
    console.error(err);
    Reporting.Raven.captureMessage('schemaBuilder.connect', {
      extra: {err},
      stacktrace: true,
    });
  });
};

exports.upsertTracks = function upsertTracks(db, userId, tracks, callback) {
  console.log('cache: upserting', tracks.length, 'tracks');
  const track = db.getSchema().table('Track');

  const rows = [];
  for (let i = 0; i < tracks.length; i++) {
    rows.push(track.createRow(tracks[i]));
  }

  db.insertOrReplace().into(track).values(rows).exec()
  .then(callback)
  .catch(err => {
    console.error(err);
    Reporting.Raven.captureMessage('db.insertOrReplace', {
      extra: {err},
      stacktrace: true,
    });
  });
};

exports.deleteTracks = function deleteTracks(db, userId, trackIds, callback) {
  console.log('cache: deleting', trackIds.length, 'tracks');
  const track = db.getSchema().table('Track');
  db.delete().from(track).where(track.id.in(trackIds)).exec()
  .then(callback)
  .catch(err => {
    console.error(err);
    Reporting.Raven.captureMessage('db.delete', {
      extra: {err},
      stacktrace: true,
    });
  });
};

function escapeForRegex(s) {
  // Return a copy of the string s with regex control characters escaped.
  // Source: http://stackoverflow.com/a/3561711.
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');  // eslint-disable-line no-useless-escape
}

function buildWhereClause(track, playlistsById, splaylistcache, resultCache, db, rule) {
  // Promise a clause for use in a lovefield where() predicate, or null to select all tracks.
  let clause = null;
  let boolOp = null;

  if ('any' in rule) {
    boolOp = 'any';
  } else if ('all' in rule) {
    boolOp = 'all';
  }

  if (boolOp !== null) {
    // Handle boolean clauses.
    const subrules = rule[boolOp];
    const lfOp = boolOp === 'all' ? Lf.op.and : Lf.op.or;

    const subClausePs = subrules
    .map(buildWhereClause.bind(undefined, track, playlistsById, splaylistcache, resultCache, db));

    return Promise.all(subClausePs)
    .then(subClauses => {
      // We need to handle nulls from recursive calls, as well as empty subrule arrays.
      const validClauses = subClauses.filter(c => c !== null);
      if (validClauses.length > 0) {
        clause = lfOp.apply(Lf.op, validClauses);
      }
      return clause;
    });
  }

  if ('value' in rule && 'operator' in rule) {
    // Handle leaf clauses.
    let value = rule.value;
    let operator = rule.operator;

    if (rule.name === 'playlist') {
      if (rule.value[0] === 'P') {
        // splaylist
        let orderedEntries = [];
        try {
          orderedEntries = splaylistcache.splaylists[rule.value.substring(1)].orderedEntries;
        } catch (e) {
          // This is likely a desync between the rules and splaylist state.
          // It's often triggered on the first sync (since the cache is racing to sync first).
          console.error(e);
          Reporting.Raven.captureException(e, {
            level: 'warning',
            tags: {playlistId: rule.value},
            extra: {splaylistcache, rule},
          });
        }

        const trackIdList = orderedEntries.map(entry => entry.trackId);
        clause = Lf.op.or(
          track.id.in(trackIdList),
          track.storeId.in(trackIdList)
        );
        if (rule.operator === 'notEqualTo') {
          clause = Lf.op.not(clause);
        }
        return Promise.resolve(clause);
      }
      // playlist
      const linkedPlaylist = playlistsById[rule.value];
      return new Promise(resolve => {
        exports.queryTracks(db, splaylistcache, linkedPlaylist, resultCache, resolve);
      }).then(tracks => {
        const trackIdList = tracks.map(t => t.id);
        clause = Lf.op.or(
          track.id.in(trackIdList),
          track.storeId.in(trackIdList)
        );
        if (rule.operator === 'notEqualTo') {
          clause = Lf.op.not(clause);
        }

        return clause;
      });
    }
    // non-playlist leaf
    if (Track.fieldsByName[rule.name].is_datetime) {
      value = Date.create(rule.value).getTime() * 1000;
    }
    if (rule.operator === 'in-month') {
      // We want a specific month; we basically want dates between the specified value and a month from it
      // FIXME: ideally, we should check that the start value is a 1st of a month at midnight
      var valueStart = value;
      var valueEnd = Date.create(rule.value).advance({ month: 1 }).getTime() * 1000;
      clause = track[rule.name]['between'](valueStart, valueEnd);
      return Promise.resolve(clause);
    }

    if (rule.operator === 'match') {
      operator = 'match';
      value = new RegExp(escapeForRegex(value));
    } else if (rule.operator === 'match-regex') {
      operator = 'match';
      value = new RegExp(value);
    } else if (rule.operator === 'match-insensitive') {
      operator = 'match';
      value = new RegExp(escapeForRegex(value), 'i');
    } else if (rule.operator === 'no-match') {
      operator = 'match';
      // Negative lookahead on each character.
      // Source: http://stackoverflow.com/a/957581/1231454
      value = new RegExp(`^((?!${escapeForRegex(value)}).)*$`);
    } else if (rule.operator === 'no-match-insensitive') {
      operator = 'match';
      value = new RegExp(`^((?!${escapeForRegex(value)}).)*$`, 'i');
    } else if (rule.operator === 'eq-insensitive') {
      operator = 'match';
      value = new RegExp(`^${escapeForRegex(value)}$`, 'i');
    } else if (rule.operator === 'neq-insensitive') {
      // Negative lookahead once.
      // Source: http://stackoverflow.com/a/2964653.
      operator = 'match';
      value = new RegExp(`^(?!${escapeForRegex(value)}$)`, 'i');
    }

    clause = track[rule.name][operator](value);
    return Promise.resolve(clause);
  }
  console.error('should have returned already');
}

function execQuery(db, track, whereClause, playlist, callback, onError) {
  let query = db.select().from(track);

  if (whereClause !== null) {
    query = query.where(whereClause);
  }

  for (let i = 0; i < playlist.sorts.length; i++) {
    const sort = playlist.sorts[i];
    const orderBy = track[sort.sortBy];
    const order = Lf.Order[sort.sortByOrder];
    query = query.orderBy(orderBy, order);
  }

  if (playlist.limit) {
    query = query.limit(playlist.limit);
  }

  query.exec().then(callback).catch(onError);
}

exports.queryTracks = function queryTracks(db, splaylistcache, playlist, resultCache, callback) {
  // Callback a list of tracks that should be in the playlist, or null on problems.

  if (playlist.localId in resultCache) {
    console.info('using cached results for', playlist.localId, resultCache);
    return callback(resultCache[playlist.localId]);
  }

  Storage.getPlaylistsForUser(playlist.userId, playlists => {
    const playlistsById = {};
    for (let i = 0; i < playlists.length; i++) {
      const p = playlists[i];
      playlistsById[p.localId] = p;
    }

    const track = db.getSchema().table('Track');
    buildWhereClause(track, playlistsById, splaylistcache, resultCache, db, playlist.rules)
    .then(whereClause => {
      execQuery(db, track, whereClause, playlist, results => {
        resultCache[playlist.localId] = results;  // eslint-disable-line no-param-reassign
        callback(results);
      }, err => {
        console.error('execQuery', err);
        Reporting.Raven.captureMessage('execQuery', {
          tags: {playlistId: playlist.remoteId},
          extra: {playlist, err},
          stacktrace: true,
        });
        return callback(null);
      });
    })
    .catch(e => {
      console.error(e);
      Reporting.Raven.captureException(e, {
        tags: {playlistId: playlist.remoteId},
        extra: {playlist},
      });
      return callback(null);
    });
  });
};

exports.orderTracks = function orderTracks(db, playlist, trackIds, callback, onError) {
  // Return a copy of tracks, ordered by playlist's sort rules.
  // Tracks that wouldn't normally be in playlist are allowed.

  const track = db.getSchema().table('Track');
  const whereClause = track.id.in(trackIds);

  execQuery(db, track, whereClause, playlist, callback, onError);
};
