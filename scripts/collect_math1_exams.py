#!/usr/bin/env python3
"""收集数学一 2009—2026 真题与参考答案，按源 PDF 书签拆卷并核对完整性。

.venv/bin/python3 scripts/collect_math1_exams.py
.venv/bin/python3 scripts/collect_math1_exams.py --check
依赖项目已有的 PyMuPDF；不重排公式，不修改原页内容。
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import urllib.request

import fitz


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "papers/math/math1"
CACHE = DEST / ".sources"
MANIFEST = ROOT / "scripts/math1_exam_sources.json"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_source(resource):
    path = CACHE / resource["filename"]
    if not path.exists():
        request = urllib.request.Request(
            resource["url"], headers={"User-Agent": "english-web-math1-archive"}
        )
        with urllib.request.urlopen(request, timeout=90) as response:
            data = response.read()
        if digest(data) != resource["sha256"]:
            raise ValueError(f"上游文件内容已改变：{resource['url']}")
        path.write_bytes(data)
    if digest(path.read_bytes()) != resource["sha256"]:
        raise ValueError(f"缓存文件校验失败：{path}")
    return path


def year_ranges(doc):
    entries = [
        (int(m[1]), page - 1)
        for level, title, page in doc.get_toc()
        if level == 1 and (m := re.match(r"(\d{4}) 年全国", title))
    ]
    return {
        year: (start, entries[i + 1][1] if i + 1 < len(entries) else len(doc))
        for i, (year, start) in enumerate(entries)
    }


def text_of(doc):
    return "\n".join(page.get_text() for page in doc)


def inspect(path, year, kind):
    with fitz.open(path) as doc:
        text = text_of(doc)
        if str(year) not in doc[0].get_text() or "数学（一）" not in doc[0].get_text():
            raise ValueError(f"年份或科目不符：{path}")
        pattern = r"(?m)^\s*(\d+)\.\s*$" if kind == "questions" else r"第\s*(\d+)\s*题"
        # 首张为上游统一重排的封面，注意事项也有 1—4 的编号。
        body = "\n".join(doc[i].get_text() for i in range(1, len(doc)))
        numbers = list(map(int, re.findall(pattern, body)))
        if kind == "questions":
            labels = []
            for page in list(doc)[1:]:
                for block in page.get_text("dict")["blocks"]:
                    for line in block.get("lines", []):
                        label = "".join(span["text"] for span in line["spans"]).strip()
                        if match := re.fullmatch(r"(\d+)\.", label):
                            labels.append((int(match[1]), line["bbox"][0]))
            # 公式中也可能出现单独一行的“2.”，只计正文题号所在左边栏。
            margin = labels[0][1]
            numbers = [n for n, x in labels if abs(x - margin) < 0.5]
        expected = list(range(1, 24 if year <= 2020 else 23))
        if numbers != expected:
            raise ValueError(f"题号缺失、重复或乱序：{path}: {numbers}")
        if kind == "answer-details" and text.count("【答案】") != len(expected):
            raise ValueError(f"参考答案数量不符：{path}")
        return {
            "file": path.relative_to(DEST).as_posix(),
            "pages": len(doc),
            "bytes": path.stat().st_size,
            "sha256": digest(path.read_bytes()),
            "question_count": len(expected),
        }, text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="离线检查归档文件与索引，不下载、不改写")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    years = manifest["years"]
    if args.check:
        index = json.loads((DEST / "index.json").read_text())
        if [paper["year"] for paper in index["papers"]] != years:
            raise ValueError("归档年份不完整")
        for paper in index["papers"]:
            for key, kind in [("paper", "questions"), ("answers", "answer-details")]:
                actual, _ = inspect(DEST / paper[key]["file"], paper["year"], kind)
                if actual != {k: v for k, v in paper[key].items() if k != "source_pages"}:
                    raise ValueError(f"文件与索引不一致：{actual['file']}")
        print(f"校验通过：{len(years)} 年，36 份 PDF，408 道题及对应参考答案。")
        return

    CACHE.mkdir(parents=True, exist_ok=True)
    (DEST / "answers").mkdir(parents=True, exist_ok=True)
    (DEST / "sources.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    sources = {item["id"]: read_source(item) for item in manifest["resources"]}
    reference = json.loads(sources["answers-reference"].read_text())
    papers = {year: {"year": year} for year in years}
    mcq_keys = {}
    rendered_pages = 0
    for kind, key in [("questions", "paper"), ("answer-details", "answers")]:
        with fitz.open(sources[kind]) as source:
            ranges = year_ranges(source)
            for year in years:
                start, stop = ranges[year]
                path = DEST / (f"{year}.pdf" if key == "paper" else f"answers/{year}-answer.pdf")
                with fitz.open() as output:
                    output.insert_pdf(source, from_page=start, to_page=stop - 1)
                    output.set_metadata({
                        "title": f"{year} 考研数学一·{'真题' if key == 'paper' else '参考答案详解'}（社区重排版）",
                        "subject": "公开资料整理，非官方扫描卷；来源见 sources.json",
                    })
                    output.save(path, garbage=4, deflate=True)
                details, text = inspect(path, year, kind)
                with fitz.open(path) as saved:
                    for n, page in enumerate(saved):
                        actual = page.get_pixmap(matrix=fitz.Matrix(.5, .5), alpha=False)
                        original = source[start + n].get_pixmap(matrix=fitz.Matrix(.5, .5), alpha=False)
                        if (actual.width, actual.height, actual.samples) != (
                            original.width, original.height, original.samples
                        ):
                            raise ValueError(f"拆卷后渲染与原页不一致：{path} 第 {n + 1} 页")
                        rendered_pages += 1
                details["source_pages"] = [start + 1, stop]
                papers[year][key] = details
                if key == "answers":
                    mcq_count = 8 if year <= 2020 else 10
                    keys = dict((int(n), a) for n, a in re.findall(
                        r"第\s*(\d+)\s*题\s*【答案】\s*([A-D])", text
                    ) if int(n) <= mcq_count)
                    if set(keys) != set(range(1, mcq_count + 1)):
                        raise ValueError(f"{year} 选择题答案键不完整")
                    mcq_keys[year] = keys

    checks = []
    for year in years[:-1]:
        for n, answer in mcq_keys[year].items():
            other = reference[f"数学一_{year}_Q{n:02d}"]["answer"]
            checks.append({"year": year, "n": n, "answer": answer, "reference": other})
    with fitz.open(sources["2026-reference"]) as doc:
        # 独立机构 PDF 按题给出“1．【答案】A”，只取前十道选择题。
        keys = dict((int(n), a) for n, a in re.findall(
            r"(\d+)[．.]\s*【答案】\s*([A-D])", text_of(doc)
        ) if int(n) <= 10)
    if set(keys) != set(range(1, 11)):
        raise ValueError("2026 独立来源答案键不完整")
    for n, answer in mcq_keys[2026].items():
        checks.append({"year": 2026, "n": n, "answer": answer, "reference": keys[n]})
    mismatches = [item for item in checks if item["answer"] != item["reference"]]
    report = {
        "checked_at": manifest["collected_at"],
        "mcq_compared": len(checks),
        "mcq_matched": len(checks) - len(mismatches),
        "mismatches": mismatches,
        "scope": "自动核对题号、答案数量、文件哈希及跨来源选择题答案键；未逐题人工复核题干公式与大题推导。两处来源可能存在共同上游。",
        "checks": checks,
        "source_output_render_check": {"pages": rendered_pages, "dpi": 36, "all_identical": True},
    }
    (DEST / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    index = {
        "subject": "math1", "years": years, "paper_count": len(years),
        "question_count": sum(p["paper"]["question_count"] for p in papers.values()),
        "edition": manifest["edition"], "papers": list(papers.values()),
    }
    (DEST / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")
    print(f"收集完成：{len(years)} 年，36 份 PDF；选择题答案键 {report['mcq_matched']}/{len(checks)} 一致。")
    if mismatches:
        raise ValueError(f"跨来源答案有分歧，详见 verification.json：{mismatches}")


if __name__ == "__main__":
    main()
