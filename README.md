# Autoplaylists for Google Music™

This is a Chrome extension that allows for user-defined autoplaylists in Google Music (iTunes calls these "Smart Playlists").

![autoplaylist screenshot](http://i.imgur.com/NQlu84kl.png)

**This extension is not supported nor endorsed by Google.**

## Installation
An unlisted beta can be installed from the Chrome Web Store:
* join [the autoplaylists mailing list](https://groups.google.com/forum/#!forum/autoplaylists-for-google-music)
* install [the autoplaylists extension](https://chrome.google.com/webstore/detail/autoplaylists-for-google/blbompphddfibggfmmfcgjjoadebinem).
 
Mailing list members are "trusted testers" of the extension; you'll need to be a member for the link to work.

## Usage

* open a tab to https://play.google.com/music/listen
* click the extension's "page action": the tiny icon in the far right of the url bar, to the left of the bookmark star
* playlists are updated whenever their definition changes and automatically once a minute

### How it works
* your library is pulled from a local Google Music IndexedDB (or Google's servers as a fallback)
* your tracks are indexed in an in-memory [lovefield](https://github.com/google/lovefield) database
* differential updates are polled for periodically
* playlist definitions are stored in chrome.storage.sync

## Development
* run `npm install`
* run `./watch.sh` somewhere and leave it running -- this will build whenever files change
* go to chrome://extensions/
* click "developer mode"
* click "Load unpacked extension" and provide the repo/src directory
* after updating any javascript, hit "reload" in chrome://extensions/
* you can find the logs in different places depending on the code that's running:

    * content script: music.google.com console
    * background script: click the "background page" link by the "Inspect views" section on chrome://extensions/
    * manager/playlist: on their pages' consoles

---
Google Music is a trademark of Google Inc. Use of this trademark is subject to Google Permissions.
