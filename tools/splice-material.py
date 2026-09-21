# -*- coding: utf-8 -*-
"""Splice a rewritten material block into theme.css in place of the old one.

The blocks are delimited by their own banner comment and the next banner, so a rewrite
cannot drift into a neighbouring material."""
import io
import sys

BANNER = u'/* =========================================================================='
PATH = 'src/theme.css'


def splice(text, marker, fragment):
    hit = text.index(marker)
    start = text.rindex(BANNER, 0, hit)
    end = text.index(BANNER, hit + len(marker))
    return text[:start] + fragment.rstrip() + u'\n\n' + text[end:]


def main():
    pairs = sys.argv[1:]
    text = io.open(PATH, encoding='utf-8').read()
    for i in range(0, len(pairs), 2):
        marker, frag_path = pairs[i], pairs[i + 1]
        frag = io.open(frag_path, encoding='utf-8').read()
        before = len(text)
        text = splice(text, marker, frag)
        print('%-28s %+d chars' % (marker[:28], len(text) - before))
    io.open(PATH, 'w', encoding='utf-8').write(text)


main()
