#!/usr/bin/env bash
# The message half of the history scrub. filter-branch feeds each commit message on stdin
# and takes this script's stdout as the new message.
set -u
# shellcheck disable=SC1091
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/scrub-names.sh"
sed "$SCRUB_SED"
