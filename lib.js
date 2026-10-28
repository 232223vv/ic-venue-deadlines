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

  const Lib = {
    offsetHours: offsetHours,
    isoToUTC: isoToUTC,
    dateInTz: dateInTz,
    daysLeft: daysLeft,
    urgency: urgency,
    countdownLabel: countdownLabel
  };

  global.Lib = Lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = Lib;
})(typeof window !== 'undefined' ? window : globalThis);
