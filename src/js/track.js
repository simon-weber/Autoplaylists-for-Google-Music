'use strict';
const Lf = require('lovefield');

const Reporting = require('./reporting');

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
    {name: 'match-regex', label: 'contains regex', input_type: 'text'},
    {name: 'match-insensitive', label: 'contains (case ignored)', input_type: 'text'},
    {name: 'no-match', label: 'does not contain', input_type: 'text'},
    {name: 'no-match-insensitive', label: 'does not contain (case ignored)', input_type: 'text'},
  ],
  datetime: [
    {name: 'lt', label: 'earlier than', input_type: 'text'},
    {name: 'gt', label: 'between now and', input_type: 'text'},
    {name: 'in-month', label: 'in the month of', input_type: 'text'},
  ],
  select: [
    {label: 'is equal to', name: 'equalTo', input_type: 'select'},
    {label: 'is not equal to', name: 'notEqualTo', input_type: 'select'},
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

  // Default types to non-null values to allow querying.
  } else if (field.type === Lf.Type.STRING) {
    field.coerce = val => (val || '').trim();
  } else if (field.is_datetime) {
    field.coerce = val => (val || 0);
  } else if (field.type === Lf.Type.INTEGER) {
    field.coerce = val => (val || -1);
  } else {
    field.coerce = val => val;
  }

  return field;
}

// {trackIdPrefix: rand()}
// maps the first 8 characters of a track id to a random float.
exports._randomCache = {};

// After calling, upserted tracks will have new random fields.
exports.resetRandomCache = function resetRandomCache() {
  console.info('reset random cache');
  exports._randomCache = {};
};

exports.fields = [
  f([0, 'id', Lf.Type.STRING]),
  f([0, 'random', Lf.Type.INTEGER], {
    // This is a synthetic field with a random 0-1 float from rand().
    // It's used to make random shuffling easier.
    // It will not change after being set unless resetRandomCache is called.
    hidden: true,
    transformation: id => {
      const prefix = id.substring(0, 8);
      let val = exports._randomCache[prefix];
      if (val === undefined) {
        val = Math.random();
        exports._randomCache[prefix] = val;
      }

      return val;
    },
  }),
  f([1, 'title', Lf.Type.STRING]),
  f([3, 'artist', Lf.Type.STRING]),
  f([4, 'album', Lf.Type.STRING]),
  f([5, 'albumArtist', Lf.Type.STRING], {
    label: 'album artist'}),
  f([10, 'composer', Lf.Type.STRING]),
  f([11, 'genre', Lf.Type.STRING]),
  f([13, 'durationMillis', Lf.Type.INTEGER], {
    label: 'duration (ms)'}),
  f([14, 'track', Lf.Type.INTEGER], {
    sjName: 'trackNumber'}),
  f([15, 'totalTracks', Lf.Type.INTEGER], {
    sjName: 'totalTrackCount',
    label: 'total tracks'}),
  f([16, 'disc', Lf.Type.INTEGER], {
    sjName: 'discNumber',
  }),
  f([17, 'totalDiscs', Lf.Type.INTEGER], {
    sjName: 'totalDiscCount',
    label: 'total discs'}),
  f([18, 'year', Lf.Type.INTEGER]),
  f([19, 'deleted', Lf.Type.INTEGER], {
    hidden: true,
  }),
  f([20, 'expunged', Lf.Type.INTEGER], {
    // not in sj
    hidden: true,
  }),
  f([21, 'pending', Lf.Type.INTEGER], {
    // not in sj
    hidden: true,
  }),
  f([22, 'playCount', Lf.Type.INTEGER], {
    label: 'play count'}),
  f([23, 'rating', Lf.Type.INTEGER], {
    explanation: 'an int between 0 and 5 representing the 5-star rating (see also "rating thumb").',
    // coerce nulls to 0; see https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/15.
    // coerce strings to ints (sj)
    coerce: val => parseInt(val, 10) || 0,
  }),
  f([23, 'ratingThumb', Lf.Type.STRING], {
    // This is a synthetic field created by applying a transformation to field number 23 (rating).
    explanation: 'one of "up", "down", or "none".',
    label: 'rating thumb',
    coerce: val => parseInt(val, 10) || 0,
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
    sjName: 'creationTimestamp',
    label: 'date added to library',
    explanation: 'either a relative datetime like "30 days ago", an absolute one like "April 1 2016", or a month like "2017-02".',
    is_datetime: true,
    // coerce strings (sj)
    coerce: val => parseInt(val, 10),
  }),
  /*
  // This could be readded as something like "last played or modified" if it's useful.
  f([25, 'lastPlayed', Lf.Type.INTEGER], {
    label: 'last played',
    is_datetime: true}),
   */
  f([26, 'subjectToCuration', Lf.Type.INTEGER], {
    // not in sj
    hidden: true,
  }),
  f([27, 'storeId', Lf.Type.STRING], {
    label: 'store id'}),
  f([28, 'matchedId', Lf.Type.STRING], {
    // not in sj
    hidden: true,
  }),
  f([29, 'type', Lf.Type.INTEGER], {
    sjName: 'trackType',
    // coerce strings (sj)
    coerce: val => parseInt(val, 10),
    explanation: '1: free/purchased, 2: uploaded but not matched, 6: uploaded and matched, 7: All Access.'}),
  f([30, 'comment', Lf.Type.STRING]),
  // TODO not in sj?
  f([34, 'bitrate', Lf.Type.INTEGER]),
  f([35, 'recentTimestamp', Lf.Type.INTEGER], {
    hidden: true,
    is_datetime: true,
  }),
  // TODO not in sj?
  f([37, 'albumPlaybackTimestamp', Lf.Type.INTEGER], {
    label: 'last played (entire album)',
    is_datetime: true,
  }),
  f([38, 'explicitType', Lf.Type.INTEGER], {
    // coerce strings (sj)
    coerce: val => parseInt(val, 10),
    hidden: true,
  }),
  f([38, 'explicit', Lf.Type.STRING], {
    explanation: 'one of "true", "false" or "unknown", representing whether the lyrics are explicit.',
    coerce: val => parseInt(val, 10) || -1,
    transformation: n => {
      let explicit = 'unknown';
      if (n === 1) {
        explicit = 'true';
      } else if (n === 2) {
        explicit = 'false';
      }
      return explicit;
    },
  }),
  f([41, 'curationSuggested', Lf.Type.INTEGER], {
    // not in sj
    hidden: true,
  }),
  f([42, 'curatedByUser', Lf.Type.INTEGER], {
    // not in sj
    hidden: true,
  }),
  f([43, 'playlistEntryId', Lf.Type.STRING], {
    // not in sj
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

// Since transformations now depend on state (for random),
// this must only be called from the background script.
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
