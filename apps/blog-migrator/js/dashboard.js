/* Dolmaro Tools · 블로그 이관 대시보드 (ireaomd.co.kr) */

const DATA_URL = 'data/posts.json';
const PAGE_SIZE = 24;

const state = {
  data: null,
  visible: PAGE_SIZE,
  search: '',
};

const $ = (sel) => document.querySelector(sel);

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

const fmtRelative = (iso) => {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}일 전`;
  return fmtDate(iso);
};

function renderStats() {
  const total = state.data?.total || 0;
  const shown = Math.min(state.visible, total);
  $('#statTotal').textContent = total.toLocaleString();
  $('#statLoaded').textContent = shown.toLocaleString();

  const gen = state.data?.generated_at;
  const lastSync = $('#lastSync');
  if (lastSync) {
    lastSync.textContent = gen ? `마지막 동기화: ${fmtRelative(gen)}` : '';
    lastSync.title = gen ? new Date(gen).toLocaleString('ko-KR') : '';
  }
}

function renderPosts() {
  const grid = $('#postGrid');
  const all = state.data?.posts || [];
  const search = state.search.trim().toLowerCase();

  const filtered = search
    ? all.filter((p) => (p.title || '').toLowerCase().includes(search) || (p.description || '').toLowerCase().includes(search))
    : all;

  const list = filtered.slice(0, state.visible);

  $('#resultCount').textContent = search
    ? `"${state.search}" 검색 결과 ${filtered.length.toLocaleString()}개 (표시 ${list.length.toLocaleString()})`
    : `${list.length.toLocaleString()}개 표시 · 전체 ${all.length.toLocaleString()}개`;

  if (list.length === 0) {
    grid.innerHTML = search
      ? `<div class="state-msg" style="grid-column: 1/-1;"><div class="state-icon">🔎</div><h2>검색 결과가 없습니다</h2><p>다른 키워드로 시도해보세요.</p></div>`
      : '';
    $('#loadMoreWrap').hidden = true;
    return;
  }

  grid.innerHTML = list.map((p) => {
    const title = p.title || '(제목 없음)';
    const link = p.link || '#';
    const date = fmtDate(p.date);
    const desc = (p.description || '').slice(0, 150);
    return `
      <a class="post-card text-only" href="${link}" target="_blank" rel="noopener" title="${title.replace(/"/g, '&quot;')}">
        <div class="post-body">
          <h3 class="post-title">${title}</h3>
          ${desc ? `<p class="post-desc">${desc}${(p.description || '').length > 150 ? '…' : ''}</p>` : ''}
          <div class="post-meta">
            <span class="post-date">📅 ${date}</span>
            <span class="post-link">원문 보기 →</span>
          </div>
        </div>
      </a>
    `;
  }).join('');

  // Load more button
  const wrap = $('#loadMoreWrap');
  const btn = $('#loadMoreBtn');
  if (state.visible >= filtered.length) {
    wrap.hidden = true;
  } else {
    wrap.hidden = false;
    btn.disabled = false;
    const remaining = filtered.length - state.visible;
    btn.textContent = `더 보기 (${Math.min(PAGE_SIZE, remaining)}개)`;
  }
}

function showError(msg) {
  $('#errorState').hidden = false;
  $('#errorMsg').textContent = msg;
  const help = $('#helpSection');
  if (help) help.open = true;
}

function showEmpty() {
  $('#emptyState').hidden = false;
  const help = $('#helpSection');
  if (help) help.open = true;
}

async function loadData() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 404) {
      showEmpty();
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    state.visible = PAGE_SIZE;
    $('#emptyState').hidden = true;
    $('#errorState').hidden = true;
    renderStats();
    renderPosts();
  } catch (err) {
    showError(`데이터를 불러오지 못했습니다: ${err.message}`);
  }
}

function bindUI() {
  $('#searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    state.visible = PAGE_SIZE;
    renderPosts();
  });
  $('#loadMoreBtn').addEventListener('click', () => {
    state.visible += PAGE_SIZE;
    renderPosts();
    renderStats();
  });
  $('#refreshBtn').addEventListener('click', async () => {
    $('#refreshBtn').disabled = true;
    await loadData();
    $('#refreshBtn').disabled = false;
  });
}

(async function init() {
  bindUI();
  await loadData();
})();
