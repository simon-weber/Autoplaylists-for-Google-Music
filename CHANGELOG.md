## 5.1.3 (January 2, 2017)

Bugfixes:

  - fix sync problems for users with a system clock ahead of Google's

## 5.1.2 (January 1, 2017)

Bugfixes:

  - fix random playlists not re-shuffling after refreshing the page
  - fix sync problems caused by multiple syncs happening at once

## 5.1.1 (December 31, 2016)

Bugfixes:

  - fix a bug causing incorrect syncs in some cases

## 5.1.0 (December 31, 2016)

Features:

  - add a duplicate button to the playlist editor to ease creation of many similar playlists

## 5.0.1 (December 30, 2016)

Bugfixes:

  - fix a bug causing duplicates of the same song in autoplaylists

## 5.0.0 (December 29, 2016)

Features:

  - activate the new syncing apis for all users and remove the option to use the old apis. See the previous release for more details.

Bugfixes:

  - prevent a rare crash caused by strange Google api responses


## 4.0.0 (December 9, 2016)

Features:

  - activate the new syncing apis by default! See [the announcement post](https://groups.google.com/forum/#!topic/autoplaylists-for-google-music-announcements/fyQ9j-09GNo) for all the details. In case of trouble, they can still be deactivated through the settings menu.

Bugfixes:

  - fix a bug affecting creation of playlists with new sync

Misc:

  - raise default sync interval from 1 minute to 5 minutes to lessen load on Google's servers

## 3.2.3 (December 5, 2016)

Bugfixes:

  - fix a few minor bugs with new sync and the auth prompt

## 3.2.2 (December 4, 2016)

Bugfixes:

  - fix a rare bug in new sync that could cause strange behavior with very full playlists

Misc:

  - greatly improve new sync performance
  - improve new sync reporting

## 3.2.1 (December 3, 2016)

Misc:

  - add the version and a link to the changelog to the interface
  - improve random sort explanation
  - clarify that OAuth prompts are once per device

## 3.2.0 (November 27, 2016)

Features:

  - add a new operator 'contains (regex)' to query strings for a regular expression

## 3.1.1 (November 23, 2016)

Misc:

  - improve new sync efficiency and GA reporting

## 3.1.0 (November 22, 2016)

Features:

  - add opt-in support for beta testing the new syncing apis. See [the announcement post](https://groups.google.com/forum/#!topic/autoplaylists-for-google-music-announcements/fyQ9j-09GNo) for the details.

Misc:

  - any users upgrading from a previous release will be prompted for auth for the new apis.

## 3.0.3 (November 22, 2016)

Bugfixes:

  - fix certain special characters breaking "contains" rules

Misc:

  - remove a workaround that prevented currently-playing subscription tracks from being deleted during a sync (Google fixed the bug causing this)

## 3.0.2 (November 21, 2016)

Bugfixes:

  - fix a bug in playlist linking cycle detection that broke playlist combinations that referred to a playlist more than once

## 3.0.1 (November 21, 2016)

Bugfixes:

  - fix limit/sort being ignored when linking other autoplaylists ("playlist equals...")

## 3.0.0 (November 19, 2016)

Removed Features:

  - remove multi-user support in preparation for a switch to improved Google apis. See [#97](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/97#issuecomment-261757023) for more details. Feel free to reach out directly if you depended on this feature; I'm happy to help you migrate to a new profile.

## 2.0.5 (November 19, 2016)

Bugfixes:

  - fix subscription (All Access) tracks being omitted from linked playlist rules ("playlist equals...")

## 2.0.4 (August 30, 2016)

Misc:

  - rate limit sentry reporting

## 2.0.3 (August 30, 2016)

Misc:

  - improve error reporting

## 2.0.2 (August 27, 2016)

Misc:

  - add reporting for activations

## 2.0.1 (August 21, 2016)

Bugfixes:

  - fix a rare crash when a deauth happens during library cache init

Misc:

  - add inline explanation for new sync period behavior

## 2.0.0 (August 20, 2016)

Features:

  - *new behavior*: the sync period is now respected during new tabs / refreshed tabs. See [#91](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/91) for more details.

Bugfixes:

  - fix playlist description not being updated for some operations

## 1.10.0 (August 20, 2016)

Features:

  - add 'explicit' field
  - add csv export button to debug interface

Bugfixes:

  - prevent random sort from changing when it shouldn't have
  - improve handling of xsrf refresh requests
  - prevent a rare situation where the content script wasn't ready to receive messages

## 1.9.0 (August 14, 2016)

Features:

  - support random sorting. See [the announcement post](https://groups.google.com/d/msg/autoplaylists-for-google-music-announcements/0DyacGDizKg/4v5Vs4eKAwAJ) for more details.

Bugfixes:

  - show the playlist name in the description for linked playlists
  - better handle situations where the user's auth has expired

## 1.8.1 (August 9, 2016)

Bugfixes:

  - better handle unexpected data when retrieving static playlists

## 1.8.0 (August 7, 2016)

Features:

  - the playlist field can now link both normal and autoplaylists. See [the announcement post](https://groups.google.com/d/msg/autoplaylists-for-google-music-announcements/IO_7xKUFW0Q/MYaXXel3AQAJ) for more details.

## 1.7.1 (June 18, 2016)

Bugfixes:

  - hide playlist field when it would have no possible values

Misc:

  - add explanation for playlist field

## 1.7.0 (June 11, 2016)

Features:

  - add "playlist" field, allowing linking of autoplaylists. See [the announcement post](https://groups.google.com/forum/#!topic/autoplaylists-for-google-music-announcements/Z5h9-ANfb1E) for more details.

## 1.6.1 (June 5, 2016)

Misc:

  - clear notification on page action click
  - minor GA changes

## 1.6.0 (June 4, 2016)

Misc:

  - prompt users with no playlists to create one

## 1.5.3 (May 29, 2016)

Misc:

  - minor GA changes

## 1.5.2 (May 28, 2016)

Bugfixes:

  - fix a problem preventing the extension from loading in older versions of chrome: [#74](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/74)

## 1.5.1 (May 22, 2016)

Misc:

  - link the new announcement mailing list: https://groups.google.com/forum/#!forum/autoplaylists-for-google-music-announcements
  - minor Google Analytics changes

## 1.5.0 (May 16, 2016)

Features:

  - add "last played (album)" field

Bugfixes:

  - use a more accurate field for "last played", avoiding false positives when tracks are edited: [#8](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/8)
  - fix a rare problem with syncing

## 1.4.1 (May 14, 2016)

Bugfixes:

  - fix library init bugs for users missing a local indexeddb
  - better handle unauthed states

## 1.4.0 (May 6, 2016)

Features:

  - strip extra whitespace from strings, improving matching: [#68](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/68)
  - improve playlist descriptions: [#59](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/59)

Bugfixes:

  - stop syncing when users become deauthed

## 1.3.0 (April 30, 2016)

Features:

  - show all matching tracks when testing: [#62](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/62)

Bugfixes:

  - fix out of date library information on load when using indexeddb: [#66](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/66)

Misc:

  - fix a lot of error reporting involving the local database

## 1.2.5 (April 28, 2016)

Bugfixes:

  - actually fix the bug from 1.2.4

## 1.2.4 (April 28, 2016)

Bugfixes:

  - switch to a new Google endpoint for deleting tracks after the old one was suddenly removed: [#65](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/65)

## 1.2.3 (April 11, 2016)

Misc:

  - revert the change meant for detecting never-played songs: [#55](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/55)

## 1.2.2 (April 10, 2016)

Bugfixes:

  - more accurately detect songs that have never been played: [#55](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/55)
  - fix another sync interval bug that was preventing syncs: [#60](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/60)

Misc:

  - rename before/after datetime operators for clarity: [#56](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/56)
  - sync immediately after initialization: [#58](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/58)

## 1.2.1 (April 7, 2016)

Bugfixes:

  - fix a crash when the sync interval was set to 0

## 1.2.0 (April 7, 2016)

Features:

  - allow users to change the sync interval: [#53](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/53)

## 1.1.0 (April 6, 2016)

Features:

  - add a new "rating thumb" field to simplify rating-based playlists: [#54](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/54)

## 1.0.10 (April 5, 2016)

Bugfixes:

  - coerce null string fields to the empty string to allow querying: [#52](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/52)
  - fix playlists with empty subrules

## 1.0.9 (April 3, 2016)

Misc:

  - remove now-unused cookies permissions
  - improve some error handling and reporting

## 1.0.8 (March 24, 2016)

Misc:

  - relabel 'creation date' to 'date added to library'

## 1.0.7 (March 24, 2016)

Bugfixes:

  - fix syncs failing after a session is open for a long time: [#51](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/51)

## 1.0.6 (March 20, 2016)

Bugfixes:

  - potentially fix a cause of failed syncs: [#49](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/49)

## 1.0.5 (March 19, 2016)

Misc:

  - improve error reporting

## 1.0.4 (March 13, 2016)

Bugfixes:

  - fix a bug with some versions of chrome preventing the extension tab from opening: [#48](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/48)

## 1.0.3 (March 4, 2016)

Bugfixes:

  - fix empty library when extension is loaded on very first visit to Google Music: [#47](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/47)
  - better handle an error when Google cookies are unavailable
  - omit hidden fields from test output

Misc:

  - slow down retry schedule to prevent web ui thrashing
  - send fewer sentry events

## 1.0.2 (March 3, 2016)

Bugfixes:

  - fix a crash preventing the page action for appearing for new users

## 1.0.1 (March 1, 2016)

The extension is now available for purchase!

## 0.11.4 (February 27, 2016)

Collects additional track metadata to help with error reporting.

## 0.11.3 (February 21, 2016)

Internal enhancements.

## 0.11.2 (February 21, 2016)

Adds an experimental fix for syncing problems.

## 0.11.1 (February 15, 2016)

Improves error reporting to help me track down bugs.

## 0.11.0 (February 7, 2016)


Features:

  - support "does not match" rules: [#34](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/34)
  - improve rating field explanation: [#37](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/37)

Bugfixes:

  - fix the free version not being able to create a playlist [#38](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/38)

## 0.10.1 (February 7, 2016)

Fix faulty logic for giving everyone the contributor version.

## 0.10.0 (February 6, 2016)

Prepares the extension for purchase on the Chrome Web store.
Until it's available for purchase, everyone can switch between the full and free version at will.

For more details, see this mailing list post: https://groups.google.com/d/msg/autoplaylists-for-google-music/hJ8j5eao4HE/3gmx1IfbCwAJ.

## 0.9.2 (January 29, 2016)

Changes the format of logging to be more informative when dumped to a file.

## 0.9.1 (January 18, 2016)

Adds logging to debug an issue around tab creation: [#30](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/30).

## 0.9.0 (January 17, 2016)

Features:

  - add support for multiple sorts (subsorts): [#14](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/14)

## 0.8.0 (January 17, 2016)

Features:

  - improve "test" output formatting

Bugfixes:

  - fix the ordering of playlists: [#9](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/9)
  - empty playlists now select all tracks instead of none

## 0.7.0 (January 15, 2016)

Features:

  - add case-insensitive string operators
  - add icons

Bugfixes:

  - fix another bug preventing periodic updates after an error: [#24](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/24)

## 0.6.0 (January 12, 2016)

Features:

  - show matching track count pre-limit

## 0.5.0 (January 10, 2016)

Features:

  - add last sync datetime to playlist description

Bugfixes:

  - fix a bug preventing periodic updates after an error: [#24](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/24)

## 0.4.1 (January 1, 2016)

Features:

  - add drag and drop exporting across extensions and users
  - remove need for 'tabs' permission
  - various ui improvements

## 0.3.0 (December 20, 2015)

Features:

  - various ui improvements

Bugfixes:

  - playlists involving 'last played' will avoid cutting off currently-playing tracks: [#18](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/18)

## 0.2.1 (December 13, 2015)

Bugfixes:

  - playlist queries with a nested, multi-column `or` now work: [#21](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/21)

## 0.2.0 (December 12, 2015)

Features:

  - playlist descriptions contain a summary of their rules: [#19](https://github.com/simon-weber/Autoplaylists-for-Google-Music/pull/19), thanks @bennettmcelwee!

Bugfixes:

  - periodic updates are less likely to cause Google's UI to lock up: [#18](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/18), [#20](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/20)

## 0.1.2 (November 27, 2015)

Bugfixes:

  - fix user detection on manual url changes: [#3](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/3)
  - fix for playlists containing All Access tracks: [#10](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/10)
  - coerce null ratings to 0: [#15](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/15)

## 0.1.1 (November 26, 2015)

Features:

  - support periodic updates: [#1](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/1)
  - support limit and sort by (playlist contents should be correct, but ordering may not be): [#9](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/9)
  - show number of matched tracks when editing playlists: [#6](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/6)
  - add explanations for field values: [#13](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/13), [#12](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/12)

## 0.0.1 (November 24, 2015)

First packaged release!

Features:

  - support datetime fields: [#2](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/2)
  - support any/all and subqueries: [#4](https://github.com/simon-weber/Autoplaylists-for-Google-Music/issues/4)
