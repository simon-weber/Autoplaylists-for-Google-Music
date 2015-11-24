'use strict';

const Lf = require('lovefield');

function f(fieldItems) {
  return {
    protoNum: fieldItems[0],
    name: fieldItems[1],
    type: fieldItems[2],
    label: fieldItems[3] || fieldItems[1],
    is_datetime: fieldItems[4] || false,
  };
}

exports.fields = [
  f([0, 'id', Lf.Type.STRING]),
  f([1, 'title', Lf.Type.STRING]),
  f([3, 'artist', Lf.Type.STRING]),
  f([4, 'album', Lf.Type.STRING]),
  f([5, 'albumArtist', Lf.Type.STRING, 'album artist']),
  f([10, 'composer', Lf.Type.STRING]),
  f([11, 'genre', Lf.Type.STRING]),
  f([13, 'durationMillis', Lf.Type.INTEGER, 'duration milliseconds']),
  f([14, 'track', Lf.Type.INTEGER]),
  f([15, 'totalTracks', Lf.Type.INTEGER, 'total tracks']),
  f([16, 'disc', Lf.Type.INTEGER]),
  f([17, 'totalDiscs', Lf.Type.INTEGER, 'total discs']),
  f([18, 'year', Lf.Type.INTEGER]),
  f([22, 'playCount', Lf.Type.INTEGER, 'play count']),
  f([23, 'rating', Lf.Type.INTEGER]),
  // Lf.Type.DATE_TIME introduces a TypeError on indexing,
  // and lots of serialization headaches without any benefit.
  // It's easier to treat it as an int internally,
  // though it does add some special-casing for datetimes in the view.
  f([24, 'creationDate', Lf.Type.INTEGER, 'creation date', true]),
  f([25, 'lastPlayed', Lf.Type.INTEGER, 'last played', true]),
  f([29, 'type', Lf.Type.INTEGER]),
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
    track[field.name] = jsproto[field.protoNum];
  });

  return track;
};
