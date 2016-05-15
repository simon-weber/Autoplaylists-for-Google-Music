const Lf = require('lovefield');

const Reporting = require('./reporting.js');

exports.operators = {
  // This is the format expected by business rules,
  // where "name" is the lovefield operator to use.
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
    {name: 'lt', label: 'earlier than', input_type: 'text'},
    {name: 'gt', label: 'between now and', input_type: 'text'},
  ],
};

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
  field.transformation = opt.transformation || null;

  if (opt.coerce) {
    field.coerce = opt.coerce;
  } else if (field.type === Lf.Type.STRING) {
    // Default nulls to the empty string to allow querying, and strip extra whitespace.
    field.coerce = val => (val || '').trim();
  } else if (field.is_datetime) {
    // Default nulls to 0 to allow querying.
    field.coerce = val => (val || 0);
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
    explanation: 'an int between 0 and 5 representing the 5-star rating.',
    // coerce nulls to 0; see https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/15.
    coerce: val => val || 0,
  }),
  f([23, 'ratingThumb', Lf.Type.STRING], {
    // This is a synthetic field created by applying a transformation to field number 23 (rating).
    explanation: 'one of "up", "down", or "none".',
    label: 'rating thumb',
    coerce: val => val || 0,
    transformation: n => {
      let thumb = 'none';
      if (n > 3) {
        thumb = 'up';
      } else if (n === 1 || n === 2) {
        thumb = 'down';
      }

      return thumb;
    },
  }),
  // Lf.Type.DATE_TIME introduces a TypeError on indexing,
  // and lots of serialization headaches without any benefit.
  // It's easier to treat it as an int internally,
  // though it does add some special-casing for datetimes in the view.
  f([24, 'creationDate', Lf.Type.INTEGER], {
    label: 'date added to library',
    explanation: 'eiher a relative datetime like "30 days ago" or an absolute one like "April 1 2016".',
    is_datetime: true,
  }),
  /*
  // This could be readded as something like "last played or modified" if it's useful.
  f([25, 'lastPlayed', Lf.Type.INTEGER], {
    label: 'last played',
    is_datetime: true}),
   */
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
    is_datetime: true,
  }),
  f([37, 'albumPlaybackimestamp', Lf.Type.INTEGER], {
    hidden: true,
    is_datetime: true,
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
  f([48, 'lastPlayed', Lf.Type.INTEGER], {
    label: 'last played',
    is_datetime: true,
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
    let val = jsproto[field.protoNum];

    try {
      val = field.coerce(val);
    } catch (e) {
      console.error('error coercing', field.protoNum, jsproto[field.protoNum]);
      Reporting.Raven.captureException(e, {
        extra: {jsproto, field, val},
      });
    }

    if (field.transformation) {
      val = field.transformation(val);
    }

    track[field.name] = val;
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
