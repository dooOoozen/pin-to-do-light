#!/usr/bin/env bash
# The name table for the history scrub, in one place.
#
# The old names are written as \u escapes deliberately: a tool whose job is to get those
# words out of a repository must not commit them into the tip of that same repository. The
# first draft of this did exactly that, and the verification loop caught it — HEAD itself
# showed up as a commit carrying the names, in these very scripts.
#
# The replacement names are written literally because they are the project's own words.

OLD_IKB=$'\u4f17\u751f\u884c\u8bb0'
OLD_GARDEN_LONG=$'\u754c\u56ed\u5fd7\u5f02'
OLD_GARDEN=$'\u754c\u56ed'
OLD_POSTER_NIGHT=$'\u591c\u6d77'
OLD_POSTER_WORK=$'\u5973\u795e\u5f02\u95fb\u5f55'
OLD_CONSOLE=$'\u672a\u8bb8\u4e4b\u5730'

# longest-first per word: the four-character garden name has to be matched before the
# two-character one, or the shorter rule wins and leaves a half-replaced word behind
SCRUB_SED="s/${OLD_POSTER_WORK} P3/电蓝海报/g
s/${OLD_POSTER_WORK}/电蓝海报/g
s/${OLD_IKB}/群青构成/g
s/${OLD_GARDEN_LONG}/晨雾花园/g
s/${OLD_GARDEN}/晨雾花园/g
s/${OLD_POSTER_NIGHT}/电蓝海报/g
s/${OLD_CONSOLE}/指令台/g
s/P3/POSTER/g"

SCRUB_PATTERNS=(-e "$OLD_IKB" -e "$OLD_GARDEN" -e "$OLD_POSTER_NIGHT" -e "$OLD_CONSOLE" -e "$OLD_POSTER_WORK")
SCRUB_GREPF="${OLD_IKB}\|${OLD_GARDEN}\|${OLD_POSTER_NIGHT}\|${OLD_CONSOLE}\|${OLD_POSTER_WORK}"
