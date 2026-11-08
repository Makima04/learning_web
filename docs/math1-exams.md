# 数学一真题资料（2009—2026）

本地归档：`papers/math/math1/`，18 套试卷 + 18 份参考答案详解，共 408 题。
每年试卷为 `<year>.pdf`，答案为 `answers/<year>-answer.pdf`；按年目录及版本说明见归档中的 `README.md`。

```bash
.venv/bin/python3 scripts/collect_math1_exams.py
.venv/bin/python3 scripts/collect_math1_exams.py --check
```

来源固定在 `scripts/math1_exam_sources.json`；收集脚本验证源文件 SHA-256，再按原合订本书签提取整页。
资料为社区重排版，非官方扫描卷。保留上游原页内容、水印、合订本页码，未重新 OCR 或自行生成答案。
主来源：[CHNragdoll/anki-pipeline 数学固定发行页](https://github.com/CHNragdoll/anki-pipeline/releases/tag/math-exams)。

归档带有 `index.json`（年份、题数、文件哈希、源页码）及 `verification.json`。
2009—2025 的选择题答案键与固定提交的 lx-ruc/kaoyanshuxue 比对，2026 与另一处公开解析 PDF 比对：156/156 一致。
这些来源可能存在共同上游；尚未逐题人工复核题干公式、填空答案及大题推导。

数学一三种题型已接入左侧“复习性价比”：`/review-priority?subject=math`，默认大题，支持选择/填空切换。旧路径 `/kg/math/review-priority` 自动迁移并保留筛选。
分析数据和网页 PDF 由 `.venv/bin/python3 scripts/gen_math1_analysis.py` 生成；逐题标签映射与成本档位在 `scripts/math1_topic_mapping.json` 维护。
原始资料遵循项目现有 `papers/` 忽略规则，不入 Git；网页所需 PDF 和分析 JSON 是生成的前端数据产物。
