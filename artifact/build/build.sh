#!/bin/sh
# Assembles the single-file متابِع artifact from its parts.
#   sh artifact/build/build.sh
set -e
cd "$(dirname "$0")/../.."

python3 artifact/build/gen-css.py > artifact/build/style.css

OUT=artifact/mutabea.html
{
  cat artifact/build/head.html
  echo '<style>'
  cat artifact/build/style.css
  cat artifact/build/extra.css
  echo '</style>'
  cat artifact/build/body.html
  echo '<script>'
  cat artifact/build/app-core.js
  cat artifact/build/app-views.js
  cat artifact/build/app-views2.js
  echo '</script>'
} > "$OUT"

echo "built $OUT ($(wc -c < "$OUT") bytes)"
