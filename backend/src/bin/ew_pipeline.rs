#![allow(dead_code)]

#[path = "../config.rs"]
mod config;
#[path = "../db.rs"]
mod db;
#[path = "../error.rs"]
mod error;
#[path = "../llm.rs"]
mod llm;

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use anyhow::{bail, Context, Result};
use regex::Regex;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sqlx::PgPool;

const STOPWORDS: &str = "a an the and or but if then else when while as of at by for with about against between into through during before after above below to from up down in out on off over under again further once here there all any both each few more most other some such no nor not only own same so than too very can will just don should now is are was were be been being have has had do does did get got this that these those i you he she it we they me him her us them my your his its our their mine yours hers ours theirs am shall would could should might must ought one two three four five six seven eight nine ten first second third";

#[derive(Debug, Deserialize)]
struct Word {
    index: u32,
    english: String,
    senses: Vec<Sense>,
}

#[derive(Debug, Deserialize)]
struct Sense {
    pos: String,
    cn: String,
}

#[derive(Default)]
struct Cli {
    command: String,
    url: Option<String>,
    key: Option<String>,
    model: Option<String>,
    args: Vec<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = parse_cli()?;
    match cli.command.as_str() {
        "match" => run_match(&cli.args),
        "validate" => run_validate(&cli.args),
        "models" => run_models(&cli).await,
        "translate" => run_translate(&cli).await,
        _ => bail!("unknown command: {}", cli.command),
    }
}

fn parse_cli() -> Result<Cli> {
    let mut values = std::env::args().skip(1);
    let command = values.next().unwrap_or_default();
    if !matches!(
        command.as_str(),
        "match" | "validate" | "models" | "translate"
    ) {
        bail!(
            "usage: ew-pipeline <match|validate|models|translate> [--url URL] [--key KEY] [--model MODEL] [files/text...]"
        );
    }

    let mut cli = Cli {
        command,
        ..Default::default()
    };
    while let Some(value) = values.next() {
        let target = match value.as_str() {
            "--url" => Some(&mut cli.url),
            "--key" => Some(&mut cli.key),
            "--model" => Some(&mut cli.model),
            _ => None,
        };
        if let Some(target) = target {
            *target = Some(values.next().context("missing value for LLM option")?);
        } else {
            cli.args.push(value);
        }
    }
    Ok(cli)
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("backend must be inside project root")
        .to_path_buf()
}

fn read_json(path: &Path) -> Result<Value> {
    let text = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&text).with_context(|| format!("parse {}", path.display()))
}

fn is_double_consonant(word: &str) -> bool {
    let bytes = word.as_bytes();
    bytes.len() >= 3
        && !b"aeiou".contains(&bytes[bytes.len() - 1])
        && b"aeiou".contains(&bytes[bytes.len() - 2])
        && !b"aeiou".contains(&bytes[bytes.len() - 3])
}

fn verb_inflections(base: &str) -> Vec<String> {
    let mut forms = BTreeSet::new();
    if let Some(stem) = base.strip_suffix('e') {
        forms.insert(format!("{base}d"));
        forms.insert(format!("{stem}ing"));
        forms.insert(format!("{base}s"));
    } else if base.ends_with('y')
        && base.len() > 1
        && !"aeiou".contains(base.as_bytes()[base.len() - 2] as char)
    {
        forms.insert(format!("{}ied", &base[..base.len() - 1]));
        forms.insert(format!("{}ies", &base[..base.len() - 1]));
        forms.insert(format!("{base}ing"));
    } else {
        forms.insert(format!("{base}ed"));
        forms.insert(format!("{base}s"));
        if is_double_consonant(base) {
            let last = base.as_bytes()[base.len() - 1] as char;
            forms.insert(format!("{base}{last}ing"));
            forms.insert(format!("{base}{last}ed"));
            forms.insert(format!("{base}{last}er"));
            forms.insert(format!("{base}{last}est"));
        } else {
            forms.insert(format!("{base}ing"));
        }
    }
    forms.into_iter().collect()
}

fn noun_plurals(base: &str) -> Vec<String> {
    let form = if base.ends_with('y')
        && base.len() > 1
        && !"aeiou".contains(base.as_bytes()[base.len() - 2] as char)
    {
        format!("{}ies", &base[..base.len() - 1])
    } else if ["s", "x", "z", "ch", "sh"]
        .iter()
        .any(|suffix| base.ends_with(suffix))
    {
        format!("{base}es")
    } else if let Some(stem) = base.strip_suffix('f') {
        format!("{stem}ves")
    } else if let Some(stem) = base.strip_suffix("fe") {
        format!("{stem}ves")
    } else {
        format!("{base}s")
    };
    vec![form]
}

fn adjective_degrees(base: &str) -> Vec<String> {
    let mut forms = BTreeSet::new();
    if base.ends_with('e') {
        forms.insert(format!("{base}r"));
        forms.insert(format!("{base}st"));
    } else if base.ends_with('y')
        && base.len() > 1
        && !"aeiou".contains(base.as_bytes()[base.len() - 2] as char)
    {
        forms.insert(format!("{}ier", &base[..base.len() - 1]));
        forms.insert(format!("{}iest", &base[..base.len() - 1]));
    } else {
        forms.insert(format!("{base}er"));
        forms.insert(format!("{base}est"));
    }
    forms.insert(format!("more {base}"));
    forms.insert(format!("most {base}"));
    forms.into_iter().collect()
}

fn add_lookup(lookup: &mut HashMap<String, BTreeSet<String>>, form: String, base: &str) {
    lookup.entry(form).or_default().insert(base.to_string());
}

fn irregular_forms() -> HashMap<String, Vec<String>> {
    include_str!("../irregular_forms.txt")
        .lines()
        .filter_map(|line| line.split_once('|'))
        .map(|(base, forms)| {
            (
                base.to_string(),
                forms.split(',').map(str::to_string).collect(),
            )
        })
        .collect()
}

fn build_lookup(words: &[Word]) -> HashMap<String, Vec<String>> {
    let irregular = irregular_forms();
    let mut lookup = HashMap::<String, BTreeSet<String>>::new();
    for word in words {
        let base = word.english.trim().to_lowercase();
        if base.is_empty() {
            continue;
        }
        add_lookup(&mut lookup, base.clone(), &base);
        for form in irregular.get(&base).into_iter().flatten() {
            add_lookup(&mut lookup, form.to_lowercase(), &base);
        }
        let poses: Vec<&str> = word.senses.iter().map(|sense| sense.pos.as_str()).collect();
        if poses.iter().any(|pos| pos.contains('v')) {
            for form in verb_inflections(&base) {
                add_lookup(&mut lookup, form, &base);
            }
        }
        if poses.iter().any(|pos| pos.starts_with('n')) {
            for form in noun_plurals(&base) {
                add_lookup(&mut lookup, form, &base);
            }
        }
        if poses.iter().any(|pos| pos.contains("adj")) {
            for form in adjective_degrees(&base) {
                add_lookup(&mut lookup, form, &base);
            }
        }
        if poses.iter().any(|pos| pos.contains("adv")) {
            add_lookup(&mut lookup, format!("more {base}"), &base);
            add_lookup(&mut lookup, format!("most {base}"), &base);
        }
    }
    lookup
        .into_iter()
        .map(|(form, bases)| (form, bases.into_iter().collect()))
        .collect()
}

fn clean_sentence_text(text: &str) -> String {
    let lead = Regex::new(r"^\s*[(\[]?\s*\d{1,3}\s*[)\].:、]\s*").unwrap();
    let header =
        Regex::new(r"\d{4}\s*年考研英语.*?(?:真题|试题)(?:.*?第\s*\d+\s*页(?:共\s*\d+\s*页)?)?")
            .unwrap();
    let gloss = Regex::new(r"[\(（]\s*[一-鿿]+(?:[·，,][一-鿿]+)*\s*[\)）]").unwrap();
    let points = Regex::new(r"(?i)[\(（]\s*\d+\s*points?\s*[\)）]").unwrap();
    let digits = Regex::new(r"[\(（]\s*\d{1,3}\s*[\)）]").unwrap();
    let spaces = Regex::new(r"\s{2,}").unwrap();
    let punctuation = Regex::new(r"\s+([,.;:!?])").unwrap();
    let text = lead.replace(text, "");
    let text = header.replace_all(&text, " ");
    let text = gloss.replace_all(&text, "");
    let text = points.replace_all(&text, "");
    let text = digits.replace_all(&text, " ");
    let text = spaces.replace_all(&text, " ");
    punctuation.replace_all(&text, "$1").trim().to_string()
}

fn tokenize(text: &str) -> Vec<(String, usize)> {
    let token = Regex::new(r"[A-Za-z][A-Za-z\-']*").unwrap();
    token
        .find_iter(text)
        .map(|item| (item.as_str().to_lowercase(), item.start()))
        .collect()
}

fn split_sentences(text: &str) -> Vec<String> {
    text.split_inclusive(['.', '!', '?'])
        .map(clean_sentence_text)
        .filter(|sentence| !sentence.is_empty())
        .collect()
}

fn locate_sentence(full: &str, offset: usize, sentences: &[String]) -> String {
    let mut position = 0;
    for sentence in sentences {
        if let Some(found) = full[position..].find(sentence) {
            let start = position + found;
            let end = start + sentence.len();
            if (start..end).contains(&offset) {
                return sentence.clone();
            }
            position = end;
        }
    }
    sentences.last().cloned().unwrap_or_default()
}

fn match_passage(
    text: &str,
    lookup: &HashMap<String, Vec<String>>,
    word_map: &HashMap<String, &Word>,
) -> Vec<Value> {
    let full = clean_sentence_text(text);
    let tokens = tokenize(&full);
    let sentences = split_sentences(&full);
    let stopwords: HashSet<&str> = STOPWORDS.split_whitespace().collect();
    let mut hits = HashMap::<String, (u32, Vec<String>)>::new();
    let mut index = 0;

    while index < tokens.len() {
        let (token, offset) = &tokens[index];
        let mut form = token.clone();
        if matches!(token.as_str(), "more" | "most") && index + 1 < tokens.len() {
            let combined = format!("{} {}", token, tokens[index + 1].0);
            if lookup.contains_key(&combined) {
                form = combined;
            }
        }
        if !(matches!(token.as_str(), "more" | "most") && form == *token) {
            if let Some(bases) = lookup.get(&form) {
                for base in bases
                    .iter()
                    .filter(|base| !stopwords.contains(base.as_str()))
                {
                    let sentence = locate_sentence(&full, *offset, &sentences);
                    let entry = hits.entry(base.clone()).or_insert_with(|| (0, Vec::new()));
                    entry.0 += 1;
                    if !sentence.is_empty() && !entry.1.contains(&sentence) {
                        entry.1.push(sentence);
                    }
                }
            }
        }
        index += if form != *token { 2 } else { 1 };
    }

    let mut result = hits.into_iter().filter_map(|(base, (count, sentences))| {
        word_map.get(&base).map(|word| json!({
            "idx": word.index,
            "english": word.english,
            "senses": word.senses.iter().map(|sense| vec![sense.pos.clone(), sense.cn.clone()]).collect::<Vec<_>>(),
            "count": count,
            "sentences": sentences.into_iter().take(5).collect::<Vec<_>>(),
        }))
    }).collect::<Vec<_>>();
    result.sort_by_key(|word| std::cmp::Reverse(word["count"].as_u64().unwrap_or_default()));
    result
}

fn answers_between(answers: &Map<String, Value>, start: i64, end: i64) -> Map<String, Value> {
    answers
        .iter()
        .filter_map(|(number, answer)| {
            number
                .parse::<i64>()
                .ok()
                .filter(|number| (*number >= start) && (*number <= end))
                .map(|_| (number.clone(), answer.clone()))
        })
        .collect()
}

fn compact_items(items: &[Value]) -> Vec<Value> {
    items
        .iter()
        .map(|item| {
            json!({
                "n": item["n"].clone(),
                "stem": item["stem"].as_str().unwrap_or_default(),
                "options": item["options"].clone(),
            })
        })
        .collect()
}

fn value_array<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

/// 把完形正文里的空白题号（独立数字 token）替换为答案对应选项词，便于例句可读。
/// 无答案或缺选项时保留原样。
/// 守卫：数字后紧跟空格+常见量词/单位（如 "19 million"）视为正文真实数字，不替换。
fn fill_cloze_blanks(passage: &str, items: &[Value], answers: &Map<String, Value>) -> String {
    if passage.is_empty() || answers.is_empty() || items.is_empty() {
        return passage.to_string();
    }
    let mut option_by_n: HashMap<i64, Map<String, Value>> = HashMap::new();
    for item in items {
        let n = item["n"].as_i64().unwrap_or(0);
        if let Some(opts) = item["options"].as_object() {
            option_by_n.insert(n, opts.clone());
        }
    }
    // 空白题号是独立 token：两侧为空白/标点/边界，避免把 12-15 里的 12 误替换。
    let re =
        Regex::new(r#"(?P<pre>^|[\s,;:(\[{'"])(?P<n>[1-9]|1[0-9]|20)(?P<post>$|[\s,.;:)\]}'"])"#)
            .unwrap();
    re.replace_all(passage, |caps: &regex::Captures| {
        let n: i64 = caps.name("n").unwrap().as_str().parse().unwrap_or(0);
        // "19 million" / "1,932" 这类正文真实数字：post 组已消费数字后的空格/标点，
        // 其后紧跟量词或数字时不替换（完形题号后不可能跟量词）。
        let after = &passage[caps.get(0).unwrap().end()..];
        let quantity = Regex::new(
            r"^(?:million|billion|thousand|hundred|dozen|percent|years?|months?|days?|hours?|points?|times?|per\b|cent\b)\b|^\d",
        )
        .unwrap();
        if quantity.is_match(after) {
            return caps.get(0).unwrap().as_str().to_string();
        }
        let letter = answers
            .get(&n.to_string())
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_uppercase())
            .unwrap_or_default();
        let word = option_by_n
            .get(&n)
            .and_then(|opts| opts.get(&letter).or_else(|| opts.get(&letter.to_lowercase())))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        match word {
            Some(w) => format!(
                "{}{}{}",
                caps.name("pre").map(|m| m.as_str()).unwrap_or(""),
                w,
                caps.name("post").map(|m| m.as_str()).unwrap_or("")
            ),
            None => caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default(),
        }
    })
    .into_owned()
}

fn match_paper(
    data: &Value,
    path: &Path,
    lookup: &HashMap<String, Vec<String>>,
    word_map: &HashMap<String, &Word>,
) -> Value {
    let answers = data
        .get("answers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let variant = data["variant"]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| {
            if path.to_string_lossy().replace('\\', "/").contains("/en2/") {
                "en2".into()
            } else {
                "en1".into()
            }
        });
    let mut sections = Vec::new();
    for section in value_array(data, "sections") {
        let mut passages = Vec::new();
        match section["type"].as_str().unwrap_or_default() {
            "use_of_english" => {
                let items = compact_items(value_array(section, "items"));
                let raw = section["passage"].as_str().unwrap_or_default();
                let cloze_answers = answers_between(&answers, 1, 20);
                let body = fill_cloze_blanks(raw, &items, &cloze_answers);
                passages.push(json!({"label":"完形填空", "body":body, "words":match_passage(&body, lookup, word_map), "itemCount":items.len(), "items":items, "answers":cloze_answers}));
            }
            "reading_a" => {
                for passage in value_array(section, "passages") {
                    let items = compact_items(value_array(passage, "items"));
                    let numbers = items
                        .iter()
                        .filter_map(|item| item["n"].as_i64())
                        .collect::<Vec<_>>();
                    let passage_answers = numbers
                        .iter()
                        .min()
                        .zip(numbers.iter().max())
                        .map(|(start, end)| answers_between(&answers, *start, *end))
                        .unwrap_or_default();
                    passages.push(json!({"label":passage["label"], "body":passage["body"], "words":match_passage(passage["body"].as_str().unwrap_or_default(), lookup, word_map), "itemCount":items.len(), "items":items, "answers":passage_answers}));
                }
            }
            "reading_b" => {
                let options = section["options"].as_object().cloned().unwrap_or_default();
                let source = section["passage"].as_str().unwrap_or_default();
                let body = if source.is_empty() && !options.is_empty() {
                    options
                        .iter()
                        .map(|(key, value)| {
                            format!("[{key}] {}", value.as_str().unwrap_or_default())
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    source.to_string()
                };
                let mut words = match_passage(&body, lookup, word_map);
                if !source.is_empty() && !options.is_empty() {
                    let extra = match_passage(
                        &options
                            .values()
                            .filter_map(Value::as_str)
                            .collect::<Vec<_>>()
                            .join("\n"),
                        lookup,
                        word_map,
                    );
                    let mut seen = words
                        .iter()
                        .filter_map(|word| word["idx"].as_u64())
                        .collect::<HashSet<_>>();
                    words.extend(extra.into_iter().filter(|word| {
                        word["idx"]
                            .as_u64()
                            .map(|idx| seen.insert(idx))
                            .unwrap_or(false)
                    }));
                }
                passages.push(json!({"label":"新题型（七选五）", "body":body, "words":words, "itemCount":value_array(section, "gaps").len(), "answers":answers_between(&answers, 41, 45)}));
            }
            "translation" => {
                let body = section["passage"].as_str().unwrap_or_default();
                passages.push(json!({"label":"翻译", "body":body, "words":match_passage(body, lookup, word_map), "itemCount":value_array(section, "segments").len()}));
            }
            "writing" => {
                for part in value_array(section, "parts") {
                    let number = part["n"].as_i64().unwrap_or_default();
                    let label = if matches!(number, 51 | 47) {
                        "A".into()
                    } else if matches!(number, 52 | 48) {
                        "B".into()
                    } else {
                        number.to_string()
                    };
                    let body = part["directions"].as_str().unwrap_or_default();
                    passages.push(json!({"label":format!("写作 Part {label}"), "body":body, "words":match_passage(body, lookup, word_map), "itemCount":0}));
                }
            }
            _ => {}
        }
        sections.push(json!({"type":section["type"], "title":section["title"].as_str().unwrap_or_default(), "passages":passages}));
    }
    json!({"year":data["year"], "source":data["source"], "variant":variant, "sections":sections})
}

fn run_match(paths: &[String]) -> Result<()> {
    let mut paper_paths = Vec::new();
    let mut output_path = None;
    let mut index = 0;
    while index < paths.len() {
        if paths[index] == "--out" {
            index += 1;
            output_path = Some(PathBuf::from(
                paths.get(index).context("missing path after --out")?,
            ));
        } else {
            paper_paths.push(paths[index].clone());
        }
        index += 1;
    }
    if paper_paths.is_empty() {
        bail!("usage: ew-pipeline match <paper1.json> [paper2.json ...] [--out papers.js]");
    }
    let root = project_root();
    let words: Vec<Word> = serde_json::from_value(read_json(&root.join("words.json"))?)?;
    let lookup = build_lookup(&words);
    let word_map = words
        .iter()
        .map(|word| (word.english.to_lowercase(), word))
        .collect::<HashMap<_, _>>();
    let mut papers = Vec::new();
    for path in paper_paths {
        let path = Path::new(&path);
        papers.push(match_paper(&read_json(path)?, path, &lookup, &word_map));
    }
    let payload = serde_json::to_string(&papers)?;
    let digest = openssl::sha::sha256(payload.as_bytes());
    let version = hex::encode(digest)[..16].to_string();
    let count = papers
        .iter()
        .flat_map(|paper| value_array(paper, "sections"))
        .flat_map(|section| value_array(section, "passages"))
        .map(|passage| value_array(passage, "words").len())
        .sum::<usize>();
    let output = format!("/* auto-generated by backend/src/bin/ew_pipeline.rs — 真题单词命中表 */\nwindow.PAPERS={payload};\nwindow.PAPERS_META={{version:'{version}',count:{count}}};\n");
    let destination = output_path.unwrap_or_else(|| root.join("web/papers.js"));
    fs::write(&destination, output)?;
    println!("wrote {}", destination.display());
    Ok(())
}

fn check_paper(data: &Value, variant: &str) -> Vec<String> {
    let expected_writing = if variant == "en2" {
        vec![47, 48]
    } else {
        vec![51, 52]
    };
    let expected_translation = if variant == "en2" { 1 } else { 5 };
    let sections = value_array(data, "sections")
        .iter()
        .filter_map(|section| section["type"].as_str().map(|kind| (kind, section)))
        .collect::<HashMap<_, _>>();
    let mut issues = Vec::new();
    let Some(uoe) = sections.get("use_of_english") else {
        issues.push("MISSING use_of_english".into());
        return issues;
    };
    let items = value_array(uoe, "items");
    if items.len() != 20 {
        issues.push(format!("uoe items={}(expect 20)", items.len()));
    }
    if items
        .iter()
        .any(|item| item["options"].as_object().map_or(0, Map::len) != 4)
    {
        issues.push("uoe not-4-opt".into());
    }
    if uoe["passage"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        issues.push("uoe EMPTY passage".into());
    }
    match sections.get("reading_a") {
        None => issues.push("MISSING reading_a".into()),
        Some(reading) => {
            let passages = value_array(reading, "passages");
            if passages.len() != 4 {
                issues.push(format!("ra texts={}(expect 4)", passages.len()));
            }
            for passage in passages {
                let items = value_array(passage, "items");
                if items.len() != 5 {
                    issues.push(format!(
                        "ra {} items={}(expect 5)",
                        passage["label"].as_str().unwrap_or_default(),
                        items.len()
                    ));
                }
                if items
                    .iter()
                    .any(|item| item["options"].as_object().map_or(0, Map::len) != 4)
                {
                    issues.push(format!(
                        "ra {} not-4-opt",
                        passage["label"].as_str().unwrap_or_default()
                    ));
                }
                if passage["body"]
                    .as_str()
                    .unwrap_or_default()
                    .trim()
                    .is_empty()
                {
                    issues.push(format!(
                        "ra {} EMPTY body",
                        passage["label"].as_str().unwrap_or_default()
                    ));
                }
            }
        }
    }
    match sections.get("reading_b") {
        None => issues.push("MISSING reading_b".into()),
        Some(reading) => {
            if value_array(reading, "gaps").len() != 5 {
                issues.push("rb gaps(expect 5)".into());
            }
            if reading["options"].as_object().is_none_or(Map::is_empty)
                && reading["passage"]
                    .as_str()
                    .unwrap_or_default()
                    .trim()
                    .is_empty()
            {
                issues.push("rb EMPTY options".into());
            }
        }
    }
    match sections.get("translation") {
        None => issues.push("MISSING translation".into()),
        Some(translation) => {
            if value_array(translation, "segments").len() != expected_translation {
                issues.push(format!("tr segments(expect {expected_translation})"));
            }
            if translation["passage"]
                .as_str()
                .unwrap_or_default()
                .trim()
                .is_empty()
            {
                issues.push("tr EMPTY passage".into());
            }
        }
    }
    match sections.get("writing") {
        None => issues.push("MISSING writing".into()),
        Some(writing) => {
            let numbers = value_array(writing, "parts")
                .iter()
                .filter_map(|part| part["n"].as_i64())
                .collect::<Vec<_>>();
            if numbers != expected_writing {
                issues.push(format!("wr parts={numbers:?}(expect {expected_writing:?})"));
            }
        }
    }
    issues
}

fn json_paths(args: &[String]) -> Result<Vec<PathBuf>> {
    if !args.is_empty() {
        return Ok(args.iter().map(PathBuf::from).collect());
    }
    let root = project_root().join("papers");
    let mut paths = fs::read_dir(&root)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect::<Vec<_>>();
    let en2 = root.join("en2");
    if en2.is_dir() {
        paths.extend(
            fs::read_dir(en2)?
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .filter(|path| path.extension().is_some_and(|ext| ext == "json")),
        );
    }
    paths.sort();
    Ok(paths)
}

fn run_validate(args: &[String]) -> Result<()> {
    let paths = json_paths(args)?;
    if paths.is_empty() {
        bail!("no parsed paper JSON files found");
    }
    let mut invalid = 0;
    for path in &paths {
        let variant = if path.to_string_lossy().replace('\\', "/").contains("/en2/") {
            "en2"
        } else {
            "en1"
        };
        let data = read_json(path)?;
        let issues = check_paper(&data, variant);
        if issues.is_empty() {
            println!("OK  {} [{variant}]", path.display());
        } else {
            invalid += 1;
            println!("BAD {} [{variant}]: {}", path.display(), issues.join("; "));
        }
    }
    println!("\n{invalid}/{} papers with issues", paths.len());
    if invalid > 0 {
        bail!("validation failed");
    }
    Ok(())
}

fn configured(cli: &Cli) -> config::Config {
    let mut conf = config::Config::from_env();
    if let Some(url) = &cli.url {
        conf.llm_url = url.trim().to_string();
    }
    if let Some(key) = &cli.key {
        conf.llm_key = key.trim().to_string();
    }
    if let Some(model) = &cli.model {
        conf.llm_model = model.trim().to_string();
    }
    conf
}

fn require_credentials(conf: &config::Config) -> Result<()> {
    if conf.llm_url.is_empty() || conf.llm_key.is_empty() {
        bail!("need --url and --key (or EW_LLM_* / ew_llm.json)");
    }
    Ok(())
}

async fn run_models(cli: &Cli) -> Result<()> {
    let conf = configured(cli);
    require_credentials(&conf)?;
    let response: Value = Client::new()
        .get(llm::join_url(&conf.llm_url, "/models"))
        .header("Authorization", format!("Bearer {}", conf.llm_key))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let mut models = value_array(&response, "data")
        .iter()
        .filter_map(|model| model["id"].as_str().or_else(|| model["name"].as_str()))
        .collect::<Vec<_>>();
    models.sort_unstable();
    models.dedup();
    if models.is_empty() {
        bail!("endpoint returned no models");
    }
    for model in &models {
        println!("{model}");
    }
    eprintln!("\n{} models", models.len());
    Ok(())
}

async fn run_translate(cli: &Cli) -> Result<()> {
    let conf = configured(cli);
    require_credentials(&conf)?;
    let text = cli.args.join(" ").trim().to_string();
    if text.is_empty() {
        bail!("provide the English text to translate");
    }
    let model = if cli.model.is_some() {
        conf.llm_model.clone()
    } else {
        match PgPool::connect(&conf.database_url).await {
            Ok(pool) => llm::active_model(&pool, &conf.llm_model).await,
            Err(_) => conf.llm_model.clone(),
        }
    };
    if model.is_empty() {
        bail!("need --model (or EW_LLM_MODEL / ew_llm.json)");
    }
    let started = Instant::now();
    let translated = llm::translate_text(&Client::new(), &conf, &model, &text).await?;
    println!("{translated}");
    eprintln!(
        "\n[ok] model={model}  {:.2}s",
        started.elapsed().as_secs_f64()
    );
    Ok(())
}

#[cfg(test)]
mod fill_cloze_tests {
    use super::*;
    use serde_json::{json, Value};

    fn items_for(entries: &[(&str, &[(&str, &str)])]) -> Vec<Value> {
        entries
            .iter()
            .map(|(n, opts)| {
                let mut options = serde_json::Map::new();
                for (k, v) in *opts {
                    options.insert(k.to_string(), Value::String(v.to_string()));
                }
                json!({"n": n.parse::<i64>().unwrap(), "options": options})
            })
            .collect()
    }

    #[test]
    fn keeps_quantity_numbers() {
        let items = items_for(&[("19", &[("A", "puts")])]);
        let answers = serde_json::Map::from_iter([("19".to_string(), Value::String("A".into()))]);
        let out = fill_cloze_blanks("reach nearly 19 million by the end", &items, &answers);
        assert!(out.contains("19 million"), "got: {out}");
    }

    #[test]
    fn fills_real_blanks() {
        let items = items_for(&[("1", &[("A", "Indeed")])]);
        let answers = serde_json::Map::from_iter([("1".to_string(), Value::String("A".into()))]);
        let out = fill_cloze_blanks("population. 1 , homelessness", &items, &answers);
        assert!(out.contains("Indeed"), "got: {out}");
    }
}
