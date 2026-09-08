#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ARPAbet → 国际音标（IPA），并把 6550 词查成音标。

默写版 PDF 没有音标；用 CMUdict 生成美式发音的 IPA（斜线、eɪ/oʊ），
供 gen_data.py 写入 data.js 第 4 栏。
"""
from __future__ import annotations

VOWELS = {
    "AA",
    "AE",
    "AH",
    "AO",
    "AW",
    "AY",
    "EH",
    "ER",
    "EY",
    "IH",
    "IY",
    "OW",
    "OY",
    "UH",
    "UW",
}

ARPA_IPA = {
    "AA": "ɑ",
    "AE": "æ",
    "AH": "ʌ",
    "AO": "ɔ",
    "AW": "aʊ",
    "AY": "aɪ",
    "B": "b",
    "CH": "tʃ",
    "D": "d",
    "DH": "ð",
    "EH": "ɛ",
    "ER": "ɝ",
    "EY": "eɪ",
    "F": "f",
    "G": "ɡ",
    "HH": "h",
    "IH": "ɪ",
    "IY": "i",
    "JH": "dʒ",
    "K": "k",
    "L": "l",
    "M": "m",
    "N": "n",
    "NG": "ŋ",
    "OW": "oʊ",
    "OY": "ɔɪ",
    "P": "p",
    "R": "r",
    "S": "s",
    "SH": "ʃ",
    "T": "t",
    "TH": "θ",
    "UH": "ʊ",
    "UW": "u",
    "V": "v",
    "W": "w",
    "Y": "j",
    "Z": "z",
    "ZH": "ʒ",
}

# 最大节首辅音（用转换后的 IPA 拼）
VALID_CC = {
    "pl",
    "pr",
    "bl",
    "br",
    "tr",
    "dr",
    "kl",
    "kr",
    "ɡl",
    "ɡr",
    "fl",
    "fr",
    "θr",
    "ʃr",
    "sl",
    "sw",
    "tw",
    "dw",
    "kw",
    "sk",
    "sp",
    "st",
    "sm",
    "sn",
    "sf",
    "θw",
    "ʃw",
}
VALID_CCC = {"spl", "spr", "str", "skr", "skw", "skl"}

# 词库里 CMUdict 没有的词（手补，国际音标）
MANUAL = {
    "coronavirus": "/kəˌroʊnəˈvaɪrəs/",
    "blog": "/blɔɡ/",
    "preposition": "/ˌprɛpəˈzɪʃən/",
    "omnivore": "/ˈɑmnəvɔr/",
    "dazzlingly": "/ˈdæzlɪŋli/",
    "unacknowledged": "/ˌʌnəkˈnɑlɪdʒd/",
    "frizzle": "/ˈfrɪzəl/",
    "longline": "/ˈlɔŋˌlaɪn/",
    "factoid": "/ˈfæktɔɪd/",
    "psychoactive": "/ˌsaɪkoʊˈæktɪv/",
    "monoglot": "/ˈmɑnəɡlɑt/",
    "technicist": "/ˈtɛknəsɪst/",
    "upload": "/ˈʌpˌloʊd/",
    "stickiness": "/ˈstɪkinəs/",
    "baluster": "/ˈbæləstɚ/",
    "asocial": "/eɪˈsoʊʃəl/",
    "megalith": "/ˈmɛɡəlɪθ/",
    "transcendentalist": "/ˌtrænsɛnˈdɛntəlɪst/",
    "marquetry": "/ˈmɑrkɪtri/",
    "timescale": "/ˈtaɪmˌskeɪl/",
    "jobseeker": "/ˈdʒɑbˌsikɚ/",
    "limbic": "/ˈlɪmbɪk/",
    "enchantingly": "/ɪnˈtʃæntɪŋli/",
    "mutability": "/ˌmjutəˈbɪləti/",
    "illiberal": "/ɪˈlɪbərəl/",
    "subheading": "/ˈsʌbˌhɛdɪŋ/",
    "explicatory": "/ɪkˈsplɪkəˌtɔri/",
    "biophilia": "/ˌbaɪoʊˈfɪliə/",
    "short-termism": "/ˌʃɔrtˈtɝmɪzəm/",
    "unlearned": "/ʌnˈlɝnd/",
    "biotic": "/baɪˈɑtɪk/",
    "greengrocer": "/ˈɡrinˌɡroʊsɚ/",
    "netball": "/ˈnɛtbɔl/",
    "pushback": "/ˈpʊʃˌbæk/",
    "woodcut": "/ˈwʊdˌkʌt/",
    "offline": "/ˈɔfˌlaɪn/",
    "inexpressible": "/ˌɪnɪkˈsprɛsəbəl/",
    "rasher": "/ˈræʃɚ/",
    "skint": "/skɪnt/",
    "futurologist": "/ˌfjutʃəˈrɑlədʒɪst/",
    "arrestee": "/əˌrɛsˈti/",
    "paediatrics": "/ˌpidiˈætrɪks/",
}


def _parse_phone(phone: str) -> tuple[str, bool, int | None] | None:
    stress = None
    base = phone
    if phone[-1].isdigit():
        stress = int(phone[-1])
        base = phone[:-1]
    ipa = ARPA_IPA.get(base)
    if ipa is None:
        return None
    if stress == 0:
        if base == "AH":
            ipa = "ə"
        elif base == "ER":
            ipa = "ɚ"
    return ipa, base in VOWELS, stress


def arpa_to_ipa(phones: list[str]) -> str | None:
    parsed: list[tuple[str, bool, int | None]] = []
    for phone in phones:
        item = _parse_phone(phone)
        if item is None:
            return None
        parsed.append(item)

    vowel_idx = [i for i, (_ipa, is_vowel, _stress) in enumerate(parsed) if is_vowel]
    starts = [0]
    for k, vi in enumerate(vowel_idx):
        if k == 0:
            continue
        prev = vowel_idx[k - 1]
        cons = [parsed[i][0] for i in range(prev + 1, vi)]
        onset_len = 0
        if len(cons) >= 3 and "".join(cons[-3:]) in VALID_CCC:
            onset_len = 3
        elif len(cons) >= 2 and "".join(cons[-2:]) in VALID_CC:
            onset_len = 2
        elif cons:
            onset_len = 1
        starts.append(vi - onset_len)

    marks = [None] * len(parsed)
    for vi in vowel_idx:
        stress = parsed[vi][2]
        if stress not in (1, 2):
            continue
        start = 0
        for s in starts:
            if s <= vi:
                start = s
            else:
                break
        marks[start] = "ˈ" if stress == 1 else "ˌ"

    out: list[str] = []
    for i, (ipa, _is_vowel, _stress) in enumerate(parsed):
        if marks[i]:
            out.append(marks[i])
        out.append(ipa)
    return "/" + "".join(out) + "/"


def british_fallbacks(key: str) -> list[str]:
    """英式拼写 → 美式，供 CMUdict 回退。"""
    out: list[str] = []
    if key.endswith("ourable"):
        out.append(key[:-7] + "orable")
    if key.endswith("ourite"):
        out.append(key[:-6] + "orite")
    if key.endswith("our"):
        out.append(key[:-3] + "or")
    if key.endswith("ise"):
        out.append(key[:-3] + "ize")
    if key.endswith("yse"):
        out.append(key[:-3] + "yze")
    if key.endswith("isation"):
        out.append(key[:-7] + "ization")
    if (
        key.endswith("re")
        and not key.endswith(("are", "ere", "ire", "ore", "ure"))
        and len(key) > 4
    ):
        out.append(key[:-2] + "er")
    if "ae" in key:
        out.append(key.replace("ae", "e"))
    special = {
        "cheque": "check",
        "practise": "practice",
        "carcase": "carcass",
        "humourous": "humorous",
        "jewellery": "jewelry",
        "neighbourhood": "neighborhood",
        "centimetre": "centimeter",
        "manoeuvre": "maneuver",
        "marvellous": "marvelous",
        "behaviour": "behavior",
        "favourable": "favorable",
        "favourite": "favorite",
    }
    if key in special:
        out.append(special[key])
    # 去重保序
    seen: set[str] = set()
    uniq: list[str] = []
    for item in out:
        if item != key and item not in seen:
            seen.add(item)
            uniq.append(item)
    return uniq


def ipa_forms(
    cmu: dict[str, list[list[str]]], key: str, *, limit: int | None = None
) -> list[str]:
    recs = cmu.get(key) or []
    out: list[str] = []
    for phones in recs:
        ipa = arpa_to_ipa(phones)
        if ipa and ipa not in out:
            out.append(ipa)
        if limit is not None and len(out) >= limit:
            break
    return out


def _unwrap(form: str) -> str:
    return form.strip("/[]")


def _join_parts(parts: list[str]) -> str:
    return "/" + " ".join(_unwrap(p) for p in parts) + "/"


def _pick_part(forms: list[str], *, first: bool) -> str:
    """短语非首词优先用不带重音的弱读。"""
    if first:
        return forms[0]
    for form in reversed(forms):
        if "'" not in form and "ˈ" not in form and "ˌ" not in form:
            return form
    return forms[0]


def lookup_ipa(cmu: dict[str, list[list[str]]], english: str) -> str:
    raw = (english or "").strip()
    if not raw:
        return ""
    key = raw.lower()
    if key in MANUAL:
        return MANUAL[key]

    forms = ipa_forms(cmu, key, limit=2)
    if forms:
        return ", ".join(forms)

    for alt in british_fallbacks(key):
        forms = ipa_forms(cmu, alt, limit=2)
        if forms:
            return ", ".join(forms)

    if "-" in key:
        collapsed = key.replace("-", "")
        forms = ipa_forms(cmu, collapsed, limit=2)
        if forms:
            return ", ".join(forms)
        parts = [p for p in key.split("-") if p]
        ipas: list[str] = []
        for part in parts:
            hit = ipa_forms(cmu, part)
            if not hit:
                for alt in british_fallbacks(part):
                    hit = ipa_forms(cmu, alt)
                    if hit:
                        break
            if not hit:
                ipas = []
                break
            ipas.append(_pick_part(hit, first=not ipas))
        if ipas:
            return _join_parts(ipas)

    if " " in key:
        ipas = []
        for part in key.split():
            hit = ipa_forms(cmu, part)
            if not hit:
                ipas = []
                break
            ipas.append(_pick_part(hit, first=not ipas))
        if ipas:
            return _join_parts(ipas)

    if key.startswith("un") and len(key) > 4:
        rest = ipa_forms(cmu, key[2:])
        if rest:
            return f"/ʌn{_unwrap(rest[0])}/"

    return ""
