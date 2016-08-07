const Gm = require('./googlemusic.js');
const Storage = require('./storage.js');

// splaylists are cached locally to enable playlist linking.
// cache fields:
//   * splaylists: {id: splaylist}
// Cached splaylists contain an additional trackIds field, a set of trackIds.

exports.open = function open() {
  // Return a new, empty cache.

  return {splaylists: {}};
}

exports.sync = function sync(cache, user, playlists, callback) {
  // Update a cache to reflect Google's state for this user.
  // Callback a set of deleted splaylist ids.

  console.log('syncing splaylist cache. current state:', cache.splaylists);
  const autoPlaylistIds = new Set(playlists.map(p => p.remoteId));

  Gm.getPlaylists(user, freshSplaylists => {
    console.log('got splaylists', freshSplaylists);

    const oldSplaylistIds = new Set(Object.keys(cache.splaylists));

    for (let i = 0; i < freshSplaylists.length; i++){
      const freshSplaylist = freshSplaylists[i];

      if (autoPlaylistIds.has(freshSplaylist.id)){
        // Skip autoplaylists.
        continue;
      }

      // Mark as seen.
      const wasAdded = !(oldSplaylistIds.delete(freshSplaylist.id));

      // Sync added or modified splaylists.
      if (wasAdded || cache.splaylists[freshSplaylist.id].lastModified < freshSplaylist.lastModified) {
        console.log(`sync splaylist "${freshSplaylist.title}"`);
        Gm.getPlaylistContents(user, freshSplaylist.id, entries => {
          const trackIds = new Set();
          for (let j = 0; j < entries.length; j++){
            const entry = entries[j];
            trackIds.add(entry.track.id);
          }
          freshSplaylist.trackIds = trackIds;
          cache.splaylists[freshSplaylist.id] = freshSplaylist;
        }, error => {
          Reporting.Raven.captureMessage('error during splaylistcache.sync.getContents', {
            tags: {playlistId: freshSplaylist.id},
            extra: {error},
          });
        });
      }
    }

    // Delete deleted splaylists (those not seen in the fresh splaylists).
    for (let oldSplaylistId of oldSplaylistIds) {
      const oldTitle = cache.splaylists[oldSplaylistId].title;
      console.log(`splaylist "${oldTitle}" was deleted`);
      delete cache.splaylists[oldSplaylistId];
    }

    callback(oldSplaylistIds);
  },
  error => {
    Reporting.Raven.captureMessage('error during splaylistcache.sync', {
      extra: {error},
    });

    callback(new Set());
  });
}
