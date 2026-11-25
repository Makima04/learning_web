# Scripts 核心管线索引

`scripts/` 根目录保留常驻构建、导出、质检与部署管线及其 JSON 映射配置；已完成的一次性迁移与修补脚本统一归档在 `scripts/archive/`。

## 常用活管线命令

- **数学手稿导出（索引 + 46 讲按需分片）**：
  `python3 scripts/export_math_handouts.py`
- **数学一真题逐题切图（末尾自动跑严格防回归体检）**：
  `python3 scripts/export_math1_question_images.py`
- **数学题图防回归体检（MD5 / dHash 重复图 + 封面异常 + 几何校验）**：
  `python3 scripts/audit_math_images.py --strict`（可加 `--only math1|ll|zy` 或 `--ocr-suspects`）
- **408 / 880 / 1000 题库分片生成**：
  `python3 scripts/split_practice_catalogs.py`
- **408 前端数据生成**：
  `python3 scripts/gen_cs408_frontend.py`
- **英语词库与真题数据生成**：
  `python3 scripts/gen_data.py` / `python3 scripts/gen_wordinfo.py`
- **生产发布打包与部署**：
  `python3 scripts/package-study-release.py` / `python3 scripts/deploy_production_study.py`
