/* Dolmaro Tools · 키워드 분석 대시보드 */

const DATA_URL = 'data/latest.json';

const PRIORITY_ORDER = { '최상': 0, '상': 1, '중': 2 };

const state = {
  data: null,
  activeDisease: null,
  filters: { priority: 'all', status: 'all', search: '' },
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : '67, 56, 202';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadData() {
  try {
    const res = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (res.status === 404) {
      showEmpty();
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.data = data;
    render();
  } catch (err) {
    if (err instanceof TypeError || /Failed to fetch/i.test(err.message)) {
      showEmpty();
      return;
    }
    showError(err.message);
  }
}

function showEmpty() {
  $('#emptyState').hidden = false;
  $('#errorState').hidden = true;
  // 데이터 없을 땐 사용 방법을 자동으로 펼쳐줌
  const help = $('#helpSection');
  if (help) help.open = true;
}

function showError(msg) {
  $('#errorState').hidden = false;
  $('#errorMsg').textContent = msg;
  $('#emptyState').hidden = true;
  const help = $('#helpSection');
  if (help) help.open = true;
}

function render() {
  $('#emptyState').hidden = true;
  $('#errorState').hidden = true;

  const { data } = state;
  $('#lastRun').textContent = fmtDate(data.finished_at || data.started_at);

  const diseases = Object.entries(data.diseases || {});
  if (!diseases.length) { showEmpty(); return; }

  if (!state.activeDisease || !data.diseases[state.activeDisease]) {
    state.activeDisease = diseases[0][0];
  }

  renderTabs(diseases);
  renderDisease();
}

function renderTabs(diseases) {
  const tabs = $('#diseaseTabs');
  tabs.hidden = false;
  tabs.innerHTML = diseases.map(([label, d]) => {
    const active = label === state.activeDisease ? 'active' : '';
    const color = d.color || '#4338ca';
    const rgb = hexToRgb(color);
    const total = d.summary?.total ?? (d.results?.length ?? 0);
    return `
      <button class="disease-tab ${active}" data-disease="${label}"
              style="--disease-color:${color}; --disease-rgb:${rgb};">
        <span class="tab-label">${d.label || label}</span>
        <span class="tab-count">${total}</span>
      </button>`;
  }).join('');

  $$('.disease-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeDisease = btn.dataset.disease;
      state.filters = { priority: 'all', status: 'all', search: '' };
      $('#searchInput').value = '';
      $$('.filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === 'all');
      });
      render();
    });
  });
}

function renderDisease() {
  const d = state.data.diseases[state.activeDisease];
  if (!d) return;
  const color = d.color || '#4338ca';
  const rgb = hexToRgb(color);
  document.body.style.setProperty('--disease-color', color);
  document.body.style.setProperty('--disease-rgb', rgb);

  renderSummary(d);
  renderRecommend(d);
  renderFilterBar();
  renderTable(d);
}

function renderSummary(d) {
  const el = $('#summarySection');
  el.hidden = false;
  const s = d.summary || {};
  const rate = (s.exposure_rate || 0) * 100;
  const byPri = s.by_priority || {};
  const byCh = s.by_channel || {};
  const priLine = ['최상', '상', '중']
    .filter(p => byPri[p])
    .map(p => `${p} ${byPri[p].exposed}/${byPri[p].total}`)
    .join(' · ') || '—';
  const chLine = [
    byCh.blog ? `블로그 ${byCh.blog}` : null,
    byCh.website ? `홈페이지 ${byCh.website}` : null,
    byCh.youtube ? `유튜브 ${byCh.youtube}` : null,
    byCh.image ? `이미지 ${byCh.image}` : null,
  ].filter(Boolean).join(' · ') || '—';

  el.innerHTML = `
    <div class="summary-card accent">
      <div class="label">전체 키워드</div>
      <div class="value">${s.total ?? 0}</div>
      <div class="sub">검사 완료 ${s.checked ?? 0}</div>
    </div>
    <div class="summary-card positive">
      <div class="label">노출 성공</div>
      <div class="value">${s.exposed ?? 0}</div>
      <div class="sub">${chLine}</div>
    </div>
    <div class="summary-card warn">
      <div class="label">미노출</div>
      <div class="value">${s.not_exposed ?? 0}</div>
      <div class="sub">콘텐츠 보강 대상</div>
    </div>
    <div class="summary-card">
      <div class="label">노출률</div>
      <div class="value">${rate.toFixed(1)}%</div>
      <div class="sub">우선순위별: ${priLine}</div>
    </div>
  `;
}

function renderRecommend(d) {
  const el = $('#recommendSection');
  const list = $('#recommendList');
  el.hidden = false;

  const missing = (d.results || [])
    .filter(r => r.checked && !r.any_exposed && (r.priority === '최상' || r.priority === '상'))
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  if (!missing.length) {
    list.innerHTML = `<div class="recommend-empty">
      🎉 최상/상 우선순위 키워드가 모두 노출되고 있습니다!
    </div>`;
    return;
  }

  const top = missing.slice(0, 12);
  list.innerHTML = top.map(r => `
    <li class="recommend-item">
      <span class="kw">${escapeHtml(r.keyword)}</span>
      <span class="pri-tag">${r.priority}</span>
    </li>
  `).join('');
}

function renderFilterBar() {
  $('#filterBar').hidden = false;

  $$('.filter-btn').forEach(btn => {
    if (btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener('click', () => {
      const { filter, value } = btn.dataset;
      state.filters[filter] = value;
      $$(`.filter-btn[data-filter="${filter}"]`).forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      renderTable(state.data.diseases[state.activeDisease]);
    });
  });

  const input = $('#searchInput');
  if (!input.__bound) {
    input.__bound = true;
    input.addEventListener('input', (e) => {
      state.filters.search = e.target.value.trim().toLowerCase();
      renderTable(state.data.diseases[state.activeDisease]);
    });
  }
}

function renderTable(d) {
  $('#tableSection').hidden = false;
  const tbody = $('#tableBody');
  const { priority, status, search } = state.filters;

  let rows = d.results || [];
  if (priority !== 'all') rows = rows.filter(r => r.priority === priority);
  if (status === 'exposed') rows = rows.filter(r => r.any_exposed);
  else if (status === 'not_exposed') rows = rows.filter(r => r.checked && !r.any_exposed);
  if (search) rows = rows.filter(r => r.keyword.toLowerCase().includes(search));

  rows = rows.slice().sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 9;
    const pb = PRIORITY_ORDER[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    if (a.any_exposed !== b.any_exposed) return a.any_exposed ? 1 : -1;
    return a.keyword.localeCompare(b.keyword, 'ko');
  });

  $('#resultCount').textContent = `${rows.length}개`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#94a3b8;">
      조건에 맞는 키워드가 없습니다.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const searchUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(r.keyword)}`;
    const exp = r.any_exposed ? 'O' : 'X';
    const ch = (v) => v ? `<span class="ch-cell on">●</span>` : `<span class="ch-cell">○</span>`;
    const where = (r.found_where || []).join(', ') || '—';
    return `
      <tr class="${r.any_exposed ? 'exposed' : ''}">
        <td class="kw-cell"><a href="${searchUrl}" target="_blank" rel="noopener">${escapeHtml(r.keyword)}</a></td>
        <td><span class="pri-cell pri-${r.priority}">${r.priority}</span></td>
        <td class="exp-cell exp-${exp}">${exp}</td>
        <td>${ch(r.blog)}</td>
        <td>${ch(r.website)}</td>
        <td>${ch(r.youtube)}</td>
        <td>${ch(r.image)}</td>
        <td style="color:#64748b; font-size:12px;">${escapeHtml(where)}</td>
      </tr>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

loadData();
