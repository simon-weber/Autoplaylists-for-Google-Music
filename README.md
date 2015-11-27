# Autoplaylists for Google Music™

This is a Chrome extension that allows for user-defined autoplaylists in Google Music (iTunes calls these "Smart Playlists").

![autoplaylist example](http://i.imgur.com/sHuKvk7.png?1)

**This extension is not supported nor endorsed by Google.**

Here's an out of date video: [dropbox video link](https://www.dropbox.com/s/jff4yd7zepvfrdg/google%20music%20autoplaylists.mov?dl=0).

It's very early in development and not yet available in the Chrome Web Store.
If you're interested in using it once it's more polished, sign up for the mailing list at
 https://groups.google.com/forum/#!forum/autoplaylists-for-google-music.
I'll announce when it's available in the Web Store.

## Usage

### Installation

* download the most recent crx from https://github.com/simon-weber/Autoplaylists-for-Google-Music/releases
* open a tab to chrome://extensions
* navigate to the folder containing the downloaded crx
* drag and drop the crx onto the Chrome extensions tab. You should see a popup to install the extension.
* reload any Google Music tabs

### Use
* open a tab to https://play.google.com/music/listen
* click the extension's "page action": the tiny icon in the far right of the url bar, to the left of the bookmark star
* playlists are updated whenever their definition changes and automatically once a minute

### How it works
* your library is pulled from a Google Music IndexedDB (or Google's servers as a fallback)
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
