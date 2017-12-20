#!/usr/bin/env bash
#
# package.sh [--just-zip]
#
# Create a crx.
# With --just-zip, don't create a crx, just create an archive for the web store.

# modified from https://developer.chrome.com/extensions/crx#bash

./build.sh

dir='src'
key='key.pem'
name='Autoplaylists-for-Google-Music'
crx="$name.crx"
pub="$name.pub"
sig="$name.sig"
zip="$name.zip"

rm -f "${zip}"

# zip up all tracked source
git archive --format=zip --output="${zip}" "HEAD:${dir}"

# add in built js + html
(cd src; zip "../${zip}" js-built/*.js)
(cd src; zip "../${zip}" html/*)

if [[ "$1" == '--just-zip' ]]; then
    echo "Wrote ${zip}"
    exit 0
fi

trap 'rm -f "$pub" "$sig" "$zip"' EXIT

# signature
openssl sha1 -sha1 -binary -sign "$key" < "$zip" > "$sig"

# public key
openssl rsa -pubout -outform DER < "$key" > "$pub" 2>/dev/null

byte_swap () {
  # Take "abcdefgh" and return it as "ghefcdab"
  echo "${1:6:2}${1:4:2}${1:2:2}${1:0:2}"
}

crmagic_hex="4372 3234" # Cr24
version_hex="0200 0000" # 2
pub_len_hex=$(byte_swap $(printf '%08x\n' $(ls -l "$pub" | awk '{print $5}')))
sig_len_hex=$(byte_swap $(printf '%08x\n' $(ls -l "$sig" | awk '{print $5}')))
(
  echo "$crmagic_hex $version_hex $pub_len_hex $sig_len_hex" | xxd -r -p
  cat "$pub" "$sig" "$zip"
) > "$crx"
echo "Wrote $crx"
