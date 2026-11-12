# 王道 408 大题原题图

2026-11-11：原目录只有 OCR 文字，图、表格、公式会丢失。例如 `ds-big-6.4-2` 的有向图只剩「—4- 人」「~3.」，无法据此作答。

2026-11-12：四科当前已入库的 430 道大题全部接入原题图。数据结构、操作系统和计网使用单题版；计组使用 68 页留空版，同页多题分别裁切。按正文像素范围裁去外围留白，保留图表与小问，不按 OCR 文本框裁图。使用小节书签和正文标题确定题序，再逐题 OCR 核验题号和原书答案页，两者匹配才写入映射。最初缺图的题在数据结构单题版中为 p.103、原书答案 P254。

| 科目 | PDF 页数 | 已入库大题原图 |
|---|---:|---:|
| 数据结构 | 167 | 164 |
| 操作系统 | 113 | 110 |
| 计算机组成原理 | 68 | 77 |
| 计算机网络 | 82 | 79 |

计组同页跨小节时，按正文标题切换小节，不能直接使用页眉（页眉可能已是下一节）。原目录 `co-big-4.1-1` 的答案页 P15 已据原页修正为 P155。留空版还包含现有目录未单独入库的 `co-big-2.3-5`、`co-big-4.3-2`，导出时作为裁切边界保留记录，不增加题目 ID 或改动既有考点审核结论。

- 图片：`frontend/public/cs408/img/wangdao/*.webp`，按题加载。
- 映射源：`scripts/wangdao_question_images.json`，按科目记录 PDF 摘要，并记录题目 ID、页码、裁切框、图片尺寸与摘要。逐科重建保留其他科目的映射。
- 重建时自动应用映射，完整目录、index 和分片均保留 `img` 及对应版本的 `pdf_page`。
- 图片优先展示；OCR 文字继续保留和加载，供现有解析入口使用。考点分类与题目 ID 不变。

```bash
.venv/bin/python3 scripts/export_wangdao_ds_images.py --pdf /path/数据结构大题.pdf
.venv/bin/python3 scripts/export_wangdao_images.py --book os --pdf /path/计算机操作系统大题.pdf
.venv/bin/python3 scripts/export_wangdao_images.py --book cn --pdf /path/计算机网络.pdf
.venv/bin/python3 scripts/export_wangdao_images.py --book co --pdf /path/计算机组成原理大题.pdf --layout compact
.venv/bin/python3 scripts/apply_wangdao_overlay.py
.venv/bin/python3 scripts/apply_wangdao_overlay.py --check
cd frontend && npm run build
```

校验包括四科原件摘要不同、430 张图片摘要、目录/分片一致性、计组同页多题及跨小节裁切边界，以及有图王道题仍会加载文字题干。OCR 缩图误识别答案页时用原分辨率复核，仍不匹配则停止导出。
