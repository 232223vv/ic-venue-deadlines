import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLongDate, parseDateRange, tzFromName, tzFromUtcOffset } from '../scripts/parse.mjs';
import {
  parseCcfddl, pickCcfddlEdition, parseIsscc, parseCicc, parseAsscc,
  parseEsserc, parseVlsi, parseCasJournal, parseCedaJournal, applyUpdates
} from '../scripts/adapters.mjs';

test('parseLongDate 支持四种写法', () => {
  assert.equal(parseLongDate('16 November 2026'), '2026-11-16');
  assert.equal(parseLongDate('September 9, 2026'), '2026-09-09');
  assert.equal(parseLongDate('1 Nov 2026'), '2026-11-01');
  assert.equal(parseLongDate('2026-11-01'), '2026-11-01');
  assert.equal(parseLongDate('not a date'), '');
});

test('parseLongDate 拒绝不存在的日历日', () => {
  assert.equal(parseLongDate('February 30, 2026'), '');
});

test('parseDateRange 支持同月与跨月', () => {
  assert.deepEqual(parseDateRange('July 11-14, 2027'), { startDate: '2027-07-11', endDate: '2027-07-14' });
  assert.deepEqual(parseDateRange('June 20\u201324, 2027'), { startDate: '2027-06-20', endDate: '2027-06-24' });
  assert.deepEqual(parseDateRange('Oct 31 - Nov 4, 2026'), { startDate: '2026-10-31', endDate: '2026-11-04' });
  assert.equal(parseDateRange('TBD'), null);
});

test('时区名与 UTC 偏移解析', () => {
  assert.equal(tzFromName('EDT'), 'UTC-4');
  assert.equal(tzFromName('JST'), 'UTC+9');
  assert.equal(tzFromName('XYZ'), '');
  assert.equal(tzFromUtcOffset('UTC -0500'), 'UTC-5');
});

const ccfFixture = [{
  title: 'DAC',
  confs: [
    {
      year: 2026, id: 'dac26', opening: '2026-07-20 08:00:00', timezone: 'UTC-8',
      date: 'July 20-24, 2026', place: 'San Francisco, CA', link: 'https://dac.com/2026',
      timeline: [{ deadline: '2025-11-18 17:00:00' }]
    },
    {
      year: 2027, id: 'dac27', opening: '2027-07-11 08:00:00', timezone: 'UTC-8',
      date: 'July 11-14, 2027', place: 'San Jose, CA', link: 'https://dac.com/2027',
      timeline: [{ abstract_deadline: '2026-11-11 17:00:00', deadline: '2026-11-18 17:00:00' }]
    }
  ]
}];

test('pickCcfddlEdition 选择尚未举行的下一届', () => {
  const picked = pickCcfddlEdition(ccfFixture[0], '2026-10-29');
  assert.equal(picked.year, 2027);
});

test('parseCcfddl 输出摘要与论文两条截止', () => {
  const { updates, missing } = parseCcfddl(ccfFixture, '2026-10-29');
  assert.equal(missing.length, 9);
  const dac = updates.dac;
  assert.equal(dac.edition, 2027);
  assert.equal(dac.place, 'San Jose, CA');
  assert.equal(dac.startDate, '2027-07-11');
  assert.deepEqual(dac.deadlines.map(d => [d.label, d.date, d.tz]), [
    ['摘要', '2026-11-11', 'UTC-8'],
    ['论文', '2026-11-18', 'UTC-8']
  ]);
});

test('ISSCC 解析:取 Submission deadline 后的第一个日期', () => {
  const text = 'Key Dates Submission deadline Submission Website opens Notice of acceptance Wednesday, September 9, 2026 \u00b7 3:00 PM EDT July 1, 2026 October 21, 2026';
  const parsed = parseIsscc(text);
  assert.equal(parsed.deadlines[0].date, '2026-09-09');
  assert.equal(parsed.deadlines[0].tz, 'UTC-4');
});

test('CICC 解析:FIRM Deadline', () => {
  const parsed = parseCicc('Regular Paper Submission FIRM Deadline: 16 November 2026 2027 IEEE Custom Integrated Circuits Conference');
  assert.equal(parsed.deadlines[0].date, '2026-11-16');
  assert.equal(parsed.deadlines[0].tz, 'UTC-8');
});

test('A-SSCC 解析:投稿系统页的 UTC 偏移', () => {
  const parsed = parseAsscc('Important Deadlines: Paper submission deadline: Jun 14, 2026 23:59 (UTC -0500) Paper submission deadline: CLOSED');
  assert.equal(parsed.deadlines[0].date, '2026-06-14');
  assert.equal(parsed.deadlines[0].tz, 'UTC-5');
});

test('ESSERC 与 VLSI 解析', () => {
  assert.equal(parseEsserc('Papers submission deadline April 2, 2027 BEST PAPER AWARDS').deadlines[0].date, '2027-04-02');
  const vlsi = parseVlsi('Important Dates January 25, 2027 Paper Submission Deadline 11:59 P.M. JST');
  assert.equal(vlsi.deadlines[0].date, '2027-01-25');
  assert.equal(vlsi.deadlines[0].tz, 'UTC+9');
});

test('官网页面结构变化时返回 null 而不是猜日期', () => {
  assert.equal(parseIsscc('completely different page'), null);
  assert.equal(parseCicc('no deadline here'), null);
  assert.equal(parseVlsi('nothing'), null);
});

const casFixture = [
  '### Call For Papers',
  '### [Adaptive Reliability in Circuits and Systems](https://ieee-cas.org/files/a.pdf)  Deadline  Deadline:1 Nov 2026      ',
  '### [JETCAS CFP: Power Circuits and Systems](https://ieee-cas.org/files/b.pdf)  Deadline  Deadline:1 Mar 2027',
  '### Recent Past Call Documents:',
  '### [Expired Call](https://ieee-cas.org/files/c.pdf)  Deadline: 29 Aug 2026'
].join('\n');

test('期刊专刊解析:只取 Recent Past 之前,并去掉 JETCAS CFP 前缀', () => {
  const parsed = parseCasJournal(casFixture);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.items.map(i => [i.title, i.deadline]), [
    ['Adaptive Reliability in Circuits and Systems', '2026-11-01'],
    ['Power Circuits and Systems', '2027-03-01']
  ]);
});

test('期刊专刊解析:明确无开放专刊时返回空列表且 ok', () => {
  const parsed = parseCasJournal('Call For Papers\nNo current call documents available.');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.items, []);
});

test('期刊专刊解析:结构不认识时 ok 为 false', () => {
  const parsed = parseCasJournal('some unrelated page');
  assert.equal(parsed.ok, false);
});

test('CEDA 期刊页:过滤过期条目与行政类公告', () => {
  const md = [
    'Call For Papers',
    '### [TCAD CFP: Compiler Frameworks](https://ieee-ceda.org/files/a.pdf)  Deadline: 15 Dec 2020',
    '### [IEEE TCAD: Call for Nominations for EiC](https://ieee-ceda.org/post/x)  Deadline: 15 Jul 2025',
    '### [TCAD CFP: Active Topic](https://ieee-ceda.org/files/b.pdf)  Deadline: 15 Dec 2026'
  ].join('\n');
  const parsed = parseCedaJournal(md, '2026-10-29');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.items.map(i => [i.title, i.deadline]), [['Active Topic', '2026-12-15']]);
});

function sampleData() {
  return {
    meta: { lastUpdated: '2026-10-28', ccfEdition: 'CCF 第七版' },
    conferences: [{
      id: 'dac', edition: 2027, status: 'confirmed', place: '旧地点',
      startDate: '2027-07-11', endDate: '2027-07-14', checked: '2026-10-28',
      deadlines: [{ label: '论文', date: '2026-11-18', tz: 'UTC-8', note: '' }]
    }],
    journals: [{
      id: 'jetcas', checked: '2026-10-28', note: '旧备注',
      specialIssues: [{ title: 'Power Circuits and Systems', topics: ['低功耗'], deadline: '2027-03-01', tz: 'AoE', link: 'https://old', source: 'https://old', checked: '2026-10-28', note: '需 75% 工业界' }]
    }]
  };
}

test('applyUpdates 覆盖可抓字段并刷新核对日期', () => {
  const pack = {
    conferences: { dac: { edition: 2027, deadlines: [{ label: '论文', date: '2026-11-20', tz: 'UTC-8', note: '' }], place: 'San Jose, CA' } },
    journals: {}
  };
  const { data, applied } = applyUpdates(sampleData(), pack, '2026-10-29');
  const dac = data.conferences[0];
  assert.equal(dac.deadlines[0].date, '2026-11-20');
  assert.equal(dac.place, 'San Jose, CA');
  assert.equal(dac.checked, '2026-10-29');
  assert.equal(data.meta.lastUpdated, '2026-10-29');
  assert.deepEqual(applied.conferences, ['dac']);
});

test('applyUpdates 的 soft 更新只补地点,不覆盖已有值', () => {
  const pack = {
    conferences: {
      dac: {
        edition: 2027, soft: true, place: 'San Jose, CA',
        startDate: '2027-07-11', endDate: '2027-07-14',
        deadlines: [{ label: '论文', date: '2026-11-20', tz: 'UTC-8', note: '' }]
      }
    },
    journals: {}
  };
  const { data } = applyUpdates(sampleData(), pack, '2026-10-29');
  assert.equal(data.conferences[0].place, '旧地点');
  assert.equal(data.conferences[0].startDate, '2027-07-11');
  assert.equal(data.conferences[0].deadlines[0].date, '2026-11-20');
});

test('applyUpdates 遇到届次不一致时跳过', () => {
  const pack = { conferences: { dac: { edition: 2028, deadlines: [{ label: '论文', date: '2027-11-20', tz: 'UTC-8', note: '' }] } }, journals: {} };
  const { data, applied } = applyUpdates(sampleData(), pack, '2026-10-29');
  assert.equal(data.conferences[0].deadlines[0].date, '2026-11-18');
  assert.equal(data.conferences[0].checked, '2026-10-28');
  assert.equal(applied.skipped.length, 1);
  assert.equal(data.meta.lastUpdated, '2026-10-28');
});

test('applyUpdates 在抓取为空时不覆盖旧数据', () => {
  const pack = { conferences: { dac: { edition: 2027, deadlines: [] } }, journals: {} };
  const { data } = applyUpdates(sampleData(), pack, '2026-10-29');
  assert.equal(data.conferences[0].deadlines[0].date, '2026-11-18');
});

test('applyUpdates 合并专刊时保留人工维护的主题与备注', () => {
  const pack = {
    conferences: {},
    journals: { jetcas: { ok: true, source: 'https://ieee-cas.org/publication/JETCAS', items: [{ title: 'Power Circuits and Systems', deadline: '2027-03-15', tz: 'AoE', link: 'https://ieee-cas.org/files/b.pdf' }] } }
  };
  const { data } = applyUpdates(sampleData(), pack, '2026-10-29');
  const si = data.journals[0].specialIssues[0];
  assert.equal(si.deadline, '2027-03-15');
  assert.equal(si.link, 'https://ieee-cas.org/files/b.pdf');
  assert.deepEqual(si.topics, ['低功耗']);
  assert.equal(si.note, '需 75% 工业界');
  assert.equal(data.journals[0].checked, '2026-10-29');
  assert.equal(data.journals[0].note, undefined);
});

test('applyUpdates 在期刊抓取失败时完全不动', () => {
  const pack = { conferences: {}, journals: { jetcas: { ok: false, items: [] } } };
  const { data } = applyUpdates(sampleData(), pack, '2026-10-29');
  assert.equal(data.journals[0].specialIssues[0].deadline, '2027-03-01');
  assert.equal(data.journals[0].note, '旧备注');
  assert.equal(data.journals[0].checked, '2026-10-28');
});
