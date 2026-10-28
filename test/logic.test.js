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
