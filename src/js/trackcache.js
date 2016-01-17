'use strict';

const Lf = require('lovefield');
require('sugar'); // monkeypatches Date

const Track = require('./track.js');

exports.openDb = function openDb(userId, callback) {
  console.log('opening...');
  const schemaBuilder = Lf.schema.create('ltracks_' + userId, 1);

  let table = schemaBuilder.createTable('Track');

  Track.fields.forEach(field => {
    table = table.addColumn(field.name, field.type);

    if (field.name === 'id') {
      table = table.addPrimaryKey(['id']);
    } else {
      table = table.addNullable([field.name]);
      table = table.addIndex('idx_' + field.name, [field.name], false, Lf.Order.DESC);
    }
  });

  schemaBuilder.connect({storeType: Lf.schema.DataStoreType.MEMORY}).
    then(callback).catch(console.error);
};

exports.upsertTracks = function upsertTracks(db, userId, tracks, callback) {
  const track = db.getSchema().table('Track');

  const rows = [];
  for (let i = 0; i < tracks.length; i++) {
    rows.push(track.createRow(tracks[i]));
  }

  return db.insertOrReplace().into(track).values(rows).exec().
    then(callback).
    catch(console.error);
};

exports.deleteTracks = function deleteTracks(db, userId, trackIds, callback) {
  const track = db.getSchema().table('Track');
  db.delete().from(track).where(track.id.in(trackIds)).exec().
    then(callback).
    catch(console.error);
};

function escapeForRegex(s) {
  // Return a copy of the string s with regex control characters escaped.
  // Source: http://stackoverflow.com/a/3561711.
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function buildWhereClause(track, rule) {
  // Return a clause for use in a lovefield where() predicate, or null to select all tracks.
  let clause = null;

  if ('any' in rule && rule.any.length > 0) {
    clause = Lf.op.or.apply(Lf.op, rule.any.map(buildWhereClause.bind(undefined, track)));
  } else if ('all' in rule && rule.all.length > 0) {
    clause = Lf.op.and.apply(Lf.op, rule.all.map(buildWhereClause.bind(undefined, track)));
  } else if ('value' in rule && 'operator' in rule) {
    let value = rule.value;
    let operator = rule.operator;

    if (Track.fieldsByName[rule.name].is_datetime) {
      value = Date.create(rule.value).getTime() * 1000;
    }

    if (rule.operator === 'match-insensitive') {
      operator = 'match';
      value = new RegExp(escapeForRegex(value), 'i');
    } else if (rule.operator === 'eq-insensitive') {
      operator = 'match';
      value = new RegExp('^' + escapeForRegex(value) + '$', 'i');
    } else if (rule.operator === 'neq-insensitive') {
      // Use a regex with negative lookahead.
      // Source: http://stackoverflow.com/a/2964653.
      operator = 'match';
      value = new RegExp('^(?!' + escapeForRegex(value) + '$)', 'i');
    }

    clause = track[rule.name][operator](value);
  }

  return clause;
}

function execQuery(db, track, whereClause, playlist, callback, onError) {
  let query = db.select().from(track);

  if (whereClause !== null) {
    query = query.where(whereClause);
  }

  const orderBy = track[playlist.sortBy];
  const order = Lf.Order[playlist.sortByOrder];
  query = query.orderBy(orderBy, order);

  if (playlist.limit) {
    query = query.limit(playlist.limit);
  }

  query.exec().
    then(callback).
    catch(onError);
}

exports.queryTracks = function queryTracks(db, playlist, callback) {
  // Return a list of tracks that should be in the playlist.

  const track = db.getSchema().table('Track');
  const whereClause = buildWhereClause(track, playlist.rules);

  execQuery(db, track, whereClause, playlist, callback, console.error);
};

exports.orderTracks = function orderTracks(db, playlist, tracks, callback, onError) {
  // Return a copy of tracks, ordered by playlist's sort rules.
  // Tracks that wouldn't normally be in playlist are allowed.

  const track = db.getSchema().table('Track');
  const whereClause = track.id.in(tracks.map(t => t.id));

  execQuery(db, track, whereClause, playlist, callback, onError);
};
