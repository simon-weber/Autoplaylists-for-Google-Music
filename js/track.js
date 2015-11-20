'use strict';

const Lf = require('lovefield');

function f(fieldItems) {
  return {
    protoNum: fieldItems[0],
    name: fieldItems[1],
    type: fieldItems[2],
    label: fieldItems[3] || fieldItems[1],
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
  f([13, 'durationMillis', Lf.Type.INTEGER]),
  f([14, 'track', Lf.Type.INTEGER]),
  f([15, 'totalTracks', Lf.Type.INTEGER]),
  f([16, 'disc', Lf.Type.INTEGER]),
  f([17, 'totalDiscs', Lf.Type.INTEGER]),
  f([18, 'year', Lf.Type.INTEGER]),
  f([22, 'playCount', Lf.Type.INTEGER, 'play count']),
  f([23, 'rating', Lf.Type.INTEGER]),
  f([24, 'creationDate', Lf.Type.INTEGER]),
  f([25, 'lastPlayed', Lf.Type.INTEGER]),
  f([29, 'type', Lf.Type.INTEGER]),
  f([30, 'comment', Lf.Type.STRING]),
  f([34, 'bitrate', Lf.Type.INTEGER]),
];

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
