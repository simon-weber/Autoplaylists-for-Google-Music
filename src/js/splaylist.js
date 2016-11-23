'use strict';

// splaylists are static playlists -- remote playlists defined as lists on Google's end.
// splaylist fields:
//   * id
//   * title
//   * createdAt (Date)
//   * lastPlayed (Date)
//   * lastModified (Date)
//   * description
//   * owner
//
// Other available fields that aren't currently deserialized:
//   * share token and status
//   * owner photo
//   * album art collage

exports.fromJsproto = function fromJsproto(jsproto) {
  const splaylist = {};

  splaylist.id = jsproto[0];
  splaylist.title = jsproto[1];
  splaylist.createdAt = new Date(jsproto[2] / 1000);
  splaylist.lastPlayed = new Date(jsproto[3] / 1000);
  splaylist.lastModified = new Date(jsproto[6] / 1000);
  splaylist.description = jsproto[7];
  splaylist.owner = jsproto[8];

  return splaylist;
};

exports.fromSJ = function fromSJ(sj) {
  const splaylist = {};

  splaylist.id = sj.id;
  splaylist.title = sj.name;
  splaylist.createdAt = new Date(parseInt(sj.creationTimestamp, 10) / 1000);
  splaylist.lastPlayed = null;  // unavailable from sj
  splaylist.lastModified = new Date(parseInt(sj.lastModifiedTimestamp, 10) / 1000);
  splaylist.description = sj.description;
  splaylist.owner = sj.ownerName;

  return splaylist;
};
