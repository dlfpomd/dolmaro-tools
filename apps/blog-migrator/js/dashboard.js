/* Dolmaro Tools · 블로그 이관 대시보드 */

const WP_BASE = 'https://www.irea.co.kr/wp-json/wp/v2/posts';
const CATEGORY_ID = 3;
const PAGE_SIZE = 20;

const state = {
  page: 0,
  totalPages: 0,
  totalPosts: 0,
  posts: [],
  loading: false,
  search: '',
};

const $ = (sel) => document.querySelector(sel);

const decodeEntities = (() => {
  const ta = document.createElement('textarea');
  return (html) => {
    if (!html) return '';
    ta.innerHTML = html;
    return ta.value;
  };
})();

const stripHtml = (html) => {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

async function fetchPage(page = 1) {
  const url = `${WP_BASE}?categories=${CATEGORY_ID}&per_page=${PAGE_SIZE}&page=${page}&_embed=wp:featuredmedia,wp:term`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 400) return { posts: [], total: state.totalPosts, totalPages: state.totalPages };
    throw new Error(`HTTP ${res.status}`);
  }
  const total = parseInt(res.headers.get('X-WP-Total') || '0', 10);
  const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '0', 10);
  const posts = await res.json();
  return { posts, total, totalPages };
}

function renderStats() {
  $('#statTotal').textContent = state.totalPosts.toLocaleString();
  $('#statLoaded').textContent = state.posts.length.toLocaleString();
}

function renderPosts() {
  const grid = $('#postGrid');
  const search = state.search.trim().toLowerCase();

  const list = search
    ? state.posts.filter((p) => {
        const title = decodeEntities(p.title?.rendered || '').toLowerCase();
        return title.includes(search);
      })
    : state.posts;

  $('#resultCount').textContent = search
    ? `"${state.search}" 검색 결과 ${list.length}개 (전체 ${state.posts.length}개 중)`
    : `${state.posts.length.toLocaleString()}개 표시 · 전체 ${state.totalPosts.toLocaleString()}개`;

  if (list.length === 0) {
    grid.innerHTML = search
      ? `<div class="state-msg" style="grid-column: 1/-1;"><div class="state-icon">🔎</div><h2>검색 결과가 없습니다</h2><p>다른 키워드로 시도해보세요.</p></div>`
      : '';
    return;
  }

  grid.innerHTML = list.map((p) => {
    const title = decodeEntities(p.title?.rendered || '(제목 없음)');
    const link = p.link || '#';
    const date = fmtDate(p.date);
    const thumb = p._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
    const thumbHtml = thumb
      ? `<div class="post-thumb" style="background-image:url('${thumb}')"></div>`
      : `<div class="post-thumb no-image">📝</div>`;
    return `
      <a class="post-card" href="${link}" target="_blank" rel="noopener" title="${title.replace(/"/g, '&quot;')}">
        ${thumbHtml}
        <div class="post-body">
          <h3 class="post-title">${title}</h3>
          <div class="post-meta">
            <span class="post-date">📅 ${date}</span>
            <span class="post-link">원문 보기 →</span>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

function renderLoadMore() {
  const wrap = $('#loadMoreWrap');
  const btn = $('#loadMoreBtn');
  if (state.page >= state.totalPages) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  btn.disabled = state.loading;
  btn.textContent = state.loading ? '불러오는 중...' : `더 보기 (${Math.min(PAGE_SIZE, state.totalPosts - state.posts.length)}개)`;
}

function showError(msg) {
  $('#errorState').hidden = false;
  $('#errorMsg').textContent = msg;
  const help = $('#helpSection');
  if (help) help.open = true;
}

async function loadMore() {
  if (state.loading || state.page >= state.totalPages) return;
  state.loading = true;
  renderLoadMore();
  try {
    const nextPage = state.page + 1;
    const { posts, total, totalPages } = await fetchPage(nextPage);
    state.page = nextPage;
    state.totalPosts = total || state.totalPosts;
    state.totalPages = totalPages || state.totalPages;
    state.posts = state.posts.concat(posts);
    renderStats();
    renderPosts();
  } catch (err) {
    showError(`글 목록을 불러오지 못했습니다: ${err.message}`);
  } finally {
    state.loading = false;
    renderLoadMore();
  }
}

async function refresh() {
  state.page = 0;
  state.posts = [];
  state.loading = false;
  $('#errorState').hidden = true;
  $('#postGrid').innerHTML = '';
  renderStats();
  await loadMore();
}

function bindUI() {
  $('#searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderPosts();
  });
  $('#loadMoreBtn').addEventListener('click', loadMore);
  $('#refreshBtn').addEventListener('click', async () => {
    $('#refreshBtn').disabled = true;
    await refresh();
    $('#refreshBtn').disabled = false;
  });
}

(async function init() {
  bindUI();
  await refresh();
})();
