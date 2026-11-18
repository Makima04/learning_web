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

fn is_vowel(byte: u8) -> bool {
    matches!(byte, b'a' | b'e' | b'i' | b'o' | b'u')
}

/// 词尾 CVC（辅-元-辅）：run/stop/big 这类需要双写的词。
fn ends_with_cvc(word: &str) -> bool {
    let bytes = word.as_bytes();
    bytes.len() >= 3
        && !is_vowel(bytes[bytes.len() - 1])
        && is_vowel(bytes[bytes.len() - 2])
        && !is_vowel(bytes[bytes.len() - 3])
}

/// 真正的词尾双写辅音：fall/miss。用于 -ing/-ed 还原时去掉一个辅音。
fn ends_with_double_consonant(word: &str) -> bool {
    let bytes = word.as_bytes();
    bytes.len() >= 2
        && !is_vowel(bytes[bytes.len() - 1])
        && bytes[bytes.len() - 1] == bytes[bytes.len() - 2]
}

fn verb_inflections(base: &str) -> Vec<String> {
    let mut forms = BTreeSet::new();
    // plain 形式永远先生成；双写只是额外候选，不能替代 plain。
    forms.insert(format!("{base}s"));
    forms.insert(format!("{base}ed"));
    forms.insert(format!("{base}ing"));

    if let Some(stem) = base.strip_suffix('e') {
        forms.insert(format!("{base}d"));
        forms.insert(format!("{stem}ing"));
    }
    if base.ends_with('y') && base.len() > 1 && !is_vowel(base.as_bytes()[base.len() - 2]) {
        let stem = &base[..base.len() - 1];
        forms.insert(format!("{stem}ied"));
        forms.insert(format!("{stem}ies"));
    }
    let last = base.as_bytes().last().copied().unwrap_or_default();
    if matches!(last, b's' | b'x' | b'z')
        || base.ends_with("ch")
        || base.ends_with("sh")
        || base.ends_with('o')
    {
        forms.insert(format!("{base}es"));
    }
    if ends_with_cvc(base) {
        let last = last as char;
        forms.insert(format!("{base}{last}ing"));
        forms.insert(format!("{base}{last}ed"));
    }
    // travel/travelled、model/modelling：英式双写 l 也收。
    if base.ends_with('l') {
        forms.insert(format!("{base}led"));
        forms.insert(format!("{base}ling"));
    }
    // panic/panicked/panicking。
    if base.ends_with('c') {
        forms.insert(format!("{base}ked"));
        forms.insert(format!("{base}king"));
    }
    // -e 结尾的特殊拼写：dye → dyeing（dying 属于 die）。
    if base == "dye" {
        forms.remove("dying");
        forms.insert("dyeing".into());
    }
    if base == "singe" {
        forms.remove("singing");
        forms.insert("singeing".into());
    }
    if base == "tinge" {
        forms.remove("tinging");
        forms.insert("tingeing".into());
    }
    forms.into_iter().collect()
}

fn noun_plurals(base: &str) -> Vec<String> {
    let mut forms = BTreeSet::new();
    forms.insert(format!("{base}s"));
    if base.ends_with('y') && base.len() > 1 && !is_vowel(base.as_bytes()[base.len() - 2]) {
        forms.insert(format!("{}ies", &base[..base.len() - 1]));
    }
    let last = base.as_bytes().last().copied().unwrap_or_default();
    if matches!(last, b's' | b'x' | b'z')
        || base.ends_with("ch")
        || base.ends_with("sh")
        || base.ends_with('o')
    {
        forms.insert(format!("{base}es"));
    }
    if let Some(stem) = base.strip_suffix("fe") {
        forms.insert(format!("{stem}ves"));
    } else if let Some(stem) = base.strip_suffix('f') {
        forms.insert(format!("{stem}ves"));
    }
    // 拉丁/希腊复数：analysis→analyses、medium→media、index→indices。
    if base.ends_with("is") {
        forms.insert(format!("{}es", &base[..base.len() - 2]));
    } else if base.ends_with("us") {
        forms.insert(format!("{}i", &base[..base.len() - 2]));
    } else if base.ends_with("on") || base.ends_with("um") {
        forms.insert(format!("{}a", &base[..base.len() - 2]));
    } else if base.ends_with("ex") || base.ends_with("ix") {
        forms.insert(format!("{}ices", &base[..base.len() - 2]));
    }
    forms.into_iter().collect()
}

fn adjective_degrees(base: &str) -> Vec<String> {
    let mut forms = BTreeSet::new();
    forms.insert(format!("{base}er"));
    forms.insert(format!("{base}est"));
    if base.ends_with('e') {
        forms.insert(format!("{base}r"));
        forms.insert(format!("{base}st"));
    } else if base.ends_with('y') && base.len() > 1 && !is_vowel(base.as_bytes()[base.len() - 2]) {
        forms.insert(format!("{}ier", &base[..base.len() - 1]));
        forms.insert(format!("{}iest", &base[..base.len() - 1]));
    }
    if ends_with_cvc(base) {
        let last = base.as_bytes().last().copied().unwrap_or_default() as char;
        forms.insert(format!("{base}{last}er"));
        forms.insert(format!("{base}{last}est"));
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

/// 英美拼写 / 连字符等成对写法。token 侧按前缀替换，命中词库的候选生效。
const SPELLING_PAIRS: &[(&str, &str)] = &[
    ("behavior", "behaviour"),
    ("labor", "labour"),
    ("favor", "favour"),
    ("color", "colour"),
    ("honor", "honour"),
    ("humor", "humour"),
    ("neighbor", "neighbour"),
    ("rumor", "rumour"),
    ("vapor", "vapour"),
    ("flavor", "flavour"),
    ("center", "centre"),
    ("theater", "theatre"),
    ("defense", "defence"),
    ("offense", "offence"),
    ("license", "licence"),
    ("program", "programme"),
    ("catalog", "catalogue"),
    ("dialog", "dialogue"),
    ("analog", "analogue"),
    ("traveler", "traveller"),
    ("traveling", "travelling"),
    ("traveled", "travelled"),
    ("modeling", "modelling"),
    ("modeled", "modelled"),
    ("canceled", "cancelled"),
    ("canceling", "cancelling"),
    ("labeled", "labelled"),
    ("labeling", "labelling"),
    ("signaled", "signalled"),
    ("signaling", "signalling"),
    ("fulfill", "fulfil"),
    ("enroll", "enrol"),
    ("skillful", "skilful"),
    ("willful", "wilful"),
    ("aging", "ageing"),
    ("judgment", "judgement"),
    ("acknowledgment", "acknowledgement"),
    ("email", "e-mail"),
    ("online", "on-line"),
    ("wellbeing", "well-being"),
    ("toward", "towards"),
    ("afterward", "afterwards"),
    ("upward", "upwards"),
    ("downward", "downwards"),
    ("forward", "forwards"),
    ("backward", "backwards"),
    ("homeward", "homewards"),
    ("outward", "outwards"),
    ("inward", "inwards"),
    ("westward", "westwards"),
    ("eastward", "eastwards"),
    ("northward", "northwards"),
    ("southward", "southwards"),
    ("among", "amongst"),
    ("amid", "amidst"),
    ("while", "whilst"),
    ("anemia", "anaemia"),
    ("estrogen", "oestrogen"),
    ("pediatric", "paediatric"),
    ("encyclopedia", "encyclopaedia"),
    ("medieval", "mediaeval"),
];

/// 词尾拼写替换；只有替换后的候选在 lookup 里才生效。
const SPELLING_SUFFIXES: &[(&str, &str)] = &[
    ("isation", "ization"),
    ("ization", "isation"),
    ("ising", "izing"),
    ("izing", "ising"),
    ("ised", "ized"),
    ("ized", "ised"),
    ("ises", "izes"),
    ("izes", "ises"),
    ("ise", "ize"),
    ("ize", "ise"),
    ("ysing", "yzing"),
    ("yzing", "ysing"),
    ("ysed", "yzed"),
    ("yzed", "ysed"),
    ("yse", "yze"),
    ("yze", "yse"),
    ("ously", "ous"),
    ("iously", "ious"),
    ("fully", "ful"),
    ("lessly", "less"),
    ("ially", "ial"),
    ("cial", "ce"),
    ("tial", "ce"),
    ("ogue", "og"),
    ("og", "ogue"),
    ("ence", "ense"),
    ("ense", "ence"),
    ("our", "or"),
    ("or", "our"),
    ("re", "er"),
    ("er", "re"),
    ("ll", "l"),
    ("l", "ll"),
    ("ae", "e"),
    ("oe", "e"),
];

/// 派生后缀：剥掉后补回的词尾候选。长后缀在前。
const DERIV_SUFFIXES: &[(&str, &[&str])] = &[
    ("istically", &["istic", "ism"]),
    ("istically", &["ic"]),
    ("istical", &["istics"]),
    ("ically", &["ic", "y"]),
    ("ional", &["ion", "ion"]),
    ("ational", &["ate", ""]),
    ("ability", &["able"]),
    ("ibility", &["ible"]),
    ("ivity", &["ive"]),
    ("iatrist", &["iatry"]),
    ("lysis", &["lyse", "lyze"]),
    ("izing", &["ize", "eous"]),
    ("ising", &["ise", "eous"]),
    ("ulsive", &["el"]),
    ("atist", &["a"]),
    ("thy", &["th"]),
    ("uly", &["ue"]),
    ("ry", &["", "e"]),
    ("ization", &["ize", "eous"]),
    ("isation", &["ise", "eous"]),
    ("ification", &["ify"]),
    ("ation", &["", "e", "ate"]),
    ("ition", &["", "e", "ite"]),
    ("ution", &["", "e", "ute"]),
    ("ceptive", &["ceive"]),
    ("ception", &["ceive"]),
    ("vention", &["vene"]),
    ("ential", &["ence", "ent"]),
    ("ative", &["ate", "e"]),
    ("itive", &["ition"]),
    ("sive", &["de"]),
    ("atic", &["acy"]),
    ("ction", &["ct"]),
    ("ssion", &["ss"]),
    ("sion", &["d", "de", "se"]),
    ("iness", &["y"]),
    ("ency", &["ent"]),
    ("ancy", &["ant"]),
    ("ent", &["", "e"]),
    ("ant", &["", "e"]),
    ("ment", &["", "e"]),
    ("ness", &["", "e"]),
    ("ity", &["", "e", "y", "ous", "al"]),
    ("ance", &["", "e", "ant", "y"]),
    ("ence", &["", "e", "ent"]),
    ("able", &["", "e", "y"]),
    ("ible", &["", "e", "y"]),
    ("ial", &["", "e"]),
    ("ally", &[""]),
    ("ily", &["y"]),
    ("ably", &["able"]),
    ("ibly", &["ible"]),
    ("ly", &["", "e", "le", "y"]),
    ("ory", &["", "e", "ate"]),
    ("ary", &["", "e"]),
    ("ate", &["", "e"]),
    ("ive", &["", "e"]),
    ("ous", &["", "e"]),
    ("ual", &["", "e"]),
    ("ful", &[""]),
    ("less", &[""]),
    ("ical", &["ic", "y"]),
    ("al", &["", "e"]),
    ("ic", &["", "e"]),
    ("ish", &[""]),
    ("ize", &["", "e", "y"]),
    ("ise", &["", "e", "y"]),
    ("ify", &["", "e"]),
    ("en", &["", "e"]),
    ("er", &["", "e", "y"]),
    ("itor", &["e", "it"]),
    ("ator", &["ate", "at"]),
    ("utor", &["ute", "ut"]),
    ("or", &["", "e"]),
    ("ery", &["", "e"]),
    ("ist", &["y", "ive", ""]),
    ("icism", &["ical"]),
    ("ism", &["istic", "ist", "ical", ""]),
    ("age", &["", "e", "ager"]),
    ("ship", &[""]),
    ("hood", &[""]),
    ("ion", &["", "e", "t"]),
    ("acy", &["ate", ""]),
    ("y", &["", "e"]),
];

/// 常见前缀：只在 token 精确/屈折/派生都失败后尝试。
const PREFIXES: &[&str] = &[
    "counter", "inter", "trans", "under", "super", "multi", "semi", "anti", "over", "fore", "with",
    "micro", "macro", "hyper", "ultra", "auto", "extra", "intra", "meta", "para", "peri", "poly",
    "mono", "non", "mis", "pre", "post", "pro", "sub", "bio", "co", "de", "dis", "en", "em", "in",
    "im", "re", "un", "up", "down", "out", "well", "self", "bi", "tri", "uni", "ir", "il",
];

fn spelling_candidates(form: &str) -> Vec<String> {
    let mut out = BTreeSet::new();
    for &(a, b) in SPELLING_PAIRS {
        for (from, to) in [(a, b), (b, a)] {
            if form.starts_with(from) {
                out.insert(format!("{to}{}", &form[from.len()..]));
            }
        }
    }
    for &(from, to) in SPELLING_SUFFIXES {
        if form.ends_with(from) && form.len() > from.len() {
            out.insert(format!("{}{to}", &form[..form.len() - from.len()]));
        }
    }
    out.remove(form);
    out.into_iter().collect()
}

#[derive(Clone)]
struct LemmaCandidate {
    base: String,
    priority: u8,
    common: usize,
}

fn common_prefix_len(a: &str, b: &str) -> usize {
    a.bytes().zip(b.bytes()).take_while(|(x, y)| x == y).count()
}

fn push_lemma_candidate(
    out: &mut HashMap<String, LemmaCandidate>,
    root: &str,
    base: &str,
    priority: u8,
    word_map: &HashMap<String, &Word>,
) {
    if base.len() < 3 || !word_map.contains_key(base) {
        return;
    }
    let common = common_prefix_len(root, base);
    let entry = out.entry(base.to_string()).or_insert(LemmaCandidate {
        base: base.to_string(),
        priority,
        common,
    });
    if priority > entry.priority || (priority == entry.priority && common > entry.common) {
        entry.priority = priority;
        entry.common = common;
    }
}

fn collect_lemma_stems(
    root: &str,
    form: &str,
    priority: u8,
    depth: usize,
    visited: &mut HashSet<String>,
    out: &mut HashMap<String, LemmaCandidate>,
    lookup: &HashMap<String, Vec<String>>,
    word_map: &HashMap<String, &Word>,
) {
    if depth > 4 || form.len() < 3 || !visited.insert(format!("{form}|{priority}")) {
        return;
    }
    let mut stems: Vec<(String, u8)> = Vec::new();

    // 屈折：复数 / 三单 / -ing / -ed / 比较级。
    if let Some(s) = form.strip_suffix("ies") {
        stems.push((format!("{s}y"), 3));
    }
    if let Some(s) = form.strip_suffix("es") {
        stems.push((s.to_string(), 3));
    }
    if let Some(s) = form.strip_suffix('s') {
        if !form.ends_with("ss") {
            stems.push((s.to_string(), 3));
        }
    }
    if let Some(b) = form.strip_suffix("ing") {
        if form.len() > 4 {
            stems.push((b.to_string(), 3));
            stems.push((format!("{b}e"), 3));
            if b.len() > 2 && ends_with_double_consonant(b) {
                stems.push((b[..b.len() - 1].to_string(), 3));
            }
        }
    }
    if let Some(s) = form.strip_suffix("ied") {
        stems.push((format!("{s}y"), 3));
    } else if let Some(b) = form.strip_suffix("ed") {
        if form.len() > 3 {
            stems.push((b.to_string(), 3));
            stems.push((format!("{b}e"), 3));
            if b.len() > 2 && ends_with_double_consonant(b) {
                stems.push((b[..b.len() - 1].to_string(), 3));
            }
        }
    }
    if let Some(s) = form.strip_suffix("est") {
        if form.len() > 4 {
            stems.push((s.to_string(), 2));
            stems.push((format!("{s}e"), 2));
            if s.len() > 2 && ends_with_double_consonant(s) {
                stems.push((s[..s.len() - 1].to_string(), 2));
            }
        }
    }
    if let Some(s) = form.strip_suffix("er") {
        if form.len() > 3 {
            stems.push((s.to_string(), 2));
            stems.push((format!("{s}e"), 2));
            // winner → winn → win；runner → runn → run。
            if s.len() > 2 && ends_with_double_consonant(s) {
                stems.push((s[..s.len() - 1].to_string(), 2));
            }
        }
    }

    // 派生后缀。
    for &(suffix, reps) in DERIV_SUFFIXES {
        if let Some(stem) = form.strip_suffix(suffix) {
            // 至少给词干留 2 个字符：deceptive → de + ceive = deceive。
            if form.len() > suffix.len() + 1 {
                for rep in reps {
                    stems.push((format!("{stem}{rep}"), 2));
                }
                // happiness -> happi -> happy 这类 i/y 互换。
                if let Some(last) = stem.chars().last() {
                    if last == 'i' {
                        stems.push((format!("{}y", &stem[..stem.len() - 1]), 2));
                    }
                }
            }
        }
    }

    // 常见前缀。
    for &prefix in PREFIXES {
        if let Some(stem) = form.strip_prefix(prefix) {
            if stem.len() >= 3 {
                stems.push((stem.to_string(), 1));
            }
        }
    }

    for (stem, prio) in stems {
        if stem.len() < 3 || stem == form {
            continue;
        }
        if word_map.contains_key(&stem) {
            push_lemma_candidate(out, root, &stem, prio, word_map);
        } else if let Some(bases) = lookup_bases(lookup, &stem) {
            // 已知屈折/不规则形：unknown → known → know、rewrote → wrote → write。
            for base in bases {
                push_lemma_candidate(out, root, base, prio, word_map);
            }
        } else if stem.len() >= 4 {
            collect_lemma_stems(root, &stem, prio, depth + 1, visited, out, lookup, word_map);
        }
    }
}

fn best_lemma(
    form: &str,
    lookup: &HashMap<String, Vec<String>>,
    word_map: &HashMap<String, &Word>,
    stopwords: &HashSet<&str>,
) -> Option<String> {
    // 已知屈折/不规则形（craftsmen、dying、known）直接取 lookup 的基词。
    if let Some(bases) = lookup_bases(lookup, form) {
        if let Some(base) = bases
            .iter()
            .filter(|base| !stopwords.contains(base.as_str()))
            .max_by_key(|base| base.len())
        {
            return Some(base.clone());
        }
    }
    let mut out = HashMap::new();
    let mut visited = HashSet::new();
    collect_lemma_stems(form, form, 0, 0, &mut visited, &mut out, lookup, word_map);
    out.into_values()
        .filter(|candidate| !stopwords.contains(candidate.base.as_str()))
        .max_by(|a, b| {
            (a.priority, a.common, a.base.len()).cmp(&(b.priority, b.common, b.base.len()))
        })
        .map(|candidate| candidate.base)
}

/// exact 命中优先：若 lookup 里同时有原形词条，只返回它，避免 found→find+found 这类重复。
fn lookup_bases<'a>(lookup: &'a HashMap<String, Vec<String>>, form: &str) -> Option<&'a [String]> {
    let bases = lookup.get(form)?;
    if let Some(exact) = bases.iter().find(|base| base.as_str() == form) {
        Some(std::slice::from_ref(exact))
    } else {
        Some(bases.as_slice())
    }
}

fn resolve_form(
    form: &str,
    lookup: &HashMap<String, Vec<String>>,
    word_map: &HashMap<String, &Word>,
    stopwords: &HashSet<&str>,
) -> Vec<String> {
    if let Some(bases) = lookup_bases(lookup, form) {
        let hit: Vec<String> = bases
            .iter()
            .filter(|base| !stopwords.contains(base.as_str()))
            .cloned()
            .collect();
        if !hit.is_empty() {
            return hit;
        }
    }
    for candidate in spelling_candidates(form) {
        if let Some(bases) = lookup_bases(lookup, &candidate) {
            let hit: Vec<String> = bases
                .iter()
                .filter(|base| !stopwords.contains(base.as_str()))
                .cloned()
                .collect();
            if !hit.is_empty() {
                return hit;
            }
        }
    }
    best_lemma(form, lookup, word_map, stopwords)
        .into_iter()
        .collect()
}

/// 连字符 / 拼接复合词：healthcare→health+care、short-term→short+term。
fn compound_bases(
    form: &str,
    lookup: &HashMap<String, Vec<String>>,
    word_map: &HashMap<String, &Word>,
    stopwords: &HashSet<&str>,
) -> Vec<String> {
    let mut out = Vec::new();
    if form.contains('-') {
        for part in form.split('-') {
            if part.len() < 2 || stopwords.contains(part) {
                continue;
            }
            out.extend(resolve_form(part, lookup, word_map, stopwords));
        }
        out.sort();
        out.dedup();
        return out;
    }
    if form.len() < 6 {
        return out;
    }
    let mut best: Option<(usize, Vec<String>)> = None;
    for i in 3..form.len().saturating_sub(2) {
        let left = &form[..i];
        let right = &form[i..];
        if stopwords.contains(left) || stopwords.contains(right) {
            continue;
        }
        let lb = resolve_form(left, lookup, word_map, stopwords);
        let rb = resolve_form(right, lookup, word_map, stopwords);
        if lb.is_empty() || rb.is_empty() {
            continue;
        }
        let mut parts = lb;
        parts.extend(rb);
        parts.sort();
        parts.dedup();
        // 优先「较短部分最长」的切分，避免 health|care 被 he|althcare 之类抢走。
        let score = left.len().min(right.len()) * 100 + left.len().max(right.len());
        if best
            .as_ref()
            .map_or(true, |(best_score, _)| score > *best_score)
        {
            best = Some((score, parts));
        }
    }
    best.map(|(_, parts)| parts).unwrap_or_default()
}

fn build_lookup(words: &[Word]) -> HashMap<String, Vec<String>> {
    let irregular = irregular_forms();
    let mut lookup = HashMap::<String, BTreeSet<String>>::new();
    let mut bases = HashSet::<String>::new();
    for word in words {
        let base = word.english.trim().to_lowercase();
        if base.is_empty() {
            continue;
        }
        bases.insert(base.clone());
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
    // 多词 / 连字符词条的另一种写法也进 lookup，供 match_passage 的 n-gram 使用。
    for base in &bases {
        if base.contains(' ') || base.contains('-') {
            for variant in [
                base.replace([' ', '-'], ""),
                base.replace('-', " "),
                base.replace(' ', "-"),
            ] {
                if variant != *base {
                    add_lookup(&mut lookup, variant, base);
                }
            }
        }
    }
    lookup
        .into_iter()
        .map(|(form, bases)| (form, bases.into_iter().collect()))
        .collect()
}

fn clean_sentence_text(text: &str) -> String {
    // 真题 PDF 里大量弯引号；先归一成直引号，否则 don't 会被拆成 don + t。
    let apostrophes = Regex::new(r"[‘’´]").unwrap();
    let text = apostrophes.replace_all(text, "'").into_owned();
    let lead = Regex::new(r"^\s*[(\[]?\s*\d{1,3}\s*[)\].:、]\s*").unwrap();
    let header =
        Regex::new(r"\d{4}\s*年考研英语.*?(?:真题|试题)(?:.*?第\s*\d+\s*页(?:共\s*\d+\s*页)?)?")
            .unwrap();
    let gloss = Regex::new(r"[\(（]\s*[一-鿿]+(?:[·，,][一-鿿]+)*\s*[\)）]").unwrap();
    let points = Regex::new(r"(?i)[\(（]\s*\d+\s*points?\s*[\)）]").unwrap();
    let digits = Regex::new(r"[\(（]\s*\d{1,3}\s*[\)）]").unwrap();
    let spaces = Regex::new(r"\s{2,}").unwrap();
    let punctuation = Regex::new(r"\s+([,.;:!?])").unwrap();
    let text = lead.replace(&text, "");
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

fn is_sentence_start(text: &str, offset: usize) -> bool {
    match text[..offset].chars().rev().find(|c| !c.is_whitespace()) {
        None => true,
        Some(c) => matches!(
            c,
            '.' | '!' | '?' | ':' | ';' | '"' | '\'' | '(' | '[' | '{' | '\n'
        ),
    }
}

fn match_passage(
    text: &str,
    lookup: &HashMap<String, Vec<String>>,
    word_map: &HashMap<String, &Word>,
    case_seen: &HashSet<String>,
) -> Vec<Value> {
    let full = clean_sentence_text(text);
    let tokens = tokenize(&full);
    let sentences = split_sentences(&full);
    let stopwords: HashSet<&str> = STOPWORDS.split_whitespace().collect();
    let mut hits = HashMap::<String, (u32, Vec<String>)>::new();
    let mut index = 0;

    while index < tokens.len() {
        let (token, offset) = &tokens[index];

        // 序数碎片（19th 的 th）与选项字母（A)/B)）不是单词。
        if (matches!(token.as_str(), "th" | "st" | "nd" | "rd")
            && *offset > 0
            && full.as_bytes()[offset - 1].is_ascii_digit())
            || token.len() == 1
        {
            index += 1;
            continue;
        }

        let mut consumed = 1;
        let mut bases: Vec<String> = Vec::new();

        // 多词词条：according to / living room / ice cream / think tank。
        for n in (2..=3).rev() {
            if index + n > tokens.len() {
                continue;
            }
            let phrase = tokens[index..index + n]
                .iter()
                .map(|(form, _)| form.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            if let Some(found) = lookup_bases(lookup, &phrase) {
                let hit: Vec<String> = found
                    .iter()
                    .filter(|base| !stopwords.contains(base.as_str()))
                    .cloned()
                    .collect();
                if !hit.is_empty() {
                    bases = hit;
                    consumed = n;
                    break;
                }
            }
        }

        // 大写词：大概率是专名（James/Jobs/Windows），不走词形还原。
        // 放行条件：全库小写出现过 / 词库条目本身大写（Internet/March）/
        // 句首且小写形就是词库原形（However）。多词条 According to 已在上面的
        // n-gram 分支命中，不会走到这里。
        let capitalized = full
            .as_bytes()
            .get(*offset)
            .is_some_and(u8::is_ascii_uppercase);
        let lowercase_is_head = word_map.contains_key(token.as_str());
        let capitalized_head = word_map
            .get(token.as_str())
            .is_some_and(|word| word.english.chars().next().is_some_and(char::is_uppercase));
        if bases.is_empty()
            && capitalized
            && !case_seen.contains(token)
            && !capitalized_head
            && !(is_sentence_start(&full, *offset) && lowercase_is_head)
        {
            index += 1;
            continue;
        }

        // 功能词本身不参与还原；否则 been→bee、having→have 这类残干会误配。
        if bases.is_empty() && stopwords.contains(token.as_str()) {
            index += 1;
            continue;
        }

        if bases.is_empty() {
            // 所有格：world's → world；companies' → companies。
            let mut candidates = vec![token.clone()];
            if let Some(stem) = token.strip_suffix("'s") {
                candidates.push(stem.to_string());
            } else if let Some(stem) = token.strip_suffix('\'') {
                candidates.push(stem.to_string());
            }
            for candidate in candidates {
                bases = resolve_form(&candidate, lookup, word_map, &stopwords);
                if !bases.is_empty() {
                    break;
                }
            }
        }

        if bases.is_empty() {
            bases = compound_bases(token, lookup, word_map, &stopwords);
        }

        if !bases.is_empty() {
            let sentence = locate_sentence(&full, *offset, &sentences);
            for base in bases {
                let entry = hits.entry(base).or_insert_with(|| (0, Vec::new()));
                entry.0 += 1;
                if !sentence.is_empty() && !entry.1.contains(&sentence) {
                    entry.1.push(sentence.clone());
                }
            }
        }
        index += consumed;
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

fn with_terminal(text: &str) -> String {
    let text = text.trim();
    if text.is_empty() || text.ends_with(['.', '!', '?']) {
        text.to_string()
    } else {
        format!("{text}.")
    }
}

/// 把选择题题干和选项拼成可分句文本。
/// 完形没有题干，同一题的选项合成一句，例句里能看到这组干扰项。
fn items_corpus(items: &[Value]) -> String {
    let mut parts = Vec::new();
    for item in items {
        let stem = item["stem"].as_str().unwrap_or_default().trim();
        let Some(opts) = item["options"].as_object() else {
            if !stem.is_empty() {
                parts.push(with_terminal(stem));
            }
            continue;
        };
        let mut keys: Vec<&String> = opts.keys().collect();
        keys.sort();
        if stem.is_empty() {
            // 不用 "A."：句号会把选项切碎，例句变成 "displayed B."。
            let line = keys
                .iter()
                .filter_map(|key| {
                    let val = opts[*key].as_str().unwrap_or_default().trim();
                    if val.is_empty() {
                        None
                    } else {
                        Some(format!("{key}) {val}"))
                    }
                })
                .collect::<Vec<_>>()
                .join("; ");
            if !line.is_empty() {
                parts.push(with_terminal(&line));
            }
        } else {
            parts.push(with_terminal(stem));
            for key in keys {
                let val = opts[key].as_str().unwrap_or_default().trim();
                if val.is_empty() {
                    continue;
                }
                parts.push(with_terminal(&format!("{key}) {val}")));
            }
        }
    }
    parts.join(" ")
}

/// 已在正文里的词保留原例句；只出现在题目或选项里的词追加到后面。
fn merge_new_words(words: &mut Vec<Value>, extra: Vec<Value>) {
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

/// 记词词表 = 正文命中，再加上题干和选项里正文没有的词。
fn words_with_items(
    body: &str,
    items: &[Value],
    lookup: &HashMap<String, Vec<String>>,
    word_map: &HashMap<String, &Word>,
    case_seen: &HashSet<String>,
) -> Vec<Value> {
    let mut words = match_passage(body, lookup, word_map, case_seen);
    let extra_text = items_corpus(items);
    if !extra_text.is_empty() {
        merge_new_words(
            &mut words,
            match_passage(&extra_text, lookup, word_map, case_seen),
        );
    }
    words
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
    case_seen: &HashSet<String>,
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
                passages.push(json!({"label":"完形填空", "body":body, "words":words_with_items(&body, &items, lookup, word_map, case_seen), "itemCount":items.len(), "items":items, "answers":cloze_answers}));
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
                    passages.push(json!({"label":passage["label"], "body":passage["body"], "words":words_with_items(passage["body"].as_str().unwrap_or_default(), &items, lookup, word_map, case_seen), "itemCount":items.len(), "items":items, "answers":passage_answers}));
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
                let mut words = match_passage(&body, lookup, word_map, case_seen);
                if !source.is_empty() && !options.is_empty() {
                    let extra = match_passage(
                        &options
                            .values()
                            .filter_map(Value::as_str)
                            .collect::<Vec<_>>()
                            .join("\n"),
                        lookup,
                        word_map,
                        case_seen,
                    );
                    merge_new_words(&mut words, extra);
                }
                passages.push(json!({"label":"新题型（七选五）", "body":body, "words":words, "itemCount":value_array(section, "gaps").len(), "answers":answers_between(&answers, 41, 45)}));
            }
            "translation" => {
                let body = section["passage"].as_str().unwrap_or_default();
                passages.push(json!({"label":"翻译", "body":body, "words":match_passage(body, lookup, word_map, case_seen), "itemCount":value_array(section, "segments").len()}));
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
                    passages.push(json!({"label":format!("写作 Part {label}"), "body":body, "words":match_passage(body, lookup, word_map, case_seen), "itemCount":0}));
                }
            }
            _ => {}
        }
        sections.push(json!({"type":section["type"], "title":section["title"].as_str().unwrap_or_default(), "passages":passages}));
    }
    json!({"year":data["year"], "source":data["source"], "variant":variant, "sections":sections})
}

/// 收集一套真题里会参与匹配的文本，用于判断某个词形是否在语料里以小写出现过。
fn collect_paper_text(data: &Value, out: &mut String) {
    for section in value_array(data, "sections") {
        for key in ["passage", "directions"] {
            if let Some(text) = section[key].as_str() {
                out.push_str(text);
                out.push('\n');
            }
        }
        if let Some(items) = section["items"].as_array() {
            out.push_str(&items_corpus(items));
            out.push('\n');
        }
        for passage in value_array(section, "passages") {
            if let Some(body) = passage["body"].as_str() {
                out.push_str(body);
                out.push('\n');
            }
            if let Some(items) = passage["items"].as_array() {
                out.push_str(&items_corpus(items));
                out.push('\n');
            }
        }
        if let Some(options) = section["options"].as_object() {
            for value in options.values() {
                if let Some(text) = value.as_str() {
                    out.push_str(text);
                    out.push('\n');
                }
            }
        }
        for part in value_array(section, "parts") {
            if let Some(text) = part["directions"].as_str() {
                out.push_str(text);
                out.push('\n');
            }
        }
    }
}

fn paper_corpus_lowercase(docs: &[(PathBuf, Value)]) -> HashSet<String> {
    let mut text = String::new();
    for (_, data) in docs {
        collect_paper_text(data, &mut text);
    }
    let clean = clean_sentence_text(&text);
    tokenize(&clean)
        .into_iter()
        .filter(|(_, offset)| {
            clean
                .as_bytes()
                .get(*offset)
                .is_some_and(u8::is_ascii_lowercase)
        })
        .map(|(form, _)| form)
        .collect()
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
    let mut docs = Vec::new();
    for path in paper_paths {
        let path = PathBuf::from(path);
        let data = read_json(&path)?;
        docs.push((path, data));
    }
    let case_seen = paper_corpus_lowercase(&docs);
    let mut papers = Vec::new();
    for (path, data) in &docs {
        papers.push(match_paper(data, path, &lookup, &word_map, &case_seen));
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

    #[test]
    fn cloze_options_share_one_sentence() {
        let items = vec![json!({
            "n": 1,
            "stem": "",
            "options": {"B": "occupied", "A": "displayed", "D": "equipped", "C": "located"}
        })];
        let text = items_corpus(&items);
        assert_eq!(text, "A) displayed; B) occupied; C) located; D) equipped.");
    }

    #[test]
    fn reading_stem_and_options_are_separate_sentences() {
        let items = vec![json!({
            "n": 21,
            "stem": "The author mentions Texas weather to",
            "options": {
                "A": "forecast a policy shift.",
                "B": "stress climate consequences"
            }
        })];
        let text = items_corpus(&items);
        assert!(text.contains("The author mentions Texas weather to."));
        assert!(text.contains("A) forecast a policy shift."));
        assert!(text.contains("B) stress climate consequences."));
    }

    #[test]
    fn question_only_word_is_added_once() {
        let words = vec![
            Word {
                index: 1,
                english: "weather".into(),
                senses: vec![Sense {
                    pos: "n".into(),
                    cn: "天气".into(),
                }],
            },
            Word {
                index: 2,
                english: "forecast".into(),
                senses: vec![Sense {
                    pos: "v".into(),
                    cn: "预报".into(),
                }],
            },
            Word {
                index: 3,
                english: "displayed".into(),
                senses: vec![Sense {
                    pos: "v".into(),
                    cn: "展示".into(),
                }],
            },
        ];
        let lookup = build_lookup(&words);
        let word_map = words
            .iter()
            .map(|word| (word.english.to_lowercase(), word))
            .collect::<HashMap<_, _>>();
        let reading = vec![json!({
            "n": 21,
            "stem": "The author mentions the weather to",
            "options": {"A": "forecast a policy shift", "B": "draw attention"}
        })];
        let hit = words_with_items(
            "The weather in Texas was cold.",
            &reading,
            &lookup,
            &word_map,
            &HashSet::new(),
        );
        let englishes: Vec<&str> = hit
            .iter()
            .filter_map(|word| word["english"].as_str())
            .collect();
        assert_eq!(englishes.iter().filter(|en| **en == "weather").count(), 1);
        assert!(englishes.contains(&"forecast"));
        let forecast = hit
            .iter()
            .find(|word| word["english"] == "forecast")
            .unwrap();
        let sentence = forecast["sentences"][0].as_str().unwrap();
        assert!(sentence.to_lowercase().contains("forecast"), "{sentence}");

        let cloze = vec![json!({
            "n": 1,
            "stem": "",
            "options": {"A": "Indeed", "B": "displayed"}
        })];
        let cloze_hit = words_with_items(
            "Indeed, the town grew.",
            &cloze,
            &lookup,
            &word_map,
            &HashSet::new(),
        );
        let cloze_en: Vec<&str> = cloze_hit
            .iter()
            .filter_map(|word| word["english"].as_str())
            .collect();
        assert!(cloze_en.contains(&"displayed"));
        assert_eq!(cloze_en.iter().filter(|en| **en == "indeed").count(), 0);
    }
}

#[cfg(test)]
mod lemma_tests {
    use super::*;

    fn w(index: u32, english: &str, pos: &str) -> Word {
        Word {
            index,
            english: english.into(),
            senses: vec![Sense {
                pos: pos.into(),
                cn: "测试".into(),
            }],
        }
    }

    fn fill(words: &[Word], text: &str) -> Vec<String> {
        let lookup = build_lookup(words);
        let word_map = words
            .iter()
            .map(|word| (word.english.to_lowercase(), word))
            .collect::<HashMap<_, _>>();
        let clean = clean_sentence_text(text);
        let case_seen: HashSet<String> = tokenize(&clean)
            .into_iter()
            .filter(|(_, offset)| {
                clean
                    .as_bytes()
                    .get(*offset)
                    .is_some_and(u8::is_ascii_lowercase)
            })
            .map(|(form, _)| form)
            .collect();
        match_passage(text, &lookup, &word_map, &case_seen)
            .iter()
            .filter_map(|word| word["english"].as_str().map(str::to_string))
            .collect()
    }

    #[test]
    fn verb_forms_keep_plain_and_doubled() {
        for form in [
            "developing",
            "marketing",
            "entering",
            "following",
            "discusses",
            "relaxing",
            "offering",
            "editing",
        ] {
            let base = match form {
                "developing" => "develop",
                "marketing" => "market",
                "entering" => "enter",
                "following" => "follow",
                "discusses" => "discuss",
                "relaxing" => "relax",
                "offering" => "offer",
                "editing" => "edit",
                _ => unreachable!(),
            };
            assert!(
                verb_inflections(base).iter().any(|f| f == form),
                "{base} 应生成 {form}"
            );
        }
        assert!(verb_inflections("run").iter().any(|f| f == "running"));
        assert!(!verb_inflections("bet").iter().any(|f| f == "better"));
    }

    #[test]
    fn plurals_cover_both_spellings_and_latin() {
        let belief = noun_plurals("belief");
        assert!(belief.iter().any(|f| f == "beliefs"));
        assert!(belief.iter().any(|f| f == "believes"));
        assert!(noun_plurals("monarch").iter().any(|f| f == "monarchs"));
        assert!(noun_plurals("analysis").iter().any(|f| f == "analyses"));
        assert!(noun_plurals("medium").iter().any(|f| f == "media"));
    }

    #[test]
    fn irregulars_close_common_gaps() {
        let words = vec![
            w(1, "man", "n."),
            w(2, "die", "v."),
            w(3, "dye", "v."),
            w(4, "good", "adj."),
        ];
        let lookup = build_lookup(&words);
        assert!(lookup.get("men").unwrap().iter().any(|b| b == "man"));
        let dying = lookup.get("dying").unwrap();
        assert!(dying.iter().any(|b| b == "die"));
        assert!(!dying.iter().any(|b| b == "dye"), "dying 不应再映射到 dye");
        assert!(lookup.get("better").unwrap().iter().any(|b| b == "good"));
    }

    #[test]
    fn spelling_variants_are_resolved() {
        let words = vec![
            w(1, "behaviour", "n."),
            w(2, "towards", "prep."),
            w(3, "e-mail", "n."),
            w(4, "labour", "n."),
            w(5, "centre", "n."),
            w(6, "programme", "n."),
        ];
        let lookup = build_lookup(&words);
        let word_map = words
            .iter()
            .map(|word| (word.english.to_lowercase(), word))
            .collect::<HashMap<_, _>>();
        let stop = STOPWORDS.split_whitespace().collect::<HashSet<_>>();
        assert_eq!(
            resolve_form("behavior", &lookup, &word_map, &stop),
            ["behaviour"]
        );
        assert_eq!(
            resolve_form("toward", &lookup, &word_map, &stop),
            ["towards"]
        );
        assert_eq!(resolve_form("email", &lookup, &word_map, &stop), ["e-mail"]);
        assert_eq!(resolve_form("labor", &lookup, &word_map, &stop), ["labour"]);
        assert_eq!(
            resolve_form("center", &lookup, &word_map, &stop),
            ["centre"]
        );
        assert_eq!(
            resolve_form("program", &lookup, &word_map, &stop),
            ["programme"]
        );
    }

    #[test]
    fn derivational_fallback_finds_base() {
        let words = vec![
            w(1, "research", "n."),
            w(2, "develop", "v."),
            w(3, "emotion", "n."),
            w(4, "probable", "adj."),
            w(5, "happy", "adj."),
            w(6, "history", "n."),
            w(7, "weak", "adj."),
            w(8, "easy", "adj."),
            w(9, "necessary", "adj."),
            w(10, "agree", "v."),
            w(11, "equal", "adj."),
            w(12, "know", "v."),
            w(13, "write", "v."),
            w(14, "win", "v."),
            w(15, "respond", "v."),
            w(16, "active", "adj."),
            w(17, "transparent", "adj."),
            w(18, "bureaucracy", "n."),
            w(19, "deceive", "v."),
            w(20, "charity", "n."),
            w(21, "anonymous", "adj."),
            w(22, "conclude", "v."),
            w(23, "existence", "n."),
            w(24, "president", "n."),
            w(25, "manager", "n."),
            w(26, "comply", "v."),
            w(27, "modify", "v."),
            w(28, "justify", "v."),
            w(29, "sociology", "n."),
            w(30, "skeptical", "adj."),
            w(31, "intuition", "n."),
            w(32, "urgent", "adj."),
            w(33, "compete", "v."),
            w(34, "monarch", "n."),
            w(35, "slave", "n."),
            w(36, "fish", "n."),
            w(37, "length", "n."),
            w(38, "wealth", "n."),
            w(39, "forest", "n."),
            w(40, "teenager", "n."),
            w(41, "astronomy", "n."),
            w(42, "drama", "n."),
            w(43, "psychiatry", "n."),
            w(44, "due", "adj."),
            w(45, "relevant", "adj."),
            w(46, "compel", "v."),
            w(47, "paralyse", "v."),
            w(48, "homogeneous", "adj."),
            w(49, "paternal", "adj."),
            w(50, "craftsman", "n."),
        ];
        let lookup = build_lookup(&words);
        let word_map = words
            .iter()
            .map(|word| (word.english.to_lowercase(), word))
            .collect::<HashMap<_, _>>();
        let stop = STOPWORDS.split_whitespace().collect::<HashSet<_>>();
        for (surface, base) in [
            ("researchers", "research"),
            ("development", "develop"),
            ("emotional", "emotion"),
            ("probably", "probable"),
            ("happiness", "happy"),
            ("historically", "history"),
            ("weakness", "weak"),
            ("easily", "easy"),
            ("unnecessary", "necessary"),
            ("disagree", "agree"),
            ("inequality", "equal"),
            ("unknown", "know"),
            ("rewrote", "write"),
            ("winners", "win"),
            ("respondents", "respond"),
            ("activists", "active"),
            ("transparency", "transparent"),
            ("bureaucratic", "bureaucracy"),
            ("deceptive", "deceive"),
            ("charitable", "charity"),
            ("anonymity", "anonymous"),
            ("conclusive", "conclude"),
            ("existential", "existence"),
            ("presidential", "president"),
            ("managerial", "manager"),
            ("compliance", "comply"),
            ("modification", "modify"),
            ("justification", "justify"),
            ("sociologist", "sociology"),
            ("skepticism", "skeptical"),
            ("intuitive", "intuition"),
            ("urgency", "urgent"),
            ("competitors", "compete"),
            ("monarchies", "monarch"),
            ("slavery", "slave"),
            ("fisheries", "fish"),
            ("lengthy", "length"),
            ("wealthy", "wealth"),
            ("forestry", "forest"),
            ("teenage", "teenager"),
            ("astronomers", "astronomy"),
            ("dramatists", "drama"),
            ("psychiatrist", "psychiatry"),
            ("duly", "due"),
            ("irrelevant", "relevant"),
            ("compulsive", "compel"),
            ("paralysis", "paralyse"),
            ("homogenization", "homogeneous"),
            ("homogenizing", "homogeneous"),
            ("paternity", "paternal"),
            ("craftsmen", "craftsman"),
        ] {
            assert_eq!(
                best_lemma(surface, &lookup, &word_map, &stop).as_deref(),
                Some(base),
                "{surface} 应还原到 {base}"
            );
        }
    }

    #[test]
    fn compound_words_split_into_headwords() {
        let words = vec![
            w(1, "health", "n."),
            w(2, "care", "n."),
            w(3, "policy", "n."),
            w(4, "make", "v."),
            w(5, "short", "adj."),
            w(6, "term", "n."),
        ];
        let lookup = build_lookup(&words);
        let word_map = words
            .iter()
            .map(|word| (word.english.to_lowercase(), word))
            .collect::<HashMap<_, _>>();
        let stop = STOPWORDS.split_whitespace().collect::<HashSet<_>>();
        let health = resolve_form("healthcare", &lookup, &word_map, &stop);
        assert!(health.is_empty());
        let mut health = compound_bases("healthcare", &lookup, &word_map, &stop);
        health.sort();
        assert_eq!(health, ["care", "health"]);
        let mut policy = compound_bases("policymakers", &lookup, &word_map, &stop);
        policy.sort();
        assert_eq!(policy, ["make", "policy"]);
        let mut short = compound_bases("short-term", &lookup, &word_map, &stop);
        short.sort();
        assert_eq!(short, ["short", "term"]);
    }

    #[test]
    fn match_passage_catches_probe_words() {
        let words = vec![
            w(1, "research", "n."),
            w(2, "develop", "v."),
            w(3, "market", "n."),
            w(4, "consider", "v."),
            w(5, "discuss", "v."),
            w(6, "belief", "n."),
            w(7, "man", "n."),
            w(8, "die", "v."),
            w(9, "dye", "v."),
            w(10, "bet", "v."),
            w(11, "better", "adj."),
            w(12, "strategy", "n."),
            w(13, "offer", "v."),
            w(14, "committee", "n."),
            w(15, "woman", "n."),
        ];
        let hits = fill(
            &words,
            "Researchers are developing marketing strategies and considering offers. \
             The committee discusses beliefs. Men and women are dying. The men are dying too. This is better. Another group of researchers agrees.",
        );
        for word in [
            "research", "develop", "market", "consider", "discuss", "belief", "man", "die",
        ] {
            assert!(hits.iter().any(|hit| hit == word), "缺少 {word}: {hits:?}");
        }
        assert!(
            !hits.iter().any(|hit| hit == "dye"),
            "dying 误配 dye: {hits:?}"
        );
        assert!(
            !hits.iter().any(|hit| hit == "bet"),
            "better 误配 bet: {hits:?}"
        );
        assert!(hits.iter().any(|hit| hit == "better"));
    }

    #[test]
    fn match_passage_handles_phrases_and_possessives() {
        let words = vec![
            w(1, "according to", "usage."),
            w(2, "living room", "n."),
            w(3, "world", "n."),
            w(4, "economy", "n."),
            w(5, "room", "n."),
        ];
        let hits = fill(
            &words,
            "According to the report, the world's economy is changing. \
             The living room is large.",
        );
        assert!(hits.iter().any(|hit| hit == "according to"), "{hits:?}");
        assert!(hits.iter().any(|hit| hit == "living room"), "{hits:?}");
        assert!(hits.iter().any(|hit| hit == "world"), "{hits:?}");
        assert!(hits.iter().any(|hit| hit == "economy"), "{hits:?}");
    }
}
