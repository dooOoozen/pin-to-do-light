#!/usr/bin/env bash
# Scrub the borrowed material names out of the repository's history.
#
# Two commits (14332a3, 48f96d2) carry the first names these materials had, in the READMEs,
# in theme.css headers, in theme-apply.js, and in their commit messages. The working tree
# has not contained them since 998febe, so this is purely about what `git log` can still
# show. Measured before writing this: exactly 2 commits x 4 text files, plus 2 messages.
#
# The substitution is the one verified against those blobs: every name maps to the material's
# current name, so nothing has to be invented, and `晨雾花园` is matched before `晨雾花园` or the
# result reads as a half-replaced word.
#
# Rewriting history is destructive and shared: every commit from 14332a3 onward changes
# hash, the remote needs a force push, and any other clone has to be re-fetched or reset.
# So this script backs up first, verifies afterwards, and will not push unless told to.
#
#   bash tools/scrub-history.sh          # rewrite locally, verify, print the push command
#   bash tools/scrub-history.sh --push   # the above, then force-push with a lease
#   bash tools/scrub-history.sh --undo   # restore the refs from the backup bundle
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# The substitution itself lives in tools/scrub-tree.sh and tools/scrub-msg.sh — one copy of
# the mapping, not one here and one inside a quoted filter argument.
GREPF='群青构成\|晨雾花园\|电蓝海报\|指令台\|电蓝海报'
BACKUP=.git/scrub-backup.bundle

if [ "${1:-}" = "--undo" ]; then
  git fetch "$BACKUP" '+refs/heads/*:refs/heads/*' '+refs/tags/*:refs/tags/*'
  echo "restored from $BACKUP; now: $(git rev-parse --short HEAD)"
  exit 0
fi

[ -z "$(git status --porcelain)" ] || { echo "工作区不干净，先提交或收起改动"; exit 1; }

BEFORE_TREE=$(git rev-parse 'HEAD^{tree}')
BEFORE_HEAD=$(git rev-parse HEAD)
git bundle create "$BACKUP" --all
echo "backup: $BACKUP (old HEAD $(git rev-parse --short HEAD), tree $BEFORE_TREE)"

# Absolute POSIX paths, resolved from the shell rather than from $0 inside the filter:
# filter-branch runs the tree filter with the cwd set to a temporary checkout, and the
# first attempt of this script died because the sed program was nested inside the
# --tree-filter argument and git read part of it as its own options.
HERE="$(pwd)"
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --all \
  --tree-filter "sh '$HERE/tools/scrub-tree.sh'" \
  --msg-filter "sh '$HERE/tools/scrub-msg.sh'" \
  --tag-name-filter cat

AFTER_TREE=$(git rev-parse 'HEAD^{tree}')
echo
echo "old tree  $BEFORE_TREE"
echo "new tree  $AFTER_TREE"
if [ "$BEFORE_TREE" != "$AFTER_TREE" ]; then
  echo "STOP: the working tree changed. The rewrite was supposed to touch history only."
  echo "      undo with:  bash tools/scrub-history.sh --undo"
  git diff "$BEFORE_HEAD" HEAD --stat | head -20
  exit 1
fi
echo "tree identical — only the history differs, as intended."

LEFT=0
for c in $(git rev-list --all); do
  n=$(git grep -Il -e 群青构成 -e 晨雾花园 -e 电蓝海报 -e 指令台 -e 电蓝海报 "$c" -- 2>/dev/null | wc -l)
  m=$(git log -1 --format=%B "$c" | grep -c "$GREPF" || true)
  # `set -e` makes a bare `[ ] && { }` abort the script when the test is false, which is
  # the normal case here, so the checks are written out
  if [ "$n" != "0" ]; then echo "still present in $c ($n files)"; LEFT=1; fi
  if [ "$m" != "0" ]; then echo "still named in the message of $c"; LEFT=1; fi
done
if [ "$LEFT" = "0" ]; then echo "no commit text or message carries the old names"; fi

echo
echo "what the two rewritten messages now say:"
git log --format='  %h  %s' | tail -4

if [ "${1:-}" = "--push" ]; then
  git push --force-with-lease origin main --tags
  echo "pushed."
else
  echo
  echo "nothing pushed yet. When you have read the above:"
  echo "  git push --force-with-lease origin main --tags"
  echo "and on any other machine:  git fetch && git reset --hard origin/main"
fi
