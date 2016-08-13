# Autoplaylists for Google Music™

This is a Chrome extension to add user-defined autoplaylists in Google Music (iTunes calls these "Smart Playlists").

![autoplaylist screenshot](autoplaylists_screenshot.png?raw=true)

**This extension is not supported nor endorsed by Google.**

## Installation and support
Everything relevant to users can be found at https://autoplaylists.simon.codes.

The rest of this page is intended for developers.

## Development workflow
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
