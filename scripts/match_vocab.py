#!/usr/bin/env python3
# match_vocab.py — 把真题篇章里的单词与红宝书词库对应上
#
# 输入: 2006.json (parse_paper 输出) + words.json (6550 词)
# 输出: papers.js (window.PAPERS) — 每份真题、每篇篇章的单词命中清单
#
# 核心难点：真题里出现的是屈折变形（homogenizing/overfished/predators），
# 红宝书存的是原形（homogenize/overfish/predator）。需要一张「变形→原形」反查表。
# 用规则屈折 + 一张小规模不规则表覆盖考研常见词。

import hashlib
import json
import re
import sys
from pathlib import Path

# ============ 1. 词形还原 ============

# 不规则动词变形式（考研高频，手动维护；原形→[变形...]）
IRREGULAR_VERBS = {
    # be
    "be": ["is", "am", "are", "was", "were", "been", "being"],
    "bear": ["bore", "born", "borne", "bearing"],
    "beat": ["beaten", "beating"],
    "become": ["became"],
    "begin": ["began", "begun", "beginning"],
    "bend": ["bent", "bending"],
    "bind": ["bound", "binding"],
    "bite": ["bit", "bitten", "biting"],
    "blow": ["blew", "blown", "blowing"],
    "break": ["broke", "broken", "breaking"],
    "bring": ["brought", "bringing"],
    "build": ["built", "building"],
    "burst": ["bursting"],
    "buy": ["bought", "buying"],
    "cast": ["casting"],
    "catch": ["caught", "catching"],
    "choose": ["chose", "chosen", "choosing"],
    "come": ["came", "coming"],
    "cost": ["costing"],
    "creep": ["crept", "creeping"],
    "cut": ["cutting"],
    "deal": ["dealt", "dealing"],
    "dig": ["dug", "digging"],
    "do": ["did", "done", "doing", "does"],
    "draw": ["drew", "drawn", "drawing"],
    "dream": ["dreamt", "dreaming"],
    "drink": ["drank", "drunk", "drinking"],
    "drive": ["drove", "driven", "driving"],
    "eat": ["ate", "eaten", "eating"],
    "fall": ["fell", "fallen", "falling"],
    "feed": ["fed", "feeding"],
    "feel": ["felt", "feeling"],
    "fight": ["fought", "fighting"],
    "find": ["found", "finding"],
    "fly": ["flew", "flown", "flying"],
    "forbid": ["forbade", "forbidden", "forbidding"],
    "forget": ["forgot", "forgotten", "forgetting"],
    "forgive": ["forgave", "forgiven", "forgiving"],
    "freeze": ["froze", "frozen", "freezing"],
    "get": ["got", "gotten", "getting", "gets"],
    "give": ["gave", "given", "giving", "gives"],
    "go": ["went", "gone", "going", "goes"],
    "grow": ["grew", "grown", "growing"],
    "hang": ["hung", "hanging"],
    "have": ["had", "having", "has"],
    "hear": ["heard", "hearing"],
    "hide": ["hid", "hidden", "hiding"],
    "hit": ["hitting"],
    "hold": ["held", "holding"],
    "hurt": ["hurting"],
    "keep": ["kept", "keeping"],
    "know": ["knew", "known", "knowing"],
    "lay": ["laid", "laying"],
    "lead": ["led", "leading"],
    "lean": ["leant", "leaning"],
    "leap": ["leapt", "leaping"],
    "learn": ["learnt", "learning"],
    "leave": ["left", "leaving"],
    "lend": ["lent", "lending"],
    "let": ["letting"],
    "lie": ["lay", "lain", "lying"],
    "light": ["lit", "lighting"],
    "lose": ["lost", "losing"],
    "make": ["made", "making"],
    "mean": ["meant", "meaning"],
    "meet": ["met", "meeting"],
    "miss": ["missing"],
    "overcome": ["overcoming"],
    "pay": ["paid", "paying"],
    "put": ["putting"],
    "quit": ["quitting"],
    "read": ["reading"],
    "ride": ["rode", "ridden", "riding"],
    "ring": ["rang", "rung", "ringing"],
    "rise": ["rose", "risen", "rising"],
    "run": ["ran", "running"],
    "say": ["said", "saying", "says"],
    "see": ["saw", "seen", "seeing", "sees"],
    "seek": ["sought", "seeking"],
    "sell": ["sold", "selling"],
    "send": ["sent", "sending"],
    "set": ["setting"],
    "shake": ["shook", "shaken", "shaking"],
    "shed": ["shedding"],
    "shine": ["shone", "shining"],
    "shoot": ["shot", "shooting"],
    "show": ["showed", "shown", "showing"],
    "shrink": ["shrank", "shrunk", "shrinking"],
    "shut": ["shutting"],
    "sing": ["sang", "sung", "singing"],
    "sink": ["sank", "sunk", "sinking"],
    "sit": ["sat", "sitting"],
    "sleep": ["slept", "sleeping"],
    "slide": ["slid", "sliding"],
    "smell": ["smelt", "smelling"],
    "speak": ["spoke", "spoken", "speaking"],
    "speed": ["sped", "speeding"],
    "spell": ["spelt", "spelling"],
    "spend": ["spent", "spending"],
    "spin": ["spun", "spinning"],
    "spread": ["spreading"],
    "stand": ["stood", "standing"],
    "steal": ["stole", "stolen", "stealing"],
    "stick": ["stuck", "sticking"],
    "strike": ["struck", "stricken", "striking"],
    "swear": ["swore", "sworn", "swearing"],
    "sweep": ["swept", "sweeping"],
    "swim": ["swam", "swum", "swimming"],
    "swing": ["swung", "swinging"],
    "take": ["took", "taken", "taking", "takes"],
    "teach": ["taught", "teaching"],
    "tear": ["tore", "torn", "tearing"],
    "tell": ["told", "telling", "tells"],
    "think": ["thought", "thinking"],
    "throw": ["threw", "thrown", "throwing"],
    "understand": ["understood", "understanding"],
    "wake": ["woke", "woken", "waking"],
    "wear": ["wore", "worn", "wearing"],
    "weave": ["wove", "woven", "weaving"],
    "weep": ["wept", "weeping"],
    "win": ["won", "winning"],
    "wind": ["wound", "winding"],
    "withdraw": ["withdrew", "withdrawn", "withdrawing"],
    "write": ["wrote", "written", "writing", "writes"],
    # 常见助/情态
    "can": ["could"],
    "will": ["would"],
    "shall": ["should"],
    "may": ["might"],
    "have": ["had", "has"],
}

# 不规则复数（少数）
IRREGULAR_PLURALS = {
    "man": ["men"], "woman": ["women"], "child": ["children"],
    "foot": ["feet"], "tooth": ["teeth"], "mouse": ["mice"],
    "goose": ["geese"], "ox": ["oxen"], "person": ["people"],
    "formula": ["formulae"], "criterion": ["criteria"], "phenomenon": ["phenomena"],
    "analysis": ["analyses"], "crisis": ["crises"], "basis": ["bases"],
    "datum": ["data"], "medium": ["media"], "index": ["indices"],
    "life": ["lives"], "wife": ["wives"], "knife": ["knives"],
    "leaf": ["leaves"], "thief": ["thieves"], "half": ["halves"],
    "self": ["selves"], "wolf": ["wolves"], "calf": ["calves"],
}


def double_consonant(w: str) -> bool:
    """末尾是 单元+单辅（如 run/sit/big）需双写辅音再加 ed/ing/er。"""
    if len(w) < 3:
        return False
    return w[-1] not in "aeiou" and w[-2] in "aeiou" and w[-3] not in "aeiou"


def verb_inflections(base: str):
    """生成规则动词变形：过去式/过去分词/现在分词/三单。"""
    out = set()
    # -e 结尾
    if base.endswith("e"):
        out.add(base + "d")
        out.add(base[:-1] + "ing")
        out.add(base + "s")
    elif base.endswith("y") and len(base) > 1 and base[-2] not in "aeiou":
        out.add(base[:-1] + "ied")   # carried
        out.add(base[:-1] + "ies")   # carries
        out.add(base + "ing")
    else:
        out.add(base + "ed")
        out.add(base + "s")
        if double_consonant(base):
            out.add(base + base[-1] + "ing")   # running
            out.add(base + base[-1] + "ed")    # stopped
            out.add(base + base[-1] + "er")
            out.add(base + base[-1] + "est")
        else:
            out.add(base + "ing")
    return out


def noun_plurals(base: str):
    out = set()
    if base.endswith("y") and len(base) > 1 and base[-2] not in "aeiou":
        out.add(base[:-1] + "ies")
    elif base.endswith(("s", "x", "z", "ch", "sh")):
        out.add(base + "es")
    elif base.endswith("f"):
        out.add(base[:-1] + "ves")
    elif base.endswith("fe"):
        out.add(base[:-2] + "ves")
    else:
        out.add(base + "s")
    return out


def adj_degrees(base: str):
    out = set()
    if base.endswith("e"):
        out.add(base + "r")
        out.add(base + "st")
    elif base.endswith("y") and len(base) > 1 and base[-2] not in "aeiou":
        out.add(base[:-1] + "ier")
        out.add(base[:-1] + "iest")
    elif len(base) <= 3 or double_consonant(base) and not base.endswith("ing"):
        out.add(base + "er")
        out.add(base + "est")
    else:
        out.add(base + "er")
        out.add(base + "est")
    out.add("more " + base)
    out.add("most " + base)
    return out


# 停用词（高频虚词/代词等，不作为「需要背的生词」）
STOPWORDS = set("""
a an the and or but if then else when while as of at by for with about against between into through during before after above below to from up down in out on off over under again further once here there all any both each few more most other some such no nor not only own same so than too very can will just don should now is are was were be been being have has had do does did get got
this that these those i you he she it we they me him her us them my your his its our their mine yours hers ours theirs
am shall would could should might must ought one two three four five six seven eight nine ten first second third
""".split())


def build_lookup(words):
    """构造 {变形(小写): [原形, ...]} 反查表。"""
    lookup = {}
    word_pos = {}  # 原形 -> 主词性（取第一个 sense 的 pos）
    for w in words:
        en = w["english"].strip().lower()
        if not en:
            continue
        # 主词性（用于决定生成哪些变形）
        poses = [s["pos"] for s in w["senses"]]
        word_pos[en] = poses
        # 注册原形自身
        lookup.setdefault(en, set()).add(en)
        is_verb = any("v" in p for p in poses)
        is_noun = any(p.startswith("n") for p in poses)
        is_adj = any("adj" in p for p in poses)
        is_adv = any("adv" in p for p in poses)

        if is_verb:
            # 不规则优先
            if en in IRREGULAR_VERBS:
                for form in IRREGULAR_VERBS[en]:
                    lookup.setdefault(form.lower(), set()).add(en)
            for form in verb_inflections(en):
                lookup.setdefault(form, set()).add(en)
        if is_noun:
            if en in IRREGULAR_PLURALS:
                for form in IRREGULAR_PLURALS[en]:
                    lookup.setdefault(form.lower(), set()).add(en)
            for form in noun_plurals(en):
                lookup.setdefault(form, set()).add(en)
        if is_adj:
            for form in adj_degrees(en):
                lookup.setdefault(form, set()).add(en)
        if is_adv:
            lookup.setdefault("more " + en, set()).add(en)
            lookup.setdefault("most " + en, set()).add(en)

    # 固化为 list
    return {k: sorted(v) for k, v in lookup.items()}


# 清洗真题例句文本中的格式噪声：
# - 句首题号 (47) / 47. / 47、（翻译 segment、七选五选项漏进来的标记）
# - PDF 页眉 「20XX年考研英语…真题第N页共M页」被并进正文
# - 中文括注 (苏格拉底) / （贝克汉姆）（原文的人名/术语注释）
# - 分值碎片 (20 points)（写作 directions 的分值标记）
# - 句中残留的 (41)（两段并句后中间的题号）
# 注意：与 scripts/clean_sentences.py 共用同一份逻辑（clean_sentences.py 直接 import 本函数），
# 改这里就等于改两处，不要在 clean_sentences.py 里复制粘贴。
LEAD_RE        = re.compile(r"^\s*[(\[]?\s*\d{1,3}\s*[)\].:、]\s*")
HEADER_RE      = re.compile(r"\d{4}\s*年考研英语.*?(?:真题|试题)(?:.*?第\s*\d+\s*页(?:共\s*\d+\s*页)?)?")
GLOSS_RE       = re.compile(r"[\(（]\s*[一-鿿]+(?:[·，,][一-鿿]+)*\s*[\)）]")
POINTS_RE      = re.compile(r"[\(（]\s*\d+\s*points?\s*[\)）]", re.IGNORECASE)
DIGIT_PAREN_RE = re.compile(r"[\(（]\s*\d{1,3}\s*[\)）]")
_MULTISPACE    = re.compile(r"\s{2,}")
_PUNCT_FIX     = re.compile(r"\s+([,.;:!?])")


def clean_sentence_text(s: str) -> str:
    """清洗单条例句文本，去掉题号/页眉/中文括注/分值碎片等噪声。返回可能为空。"""
    if not s:
        return s
    s = LEAD_RE.sub("", s, count=1)
    s = HEADER_RE.sub(" ", s)
    s = GLOSS_RE.sub("", s)
    s = POINTS_RE.sub("", s)
    s = DIGIT_PAREN_RE.sub(" ", s)
    s = _MULTISPACE.sub(" ", s).strip()
    s = _PUNCT_FIX.sub(r"\1", s)
    return s.strip()


TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z\-']{0,}")


def tokenize(text: str):
    """切词：返回 [(token_lower, start, end)]，保留位置以便回查原句。"""
    out = []
    for m in TOKEN_RE.finditer(text):
        t = m.group(0).lower()
        out.append((t, m.start(), m.end()))
    return out


def split_sentences(text: str):
    """粗略按句号/问号/感叹号切句，并逐条清洗格式噪声。空串丢弃。"""
    parts = re.split(r"(?<=[.!?])\s+", text)
    out = []
    for p in parts:
        c = clean_sentence_text(p)
        if c:
            out.append(c)
    return out


def find_token_in_sentence(token: str, sentence: str):
    """在句子里找 token 的出现位置，返回 (start,end) 或 None。考虑屈折前缀匹配。"""
    for m in TOKEN_RE.finditer(sentence):
        if m.group(0).lower() == token:
            return (m.start(), m.end())
    return None


def match_passage(passage_text: str, lookup: dict, word_map: dict):
    """对一篇正文做匹配，返回 [{idx, english, senses, count, sentences:[...]}]。"""
    if not passage_text:
        return []
    # 先清正文噪声（页眉/中文括注/题号），切出来的句子就是干净的，
    # locate_sentence 的 full.find() 也能精确命中。
    passage_text = clean_sentence_text(passage_text)
    tokens = tokenize(passage_text)
    # 合并多词变形（如 "more beautiful"）：扫描时若遇到 "more"/"most" 且下一词能加 degree，合并
    hits = {}  # 原形 -> {count, sentences:set}

    sentences = split_sentences(passage_text)
    # 句子边界字符偏移表：把每个 token 归属到某句
    # 简单做法：对每个命中 token，在原文里定位它属于哪个句子

    i = 0
    n = len(tokens)
    while i < n:
        tok, s, e = tokens[i]
        # 尝试合并 "more/most + adj"
        form = tok
        if tok in ("more", "most") and i + 1 < n:
            nxt = tokens[i + 1][0]
            combined = tok + " " + nxt
            if combined in lookup:
                form = combined
        # 查反查表
        bases = lookup.get(form)
        if not bases and tok in ("more", "most"):
            # 单独的 more/most 不命中
            bases = None
        if bases:
            # 过滤停用词
            real = [b for b in bases if b not in STOPWORDS]
            # 若全部命中都是停用词，跳过
            for b in real:
                # 找原句
                sent = locate_sentence(passage_text, s, e, sentences)
                d = hits.setdefault(b, {"count": 0, "sentences": []})
                d["count"] += 1
                if sent and sent not in d["sentences"]:
                    d["sentences"].append(sent)
        i += 1
        if form != tok:  # 合并了两词，跳过下一个
            i += 1

    # 组装结果，按出现次数降序
    result = []
    for base, d in hits.items():
        w = word_map.get(base)
        if not w:
            continue
        # word_map 存的是 words.json 原始对象 {index, english, senses:[{pos,cn}]}
        senses = [[s["pos"], s["cn"]] for s in w["senses"]]
        result.append({
            "idx": w["index"],
            "english": w["english"],
            "senses": senses,
            "count": d["count"],
            "sentences": d["sentences"][:5],  # 最多 5 句例句
        })
    result.sort(key=lambda x: -x["count"])
    return result


def locate_sentence(full: str, start: int, end: int, sentences):
    """根据 token 在 full 中的偏移，找出它所在的句子文本。"""
    # 句子按 split 切分，要重建偏移：用 finditer 重新定位每个句子的起止
    pos = 0
    for sent in sentences:
        idx = full.find(sent, pos)
        if idx == -1:
            continue
        s_start, s_end = idx, idx + len(sent)
        if s_start <= start < s_end:
            return sent
        pos = s_end
    # 兜底
    return sentences[-1] if sentences else full[start:end]


# ============ 2. 主流程 ============

def main():
    base_dir = Path(__file__).resolve().parent.parent
    words_path = base_dir / "words.json"
    papers = []  # 命令行传入的 paper.json 列表

    args = sys.argv[1:]
    if not args:
        print("usage: match_vocab.py <paper1.json> [paper2.json ...]")
        sys.exit(1)

    words = json.loads(words_path.read_text(encoding="utf-8"))
    word_map = {w["english"].lower(): w for w in words}
    lookup = build_lookup(words)

    all_papers = []
    for p in args:
        data = json.loads(Path(p).read_text(encoding="utf-8"))
        # 顶层 answers：{"1":"A","21":"B","41":"C",...}（extract_answers.py 写入）。
        # 按 section 题号范围切到各 passage。无则空 dict。
        top_answers = data.get("answers") or {}
        def slice_ans(start, end):
            return {k: v for k, v in top_answers.items()
                    if start <= int(k) <= end}
        paper = {
            "year": data.get("year"),
            "source": data.get("source"),
            # variant: "en1" 英语一 / "en2" 英语二。从 source 路径推断（papers/en2/*.json），
            # 缺省视为 en1（兼容根目录下既有 20 份英一真题）。前端据此分导航。
            "variant": data.get("variant") or ("en2" if "/en2/" in str(p).replace("\\", "/") else "en1"),
            "sections": [],
        }
        for sec in data.get("sections", []):
            sec_out = {
                "type": sec["type"],
                "title": sec.get("title", ""),
            }
            # 收集「可背单词的篇章」
            passages = []
            if sec["type"] == "use_of_english":
                words_hits = match_passage(sec.get("passage", ""), lookup, word_map)
                # 透传 items（完形选项，stem 通常为空）——reader 显示答案需选项列表
                items = [
                    {"n": it.get("n"), "stem": it.get("stem", ""),
                     "options": it.get("options", {})}
                    for it in sec.get("items", [])
                ]
                passages.append({
                    "label": "完形填空",
                    "body": sec.get("passage", ""),
                    "words": words_hits,
                    "itemCount": len(sec.get("items", [])),
                    "items": items,
                    "answers": slice_ans(1, 20),
                })
            elif sec["type"] == "reading_a":
                for t in sec.get("passages", []):
                    words_hits = match_passage(t.get("body", ""), lookup, word_map)
                    # 透传 items（stem + options）——双栏 reader 需要题干关键词分层高亮
                    items = [
                        {"n": it.get("n"), "stem": it.get("stem", ""),
                         "options": it.get("options", {})}
                        for it in t.get("items", [])
                    ]
                    # 该 Text 的题号范围（items[0].n ~ items[-1].n），切 answers
                    ns = [it.get("n") for it in items if it.get("n")]
                    if ns:
                        a_min, a_max = min(ns), max(ns)
                        ans = slice_ans(a_min, a_max)
                    else:
                        ans = {}
                    passages.append({
                        "label": t["label"],
                        "body": t.get("body", ""),
                        "words": words_hits,
                        "itemCount": len(t.get("items", [])),
                        "items": items,
                        "answers": ans,
                    })
            elif sec["type"] == "reading_b":
                # 七选五: 正文在 passage；排序/小标题变体有时把可重排段落放在 options
                # （passage 为空）。两者都扫，保证总有单词命中。
                passage_body = sec.get("passage", "")
                opts = sec.get("options", {})
                if not passage_body and opts:
                    # 排序题：把各段落拼成正文
                    passage_body = "\n".join(f"[{k}] {v}" for k, v in sorted(opts.items()))
                words_hits = match_passage(passage_body, lookup, word_map)
                # 若正文已有内容（七选五），再补扫选项句子里的词，合并去重
                if sec.get("passage") and opts:
                    opt_text = "\n".join(opts.values())
                    extra = match_passage(opt_text, lookup, word_map)
                    seen = {w["idx"] for w in words_hits}
                    for w in extra:
                        if w["idx"] not in seen:
                            words_hits.append(w)
                            seen.add(w["idx"])
                passages.append({
                    "label": "新题型（七选五）",
                    "body": passage_body,
                    "words": words_hits,
                    "itemCount": len(sec.get("gaps", [])),
                    "answers": slice_ans(41, 45),
                })
            elif sec["type"] == "translation":
                # 翻译：把全文 + 各 segment 都算上
                full = sec.get("passage", "")
                words_hits = match_passage(full, lookup, word_map)
                passages.append({
                    "label": "翻译",
                    "body": full,
                    "words": words_hits,
                    "itemCount": len(sec.get("segments", [])),
                })
            elif sec["type"] == "writing":
                # 写作题目文本较短，但仍可匹配
                for part in sec.get("parts", []):
                    words_hits = match_passage(part.get("directions", ""), lookup, word_map)
                    n = part["n"]
                    # 英一题号 51/52（Part A/B），英二 47/48。统一映射成 A/B 标签。
                    letter = "A" if (n == 51 or n == 47) else ("B" if (n == 52 or n == 48) else str(n))
                    passages.append({
                        "label": f"写作 Part {letter}",
                        "body": part.get("directions", ""),
                        "words": words_hits,
                        "itemCount": 0,
                    })
            sec_out["passages"] = passages
            paper["sections"].append(sec_out)
        all_papers.append(paper)

    # 写 papers.js 到 web/（现役 vanilla 前端，server 同源挂载）。
    # CLAUDE.md：数据是构建产物；改源头（这里）再重跑，别手改 JS。
    out_paths = [
        base_dir / "web" / "papers.js",
    ]
    for out_path in out_paths:
        papers_payload = json.dumps(all_papers, ensure_ascii=False, separators=(",", ":"))
        phash = hashlib.sha256(papers_payload.encode("utf-8")).hexdigest()[:16]
        word_count = sum(
            len(ps.get("words", []))
            for p in all_papers
            for sec in p.get("sections", [])
            for ps in sec.get("passages", [])
        )
        with out_path.open("w", encoding="utf-8") as f:
            f.write("/* auto-generated by scripts/match_vocab.py — 真题单词命中表 */\n")
            f.write("window.PAPERS=" + papers_payload + ";\n")
            f.write(f"window.PAPERS_META={{version:{phash!r},count:{word_count}}};\n")
        print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")

    # 摘要
    for paper in all_papers:
        print(f"\n== {paper['year']} {paper['source']} ==")
        for sec in paper["sections"]:
            for psg in sec["passages"]:
                print(f"  {psg['label']:14} 命中 {len(psg['words']):3} 词  | body {len(psg['body'])} chars")
                # 抽前 8 个高频词展示
                top = [w["english"] for w in psg["words"][:8]]
                if top:
                    print(f"      高频: {', '.join(top)}")


if __name__ == "__main__":
    main()
