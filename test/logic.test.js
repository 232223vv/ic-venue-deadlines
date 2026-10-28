const test = require('node:test');
const assert = require('node:assert/strict');
const Lib = require('../lib.js');

test('offsetHours 解析 AoE 与 UTC 偏移', () => {
  assert.equal(Lib.offsetHours('AoE'), -12);
  assert.equal(Lib.offsetHours('UTC+8'), 8);
  assert.equal(Lib.offsetHours('UTC-8'), -8);
  assert.equal(Lib.offsetHours(''), 0);
});

test('daysLeft: AoE 下 UTC 深夜仍算前一天', () => {
  const now = new Date('2026-11-16T23:00:00Z'); // AoE = 2026-11-16 11:00
  assert.equal(Lib.daysLeft('2026-11-17', 'AoE', now), 1);
});

test('daysLeft: UTC+8 跨日', () => {
  const now = new Date('2026-11-16T17:00:00Z'); // 北京 = 2026-11-17 01:00
  assert.equal(Lib.daysLeft('2026-11-17', 'UTC+8', now), 0);
});

test('daysLeft: 已过期返回负数', () => {
  const now = new Date('2026-11-20T04:00:00Z'); // AoE = 2026-11-19 16:00
  assert.equal(Lib.daysLeft('2026-11-17', 'AoE', now), -2);
});

test('urgency 边界', () => {
  assert.equal(Lib.urgency(null), 'tbd');
  assert.equal(Lib.urgency(-1), 'ended');
  assert.equal(Lib.urgency(0), 'urgent');
  assert.equal(Lib.urgency(7), 'urgent');
  assert.equal(Lib.urgency(8), 'soon');
  assert.equal(Lib.urgency(30), 'soon');
  assert.equal(Lib.urgency(31), 'normal');
});

test('countdownLabel 文案', () => {
  assert.equal(Lib.countdownLabel(null), '待公布');
  assert.equal(Lib.countdownLabel(-1), '已结束');
  assert.equal(Lib.countdownLabel(0), '今天');
  assert.equal(Lib.countdownLabel(1), '明天');
  assert.equal(Lib.countdownLabel(12), '12 天');
});

const rows = [
  { id: 'a', group: 'eda', ccf: 'A', days: 10, haystack: 'dac design automation' },
  { id: 'b', group: 'circuits', ccf: null, days: 40, haystack: 'isscc solid state' },
  { id: 'c', group: 'arch', ccf: 'A', days: -2, haystack: 'isca architecture' },
  { id: 'd', group: 'eda', ccf: 'B', days: null, haystack: 'iccad cad' }
];

test('filterRows: 按方向、等级、时间窗、关键词组合', () => {
  const base = { view: 'conferences', group: 'all', ccf: 'all', window: 'all', q: '' };
  assert.equal(Lib.filterRows(rows, base).length, 4);
  assert.deepEqual(Lib.filterRows(rows, Object.assign({}, base, { group: 'eda' })).map(r => r.id), ['a', 'd']);
  assert.deepEqual(Lib.filterRows(rows, Object.assign({}, base, { ccf: 'A' })).map(r => r.id), ['a', 'c']);
  assert.deepEqual(Lib.filterRows(rows, Object.assign({}, base, { ccf: 'none' })).map(r => r.id), ['b']);
  assert.deepEqual(Lib.filterRows(rows, Object.assign({}, base, { window: '30' })).map(r => r.id), ['a']);
  assert.deepEqual(Lib.filterRows(rows, Object.assign({}, base, { q: 'isca' })).map(r => r.id), ['c']);
});

test('filterRows: 期刊视图忽略方向筛选', () => {
  const state = { view: 'journals', group: 'eda', ccf: 'all', window: 'all', q: '' };
  assert.equal(Lib.filterRows(rows, state).length, 4);
});

test('sortRows: 未截止升序、待公布最后、已结束按最近优先', () => {
  assert.deepEqual(Lib.sortRows(rows).map(r => r.id), ['a', 'b', 'c', 'd']);
  const two = [
    { id: 'x', days: -30, group: 'eda', ccf: 'A', haystack: '' },
    { id: 'y', days: -1, group: 'eda', ccf: 'A', haystack: '' }
  ];
  assert.deepEqual(Lib.sortRows(two).map(r => r.id), ['y', 'x']);
});

test('nextOf: 有未来截止时取最近的未来', () => {
  const now = new Date('2026-10-28T00:00:00Z');
  const r = Lib.nextOf([
    { label: '摘要', date: '2026-11-20', tz: 'AoE' },
    { label: '论文', date: '2026-11-10', tz: 'AoE' }
  ], now);
  assert.equal(r.next.label, '论文');
  assert.equal(r.next.days, 14);
});

test('nextOf: 全部已过时取最近一次已过', () => {
  const now = new Date('2026-10-28T00:00:00Z');
  const r = Lib.nextOf([
    { label: '摘要', date: '2026-04-07', tz: 'AoE' },
    { label: '论文', date: '2026-09-09', tz: 'AoE' }
  ], now);
  assert.equal(r.next.label, '论文');
  assert.equal(r.next.days, -48);
});

test('nextOf: 空列表返回 null', () => {
  assert.equal(Lib.nextOf([], new Date('2026-10-28T00:00:00Z')).next, null);
  assert.equal(Lib.nextOf(undefined, new Date('2026-10-28T00:00:00Z')).next, null);
});

test('nextOf: 今天截止为 0', () => {
  const now = new Date('2026-10-28T00:00:00Z'); // AoE = 2026-10-27
  assert.equal(Lib.nextOf([{ label: '论文', date: '2026-10-27', tz: 'AoE' }], now).next.days, 0);
});
