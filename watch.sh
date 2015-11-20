#!/usr/bin/env bash

for f in js/*.js; do
    watchify "$f" -d -o "js-built/$(basename $f)" -v &
done

wait $!
