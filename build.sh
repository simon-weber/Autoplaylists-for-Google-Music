#!/usr/bin/env bash

rm -f src/js-built/*.js

for f in src/js/*.js; do
    browserify "$f" -d -o "src/js-built/$(basename $f)"
    printf '.'
done

echo 'done'
