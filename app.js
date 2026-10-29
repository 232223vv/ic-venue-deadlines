(function () {
  const DATA = window.DATA;
  const Lib = window.Lib;

  const GROUP_LABEL = { eda: 'EDA / 设计自动化', circuits: '电路 / 器件', arch: '体系结构' };
  const BADGE_LABEL = { eda: 'EDA', circuits: '电路', arch: '架构' };
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

  function conferenceRows(now) {
    return DATA.conferences.map(function (c) {
      const d = Lib.nextOf(c.deadlines, now);
      return {
        id: c.id,
        kind: 'conference',
        title: c.abbr + (c.edition ? ' ' + c.edition : ''),
        subtitle: c.name,
        group: c.group,
        ccf: c.ccf,
        place: c.place || '',
        when: '',
        dates: c.startDate ? (c.endDate ? c.startDate + ' – ' + c.endDate : c.startDate) : '',
        days: d.next ? d.next.days : null,
        deadlineLabel: d.next ? d.next.label + ' · ' + d.next.date + ' ' + d.next.tz : '',
        deadlines: d.items,
        topics: c.topics || [],
        note: c.note || '',
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
          subtitle: j.abbr + ' 专刊 · 滚动投稿',
          group: 'journal',
          ccf: j.ccf,
          place: j.publisher || '',
          when: '',
          days: days,
          deadlineLabel: '截稿 ' + si.deadline + ' ' + (si.tz || 'AoE'),
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
    if (r.group !== 'journal') badges.appendChild(badge(BADGE_LABEL[r.group] || r.group, { class: 'badge group' }));
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
    inner.inert = !expanded;

    if (r.topics.length) {
      const chips = el('div', 'chips');
      r.topics.forEach(function (t) { chips.appendChild(el('span', 'chip', t)); });
      body.appendChild(chips);
    }

    if (r.note) body.appendChild(el('p', 'row-note', '备注:' + r.note));

    if (r.dates) {
      const line = el('p', 'deadline');
      line.appendChild(el('b', '', '会期'));
      line.appendChild(el('span', '', r.dates));
      body.appendChild(line);
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
    const total = state.view === 'conferences'
      ? rows.length
      : rows.filter(function (r) { return r.days !== null && r.days >= 0; }).length;
    const noun = state.view === 'conferences'
      ? '共收录 ' + total + ' 个会场'
      : '共 ' + total + ' 个开放专刊';
    statEl.textContent = '最近 30 天有 ' + soon + ' 个截止 · ' + noun;
  }

  function render() {
    const now = new Date();
    const rows = state.view === 'conferences' ? conferenceRows(now) : journalRows(now);
    const filtered = Lib.sortRows(Lib.filterRows(rows, state));

    listEl.textContent = '';

    const upcoming = filtered.filter(function (r) { return r.days !== null && r.days >= 0; });
    const tbd = filtered.filter(function (r) { return r.days === null; });
    const ended = filtered.filter(function (r) { return r.days !== null && r.days < 0; });

    let silent = [];

    if (state.view === 'conferences') {
      GROUP_ORDER.forEach(function (g) {
        const items = upcoming.filter(function (r) { return r.group === g; });
        if (items.length) listEl.appendChild(section(GROUP_LABEL[g], items));
      });
    } else {
      if (upcoming.length) listEl.appendChild(section('开放中的专刊', upcoming));

      silent = DATA.journals.filter(function (j) {
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
          const head = el('div', 'row-head row-head-static');
          const main = el('span', 'row-main');
          main.appendChild(el('span', 'row-title', j.abbr));
          main.appendChild(el('span', 'row-sub', j.name));
          const metaText = [j.note, j.rolling ? '滚动投稿' : '', j.checked ? '核对 ' + j.checked : '']
            .filter(Boolean).join(' · ');
          main.appendChild(el('span', 'row-meta', metaText));
          const links = el('span', 'row-links');
          const site = el('a', '', '官网');
          site.href = j.url;
          site.target = '_blank';
          site.rel = 'noopener noreferrer';
          links.appendChild(site);
          main.appendChild(links);
          head.appendChild(main);
          const count = el('span', 'count tbd');
          count.appendChild(el('span', 'count-num', '无'));
          head.appendChild(count);
          row.appendChild(head);
          list.appendChild(row);
        });
        sec.appendChild(list);
        listEl.appendChild(sec);
      }
    }

    if (tbd.length) listEl.appendChild(section('待公布', tbd));
    if (ended.length) listEl.appendChild(section('已结束', ended, true));

    emptyEl.hidden = filtered.length > 0 || silent.length > 0;
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
    if (!id) return;
    const open = state.expanded.has(id);
    if (open) state.expanded.delete(id); else state.expanded.add(id);
    const nowExpanded = !open;
    row.setAttribute('data-expanded', String(nowExpanded));
    head.setAttribute('aria-expanded', String(nowExpanded));
    const inner = row.querySelector('.row-body-inner');
    if (inner) inner.inert = !nowExpanded;
  });

  render();
  setInterval(render, 30 * 60 * 1000);
})();
