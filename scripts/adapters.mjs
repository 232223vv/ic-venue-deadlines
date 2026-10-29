import { parseLongDate, parseDateRange, tzFromName, tzFromUtcOffset, normalizeTitle, stripHtml } from './parse.mjs';

export const CCFDDL_URL = 'https://ccfddl.com/conference/allconf.json';

export const CCFDDL_VENUES = {
  DAC: 'dac',
  ICCAD: 'iccad',
  DATE: 'date',
  'ASP-DAC': 'aspdac',
  ICCD: 'iccd',
  ISCAS: 'iscas',
  ISCA: 'isca',
  MICRO: 'micro',
  HPCA: 'hpca',
  ASPLOS: 'asplos'
};

function normalizeTz(raw) {
  if (!raw) return 'AoE';
  const value = String(raw).trim();
  if (/^AoE$/i.test(value)) return 'AoE';
  if (/^UTC[+-]\d{1,2}$/i.test(value)) return value.toUpperCase();
  return 'AoE';
}

function deadlineDate(raw) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw || ''));
  return m ? m[1] : '';
}

export function pickCcfddlEdition(conf, today) {
  const confs = (conf && conf.confs) || [];
  if (!confs.length) return null;
  const upcoming = confs
    .filter(c => {
      const opening = deadlineDate(c.opening) || '';
      return opening >= today;
    })
    .sort((a, b) => String(a.opening).localeCompare(String(b.opening)));
  if (upcoming.length) return upcoming[0];
  return confs.slice().sort((a, b) => String(b.opening || b.year).localeCompare(String(a.opening || a.year)))[0];
}

export function deadlinesFromCcfddl(edition) {
  const tz = normalizeTz(edition.timezone);
  const out = [];
  for (const slot of edition.timeline || []) {
    const abstractDate = deadlineDate(slot.abstract_deadline);
    const paperDate = deadlineDate(slot.deadline);
    if (abstractDate && abstractDate !== paperDate) {
      out.push({ label: '摘要', date: abstractDate, tz, note: slot.comment || '' });
    }
    if (paperDate) {
      out.push({ label: '论文', date: paperDate, tz, note: slot.comment && abstractDate !== paperDate ? '' : (slot.comment || '') });
    }
  }
  return out.filter((d, i, arr) => arr.findIndex(x => x.label === d.label && x.date === d.date) === i);
}

export function parseCcfddl(payload, today) {
  const list = Array.isArray(payload) ? payload : [];
  const byTitle = new Map(list.map(item => [String(item.title || '').toUpperCase(), item]));
  const updates = {};
  const missing = [];
  for (const [title, id] of Object.entries(CCFDDL_VENUES)) {
    const conf = byTitle.get(title.toUpperCase());
    if (!conf) { missing.push(title); continue; }
    const edition = pickCcfddlEdition(conf, today);
    if (!edition) { missing.push(title); continue; }
    const deadlines = deadlinesFromCcfddl(edition);
    if (!deadlines.length) { missing.push(title); continue; }
    const range = parseDateRange(edition.date);
    updates[id] = {
      edition: Number(edition.year) || undefined,
      deadlines,
      place: String(edition.place || '').trim(),
      startDate: range ? range.startDate : '',
      endDate: range ? range.endDate : '',
      link: edition.link || '',
      editionLabel: edition.date || '',
      soft: true
    };
  }
  return { updates, missing };
}

function sliceAfter(text, anchor, size = 320) {
  const i = text.indexOf(anchor);
  if (i < 0) return '';
  return text.slice(i, i + size);
}

export function parseIsscc(text) {
  const slice = sliceAfter(text, 'Submission deadline');
  if (!slice) return null;
  const date = parseLongDate(slice);
  if (!date) return null;
  const tzName = /(EDT|EST|PDT|PST)/.exec(slice);
  const confIdx = text.indexOf('Conference');
  const confSlice = confIdx >= 0 ? text.slice(confIdx, confIdx + 240) : '';
  const range = parseDateRange(confSlice);
  return {
    deadlines: [{ label: '论文', date, tz: tzName ? tzFromName(tzName[1]) || 'UTC-4' : 'UTC-4', note: '' }],
    startDate: range ? range.startDate : '',
    endDate: range ? range.endDate : ''
  };
}

export function parseCicc(text) {
  const slice = sliceAfter(text, 'FIRM Deadline', 260) || sliceAfter(text, 'Deadline for paper submission', 260);
  if (!slice) return null;
  const date = parseLongDate(slice);
  if (!date) return null;
  return { deadlines: [{ label: '论文', date, tz: 'UTC-8', note: '11:59 pm PT' }] };
}

export function parseAsscc(text) {
  const i = text.indexOf('Paper submission deadline');
  if (i < 0) return null;
  const slice = text.slice(i, i + 180);
  const date = parseLongDate(slice);
  if (!date) return null;
  const offset = /UTC\s*[+-]\s*\d{4}/.exec(slice);
  return { deadlines: [{ label: '论文', date, tz: (offset && tzFromUtcOffset(offset[0])) || 'UTC-5', note: '' }] };
}

export function parseEsserc(text) {
  const slice = sliceAfter(text, 'Papers submission deadline', 120);
  if (!slice) return null;
  const date = parseLongDate(slice);
  if (!date) return null;
  return { deadlines: [{ label: '论文', date, tz: 'UTC+3', note: '官网未公布时区,按会场当地(EEST)记录' }] };
}

export function parseVlsi(text) {
  const m = /([A-Z][a-z]+ \d{1,2}, \d{4})\s+Paper Submission Deadline/.exec(text) ||
    /Paper Submission Deadline[^]{0,40}?([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(text);
  if (!m) return null;
  const date = parseLongDate(m[1]);
  if (!date) return null;
  return { deadlines: [{ label: '论文', date, tz: 'UTC+9', note: '11:59 P.M. JST' }] };
}

export const OFFICIAL_SOURCES = [
  { id: 'isscc', url: 'https://isscc.org/call-for-papers-overview-26', edition: 2027, parse: parseIsscc },
  { id: 'cicc', url: 'https://www.ieee-cicc.org/2027-call-for-papers/', edition: 2027, parse: parseCicc },
  { id: 'asscc', url: 'https://epapers2.org/asscc2026/ESR/authorinfo1.php', edition: 2026, parse: parseAsscc },
  { id: 'esserc', url: 'https://www.esserc2027.org/conference', edition: 2027, parse: parseEsserc },
  { id: 'vlsisymp', url: 'https://www.vlsisymposium.org/', edition: 2027, parse: parseVlsi }
];

export function parseCasJournal(markdown) {
  const text = String(markdown || '');
  const headerOk = /Call For Papers/i.test(text) || /No current call documents available/i.test(text);
  const cut = text.search(/Recent Past Call Documents/i);
  const active = cut >= 0 ? text.slice(0, cut) : text;
  const items = [];
  const re = /^###\s+\[([^\]]+)\]\((https?:\/\/\S+?)\)[^\n]*?Deadline:\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/gm;
  let m;
  while ((m = re.exec(active)) !== null) {
    const title = m[1].replace(/^JETCAS\s+CFP:\s*/i, '').trim();
    const date = parseLongDate(m[3]);
    if (!title || !date) continue;
    items.push({ title, deadline: date, tz: 'AoE', link: m[2] });
  }
  return { ok: headerOk, items };
}

export function parseCedaJournal(markdown, today) {
  const text = String(markdown || '');
  const ok = /Call For Papers/i.test(text);
  const items = [];
  const re = /^###\s+\[([^\]]+)\]\((https?:\/\/\S+?)\)[^\n]*?Deadline:\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const rawTitle = m[1];
    if (/call for nominations|editor-in-chief|call for proposals/i.test(rawTitle)) continue;
    const title = rawTitle.replace(/^(TCAD|JETCAS)\s+(CFP|Call for Papers):\s*/i, '').trim();
    const date = parseLongDate(m[3]);
    if (!title || !date || date < today) continue;
    items.push({ title, deadline: date, tz: 'AoE', link: m[2] });
  }
  return { ok, items };
}

export const JOURNAL_SOURCES = [
  { id: 'jetcas', kind: 'cas', url: 'https://ieee-cas.org/publication/JETCAS' },
  { id: 'tcas1', kind: 'cas', url: 'https://ieee-cas.org/publication/TCAS-I' },
  { id: 'tcas2', kind: 'cas', url: 'https://ieee-cas.org/publication/TCAS-II' },
  { id: 'ojcas', kind: 'cas', url: 'https://ieee-cas.org/publication/OJCAS' },
  { id: 'tcad', kind: 'ceda', url: 'https://ieee-ceda.org/publications/tcad' },
  { id: 'tvlsi', kind: 'unavailable', reason: 'IEEE CAS 与 CEDA 均无 TVLSI 的征稿列表' },
  { id: 'dt', kind: 'unavailable', reason: 'IEEE CS 的 CFP 汇总页不含 Design & Test 条目' },
  { id: 'todaes', kind: 'acm', url: 'https://dl.acm.org/journal/todaes' },
  { id: 'tecs', kind: 'acm', url: 'https://dl.acm.org/journal/tecs' }
];

export function mergeSpecialIssues(existing, scraped, source, today) {
  const old = new Map((existing || []).map(si => [normalizeTitle(si.title), si]));
  return scraped.map(item => {
    const prev = old.get(normalizeTitle(item.title));
    const merged = {
      title: item.title,
      topics: (prev && prev.topics) || [],
      deadline: item.deadline,
      tz: item.tz || (prev && prev.tz) || 'AoE',
      link: item.link,
      source,
      checked: today
    };
    if (prev && prev.note) merged.note = prev.note;
    return merged;
  });
}

export function applyUpdates(data, pack, today) {
  const out = JSON.parse(JSON.stringify(data));
  const applied = { conferences: [], journals: [], skipped: [] };

  for (const conf of out.conferences) {
    const next = pack.conferences && pack.conferences[conf.id];
    if (!next) continue;
    if (next.edition && next.edition !== conf.edition) {
      applied.skipped.push(`${conf.id}: 抓到的届次 ${next.edition} 与页面记录的 ${conf.edition} 不一致,未覆盖`);
      continue;
    }
    if (Array.isArray(next.deadlines) && next.deadlines.length) {
      conf.deadlines = next.deadlines;
      conf.status = 'confirmed';
    }
    if (next.place && (!next.soft || !conf.place)) conf.place = next.place;
    if (next.startDate && (!next.soft || !conf.startDate)) conf.startDate = next.startDate;
    if (next.endDate && (!next.soft || !conf.endDate)) conf.endDate = next.endDate;
    conf.checked = today;
    applied.conferences.push(conf.id);
  }

  for (const journal of out.journals) {
    const next = pack.journals && pack.journals[journal.id];
    if (!next || !next.ok) continue;
    journal.specialIssues = mergeSpecialIssues(journal.specialIssues, next.items, next.source, today);
    journal.checked = today;
    delete journal.note;
    applied.journals.push(journal.id);
  }

  out.meta.lastFetched = today;
  if (applied.conferences.length || applied.journals.length) out.meta.lastUpdated = today;
  return { data: out, applied };
}

export { stripHtml };
