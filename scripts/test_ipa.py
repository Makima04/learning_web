#!/usr/bin/env python3
"""ARPAbet → 国际音标 IPA 与查词回退（不依赖 nltk 下载）。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ipa import arpa_to_ipa, british_fallbacks, lookup_ipa


CMU = {
    "panorama": [["P", "AE2", "N", "ER0", "AE1", "M", "AH0"]],
    "object": [["AA1", "B", "JH", "EH0", "K", "T"], ["AH0", "B", "JH", "EH1", "K", "T"]],
    "observe": [["AH0", "B", "Z", "ER1", "V"]],
    "according": [["AH0", "K", "AO1", "R", "D", "IH0", "NG"]],
    "to": [["T", "UW1"], ["T", "IH0"], ["T", "AH0"]],
    "favor": [["F", "EY1", "V", "ER0"]],
    "email": [["IY0", "M", "EY1", "L"]],
    "x-ray": [["EH1", "K", "S", "R", "EY2"]],
    "airconditioning": [["EH1", "R", "K", "AH0", "N", "D", "IH1", "SH", "AH0", "N", "IH0", "NG"]],
    "think": [["TH", "IH1", "NG", "K"]],
    "tank": [["T", "AE1", "NG", "K"]],
    "pediatrics": [["P", "IY2", "D", "IY0", "AE1", "T", "R", "IH0", "K", "S"]],
}


def test_arpa_object_noun_verb():
    noun = arpa_to_ipa(["AA1", "B", "JH", "EH0", "K", "T"])
    verb = arpa_to_ipa(["AH0", "B", "JH", "EH1", "K", "T"])
    assert noun == "/ˈɑbdʒɛkt/", noun
    assert verb == "/əbˈdʒɛkt/", verb


def test_arpa_panorama_stress():
    assert arpa_to_ipa(["P", "AE2", "N", "ER0", "AE1", "M", "AH0"]) == "/ˌpænɚˈæmə/"


def test_lookup_homograph_and_phrase():
    assert lookup_ipa(CMU, "object") == "/ˈɑbdʒɛkt/, /əbˈdʒɛkt/"
    assert lookup_ipa(CMU, "according to") == "/əˈkɔrdɪŋ tə/"
    assert lookup_ipa(CMU, "think tank") == "/ˈθɪŋk ˈtæŋk/"


def test_british_and_hyphen():
    assert british_fallbacks("favour") == ["favor"]
    assert lookup_ipa(CMU, "favour") == "/ˈfeɪvɚ/"
    assert lookup_ipa(CMU, "e-mail") == "/iˈmeɪl/"
    assert lookup_ipa(CMU, "X-ray") == "/ˈɛksˌreɪ/"
    assert lookup_ipa(CMU, "paediatrics") == "/ˌpidiˈætrɪks/"


def test_manual_overlay():
    assert lookup_ipa(CMU, "blog") == "/blɔɡ/"
    assert lookup_ipa({}, "preposition") == "/ˌprɛpəˈzɪʃən/"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
    print("all passed")
