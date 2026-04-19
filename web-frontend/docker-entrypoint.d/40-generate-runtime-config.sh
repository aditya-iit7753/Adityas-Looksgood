#!/bin/sh
set -eu

: "${PUBLIC_API_URL:=https://looksgood-api-production.up.railway.app/api}"

envsubst '${PUBLIC_API_URL}' \
  < /usr/share/nginx/html/config.template.js \
  > /usr/share/nginx/html/config.js

