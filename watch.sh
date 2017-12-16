#!/usr/bin/env bash

jekyll build -w --incremental &

PATH+=:node_modules/.bin

for f in src/js/*.js; do
    watchify "$f" -d -o "src/js-built/$(basename $f)" -v &
done

wait $!
echo
