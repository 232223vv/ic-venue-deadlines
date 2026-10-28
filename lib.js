(function (global) {
  const MS_DAY = 86400000;

  function offsetHours(tz) {
    if (!tz) return 0;
    if (tz === 'AoE') return -12;
    const m = /^UTC([+-])(\d{1,2})$/.exec(tz);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * Number(m[2]);
  }

  function isoToUTC(iso) {
    const parts = iso.split('-').map(Number);
    return Date.UTC(parts[0], parts[1] - 1, parts[2]);
  }

  function dateInTz(now, tz) {
    return new Date(now.getTime() + offsetHours(tz) * 3600000).toISOString().slice(0, 10);
  }

  function daysLeft(iso, tz, now) {
    const ref = now || new Date();
    return Math.round((isoToUTC(iso) - isoToUTC(dateInTz(ref, tz))) / MS_DAY);
  }

  function urgency(days) {
    if (days === null || days === undefined) return 'tbd';
    if (days < 0) return 'ended';
    if (days <= 7) return 'urgent';
    if (days <= 30) return 'soon';
    return 'normal';
  }

  function countdownLabel(days) {
    if (days === null || days === undefined) return '待公布';
    if (days < 0) return '已结束';
    if (days === 0) return '今天';
    if (days === 1) return '明天';
    return days + ' 天';
  }

  function filterRows(rows, state) {
    const q = (state.q || '').trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.view === 'conferences' && state.group !== 'all' && r.group !== state.group) return false;
      if (state.ccf !== 'all' && (r.ccf || 'none') !== state.ccf) return false;
      if (state.window !== 'all') {
        if (r.days === null || r.days === undefined) return false;
        if (r.days < 0 || r.days > Number(state.window)) return false;
      }
      if (q && r.haystack.indexOf(q) === -1) return false;
      return true;
    });
  }

  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      const ad = a.days === undefined ? null : a.days;
      const bd = b.days === undefined ? null : b.days;
      if (ad === null && bd === null) return 0;
      if (ad === null) return 1;
      if (bd === null) return -1;
      const aEnded = ad < 0;
      const bEnded = bd < 0;
      if (aEnded !== bEnded) return aEnded ? 1 : -1;
      return aEnded ? bd - ad : ad - bd;
    });
  }

  const Lib = {
    offsetHours: offsetHours,
    isoToUTC: isoToUTC,
    dateInTz: dateInTz,
    daysLeft: daysLeft,
    urgency: urgency,
    countdownLabel: countdownLabel,
    filterRows: filterRows,
    sortRows: sortRows
  };

  global.Lib = Lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = Lib;
})(typeof window !== 'undefined' ? window : globalThis);
