# 会场截止日期追踪页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个零构建的静态单页,按截止日期展示 15 个会议与 9 个期刊的开放专刊,含主题、地点、倒计时与来源。

**Architecture:** `data.js` 存结构化数据并以 `window.DATA` 暴露;`lib.js` 只放可单测的纯函数(时区、倒计时、筛选、排序);`app.js` 只做 DOM 渲染与事件;`style.css` 承载 Apple 风格 token。测试跑在 Node 内置 `node:test` 上,页面本身无构建步骤。

**Tech Stack:** 原生 HTML / CSS / JavaScript(ES2017 语法,无模块化),Node 24 内置 `node --test`。

**Spec:** `docs/superpowers/specs/2026-10-28-venue-deadline-tracker-design.md`

## Global Constraints

- 零构建:不引入框架、不引 CDN、不产生 npm 依赖;`node_modules/` 不得出现。
- 数据只能经 `window.DATA`(`data.js`)进入页面,禁止 `fetch()` 读 JSON(`file://` 下会被 CORS 拦截)。
- 日期一律 ISO 8601(`YYYY-MM-DD`);时区字段只允许 `AoE` 或 `UTC±H`;查不到就是 `tbd`,**禁止推测日期**。
- 每条记录必须带 `source` 与 `checked`。
- 视觉 token 取自 spec 第 6 节,不得自行加渐变、emoji、图标字体。
- 提交身份固定用一次性参数,不写 git config:
  `git -c user.name="232223vv" -c user.email="232223vv@users.noreply.github.com" commit -m "..."`
- 提交信息用 conventional commits(`feat:` / `test:` / `chore:` / `docs:`)。

## 文件结构

| 文件 | 职责 |
|---|---|
| `index.html` | 页面骨架:吸顶导航、Hero、分段控件、筛选行、列表容器、空状态 |
| `style.css` | Apple 风格 token 与全部组件样式 |
| `lib.js` | 纯函数:`offsetHours` / `dateInTz` / `daysLeft` / `urgency` / `countdownLabel` / `filterRows` / `sortRows` |
| `data.js` | `meta` + `conferences[15]` + `journals[9]`,同时挂 `window.DATA` 与 `module.exports` |
| `app.js` | 行模型构建、筛选状态、渲染、展开交互 |
| `test/logic.test.js` | 纯函数单测 |
| `test/data.test.js` | 数据契约校验 |

---

### Task 1: 日期与倒计时纯函数

**Files:**
- Create: `lib.js`
- Test: `test/logic.test.js`

**Interfaces:**
- Produces:
  - `offsetHours(tz: string): number`
  - `dateInTz(now: Date, tz: string): string` — 返回 `YYYY-MM-DD`
  - `daysLeft(iso: string, tz: string, now?: Date): number`
  - `urgency(days: number|null): 'ended'|'urgent'|'soon'|'normal'|'tbd'`
  - `countdownLabel(days: number|null): string`

- [ ] **Step 1: 写失败测试**

`test/logic.test.js`:

```js
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
  const now = new Date('2026-11-20T04:00:00Z');
  assert.equal(Lib.daysLeft('2026-11-17', 'AoE', now), -3);
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/`
Expected: FAIL — `Cannot find module '../lib.js'`

- [ ] **Step 3: 实现 lib.js 的日期部分**

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/`
Expected: PASS,6 个测试全绿

- [ ] **Step 5: 提交**

```bash
git add lib.js test/logic.test.js
git -c user.name="232223vv" -c user.email="232223vv@users.noreply.github.com" commit -m "feat: add date and countdown helpers"
```

---

### Task 2: 筛选与排序纯函数

**Files:**
- Modify: `lib.js`(在 `Lib` 对象里追加两个方法)
- Modify: `test/logic.test.js`

**Interfaces:**
- Consumes: `urgency` / `daysLeft`(无直接调用)
- Produces:
  - `filterRows(rows: Row[], state: {view, group, ccf, window, q}): Row[]`
  - `sortRows(rows: Row[]): Row[]`
  - `Row = { group: string, ccf: string|null, days: number|null, haystack: string }`

- [ ] **Step 1: 追加失败测试**

在 `test/logic.test.js` 末尾追加:

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/`
Expected: FAIL — `Lib.filterRows is not a function`

- [ ] **Step 3: 实现**

在 `lib.js` 的 `Lib` 对象前加入:

```js
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
```

并在 `Lib` 对象里追加 `filterRows: filterRows, sortRows: sortRows`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/`
Expected: PASS,9 个测试全绿

- [ ] **Step 5: 提交**

```bash
git add lib.js test/logic.test.js
git -c user.name="232223vv" -c user.email="232223vv@users.noreply.github.com" commit -m "feat: add filter and sort helpers"
```

---

### Task 3: 数据契约 + 会议数据(15 条)

**Files:**
- Create: `data.js`
- Create: `test/data.test.js`

**Interfaces:**
- Produces: `window.DATA = { meta, conferences, journals }`,形状见 spec 第 3 节。

**采集规则(硬性):**
- 只收录**下一个尚未举行的 edition**。若该 edition 的截止日期未公布:`status: "tbd"`、`deadlines: []`、`place: ""`、`startDate: ""`,并把查到的最新信息写进 `note`。
- 每个会场至少打开一次官方站点确认,不得只抄第三方日历。
- `tz` 优先取官网原文(常见 `AoE`、`UTC-8`、`UTC-7`、`UTC+8`)。
- 2026-10-28 之前的时间点不要让旧 edition 冒充新版。

**取数入口:**

| id | 官网 |
|---|---|
| dac | https://dac.com |
| iccad | https://iccad.com |
| date | https://date-conference.com |
| aspdac | https://aspdac.com |
| iccd | https://iccd-conf.com |
| isscc | https://isscc.org |
| cicc | https://ieee-cicc.org |
| asscc | https://a-sscc2026.org(按年换域名) |
| esserc | 检索 `ESSERC 2027`,别名 `ESSCIRC / ESSDERC / ESSCC` |
| vlsisymp | https://vlsisymposium.org |
| iscas | 按年建站,检索 `IEEE ISCAS 2027` |
| isca | https://iscaconf.org |
| micro | https://microarch.org |
| hpca | https://hpca-conf.org |
| asplos | https://asplos-conference.org |

- [ ] **Step 1: 写数据契约测试**

`test/data.test.js`:

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/`
Expected: FAIL — `Cannot find module '../data.js'`

- [ ] **Step 3: 建 data.js 骨架**

```js
(function (global) {
  const DATA = {
    meta: {
      lastUpdated: '2026-10-28',
      ccfEdition: 'CCF 第七版(2026-03-31)'
    },
    conferences: [],
    journals: []
  };

  global.DATA = DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: 按上表逐个会场核实并填入 15 条**

写入格式示例(**所有 `<...>` 都是占位符,契约测试会拒绝它们,采集时必须替换为官网原文**):

```js
    conferences: [
      {
        id: 'dac',
        name: 'Design Automation Conference',
        abbr: 'DAC',
        aliases: [],
        group: 'eda',
        society: 'ACM SIGDA / IEEE CEDA',
        ccf: 'A',
        edition: 2027,
        startDate: '<YYYY-MM-DD>',
        endDate: '<YYYY-MM-DD>',
        place: '<官网原文地点>',
        deadlines: [
          { label: '摘要', date: '<YYYY-MM-DD>', tz: 'AoE', note: '' }
        ],
        topics: ['<官网原文主题>'],
        url: 'https://dac.com',
        source: '<官网 CFP 页 URL>',
        checked: '2026-10-28',
        status: 'confirmed'
      }
    ],
```

`startDate` / `place` / `deadline.date` 全部以官网原文为准;官网写 "TBD" 的填 `tbd` 状态,不要估算。

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test test/`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add data.js test/data.test.js
git -c user.name="232223vv" -c user.email="232223vv@users.noreply.github.com" commit -m "feat: add conference data and contract tests"
```

---

### Task 4: 期刊专刊数据(9 条)

**Files:**
- Modify: `data.js`

**采集规则:**
- 每个期刊先看出版社官方 Call for Papers 页,再确认专刊页面的截止日期。
- 只收**当前仍开放**的专刊;已过期的不要收录(`specialIssues` 只放未来截止)。
- 一个开放专刊都没有的期刊,`specialIssues: []` 即可,页面会折叠显示"暂无开放专刊"。
- 无专刊时 `checked` 也要更新,表示"今天查过,确实没有"。

**取数入口:**

| id | 期刊 | 入口 |
|---|---|---|
| tcad | IEEE TCAD | https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=43 + 检索 `TCAD special issue call for papers` |
| tvlsi | IEEE TVLSI | https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=92 |
| tcas1 | IEEE TCAS-I | https://ieee-cas.org(Publications → TCAS-I → Calls for Papers) |
| tcas2 | IEEE TCAS-II | https://ieee-cas.org(Publications → TCAS-II → Calls for Papers) |
| todaes | ACM TODAES | https://dl.acm.org/journal/todaes |
| tecs | ACM TECS | https://dl.acm.org/journal/tecs |
| dt | IEEE Design & Test | https://www.computer.org/csdl/magazine/dt |
| jetcas | IEEE JETCAS | 检索 `IEEE JETCAS special issue call for papers` |
| ojcas | IEEE OJCAS | https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=8782706 |

- [ ] **Step 1: 填入 9 个期刊条目**

```js
    journals: [
      {
        id: 'tcad',
        name: 'IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems',
        abbr: 'IEEE TCAD',
        publisher: 'IEEE',
        ccf: 'A',
        rolling: true,
        url: 'https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=43',
        specialIssues: [
          {
            title: '专刊标题原文',
            topics: ['主题1', '主题2'],
            deadline: '2026-12-15',
            tz: 'AoE',
            link: 'https://...',
            source: 'https://...',
            checked: '2026-10-28'
          }
        ]
      }
    ]
```

- [ ] **Step 2: 跑契约测试**

Run: `node --test test/`
Expected: PASS(若失败,按报错补字段,不要放宽测试)

- [ ] **Step 3: 提交**

```bash
git add data.js
git -c user.name="232223vv" -c user.email="232223vv@users.noreply.github.com" commit -m "feat: add journal special issue data"
```

---

### Task 5: 页面骨架与 Apple 风格样式

**Files:**
- Create: `index.html`
- Create: `style.css`

- [ ] **Step 1: 写 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>投稿日历 · IC / EDA / 体系结构</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="site-header">
  <div class="wrap header-inner">
    <span class="brand">投稿日历</span>
    <span class="meta" id="lastUpdated"></span>
  </div>
</header>

<main class="wrap">
  <section class="hero">
    <h1>下一次截止,还有几天。</h1>
    <p class="sub">IC 设计 · EDA · 体系结构　会议与期刊专刊</p>
    <p class="stat" id="statLine"></p>
  </section>

  <div class="toolbar">
    <div class="segmented" role="group" aria-label="视图" data-filter="view">
      <button type="button" data-value="conferences" aria-pressed="true">会议</button>
      <button type="button" data-value="journals" aria-pressed="false">期刊专刊</button>
    </div>
    <label class="search">
      <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <path d="M10.8 10.8L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
      <input id="q" type="search" placeholder="搜索会场、主题" autocomplete="off">
    </label>
  </div>

  <div class="filters">
    <div class="segmented" role="group" aria-label="方向" data-filter="group" id="groupFilter">
      <button type="button" data-value="all" aria-pressed="true">全部</button>
      <button type="button" data-value="eda" aria-pressed="false">EDA</button>
      <button type="button" data-value="circuits" aria-pressed="false">电路</button>
      <button type="button" data-value="arch" aria-pressed="false">架构</button>
    </div>
    <div class="segmented" role="group" aria-label="等级" data-filter="ccf">
      <button type="button" data-value="all" aria-pressed="true">全部等级</button>
      <button type="button" data-value="A" aria-pressed="false">A</button>
      <button type="button" data-value="B" aria-pressed="false">B</button>
      <button type="button" data-value="C" aria-pressed="false">C</button>
      <button type="button" data-value="none" aria-pressed="false">目录外</button>
    </div>
    <div class="segmented" role="group" aria-label="时间窗" data-filter="window">
      <button type="button" data-value="all" aria-pressed="true">全部</button>
      <button type="button" data-value="30" aria-pressed="false">30 天</button>
      <button type="button" data-value="90" aria-pressed="false">90 天</button>
      <button type="button" data-value="180" aria-pressed="false">180 天</button>
    </div>
  </div>

  <div id="list"></div>
  <p class="empty" id="empty" hidden>没有符合当前条件的会场,放宽筛选再试。</p>

  <footer class="footnote">
    数据取自各会场官网与出版社页面,核对日期见页首;查不到的日期标记为“待公布”,不做推测。
  </footer>
</main>

<script src="data.js"></script>
<script src="lib.js"></script>
<script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写 style.css**

```css
:root {
  --bg: #ffffff;
  --bg-2: #f5f5f7;
  --text: #1d1d1f;
  --text-2: #6e6e73;
  --text-3: #86868b;
  --accent: #0071e3;
  --hairline: rgba(0, 0, 0, 0.10);
  --red: #ff3b30;
  --orange: #ff9500;
  --indigo: #5856d6;
  --teal: #30b0c7;
  --gray: #86868b;
  --radius-lg: 20px;
  --radius-pill: 980px;
  --shadow-rest: 0 2px 8px rgba(0, 0, 0, 0.04);
  --dur: 240ms;
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC",
          "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --maxw: 860px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 17px/1.47 var(--font);
  -webkit-font-smoothing: antialiased;
}

.wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 40px; }

/* 吸顶毛玻璃 */
.site-header {
  position: sticky; top: 0; z-index: 10;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--hairline);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .site-header { background: rgba(255, 255, 255, 0.94); }
}
.header-inner {
  display: flex; align-items: center; justify-content: space-between;
  height: 52px;
}
.brand { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.meta { font-size: 12px; color: var(--text-3); }

/* Hero */
.hero { padding: 64px 0 8px; }
.hero h1 {
  margin: 0; font-size: 48px; line-height: 1.1;
  font-weight: 600; letter-spacing: -0.02em;
}
.hero .sub { margin: 12px 0 0; color: var(--text-2); }
.hero .stat { margin: 20px 0 0; font-size: 14px; color: var(--text-3); }

/* 工具条 */
.toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; margin: 40px 0 0; flex-wrap: wrap;
}

.segmented {
  display: inline-flex; gap: 2px; padding: 3px;
  background: var(--bg-2); border-radius: var(--radius-pill);
}
.segmented button {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  padding: 7px 16px; border-radius: var(--radius-pill);
  font: 500 14px/1 var(--font); color: var(--text-2);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.segmented button[aria-pressed="true"] {
  background: #fff; color: var(--text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.10);
}

.search {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: var(--radius-pill);
  background: var(--bg-2); color: var(--text-3);
}
.search input {
  border: 0; background: transparent; outline: none;
  font: 400 14px/1 var(--font); color: var(--text); width: 168px;
}

.filters { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0 0; }

/* 分组列表 */
.group { margin: 36px 0 0; }
.group > h2, .group > summary {
  font-size: 12px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--text-3);
  margin: 0 0 10px 16px;
}
details.group > summary { cursor: pointer; list-style: none; }
details.group > summary::-webkit-details-marker { display: none; }
details.group > summary::after { content: " ▾"; }
.row-list {
  background: #fff; border-radius: var(--radius-lg);
  box-shadow: var(--shadow-rest); overflow: hidden;
}

/* 行 */
.row + .row { border-top: 1px solid var(--hairline); }
.row-head {
  display: flex; align-items: center; gap: 18px; width: 100%;
  padding: 18px 20px; border: 0; background: none; cursor: pointer;
  text-align: left; font: inherit; color: inherit;
  transition: background var(--dur) var(--ease);
}
.row-head:hover { background: rgba(0, 0, 0, 0.015); }
.row-main { flex: 1; min-width: 0; }
.row-title { display: block; font-weight: 600; letter-spacing: -0.01em; }
.row-sub { display: block; font-size: 13px; color: var(--text-3); margin-top: 2px; }
.row-meta { display: block; font-size: 13px; color: var(--text-2); margin-top: 6px; }

.count { text-align: right; min-width: 84px; }
.count-num {
  display: block; font-size: 26px; font-weight: 600; letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.count-cap { display: block; font-size: 11px; color: var(--text-3); margin-top: 2px; }
.count.urgent .count-num { color: var(--red); }
.count.soon .count-num { color: var(--orange); }
.count.ended .count-num { color: var(--text-3); font-size: 18px; }
.count.tbd .count-num { color: var(--text-3); font-size: 16px; }

/* 徽章 */
.badges { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; width: 74px; }
.badge {
  display: inline-block; padding: 3px 9px; border-radius: var(--radius-pill);
  font-size: 11px; font-weight: 500; line-height: 1.3; color: var(--gray);
  background: rgba(134, 134, 139, 0.12);
}
.badge[data-ccf="A"] { color: var(--accent); background: rgba(0, 113, 227, 0.10); }
.badge[data-ccf="B"] { color: var(--indigo); background: rgba(88, 86, 214, 0.10); }
.badge[data-ccf="C"] { color: var(--teal); background: rgba(48, 176, 199, 0.12); }
.badge.group { color: var(--text-2); background: rgba(0, 0, 0, 0.05); }

/* 展开体 */
.row-body-wrap {
  display: grid; grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur) var(--ease);
}
.row[data-expanded="true"] .row-body-wrap { grid-template-rows: 1fr; }
.row-body-inner { overflow: hidden; }
.row-body { padding: 0 20px 20px; font-size: 14px; color: var(--text-2); }

.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; }
.chip {
  padding: 4px 10px; border-radius: var(--radius-pill);
  background: var(--bg-2); font-size: 12px; color: var(--text-2);
}

.deadline { display: flex; gap: 10px; font-size: 13px; margin: 0 0 6px; }
.deadline b { font-weight: 500; color: var(--text); min-width: 56px; }
.deadline .tz { color: var(--text-3); }

.row-links { display: flex; gap: 16px; margin-top: 14px; font-size: 13px; }
.row-links a { color: var(--accent); text-decoration: none; }
.row-links a:hover { text-decoration: underline; }
.checked { margin-top: 10px; font-size: 12px; color: var(--text-3); }

/* 空状态与页脚 */
.empty { padding: 64px 0; text-align: center; color: var(--text-3); }
.footnote {
  margin: 64px 0 48px; padding-top: 20px;
  border-top: 1px solid var(--hairline);
  font-size: 12px; color: var(--text-3);
}

/* 焦点与减弱动效 */
:focus-visible { outline: 3px solid rgba(0, 113, 227, 0.4); outline-offset: 2px; border-radius: 6px; }
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}

/* 响应式 */
@media (max-width: 640px) {
  .wrap { padding: 0 20px; }
  .hero { padding-top: 40px; }
  .hero h1 { font-size: 34px; }
  .row-head { gap: 12px; padding: 16px; flex-wrap: wrap; }
  .badges { flex-direction: row; width: 100%; }
  .count { min-width: 64px; }
  .count-num { font-size: 22px; }
  .search input { width: 120px; }
}
```

- [ ] **Step 3: 浏览器打开确认骨架**

用浏览器打开 `index.html`(此时 `app.js` 还不存在,列表为空是正常的):
Run: `open index.html`
Expected: 白底、吸顶导航、Hero 标题、三个分段控件、搜索框都在;无横向滚动。

- [ ] **Step 4: 提交**

```bash
git add index.html style.css
git -c user.name="232223vv" -c user.email="232223vv@users.noreply.github.com" commit -m "feat: add page shell with apple-style design tokens"
```

---

### Task 6: 渲染与交互

**Files:**
- Create: `app.js`
- Modify: `index.html`(无,脚本已在 Task 5 引入)

**Interfaces:**
- Consumes: `window.DATA`、`window.Lib` 的全部导出

- [ ] **Step 1: 写 app.js**

```js
(function () {
  const DATA = window.DATA;
  const Lib = window.Lib;

  const GROUP_LABEL = { eda: 'EDA / 设计自动化', circuits: '电路 / 器件', arch: '体系结构' };
  const GROUP_ORDER = ['eda', 'circuits', 'arch'];

  const state = {
    view: 'conferences',
    group: 'all',
    ccf: 'all',
    window: 'all',
    q: '',
    expanded: new Set()
  };

  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const statEl = document.getElementById('statLine');
  const updatedEl = document.getElementById('lastUpdated');
  const groupFilter = document.getElementById('groupFilter');

  function nextOf(deadlines, now) {
    const items = deadlines.map(function (d) {
      return {
        label: d.label,
        date: d.date,
        tz: d.tz,
        note: d.note || '',
        days: Lib.daysLeft(d.date, d.tz, now)
      };
    });
    const upcoming = items.filter(function (d) { return d.days >= 0; })
      .sort(function (a, b) { return a.days - b.days; });
    return { next: upcoming[0] || null, items: items.slice().sort(function (a, b) { return a.days - b.days; }) };
  }

  function conferenceRows(now) {
    return DATA.conferences.map(function (c) {
      const d = nextOf(c.deadlines, now);
      return {
        id: c.id,
        kind: 'conference',
        title: c.abbr + (c.edition ? ' ' + c.edition : ''),
        subtitle: c.name,
        group: c.group,
        ccf: c.ccf,
        place: c.place || '',
        when: c.startDate ? (c.endDate ? c.startDate + ' – ' + c.endDate : c.startDate) : '',
        days: d.next ? d.next.days : null,
        deadlineLabel: d.next ? d.next.label + ' · ' + d.next.date + ' ' + d.next.tz : '',
        deadlines: d.items,
        topics: c.topics || [],
        links: [{ label: '官网', href: c.url }, { label: '来源', href: c.source }],
        checked: c.checked,
        haystack: [c.abbr, c.name, (c.aliases || []).join(' '), c.place || '', (c.topics || []).join(' ')]
          .join(' ').toLowerCase()
      };
    });
  }

  function journalRows(now) {
    const rows = [];
    DATA.journals.forEach(function (j) {
      (j.specialIssues || []).forEach(function (si, i) {
        const days = Lib.daysLeft(si.deadline, si.tz || 'AoE', now);
        rows.push({
          id: j.id + '-si-' + i,
          kind: 'journal',
          title: si.title,
          subtitle: j.abbr + ' 专刊',
          group: 'journal',
          ccf: j.ccf,
          place: j.publisher || '',
          when: '截稿 ' + si.deadline,
          days: days,
          deadlineLabel: si.deadline + ' ' + (si.tz || 'AoE'),
          deadlines: [{ label: '专刊截稿', date: si.deadline, tz: si.tz || 'AoE', days: days, note: si.note || '' }],
          topics: si.topics || [],
          links: [{ label: '专刊页', href: si.link }, { label: '期刊主页', href: j.url }],
          checked: si.checked,
          haystack: [j.abbr, j.name, si.title, (si.topics || []).join(' ')].join(' ').toLowerCase()
        });
      });
    });
    return rows;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function badge(text, attrs) {
    const b = el('span', 'badge', text);
    Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
    return b;
  }

  function rowNode(r) {
    const row = el('article', 'row');
    row.dataset.id = r.id;
    const expanded = state.expanded.has(r.id);
    row.setAttribute('data-expanded', String(expanded));

    const head = el('button', 'row-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(expanded));

    const badges = el('span', 'badges');
    if (r.group !== 'journal') badges.appendChild(badge(GROUP_LABEL[r.group] || r.group, { class: 'badge group' }));
    badges.appendChild(badge(r.ccf ? 'CCF ' + r.ccf : '目录外', { 'data-ccf': r.ccf || 'none' }));

    const main = el('span', 'row-main');
    main.appendChild(el('span', 'row-title', r.title));
    main.appendChild(el('span', 'row-sub', r.subtitle));
    const metaText = [r.deadlineLabel, r.place, r.when].filter(Boolean).join(' · ');
    main.appendChild(el('span', 'row-meta', metaText));

    const count = el('span', 'count ' + Lib.urgency(r.days));
    count.appendChild(el('span', 'count-num', Lib.countdownLabel(r.days)));
    count.appendChild(el('span', 'count-cap', r.days === null ? '' : (r.days < 0 ? '截止已过' : '距截止')));

    head.appendChild(badges);
    head.appendChild(main);
    head.appendChild(count);

    const wrap = el('div', 'row-body-wrap');
    const inner = el('div', 'row-body-inner');
    const body = el('div', 'row-body');

    if (r.topics.length) {
      const chips = el('div', 'chips');
      r.topics.forEach(function (t) { chips.appendChild(el('span', 'chip', t)); });
      body.appendChild(chips);
    }

    r.deadlines.forEach(function (d) {
      const line = el('p', 'deadline');
      line.appendChild(el('b', '', d.label));
      line.appendChild(el('span', '', d.date));
      line.appendChild(el('span', 'tz', d.tz + (d.note ? ' · ' + d.note : '')));
      body.appendChild(line);
    });

    if (r.links.length) {
      const links = el('div', 'row-links');
      r.links.forEach(function (l) {
        const a = el('a', '', l.label);
        a.href = l.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        links.appendChild(a);
      });
      body.appendChild(links);
    }

    body.appendChild(el('p', 'checked', '核对于 ' + r.checked));
    inner.appendChild(body);
    wrap.appendChild(inner);

    row.appendChild(head);
    row.appendChild(wrap);
    return row;
  }

  function section(title, rows, collapsed) {
    const isDetails = !!collapsed;
    const sec = el(isDetails ? 'details' : 'section', 'group');
    const head = el(isDetails ? 'summary' : 'h2', '', title);
    sec.appendChild(head);
    const list = el('div', 'row-list');
    rows.forEach(function (r) { list.appendChild(rowNode(r)); });
    sec.appendChild(list);
    return sec;
  }

  function updateStat(rows) {
    const soon = rows.filter(function (r) {
      return r.days !== null && r.days >= 0 && r.days <= 30;
    }).length;
    statEl.textContent = '最近 30 天有 ' + soon + ' 个截止 · 共收录 ' + rows.length + ' 个会场';
  }

  function render() {
    const now = new Date();
    const rows = state.view === 'conferences' ? conferenceRows(now) : journalRows(now);
    const filtered = Lib.sortRows(Lib.filterRows(rows, state));

    listEl.textContent = '';

    const upcoming = filtered.filter(function (r) { return r.days !== null && r.days >= 0; });
    const tbd = filtered.filter(function (r) { return r.days === null; });
    const ended = filtered.filter(function (r) { return r.days !== null && r.days < 0; });

    if (state.view === 'conferences') {
      GROUP_ORDER.forEach(function (g) {
        const items = upcoming.filter(function (r) { return r.group === g; });
        if (items.length) listEl.appendChild(section(GROUP_LABEL[g], items));
      });
    } else {
      if (upcoming.length) listEl.appendChild(section('开放中的专刊', upcoming));

      const silent = DATA.journals.filter(function (j) {
        if ((j.specialIssues || []).length) return false;
        if (state.ccf !== 'all' && (j.ccf || 'none') !== state.ccf) return false;
        const q = (state.q || '').trim().toLowerCase();
        if (q && (j.abbr + ' ' + j.name).toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      if (silent.length) {
        const sec = el('section', 'group');
        sec.appendChild(el('h2', '', '暂无开放专刊'));
        const list = el('div', 'row-list');
        silent.forEach(function (j) {
          const row = el('div', 'row');
          const head = el('div', 'row-head');
          const main = el('span', 'row-main');
          main.appendChild(el('span', 'row-title', j.abbr));
          main.appendChild(el('span', 'row-sub', j.name));
          head.appendChild(main);
          head.appendChild(el('span', 'count tbd', '无'));
          row.appendChild(head);
          list.appendChild(row);
        });
        sec.appendChild(list);
        listEl.appendChild(sec);
      }
    }

    if (tbd.length) listEl.appendChild(section('待公布', tbd));
    if (ended.length) listEl.appendChild(section('已结束', ended, true));

    emptyEl.hidden = filtered.length > 0;
    updateStat(rows);
    updatedEl.textContent = '数据核对至 ' + DATA.meta.lastUpdated;
    groupFilter.style.display = state.view === 'conferences' ? '' : 'none';
  }

  document.querySelectorAll('[data-filter]').forEach(function (group) {
    group.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-value]');
      if (!btn) return;
      group.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      btn.setAttribute('aria-pressed', 'true');
      state[group.dataset.filter] = btn.dataset.value;
      render();
    });
  });

  document.getElementById('q').addEventListener('input', function (e) {
    state.q = e.target.value;
    render();
  });

  listEl.addEventListener('click', function (e) {
    const head = e.target.closest('.row-head');
    if (!head) return;
    const row = head.parentElement;
    const id = row.dataset.id;
    const open = state.expanded.has(id);
    if (open) state.expanded.delete(id); else state.expanded.add(id);
    row.setAttribute('data-expanded', String(!open));
    head.setAttribute('aria-expanded', String(!open));
  });

  render();
  setInterval(render, 30 * 60 * 1000);
})();
```

- [ ] **Step 2: 浏览器实点一遍**

Run: `open index.html`
检查清单:
- 三个分段控件点击后卡片立即变化
- 搜索 "dac" 只剩 DAC
- 展开行显示主题、全部 deadline、链接、核对日期
- 已结束分组默认折叠
- 切到"期刊专刊"后方向筛选消失
Expected: 全部符合;控制台无报错。

- [ ] **Step 3: 提交**

```bash
git add app.js
git -c user.name="232223vv" -c user.email="232223vv@users.noreply.github.com" commit -m "feat: render conference and special issue lists"
```

---

### Task 7: 端到端验收

**Files:** 无新增

- [ ] **Step 1: 跑全部单测**

Run: `node --test test/`
Expected: PASS,13 个测试全绿

- [ ] **Step 2: 浏览器验收(含移动端)**

用浏览器自动化(或手动)打开 `file://.../index.html`:
1. 桌面宽度截图,确认 Apple 风格:毛玻璃导航、圆角分组、发丝线、蓝色强调
2. 切到 375px 窄屏,确认无横向滚动、倒计时不换行
3. 键盘 `Tab` 走到分段控件与行,确认焦点环可见、回车可展开
4. 控制台无报错,网络面板无外部请求

Expected: 4 项全过。

- [ ] **Step 3: 数据体检**

Run: `node --test test/`
并人工抽查 3 个会场,打开其 `source` 链接确认日期与页面一致。
Expected: 一致;不一致则修数据并更新 `checked`。

- [ ] **Step 4: 推送**

```bash
git push origin main
```

Expected: 推送成功,GitHub 私有仓库可见最新提交。
