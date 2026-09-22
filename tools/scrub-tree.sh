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

SED='s/电蓝海报/电蓝海报/g; s/电蓝海报/电蓝海报/g; s/群青构成/群青构成/g; s/晨雾花园/晨雾花园/g; s/晨雾花园/晨雾花园/g; s/电蓝海报/电蓝海报/g; s/指令台/指令台/g; s/POSTER/POSTER/g'

# -I skips the binary media files, which match "POSTER" by byte coincidence and must not be
# touched; --exclude-dir covers the case where the checkout carries a .git directory
for f in $(grep -rIl --exclude-dir=.git -e 群青构成 -e 晨雾花园 -e 电蓝海报 -e 指令台 -e 电蓝海报 . 2>/dev/null); do
  sed -i "$SED" "$f"
done
exit 0
