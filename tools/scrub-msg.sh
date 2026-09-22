#!/usr/bin/env bash
# The message half of the history scrub. filter-branch feeds each commit message on stdin
# and takes this script's stdout as the new message.
set -u
sed 's/电蓝海报/电蓝海报/g; s/电蓝海报/电蓝海报/g; s/群青构成/群青构成/g; s/晨雾花园/晨雾花园/g; s/晨雾花园/晨雾花园/g; s/电蓝海报/电蓝海报/g; s/指令台/指令台/g; s/POSTER/POSTER/g'
