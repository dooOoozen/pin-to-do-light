#!/usr/bin/env bash
# Scrub the borrowed material names out of the repository's history.
#
# Two commits (14332a3, 48f96d2) carry the first names these materials had, in the READMEs,
# in theme.css headers, in theme-apply.js, and in their commit messages. The working tree
# has not contained them since 998febe, so this is purely about what `git log` can still
# show. Measured before writing this: exactly 2 commits x 4 text files, plus 2 messages.
#
# The substitution lives in tools/scrub-names.sh, where the old names are stored as \u
# escapes: this tool must not recommit the words it exists to remove, and the first draft
# did exactly that in its own comments until the verification loop caught it.
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

# The substitution and the search patterns both come from one file, whose names are stored
# as escapes so this tool does not recommit the words it exists to remove.
# shellcheck disable=SC1091
. "$(pwd)/tools/scrub-names.sh"
BACKUP=.git/scrub-backup.bundle

if [ "${1:-}" = "--undo" ]; then
  # `git fetch <bundle> refs/heads/main:refs/heads/main` is refused while main is checked
  # out, so read the SHAs the bundle recorded and point the refs at them directly.
  git bundle verify "$BACKUP" >/dev/null 2>&1 || { echo "no readable backup at $BACKUP"; exit 1; }
  git bundle list-heads "$BACKUP" | while read -r sha ref; do
    case "$ref" in
      refs/heads/main|refs/tags/*)
        # annotated tags come as refs/tags/X^{}; skip those, the tag object is restored by
        # its own line and git resolves the peeled entry from it
        case "$ref" in *'{}') continue ;; esac
        git update-ref "$ref" "$sha" && echo "restored $ref -> $(git rev-parse --short "$sha")"
        ;;
    esac
  done
  git update-ref -d refs/original/refs/heads/main 2>/dev/null || true
  git reset --hard refs/heads/main
  echo "now at $(git rev-parse --short HEAD); filter-branch's refs/original/ backup was dropped"
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
#
# And --all goes AFTER the `--`: git-filter-branch's own parser treats any unrecognised
# `-*` token as a switch that takes one argument, so `--all --tree-filter X` makes `--all`
# swallow `--tree-filter` and the filters are silently never bound. Read that out of
# $(git --exec-path)/git-filter-branch rather than guessing at it.
HERE="$(pwd)"
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force \
  --tree-filter "sh '$HERE/tools/scrub-tree.sh'" \
  --msg-filter "sh '$HERE/tools/scrub-msg.sh'" \
  --tag-name-filter cat -- --all

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

# Check the refs that will actually be pushed. filter-branch leaves its own backup under
# refs/original/, and those objects still carry the old names by design — scanning them
# would report a failure that is really the safety net doing its job.
LEFT=0
for c in $(git for-each-ref --format='%(objectname)' refs/heads refs/tags); do
  for r in $(git rev-list "$c"); do
    # `git grep` exits 1 when a commit is clean, and `set -o pipefail` would turn that
    # expected no-match into the script dying at the first good commit
    n=$(git grep -Il "${SCRUB_PATTERNS[@]}" "$r" -- 2>/dev/null | wc -l || true)
    m=$(git log -1 --format=%B "$r" | grep -c "$SCRUB_GREPF" || true)
    # `set -e` makes a bare `[ ] && { }` abort the script when the test is false, which is
    # the normal case here, so the checks are written out
    if [ "$n" != "0" ]; then echo "still present in $r ($n files)"; LEFT=1; fi
    if [ "$m" != "0" ]; then echo "still named in the message of $r"; LEFT=1; fi
  done
done

if [ "$LEFT" != "0" ]; then
  # A silent no-op is the failure mode this script has already hit twice: a filter that
  # never bound would leave the names in place and still produce a plausible-looking run.
  echo "STOP: the old names are still reachable. Do not push. Undo with:"
  echo "  bash tools/scrub-history.sh --undo"
  exit 1
fi
echo "no commit text or message on any branch or tag carries the old names"

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
