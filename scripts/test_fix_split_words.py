#!/usr/bin/env python3
"""fix_split_words 单元测试（无需 PDF）。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_paper import fix_split_words, reflow


def test_known_splits():
    s = (
        "life of the We st, as the careers of their eli tes, "
        "inclu ding sev eral world -renowned scientists"
    )
    out = fix_split_words(s)
    assert "West" in out and "We st" not in out, out
    assert "elites" in out and "eli tes" not in out, out
    assert "including" in out and "inclu ding" not in out, out
    assert "several" in out and "sev eral" not in out, out
    assert "world-renowned" in out and "world -renowned" not in out, out


def test_preserve_common_bigrams():
    for s in (
        "may be this",
        "a long time",
        "in humans still",
        "such as cats",
        "a bout of flu",
        "on line 3",
        "at tack the problem",
        "in formation",
        "to pic of discussion",
        "for mer president",
    ):
        assert fix_split_words(s) == s, s


def test_chained_fragments():
    out = fix_split_words("th at ad dress th e ma ny ne eds")
    assert out == "that address the many needs", out


def test_homeless():
    assert fix_split_words("the ho meless") == "the homeless"


def test_reflexive():
    assert fix_split_words("them selves") == "themselves"
    assert fix_split_words("him self") == "himself"


def test_reflow_line_wrap():
    out = reflow("life of the We\nst, as the careers")
    assert "West" in out and "We st" not in out, out


if __name__ == "__main__":
    test_known_splits()
    test_preserve_common_bigrams()
    test_chained_fragments()
    test_homeless()
    test_reflexive()
    test_reflow_line_wrap()
    print("ok")
