import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import {
  CCFDDL_URL, OFFICIAL_SOURCES, JOURNAL_SOURCES,
  parseCcfddl, parseCasJournal, parseCedaJournal, applyUpdates
} from './adapters.mjs';
import { stripHtml } from './parse.mjs';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'data.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export function looksBlocked(text) {
  return /just a moment|enable javascript and cookies|performing security verification|attention required|access denied|verify you are human/i
    .test(String(text || '').slice(0, 3000));
}

async function viaDirect(url, timeout) {
  const res = await fetch(url, {
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout)
  });
  const text = await res.text();
  if (res.ok && text.length > 400 && !looksBlocked(text)) return { ok: true, via: 'direct', text };
  return { ok: false, via: 'direct', reason: `HTTP ${res.status}${looksBlocked(text) ? ' (反爬验证页)' : ''}` };
}

async function viaReader(url, timeout) {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(Math.max(timeout, 30000))
  });
  const text = await res.text();
  if (res.ok && text.length > 400 && !looksBlocked(text)) return { ok: true, via: 'reader', text };
  return { ok: false, via: 'reader', reason: looksBlocked(text) ? 'reader 也拿到反爬验证页' : `reader HTTP ${res.status}` };
}

async function viaChrome(url, timeout) {
  const bin = process.env.CHROME_BIN;
  if (!bin) return null;
  try {
    const { stdout } = await execFileAsync(bin, [
      '--headless=new', '--disable-gpu', '--no-first-run',
      '--virtual-time-budget=8000', '--dump-dom', url
    ], { timeout, maxBuffer: 32 * 1024 * 1024 });
    if (stdout && stdout.length > 400) return { ok: true, via: 'chrome', text: stdout };
    return { ok: false, via: 'chrome', reason: 'DOM 为空' };
  } catch (err) {
    return { ok: false, via: 'chrome', reason: err.message.split('\n')[0] };
  }
}

export async function fetchText(url, opts = {}) {
  const timeout = opts.timeout ?? 20000;
  const attempts = [];
  const layers = [() => viaDirect(url, timeout)];
  if (opts.proxy !== false) layers.push(() => viaReader(url, timeout));
  layers.push(() => viaChrome(url, timeout));

  for (const layer of layers) {
    try {
      const result = await layer();
      if (!result) continue;
      if (result.ok) return result;
      attempts.push(`${result.via}: ${result.reason}`);
    } catch (err) {
      attempts.push(String(err && err.message ? err.message : err).slice(0, 80));
    }
  }
  return { ok: false, via: 'none', text: '', attempts };
}

export function loadData() {
  const require = createRequire(import.meta.url);
  const resolved = require.resolve(DATA_PATH);
  delete require.cache[resolved];
  return require(resolved);
}

export function serializeData(data) {
  return `(function (global) {\n  const DATA = ${JSON.stringify(data, null, 2)};\n\n  global.DATA = DATA;\n  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;\n})(typeof window !== 'undefined' ? window : globalThis);\n`;
}

export function localToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function runRefresh({ today, fetchTextImpl = fetchText } = {}) {
  const day = today || localToday();
  const report = [];
  const conferences = {};
  const journals = {};

  const journalSources = JOURNAL_SOURCES.filter(src => src.url);
  const [ccfRes, officialRes, journalRes] = await Promise.all([
    fetchTextImpl(CCFDDL_URL, { timeout: 30000 }),
    Promise.all(OFFICIAL_SOURCES.map(async src => ({ src, res: await fetchTextImpl(src.url, { timeout: 25000 }) }))),
    Promise.all(journalSources.map(async src => ({ src, res: await fetchTextImpl(src.url, { timeout: 25000 }) })))
  ]);

  if (ccfRes.ok) {
    try {
      const { updates, missing } = parseCcfddl(JSON.parse(ccfRes.text), day);
      Object.assign(conferences, updates);
      report.push({
        source: 'ccfddl', label: 'CCF 会议日历', status: 'ok',
        updated: Object.keys(updates).length,
        detail: `经 ${ccfRes.via} 获取${missing.length ? `;未找到 ${missing.join('/')}` : ''}`
      });
    } catch (err) {
      report.push({ source: 'ccfddl', label: 'CCF 会议日历', status: 'error', updated: 0, detail: 'JSON 解析失败' });
    }
  } else {
    report.push({ source: 'ccfddl', label: 'CCF 会议日历', status: 'blocked', updated: 0, detail: ccfRes.attempts.join('; ') });
  }

  for (const { src, res } of officialRes) {
    if (!res.ok) {
      report.push({ source: src.id, label: src.id.toUpperCase(), status: 'blocked', updated: 0, detail: res.attempts.join('; ') });
      continue;
    }
    let parsed = null;
    try { parsed = src.parse(stripHtml(res.text)); } catch (err) { parsed = null; }
    if (!parsed || !parsed.deadlines || !parsed.deadlines.length) {
      report.push({ source: src.id, label: src.id.toUpperCase(), status: 'changed', updated: 0, detail: '页面结构未匹配,保留旧数据' });
      continue;
    }
    conferences[src.id] = {
      edition: src.edition,
      deadlines: parsed.deadlines,
      place: parsed.place || '',
      startDate: parsed.startDate || '',
      endDate: parsed.endDate || ''
    };
    report.push({ source: src.id, label: src.id.toUpperCase(), status: 'ok', updated: 1, detail: `经 ${res.via} 获取` });
  }

  for (const { src, res } of journalRes) {
    if (!res.ok) {
      report.push({ source: src.id, label: src.id.toUpperCase(), status: 'blocked', updated: 0, detail: res.attempts.join('; ') });
      continue;
    }
    if (src.kind === 'acm') {
      report.push({ source: src.id, label: src.id.toUpperCase(), status: 'blocked', updated: 0, detail: 'ACM DL 需要浏览器验证,未能解析专刊列表' });
      continue;
    }
    const parsed = src.kind === 'ceda' ? parseCedaJournal(res.text, day) : parseCasJournal(res.text);
    if (!parsed.ok) {
      report.push({ source: src.id, label: src.id.toUpperCase(), status: 'changed', updated: 0, detail: '页面结构未匹配,保留旧数据' });
      continue;
    }
    journals[src.id] = { ok: true, items: parsed.items, source: src.url };
    report.push({
      source: src.id, label: src.id.toUpperCase(), status: 'ok',
      updated: parsed.items.length,
      detail: parsed.items.length ? `经 ${res.via} 获取` : '当前无开放专刊'
    });
  }

  for (const src of JOURNAL_SOURCES.filter(item => item.kind === 'unavailable')) {
    report.push({ source: src.id, label: src.id.toUpperCase(), status: 'no-source', updated: 0, detail: src.reason });
  }

  return { report, conferences, journals, today: day };
}

export async function refreshAndWrite(opts = {}) {
  const data = loadData();
  const pack = await runRefresh(opts);
  const { data: next, applied } = applyUpdates(data, pack, pack.today);
  const source = serializeData(next);
  const previous = await readFile(DATA_PATH, 'utf8');
  let wrote = false;
  if (source !== previous) {
    await copyFile(DATA_PATH, `${DATA_PATH}.bak`);
    await writeFile(DATA_PATH, source);
    wrote = true;
  }
  return { report: pack.report, applied, data: next, wrote, today: pack.today };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshAndWrite()
    .then(result => {
      for (const row of result.report) {
        console.log(`${row.status.padEnd(10)} ${row.label.padEnd(12)} ${String(row.updated).padStart(2)}  ${row.detail}`);
      }
      console.log(`\n写入 data.js: ${result.wrote ? '是' : '无变化'}`);
      if (result.applied.skipped.length) console.log('跳过:', result.applied.skipped.join('; '));
    })
    .catch(err => { console.error(err); process.exit(1); });
}
