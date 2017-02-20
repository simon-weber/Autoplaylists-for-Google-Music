#!/usr/bin/env bash

for f in src/js/*.js; do
    node_modules/.bin/watchify "$f" -d -o "src/js-built/$(basename $f)" -v &
done

wait $!
