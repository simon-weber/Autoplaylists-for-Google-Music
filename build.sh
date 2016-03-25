#!/usr/bin/env bash

rm -f src/js-built/*.js

for f in src/js/*.js; do
    output_path="src/js-built/$(basename $f)"
    url="chrome-extension://blbompphddfibggfmmfcgjjoadebinem/js-built/$(basename $f).map"
    browserify "$f" --debug | exorcist "${output_path}.map" --url "${url}" > "${output_path}"
    printf '.'
done

echo 'done'
