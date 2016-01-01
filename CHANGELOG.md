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
