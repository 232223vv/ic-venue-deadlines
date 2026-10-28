const test = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../data.js');

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TZ = /^(AoE|UTC[+-]\d{1,2})$/;
const GROUPS = ['eda', 'circuits', 'arch'];
const CCF = ['A', 'B', 'C', null];

const CONFERENCE_IDS = [
  'dac', 'iccad', 'date', 'aspdac', 'iccd',
  'isscc', 'cicc', 'asscc', 'esserc', 'vlsisymp', 'iscas',
  'isca', 'micro', 'hpca', 'asplos'
];

test('meta 带核对日期与 CCF 版本', () => {
  assert.match(DATA.meta.lastUpdated, ISO);
  assert.ok(DATA.meta.ccfEdition);
});

test('收录 15 个会议与 9 个期刊', () => {
  const ids = DATA.conferences.map(c => c.id);
  CONFERENCE_IDS.forEach(id => assert.ok(ids.includes(id), '缺少会议:' + id));
  assert.equal(DATA.conferences.length, 15);
  assert.equal(DATA.journals.length, 9);
});

test('会议字段完整', () => {
  const seen = new Set();
  DATA.conferences.forEach(c => {
    assert.ok(!seen.has(c.id), '重复 id:' + c.id);
    seen.add(c.id);
    assert.ok(c.name && c.abbr, c.id);
    assert.ok(GROUPS.includes(c.group), c.id + ' group 非法');
    assert.ok(CCF.includes(c.ccf), c.id + ' ccf 非法');
    assert.ok(['confirmed', 'tbd'].includes(c.status), c.id + ' status 非法');
    assert.match(c.url, /^https?:\/\//, c.id + ' url 非法');
    assert.match(c.source, /^https?:\/\//, c.id + ' source 非法');
    assert.match(c.checked, ISO);
    assert.ok(Array.isArray(c.deadlines), c.id);
    if (c.status === 'confirmed') {
      assert.match(c.startDate, ISO);
      assert.ok(c.place, c.id + ' 缺地点');
      assert.ok(!/[<>]/.test(c.place), c.id + ' place 仍是占位符');
      assert.ok(c.deadlines.length > 0, c.id + ' 已确认却无截止日期');
    }
    c.deadlines.forEach(d => {
      assert.match(d.date, ISO, c.id + ' 日期格式');
      assert.match(d.tz, TZ, c.id + ' 时区非法');
      assert.ok(d.label, c.id + ' deadline 缺 label');
    });
  });
});

test('期刊字段完整', () => {
  DATA.journals.forEach(j => {
    assert.ok(j.id && j.name && j.abbr && j.url, j.id);
    assert.ok(CCF.includes(j.ccf), j.id + ' ccf 非法');
    assert.ok(Array.isArray(j.specialIssues), j.id);
    j.specialIssues.forEach(si => {
      assert.match(si.deadline, ISO, j.id + ' 专刊日期');
      assert.ok(si.title && si.link, j.id + ' 专刊缺标题或链接');
      assert.match(si.checked, ISO);
    });
  });
});

test('期刊带核对日期与 https 链接', () => {
  DATA.journals.forEach(j => {
    assert.match(j.checked, ISO, j.id + ' 缺 checked');
    assert.match(j.url, /^https:\/\//, j.id + ' url 非 https');
    j.specialIssues.forEach(si => {
      assert.match(si.tz, TZ, j.id + ' 专刊 tz 缺失');
      assert.match(si.source, /^https?:\/\//, j.id + ' 专刊 source 缺失');
    });
  });
});
