#!/usr/bin/env node
/**
 * 将 materials/math/handouts/_web/native_solutions.json 中的原生 LaTeX Markdown
 * 批量编译为严格校验通过的 KaTeX HTML，供 scripts/export_math_handouts.py 注入手稿。
 *
 * 用法：
 *   node scripts/render_native_solutions.mjs --emit-json   # 输出 { key: html } 到 stdout
 *   node scripts/render_native_solutions.mjs --audit       # 严格校验并打印详细体检报告
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '..');
const KATEX_PATH = path.join(PROJECT_DIR, 'frontend/node_modules/katex');
const SOLUTIONS_PATH = path.join(PROJECT_DIR, 'materials/math/handouts/_web/native_solutions.json');

const katex = require(KATEX_PATH);

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeTex(tex) {
  let t = tex.trim();
  // 把公式内的 Unicode 罗马数字转为标准 LaTeX，避免 KaTeX 报缺少字体度量警告
  t = t
    .replace(/Ⅰ/g, '\\mathrm{I}')
    .replace(/Ⅱ/g, '\\mathrm{II}')
    .replace(/Ⅲ/g, '\\mathrm{III}')
    .replace(/Ⅳ/g, '\\mathrm{IV}')
    .replace(/Ⅴ/g, '\\mathrm{V}')
    .replace(/Ⅵ/g, '\\mathrm{VI}')
    .replace(/①/g, '(1)')
    .replace(/②/g, '(2)')
    .replace(/③/g, '(3)')
    .replace(/④/g, '(4)')
    .replace(/⑤/g, '(5)')
    .replace(/⑥/g, '(6)')
    .replace(/⑦/g, '(7)')
    .replace(/⑧/g, '(8)')
    .replace(/⑨/g, '(9)')
    .replace(/⑩/g, '(10)')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/，/g, ',')
    .replace(/；/g, ';')
    .replace(/：/g, ':');
  return t;
}

function renderTex(tex, displayMode, strict = true) {
  const clean = normalizeTex(tex);
  return katex.renderToString(clean, {
    displayMode,
    throwOnError: strict,
    strict: 'ignore',
    trust: false,
  });
}

/**
 * 将单条原生 LaTeX Markdown 转为语义化 HTML：
 * - 支持 $$...$$ 独立居中公式块（自动包裹 .mh-detail-eq）
 * - 支持 $...$ 行内公式
 * - 支持 **加粗** 与「【注】」/「解」/「证」/「解法一/二」标签高亮
 * - 自动按空行或独立公式块分段，保持阅读节奏清晰
 */
export function renderSolutionMarkdown(md, { strict = true } = {}) {
  const raw = (md || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return { html: '', errors: ['empty'] };

  const errors = [];
  const blocks = [];

  // 1. 提取所有 $$...$$ 块级公式为占位符
  const withDisplayTokens = raw.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    const idx = blocks.length;
    try {
      const rendered = renderTex(tex, true, strict);
      blocks.push(`<div class="mh-detail-eq">${rendered}</div>`);
    } catch (e) {
      errors.push(`display_katex: ${e.message.slice(0, 90)}`);
      blocks.push(`<div class="mh-detail-eq">${renderTex(tex, true, false)}</div>`);
    }
    return `\n\n@@DISP_${idx}@@\n\n`;
  });

  // 2. 按空行分段
  const rawParas = withDisplayTokens
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const htmlParts = [];

  for (const para of rawParas) {
    // 独立公式块直接输出
    const dispOnly = para.match(/^@@DISP_(\d+)@@$/);
    if (dispOnly) {
      htmlParts.push(blocks[Number(dispOnly[1])]);
      continue;
    }

    const renderInline = (segment) => {
      const inlineTokens = [];
      let text = segment.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
        const idx = inlineTokens.length;
        try {
          const rendered = renderTex(tex, false, strict);
          inlineTokens.push(`<span class="mh-detail-katex">${rendered}</span>`);
        } catch (e) {
          errors.push(`inline_katex: ${e.message.slice(0, 90)}`);
          inlineTokens.push(`<span class="mh-detail-katex">${renderTex(tex, false, false)}</span>`);
        }
        return `@@INL_${idx}@@`;
      });

      if (text.includes('$')) {
        errors.push('unclosed_dollar');
      }
      if (/\\(?:frac|int|lim|sum|prod|sqrt|left|right|begin|end|mathrm|alpha|beta|gamma|lambda|infty|cdot|times|le|ge|neq|to|rightarrow)\b/.test(text)) {
        errors.push('bare_latex_outside_math');
      }

      text = escapeHtml(text);
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/@@INL_(\d+)@@/g, (_, i) => inlineTokens[Number(i)]);
      text = text.replace(/@@DISP_(\d+)@@/g, (_, i) => blocks[Number(i)]);
      return text;
    };

    // 处理段内多行（支持 Markdown 管道表格）
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    if (
      lines.length >= 2 &&
      lines.every((l) => l.startsWith('|') && l.endsWith('|')) &&
      /^\|[\s:|-]+\|$/.test(lines[1])
    ) {
      const splitCells = (row) => row.slice(1, -1).split('|').map((c) => c.trim());
      const headers = splitCells(lines[0]);
      const bodyRows = lines.slice(2).map(splitCells);
      const thHtml = headers.map((c) => `<th>${renderInline(c)}</th>`).join('');
      const tbHtml = bodyRows
        .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`)
        .join('');
      htmlParts.push(`<div class="mh-detail-table-wrap"><table class="mh-detail-table"><thead><tr>${thHtml}</tr></thead><tbody>${tbHtml}</tbody></table></div>`);
      continue;
    }

    for (const line of lines) {
      const mDisp = line.match(/^@@DISP_(\d+)@@$/);
      if (mDisp) {
        htmlParts.push(blocks[Number(mDisp[1])]);
        continue;
      }

      let text = renderInline(line);

      // 检测是否为【注】提示块
      if (/^【注】/.test(line) || /^\*\*【注】\*\*/.test(line)) {
        const cleaned = text.replace(/^(?:<strong>)?【注】(?:<\/strong>)?\s*[：:]?\s*/, '');
        htmlParts.push(`<div class="mh-detail-note"><span class="mh-detail-note-tag">注</span>${cleaned}</div>`);
        continue;
      }

      // 识别开头的「解法一」「解法二」「方法一」「方法二」「解」「证」等小标签
      text = text.replace(
        /^(?:<strong>)?(解法\s*[一二三四\d]+|方法\s*[一二三四\d]+|解|证)(?:<\/strong>)?(?:\s*[：:.]?\s+)/,
        '<span class="mh-detail-lead">$1</span>'
      );

      htmlParts.push(`<p>${text}</p>`);
    }
  }

  return { html: htmlParts.join('\n'), errors };
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (!fs.existsSync(SOLUTIONS_PATH)) {
    if (args.has('--emit-json')) {
      process.stdout.write('{}');
      return;
    }
    console.error(`Not found: ${SOLUTIONS_PATH}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SOLUTIONS_PATH, 'utf8'));
  const entries = Object.entries(data);
  const compiled = {};
  const failed = [];
  let verifiedCount = 0;
  let cleanedCount = 0;

  for (const [key, val] of entries) {
    const md = typeof val === 'string' ? val : val?.md || '';
    const status = typeof val === 'string' ? 'unknown' : val?.status || 'unknown';
    if (status === 'verified') verifiedCount++;
    else if (status === 'cleaned') cleanedCount++;

    const { html, errors } = renderSolutionMarkdown(md, { strict: true });
    if (errors.length > 0) {
      failed.push({ key, status, errors });
    } else {
      compiled[key] = html;
    }
  }

  if (args.has('--emit-json')) {
    if (failed.length > 0) {
      console.error(`[render_native_solutions] WARNING: ${failed.length} entries failed strict KaTeX validation and were skipped.`);
    }
    process.stdout.write(JSON.stringify(compiled));
    return;
  }

  // Default / --audit
  console.log(JSON.stringify({
    totalEntries: entries.length,
    compiledOk: Object.keys(compiled).length,
    failedCount: failed.length,
    verifiedCount,
    cleanedCount,
    failedSamples: failed.slice(0, 20),
  }, null, 2));

  if (failed.length > 0) process.exit(2);
}

main();
