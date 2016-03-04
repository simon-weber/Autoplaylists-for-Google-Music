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
  field.hidden = opt.hidden || false;

  if (opt.coerce) {
    field.coerce = opt.coerce;
  } else {
    field.coerce = val => val;
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
  f([19, 'deleted', Lf.Type.INTEGER], {
    hidden: true,
  }),
  f([20, 'expunged', Lf.Type.INTEGER], {
    hidden: true,
  }),
  f([21, 'pending', Lf.Type.INTEGER], {
    hidden: true,
  }),
  f([22, 'playCount', Lf.Type.INTEGER], {
    label: 'play count'}),
  f([23, 'rating', Lf.Type.INTEGER], {
    explanation: '0: no thumb, 1: down thumb, 5: up thumb; or, values from the old 5-star ratings lab.',
    // coerce nulls to 0; see https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/15.
    coerce: val => val || 0,
  }),

  // Lf.Type.DATE_TIME introduces a TypeError on indexing,
  // and lots of serialization headaches without any benefit.
  // It's easier to treat it as an int internally,
  // though it does add some special-casing for datetimes in the view.
  f([24, 'creationDate', Lf.Type.INTEGER], {
    label: 'creation date',
    explanation: 'eg "two weeks ago".',
    is_datetime: true}),
  f([25, 'lastPlayed', Lf.Type.INTEGER], {
    label: 'last played',
    explanation: 'eg "30 days ago" or "yesterday".',
    is_datetime: true}),
  f([26, 'subjectToCuration', Lf.Type.INTEGER], {
    hidden: true,
  }),
  f([27, 'storeId', Lf.Type.STRING], {
    label: 'store id'}),
  f([28, 'matchedId', Lf.Type.STRING], {
    hidden: true,
  }),
  f([29, 'type', Lf.Type.INTEGER], {
    explanation: '1: free/purchased, 2: uploaded but not matched, 6: uploaded and matched, 7: All Access.'}),
  f([30, 'comment', Lf.Type.STRING]),
  f([34, 'bitrate', Lf.Type.INTEGER]),
  f([35, 'recentTimestamp', Lf.Type.INTEGER], {
    hidden: true,
  }),
  f([37, 'albumPlaylistTimestamp', Lf.Type.INTEGER], {
    hidden: true,
  }),
  f([38, 'explicitType', Lf.Type.INTEGER], {
    hidden: true,
  }),
  f([41, 'curationSuggested', Lf.Type.INTEGER], {
    hidden: true,
  }),
  f([42, 'curatedByUser', Lf.Type.INTEGER], {
    hidden: true,
  }),
  f([43, 'playlistEntryId', Lf.Type.STRING], {
    hidden: true,
  }),
];

exports.fieldsByName = exports.fields.reduce((obj, x) => {
  obj[x.name] = x;  // eslint-disable-line no-param-reassign
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

exports.toString = function toString(track) {
  let output = '';
  for (const key in track) {
    const field = exports.fieldsByName[key];
    if (field.hidden) {
      continue;
    }

    const val = track[key];
    let strVal = JSON.stringify(val);

    if (field.is_datetime) {
      strVal = new Date(val / 1000).toLocaleString();
    }

    output += `${field.label}: ${strVal}\n`;
  }

  return output;
};
