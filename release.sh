#!/usr/bin/env bash

sentry_api_key="$(cat sentry_api.key)"
version="$(cat src/manifest.json | jq --raw-output .version)"
app_id='blbompphddfibggfmmfcgjjoadebinem'
g_client_id="$(cat webstore_client.id)"
g_client_secret="$(cat webstore_client.secret)"
g_refresh_token="$(cat webstore_client.refresh_token)"

./package.sh --just-zip

# Get a Google access token.
echo 'getting access token...'
g_access_token="$(curl https://www.googleapis.com/oauth2/v4/token \
    -d "client_id=${g_client_id}&client_secret=${g_client_secret}&refresh_token=${g_refresh_token}&grant_type=refresh_token&redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
    -q \
    | jq --raw-output .access_token)"
echo

# Upload to Google.
echo 'uploading...'
curl "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${app_id}" \
    -H "Authorization: Bearer ${g_access_token}"  \
    -H "x-goog-api-version: 2" \
    -X PUT \
    -T Autoplaylists-for-Google-Music.zip \
    --progress-bar
echo

# Publish to everyone.
echo 'publishing...'
curl "https://www.googleapis.com/chromewebstore/v1.1/items/${app_id}/publish" \
    -H "Authorization: Bearer ${g_access_token}"  \
    -X POST \
    -d ""
echo


# Create a new release.
echo 'pushing to sentry...'
curl https://app.getsentry.com/api/0/projects/simon-weber/autoplaylists-extension/releases/ \
  -u "${sentry_api_key}": \
  -X POST \
  -d '{"version": "'"${version}"'"}' \
  -H 'Content-Type: application/json'
echo

for file in src/js-built/*.js*; do
    echo "${file}"
    # Upload a file for the given release.
    curl "https://app.getsentry.com/api/0/projects/simon-weber/autoplaylists-extension/releases/${version}/files/" \
      -u "${sentry_api_key}": \
      -X POST \
      -F file=@"${file}" \
      -F name="${file}"
    echo
done

git tag -a "${version}" -m 'see changelog'
git push origin "${version}"
git push
