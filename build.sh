#!/usr/bin/env bash

rm -f src/js-built/*.js

for f in src/js/*.js; do
    output_path="src/js-built/$(basename $f)"
    browserify "$f" --debug | exorcist "${output_path}.map" > "${output_path}"
    printf '.'
done

echo 'done'
