#!/bin/sh
# Fetches the reference sources into ref/ (git-ignored). Reading material only:
# nothing in ref/ is built, run, or shipped.
set -e
cd "$(dirname "$0")/.."
mkdir -p ref
[ -d ref/quake ] || git clone --depth 1 https://github.com/id-Software/Quake.git ref/quake
git submodule update --init sim
