#!/usr/bin/env bash

for f in src/js/*.js; do
    browserify "$f" -d -o "src/js-built/$(basename $f)"
    printf '.'
done

echo 'done'
