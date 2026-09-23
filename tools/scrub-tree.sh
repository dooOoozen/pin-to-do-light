#!/usr/bin/env bash
# The tree half of the history scrub. filter-branch runs this with the working directory
# set to a checkout of the commit being rewritten, so it only ever sees one commit's files.
#
# Kept in its own file on purpose: the whole reason the first attempt failed is that this
# sed program was nested inside a double-quoted --tree-filter argument, and the quoting
# collapsed into something git read as its own options.
set -eu
# deliberately no cd: filter-branch runs this with the working directory set to the
# temporary checkout of the commit being rewritten, and resolving this script's own path
# would point back at the real working tree instead

# shellcheck disable=SC1091
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/scrub-names.sh"

# -I skips the binary media files, which match "P3" by byte coincidence and must not be
# touched; --exclude-dir covers the case where the checkout carries a .git directory
for f in $(grep -rIl --exclude-dir=.git "${SCRUB_PATTERNS[@]}" . 2>/dev/null); do
  sed -i "$SCRUB_SED" "$f"
done
exit 0
