const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12
};

const TZ_NAMES = {
  EDT: 'UTC-4', EST: 'UTC-5', CDT: 'UTC-5', CST: 'UTC-6',
  PDT: 'UTC-7', PST: 'UTC-8', MDT: 'UTC-6', MST: 'UTC-7',
  JST: 'UTC+9', KST: 'UTC+9', CET: 'UTC+1', CEST: 'UTC+2',
  EET: 'UTC+2', EEST: 'UTC+3', GMT: 'UTC+0', UTC: 'UTC+0', BST: 'UTC+1'
};

export function monthIndex(word) {
  if (!word) return 0;
  return MONTHS[String(word).toLowerCase().replace(/\.$/, '')] || 0;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function iso(year, month, day) {
  if (!year || !month || !day) return '';
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function tzFromName(name) {
  if (!name) return '';
  return TZ_NAMES[String(name).toUpperCase()] || '';
}

export function tzFromUtcOffset(raw) {
  const m = /UTC\s*([+-])\s*(\d{4})/.exec(raw || '');
  if (!m) return '';
  const sign = m[1];
  const hours = Number(m[2].slice(0, 2));
  return `UTC${sign}${hours}`;
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseLongDate(text) {
  if (!text) return '';
  const s = String(text).replace(/\s+/g, ' ');
  let m = /(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/.exec(s);
  if (m) return iso(m[3], monthIndex(m[2]), m[1]);
  m = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m) return iso(m[3], monthIndex(m[1]), m[2]);
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return iso(m[1], m[2], m[3]);
  return '';
}

export function parseDateRange(text) {
  if (!text) return null;
  const s = String(text).replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
  let m = /([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*-\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m) {
    const start = iso(m[5], monthIndex(m[1]), m[2]);
    const end = iso(m[5], monthIndex(m[3]), m[4]);
    if (start && end) return { startDate: start, endDate: end };
  }
  m = /([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m) {
    const start = iso(m[4], monthIndex(m[1]), m[2]);
    const end = iso(m[4], monthIndex(m[1]), m[3]);
    if (start && end) return { startDate: start, endDate: end };
  }
  const single = parseLongDate(s);
  if (single) return { startDate: single, endDate: single };
  return null;
}

export function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/^jetcas\s+cfp:\s*/i, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .trim();
}

export function extractFirstDate(text, patterns) {
  for (const re of patterns) {
    const m = re.exec(text || '');
    if (m) {
      const value = parseLongDate(m[1] || m[0]);
      if (value) return value;
    }
  }
  return '';
}
