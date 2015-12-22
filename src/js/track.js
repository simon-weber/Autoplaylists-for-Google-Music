'use strict';

const Lf = require('lovefield');

function f(requiredItems, optionalItems) {
  const field = {
    protoNum: requiredItems[0],
    name: requiredItems[1],
    type: requiredItems[2],
  };

  const opt = optionalItems || {};
  field.label = opt.label || field.name;
  field.explanation = opt.explanation || '';
  field.is_datetime = opt.is_datetime || false;

  if (opt.coerce) {
    field.coerce = opt.coerce;
  } else {
    field.coerce = val => {return val;};
  }

  return field;
}

exports.fields = [
  f([0, 'id', Lf.Type.STRING]),
  f([1, 'title', Lf.Type.STRING]),
  f([3, 'artist', Lf.Type.STRING]),
  f([4, 'album', Lf.Type.STRING]),
  f([5, 'albumArtist', Lf.Type.STRING], {
    label: 'album artist'}),
  f([10, 'composer', Lf.Type.STRING]),
  f([11, 'genre', Lf.Type.STRING]),
  f([13, 'durationMillis', Lf.Type.INTEGER], {
    label: 'duration (ms)'}),
  f([14, 'track', Lf.Type.INTEGER]),
  f([15, 'totalTracks', Lf.Type.INTEGER], {
    label: 'total tracks'}),
  f([16, 'disc', Lf.Type.INTEGER]),
  f([17, 'totalDiscs', Lf.Type.INTEGER], {
    label: 'total discs'}),
  f([18, 'year', Lf.Type.INTEGER]),
  f([22, 'playCount', Lf.Type.INTEGER], {
    label: 'play count'}),
  f([23, 'rating', Lf.Type.INTEGER], {
    explanation: '0: no thumb, 1: down thumb, 5: up thumb.',
    // coerce nulls to 0; see https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/15.
    coerce: val => {return val || 0;},
  }),

  // Lf.Type.DATE_TIME introduces a TypeError on indexing,
  // and lots of serialization headaches without any benefit.
  // It's easier to treat it as an int internally,
  // though it does add some special-casing for datetimes in the view.
  f([24, 'creationDate', Lf.Type.INTEGER], {
    label: 'creation date',
    explanation: 'when the track was added to the library, eg "two weeks ago".',
    is_datetime: true}),
  f([25, 'lastPlayed', Lf.Type.INTEGER], {
    label: 'last played',
    explanation: 'when the track was last played, eg "30 days ago" or "yesterday". Sometimes inaccurate.',
    is_datetime: true}),
  f([27, 'storeId', Lf.Type.STRING], {
    label: 'store id'}),
  f([29, 'type', Lf.Type.INTEGER], {
    explanation: '1: free/purchased, 2: uploaded but not matched, 6: uploaded and matched, 7: All Access'}),
  f([30, 'comment', Lf.Type.STRING]),
  f([34, 'bitrate', Lf.Type.INTEGER]),
];

exports.fieldsByName = exports.fields.reduce((obj, x) => {
  obj[x.name] = x;
  return obj;
}, {});

const lToB = {};
lToB[Lf.Type.STRING] = 'string';
lToB[Lf.Type.INTEGER] = 'numeric';

exports.lfToBusinessTypes = lToB;

exports.fromJsproto = function fromJsproto(jsproto) {
  const track = {};
  exports.fields.forEach(field => {
    track[field.name] = field.coerce(jsproto[field.protoNum]);
  });

  return track;
};

exports.getPlaylistAddId = function getPlaylistAddId(track) {
  // Return the id for this track when interacting with Google.
  // For some reason Google doesn't accept AA playlist adds with library ids.
  let id = track.id;

  if (track.type === 7) {
    id = track.storeId;
  }

  return id;
};
