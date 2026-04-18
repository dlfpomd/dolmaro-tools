// ============================================================
// Autoimmune YouTube Trend Scanner
// - ViewStats 알고리즘 리버스 엔지니어링 구현
// - Outlier Score = 영상 조회수 / 채널 최근 영상 평균 조회수
// - View Velocity = 조회수 / 업로드 후 경과 시간
// ============================================================

const CATEGORIES = [
  { id: 'sjogren',    name: '쇼그렌 증후군',        keywords: ['쇼그렌 증후군', 'sjogren syndrome'] },
  { id: 'bms',        name: '구강작열감증후군',     keywords: ['구강작열감증후군', 'burning mouth syndrome'] },
  { id: 'tongue',     name: '혀 통증',              keywords: ['혀 통증', 'glossodynia tongue pain'] },
  { id: 'all',        name: '전체',                keywords: ['자가면역질환', 'autoimmune disease'] },
  { id: 'ra',         name: '류마티스 관절염',     keywords: ['류마티스 관절염', 'rheumatoid arthritis'] },
  { id: 'lupus',      name: '루푸스',              keywords: ['루푸스', 'lupus SLE'] },
  { id: 'hashimoto',  name: '하시모토 갑상선염',   keywords: ['하시모토', 'hashimoto thyroiditis'] },
  { id: 'graves',     name: '그레이브스병',        keywords: ['그레이브스병', 'graves disease'] },
  { id: 'crohn',      name: '크론병',              keywords: ['크론병', 'crohn disease'] },
  { id: 'uc',         name: '궤양성 대장염',       keywords: ['궤양성 대장염', 'ulcerative colitis'] },
  { id: 'ms',         name: '다발성 경화증',       keywords: ['다발성 경화증', 'multiple sclerosis'] },
  { id: 'psoriasis',  name: '건선',                keywords: ['건선', 'psoriasis'] },
  { id: 'celiac',     name: '셀리악병',            keywords: ['셀리악병', 'celiac disease'] },
  { id: 't1d',        name: '제1형 당뇨',          keywords: ['제1형 당뇨', 'type 1 diabetes'] },
  { id: 'behcet',     name: '베체트병',            keywords: ['베체트병', 'behcet disease'] },
  { id: 'as',         name: '강직성 척추염',       keywords: ['강직성 척추염', 'ankylosing spondylitis'] },
  { id: 'vitiligo',   name: '백반증',              keywords: ['백반증', 'vitiligo'] },
  { id: 'atopic',     name: '아토피 피부염',       keywords: ['아토피 피부염', 'atopic dermatitis'] },
];

const QUICK_TAGS = [
  '치료', '증상', '원인', '식단', '약물', '운동', '영양제',
  '자연치유', '한방', '생활습관', '최신치료', 'AIP', '글루텐프리'
];

const STORAGE_KEYS = {
  apiKey:        'ats.apiKey',
  collected:     'ats.collected',
  savedChannels: 'ats.savedChannels',
  quotaDate:     'ats.quotaDate',
  quotaCount:    'ats.quotaCount',
};

// API quota cost per call type
const QUOTA_COST = {
  search: 100,
  videos: 1,
  channels: 1,
};

class TrendScannerApp {
  constructor() {
    this.apiKey = this._loadApiKeyAnywhere();
    this.currentKeyword = null;
    this.currentCategory = 'all';
    this.currentPageToken = null;
    this.videos = [];
    this.channelAvgCache = new Map(); // channelId -> avg view count
    this.collected = this._loadCollected();
    this.savedChannels = this._loadSavedChannels();
    this._resetQuotaIfNewDay();
  }

  init() {
    this._renderDate();
    this._renderCategories();
    this._renderTags();
    this._renderApiStatus();
    this._updateQuotaUI();
    this._renderCollectedCount();
    this._renderSavedChannelsCount();

    if (!this.apiKey) {
      this.showTab('api-settings');
    }
  }

  // ---------- UI Render ----------
  _renderDate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const days = ['일','월','화','수','목','금','토'];
    document.getElementById('currentDate').textContent = `${yyyy}.${mm}.${dd} (${days[d.getDay()]})`;
  }

  _renderCategories() {
    const el = document.getElementById('categoryList');
    el.innerHTML = CATEGORIES.map(c => `
      <div class="category-item ${c.id === this.currentCategory ? 'active' : ''}" data-id="${c.id}">
        <span>${c.name}</span>
        <span class="category-count">${c.id === this.currentCategory ? this.videos.length : ''}</span>
      </div>
    `).join('');
    el.querySelectorAll('.category-item').forEach(item => {
      item.addEventListener('click', () => this.selectCategory(item.dataset.id));
    });
  }

  _renderTags() {
    const el = document.getElementById('tagList');
    el.innerHTML = QUICK_TAGS.map(t => `<div class="tag-item" data-tag="${t}">${t}</div>`).join('');
    el.querySelectorAll('.tag-item').forEach(item => {
      item.addEventListener('click', () => {
        document.getElementById('customKeyword').value = item.dataset.tag;
        this.searchCustomKeyword();
      });
    });
  }

  _renderApiStatus() {
    const el = document.getElementById('apiStatus');
    if (!el) return;
    if (this.apiKey) {
      el.className = 'api-status success';
      el.textContent = `✓ API 키가 등록되어 있습니다 (${this.apiKey.slice(0,6)}...${this.apiKey.slice(-4)})`;
    } else {
      el.className = 'api-status';
      el.textContent = '';
    }
    const input = document.getElementById('apiKeyInput');
    if (input) input.value = this.apiKey;
    this._renderBookmarkUrl();
  }

  _renderBookmarkUrl() {
    const section = document.getElementById('bookmarkSection');
    const urlInput = document.getElementById('bookmarkUrl');
    if (!section || !urlInput) return;
    if (!this.apiKey) {
      section.style.display = 'none';
      return;
    }
    const base = window.location.origin + window.location.pathname;
    urlInput.value = `${base}#k=${encodeURIComponent(this.apiKey)}`;
    section.style.display = '';
  }

  _loadApiKeyAnywhere() {
    // 1) URL hash (e.g. ...#k=AIzaXXX) — survives localStorage wipes
    // 2) URL query (e.g. ...?k=AIzaXXX) — in case user used ? by mistake
    // 3) localStorage
    const tryParse = (s, name) => {
      if (!s) return '';
      const re = new RegExp(`[?&#]${name}=([^&]+)`);
      const m = s.match(re);
      return m ? decodeURIComponent(m[1]) : '';
    };
    const fromHash = tryParse(window.location.hash, 'k') || tryParse(window.location.hash, 'key') || tryParse(window.location.hash, 'apiKey');
    const fromQuery = tryParse(window.location.search, 'k') || tryParse(window.location.search, 'key') || tryParse(window.location.search, 'apiKey');
    const fromUrl = fromHash || fromQuery;
    if (fromUrl && fromUrl.startsWith('AIza')) {
      try { localStorage.setItem(STORAGE_KEYS.apiKey, fromUrl); } catch (e) {}
      return fromUrl;
    }
    return localStorage.getItem(STORAGE_KEYS.apiKey) || '';
  }

  copyBookmarkUrl() {
    const input = document.getElementById('bookmarkUrl');
    if (!input) return;
    const doFallback = () => {
      input.select();
      input.setSelectionRange(0, 99999);
      try { document.execCommand('copy'); } catch (e) {}
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(input.value).then(
        () => this._showStatus('success', '✓ 북마크 URL이 클립보드에 복사되었습니다.'),
        () => { doFallback(); this._showStatus('success', '✓ URL이 선택되었습니다. Ctrl+C로 복사하세요.'); }
      );
    } else {
      doFallback();
      this._showStatus('success', '✓ URL이 선택되었습니다. Ctrl+C로 복사하세요.');
    }
  }

  clearApiKey() {
    if (!confirm('저장된 API 키를 삭제하시겠습니까?')) return;
    this.apiKey = '';
    try { localStorage.removeItem(STORAGE_KEYS.apiKey); } catch (e) {}
    // Also clean the URL so a page reload won't restore it from there
    if (window.location.hash.includes('k=') || window.location.hash.includes('key=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    this._renderApiStatus();
    this._showStatus('', '저장된 API 키가 삭제되었습니다.');
  }

  showTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const target = document.getElementById(`tab-${tabName}`);
    if (target) target.classList.add('active');
    if (tabName === 'collected') this._renderCollected();
    if (tabName === 'outlier') this._renderOutlierList();
    if (tabName === 'saved-channels') this._renderSavedChannels();
  }

  // ---------- API Key ----------
  saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    const key = input.value.trim();
    if (!key.startsWith('AIza')) {
      this._showStatus('error', '올바른 형식의 API 키가 아닙니다 (AIza로 시작해야 합니다)');
      return;
    }
    this.apiKey = key;
    localStorage.setItem(STORAGE_KEYS.apiKey, key);
    this._showStatus('success', '✓ API 키가 저장되었습니다. 이제 트렌드 탐색이 가능합니다.');
    this._renderApiStatus();
  }

  toggleApiKeyVisibility() {
    const input = document.getElementById('apiKeyInput');
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  _showStatus(type, msg) {
    const el = document.getElementById('apiStatus');
    el.className = `api-status ${type}`;
    el.textContent = msg;
  }

  // ---------- Category / Search ----------
  selectCategory(categoryId) {
    this.currentCategory = categoryId;
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat) return;
    this.currentKeyword = cat.keywords.join(' | ');
    this._renderCategories();
    this.showTab('trend');
    this._search(cat.keywords, true);
  }

  searchCustomKeyword() {
    const kw = document.getElementById('customKeyword').value.trim();
    if (!kw) return;
    this.currentKeyword = kw;
    this.currentCategory = '';
    this._renderCategories();
    this.showTab('trend');
    this._search([kw], true);
  }

  searchWithCurrentKeyword() {
    if (!this.currentKeyword) return;
    const cat = CATEGORIES.find(c => c.id === this.currentCategory);
    const kws = cat ? cat.keywords : [this.currentKeyword];
    this._search(kws, true);
  }

  refreshAll() {
    this.channelAvgCache.clear();
    if (this.currentKeyword) this.searchWithCurrentKeyword();
  }

  // ---------- YouTube API Calls ----------
  async _search(keywords, reset = false) {
    if (!this.apiKey) {
      alert('먼저 API 키를 설정해주세요.');
      this.showTab('api-settings');
      return;
    }

    if (reset) {
      this.videos = [];
      this.currentPageToken = null;
    }

    this._showLoading('트렌드 분석 중...', 'YouTube에서 영상 검색 중');

    try {
      const dateRange = parseInt(document.getElementById('dateRange').value, 10);
      const publishedAfter = new Date(Date.now() - dateRange * 86400000).toISOString();

      // Multi-keyword parallel search
      const searchResults = await Promise.all(
        keywords.map(kw => this._apiSearch(kw, publishedAfter))
      );

      const videoIds = [...new Set(searchResults.flat().map(r => r.id.videoId))];
      if (videoIds.length === 0) {
        this.videos = [];
        this._renderVideos();
        this._hideLoading();
        return;
      }

      this._showLoading('트렌드 분석 중...', '영상 상세 정보 조회 중');
      const videoDetails = await this._apiGetVideos(videoIds);

      this._showLoading('트렌드 분석 중...', 'Outlier Score 계산 중');
      const uniqueChannelIds = [...new Set(videoDetails.map(v => v.snippet.channelId))];
      await this._loadChannelAverages(uniqueChannelIds);

      // Enrich with outlier score & velocity
      this.videos = videoDetails.map(v => this._enrichVideo(v));
      this.sortResults();
    } catch (err) {
      console.error(err);
      alert(`오류: ${err.message}`);
    } finally {
      this._hideLoading();
    }
  }

  async _apiSearch(keyword, publishedAfter) {
    const params = new URLSearchParams({
      part: 'snippet',
      q: keyword,
      type: 'video',
      maxResults: '50',
      order: 'viewCount',
      publishedAfter,
      relevanceLanguage: 'ko',
      key: this.apiKey,
    });
    const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
    const res = await fetch(url);
    this._addQuota(QUOTA_COST.search);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`search.list: ${err.error?.message || res.status}`);
    }
    const data = await res.json();
    return data.items || [];
  }

  async _apiGetVideos(videoIds) {
    const chunks = [];
    for (let i = 0; i < videoIds.length; i += 50) chunks.push(videoIds.slice(i, i + 50));
    const results = [];
    for (const chunk of chunks) {
      const params = new URLSearchParams({
        part: 'snippet,statistics,contentDetails',
        id: chunk.join(','),
        key: this.apiKey,
      });
      const url = `https://www.googleapis.com/youtube/v3/videos?${params}`;
      const res = await fetch(url);
      this._addQuota(QUOTA_COST.videos);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`videos.list: ${err.error?.message || res.status}`);
      }
      const data = await res.json();
      results.push(...(data.items || []));
    }
    return results;
  }

  async _loadChannelAverages(channelIds) {
    const needed = channelIds.filter(id => !this.channelAvgCache.has(id));
    if (needed.length === 0) return;

    // Fetch channel uploads playlists in chunks
    const chunks = [];
    for (let i = 0; i < needed.length; i += 50) chunks.push(needed.slice(i, i + 50));

    for (const chunk of chunks) {
      const params = new URLSearchParams({
        part: 'contentDetails,statistics',
        id: chunk.join(','),
        key: this.apiKey,
      });
      const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
      this._addQuota(QUOTA_COST.channels);
      if (!res.ok) continue;
      const data = await res.json();

      // For each channel, fetch latest 10 videos from uploads playlist
      const channelUploadMap = {};
      (data.items || []).forEach(ch => {
        channelUploadMap[ch.id] = {
          uploadsId: ch.contentDetails?.relatedPlaylists?.uploads,
          totalViews: parseInt(ch.statistics?.viewCount || '0', 10),
          totalVideos: parseInt(ch.statistics?.videoCount || '0', 10),
        };
      });

      // Fallback: global channel avg if playlist fetch fails
      for (const chId of Object.keys(channelUploadMap)) {
        const info = channelUploadMap[chId];
        const globalAvg = info.totalVideos > 0 ? info.totalViews / info.totalVideos : 0;

        try {
          const avg = await this._getRecentVideosAvg(info.uploadsId, chId);
          this.channelAvgCache.set(chId, avg || globalAvg || 1);
        } catch {
          this.channelAvgCache.set(chId, globalAvg || 1);
        }
      }
    }
  }

  async _getRecentVideosAvg(uploadsPlaylistId, channelId) {
    if (!uploadsPlaylistId) return 0;
    const params = new URLSearchParams({
      part: 'contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: '10',
      key: this.apiKey,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
    this._addQuota(1);
    if (!res.ok) return 0;
    const data = await res.json();
    const videoIds = (data.items || []).map(i => i.contentDetails.videoId);
    if (videoIds.length === 0) return 0;

    const vparams = new URLSearchParams({
      part: 'statistics',
      id: videoIds.join(','),
      key: this.apiKey,
    });
    const vres = await fetch(`https://www.googleapis.com/youtube/v3/videos?${vparams}`);
    this._addQuota(QUOTA_COST.videos);
    if (!vres.ok) return 0;
    const vdata = await vres.json();
    const views = (vdata.items || []).map(v => parseInt(v.statistics?.viewCount || '0', 10));
    if (views.length === 0) return 0;
    // exclude current video (outlier itself) by using median-ish mean of recent
    return views.reduce((a, b) => a + b, 0) / views.length;
  }

  // ---------- Outlier / Velocity Calculation ----------
  _enrichVideo(v) {
    const views = parseInt(v.statistics?.viewCount || '0', 10);
    const likes = parseInt(v.statistics?.likeCount || '0', 10);
    const comments = parseInt(v.statistics?.commentCount || '0', 10);
    const publishedAt = new Date(v.snippet.publishedAt);
    const hoursSincePublish = Math.max(1, (Date.now() - publishedAt.getTime()) / 3600000);

    const channelAvg = this.channelAvgCache.get(v.snippet.channelId) || 1;
    const outlierScore = channelAvg > 0 ? views / channelAvg : 0;
    const velocity = views / hoursSincePublish; // views per hour
    const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

    return {
      id: v.id,
      title: v.snippet.title,
      channelTitle: v.snippet.channelTitle,
      channelId: v.snippet.channelId,
      thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url,
      publishedAt: v.snippet.publishedAt,
      duration: this._formatDuration(v.contentDetails?.duration),
      views,
      likes,
      comments,
      channelAvg: Math.round(channelAvg),
      outlierScore,
      velocity,
      engagementRate,
      hoursSincePublish,
    };
  }

  _formatDuration(iso) {
    if (!iso) return '';
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '';
    const [, h, m, s] = match;
    const hours = parseInt(h || 0, 10);
    const mins = parseInt(m || 0, 10);
    const secs = parseInt(s || 0, 10);
    if (hours > 0) return `${hours}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    return `${mins}:${String(secs).padStart(2,'0')}`;
  }

  // ---------- Sort / Filter / Render ----------
  sortResults() {
    const sortBy = document.getElementById('sortBy').value;
    const minViews = parseInt(document.getElementById('minViews').value, 10);

    let sorted = [...this.videos].filter(v => v.views >= minViews);
    switch (sortBy) {
      case 'outlier':  sorted.sort((a, b) => b.outlierScore - a.outlierScore); break;
      case 'velocity': sorted.sort((a, b) => b.velocity - a.velocity); break;
      case 'views':    sorted.sort((a, b) => b.views - a.views); break;
      case 'date':     sorted.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)); break;
    }
    this._renderVideoList(sorted, 'videoList', 'trendCount');
  }

  _renderVideos() { this.sortResults(); }

  _renderOutlierList() {
    const sorted = [...this.videos]
      .filter(v => v.outlierScore >= 3)
      .sort((a, b) => b.outlierScore - a.outlierScore);
    this._renderVideoList(sorted, 'outlierList', null);
  }

  _renderVideoList(list, containerId, countId) {
    const el = document.getElementById(containerId);
    if (countId) {
      document.getElementById(countId).textContent = `${list.length}개 영상`;
    }
    if (list.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <h3>검색 결과가 없습니다</h3>
          <p>다른 키워드로 시도하거나 기간/조회수 필터를 조정해보세요.</p>
        </div>`;
      return;
    }
    el.innerHTML = list.map(v => this._videoCardHTML(v)).join('');
    el.querySelectorAll('.video-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.video-action-btn') || e.target.closest('.video-channel')) return;
        window.open(`https://youtube.com/watch?v=${card.dataset.id}`, '_blank');
      });
    });
    el.querySelectorAll('.bookmark-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCollect(btn.dataset.id);
      });
    });
    el.querySelectorAll('.video-channel').forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('channelInput').value = link.dataset.channelId;
        this.showTab('channel');
        this.analyzeChannel();
      });
    });
    el.querySelectorAll('.save-channel-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSaveChannel(btn.dataset.channelId, btn.dataset.channelTitle);
      });
    });
  }

  _videoCardHTML(v) {
    const scoreClass = v.outlierScore >= 50 ? 'viral'
      : v.outlierScore >= 10 ? 'great'
      : v.outlierScore >= 3 ? 'good'
      : 'normal';
    const isCollected = this.collected.some(c => c.id === v.id);
    const scoreDisplay = v.outlierScore >= 10 ? v.outlierScore.toFixed(0) : v.outlierScore.toFixed(1);

    return `
      <div class="video-card" data-id="${v.id}">
        <div class="video-thumb">
          <img src="${v.thumbnail}" loading="lazy" alt="">
          <div class="video-score-badge ${scoreClass}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            ${scoreDisplay}x
          </div>
          <div class="video-duration">${v.duration}</div>
        </div>
        <div class="video-body">
          <div class="video-title">${this._esc(v.title)}</div>
          <div class="video-channel-row">
            <div class="video-channel" data-channel-id="${v.channelId}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${this._esc(v.channelTitle)}
            </div>
            <button class="save-channel-btn ${this._isChannelSaved(v.channelId) ? 'active' : ''}"
              data-channel-id="${v.channelId}" data-channel-title="${this._esc(v.channelTitle)}"
              title="${this._isChannelSaved(v.channelId) ? '저장 취소' : '채널 저장'}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${this._isChannelSaved(v.channelId) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          </div>
          <div class="video-stats">
            <span class="video-stat"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${this._fmtNum(v.views)}</span>
            <span class="video-stat highlight" title="View Velocity">⚡ ${this._fmtNum(Math.round(v.velocity))}/h</span>
            <span class="video-stat" title="업로드">${this._relTime(v.publishedAt)}</span>
          </div>
        </div>
        <div class="video-actions">
          <button class="video-action-btn" title="채널 평균 조회수">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            채널평균 ${this._fmtNum(v.channelAvg)}
          </button>
          <button class="video-action-btn bookmark-btn ${isCollected ? 'active' : ''}" data-id="${v.id}" title="${isCollected ? '수집 취소' : '수집'}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="${isCollected ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            ${isCollected ? '수집됨' : '수집'}
          </button>
        </div>
      </div>`;
  }

  _fmtNum(n) {
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '억';
    if (n >= 10000) return (n / 10000).toFixed(1) + '만';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  _relTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}일 전`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}개월 전`;
    return `${Math.floor(months / 12)}년 전`;
  }

  _esc(s) {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  // ---------- Collected ----------
  _loadCollected() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.collected) || '[]'); }
    catch { return []; }
  }

  _saveCollected() {
    localStorage.setItem(STORAGE_KEYS.collected, JSON.stringify(this.collected));
    this._renderCollectedCount();
  }

  toggleCollect(videoId) {
    const video = this.videos.find(v => v.id === videoId);
    if (!video) return;
    const idx = this.collected.findIndex(c => c.id === videoId);
    if (idx >= 0) {
      this.collected.splice(idx, 1);
    } else {
      this.collected.push({ ...video, collectedAt: new Date().toISOString() });
    }
    this._saveCollected();
    this.sortResults();
  }

  _renderCollected() {
    const sorted = [...this.collected].sort((a, b) => new Date(b.collectedAt) - new Date(a.collectedAt));
    this._renderVideoList(sorted, 'collectedList', 'collectedCount');
  }

  _renderCollectedCount() {
    const el = document.getElementById('collectedCount');
    if (el) el.textContent = `${this.collected.length}개 저장됨`;
  }

  clearCollected() {
    if (!confirm('수집된 모든 영상을 삭제하시겠습니까?')) return;
    this.collected = [];
    this._saveCollected();
    this._renderCollected();
  }

  exportCollected() {
    if (this.collected.length === 0) { alert('수집된 영상이 없습니다.'); return; }
    const header = ['제목','채널','조회수','Outlier','Velocity(/h)','업로드일','URL'];
    const rows = this.collected.map(v => [
      v.title.replaceAll('"', '""'),
      v.channelTitle.replaceAll('"', '""'),
      v.views,
      v.outlierScore.toFixed(2),
      Math.round(v.velocity),
      v.publishedAt,
      `https://youtube.com/watch?v=${v.id}`,
    ]);
    const csv = '\ufeff' + [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autoimmune-trends-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Channel Analysis ----------
  async analyzeChannel() {
    if (!this.apiKey) { alert('API 키를 먼저 설정해주세요.'); return; }
    const input = document.getElementById('channelInput').value.trim();
    if (!input) return;

    this._showLoading('채널 분석 중...', '채널 정보 조회');
    try {
      let channelId = await this._resolveChannelId(input);
      if (!channelId) throw new Error('채널을 찾을 수 없습니다');

      const params = new URLSearchParams({
        part: 'snippet,statistics,contentDetails',
        id: channelId,
        key: this.apiKey,
      });
      const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
      this._addQuota(QUOTA_COST.channels);
      const data = await res.json();
      const ch = data.items?.[0];
      if (!ch) throw new Error('채널 정보 없음');

      const totalViews = parseInt(ch.statistics.viewCount, 10);
      const totalVideos = parseInt(ch.statistics.videoCount, 10);
      const avgViews = totalVideos > 0 ? Math.round(totalViews / totalVideos) : 0;

      // Recent videos
      const uploadsId = ch.contentDetails.relatedPlaylists.uploads;
      const recentAvg = await this._getRecentVideosAvg(uploadsId, channelId);

      document.getElementById('channelResult').innerHTML = `
        <div class="channel-info-card">
          <div class="channel-info-header">
            <div class="channel-avatar"><img src="${ch.snippet.thumbnails.medium.url}" alt=""></div>
            <div class="channel-info-meta">
              <h3>${this._esc(ch.snippet.title)}</h3>
              <p>${this._esc(ch.snippet.description || '').slice(0, 140)}${(ch.snippet.description || '').length > 140 ? '...' : ''}</p>
            </div>
          </div>
          <div class="channel-metrics">
            <div class="metric-box">
              <div class="metric-label">구독자</div>
              <div class="metric-value">${this._fmtNum(parseInt(ch.statistics.subscriberCount, 10))}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">총 영상 수</div>
              <div class="metric-value">${this._fmtNum(totalVideos)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">전체 평균 조회수</div>
              <div class="metric-value">${this._fmtNum(avgViews)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">최근 10개 평균</div>
              <div class="metric-value">${this._fmtNum(Math.round(recentAvg))}</div>
            </div>
          </div>
        </div>`;
    } catch (err) {
      document.getElementById('channelResult').innerHTML = `<div class="empty-state"><h3>오류</h3><p>${this._esc(err.message)}</p></div>`;
    } finally {
      this._hideLoading();
    }
  }

  async _resolveChannelId(input) {
    // UC로 시작하는 채널 ID
    if (/^UC[\w-]{20,}$/.test(input)) return input;

    // URL에서 추출
    let handle = input;
    const urlMatch = input.match(/youtube\.com\/(@[\w.-]+|channel\/([^\/?]+)|c\/([^\/?]+)|user\/([^\/?]+))/);
    if (urlMatch) {
      if (urlMatch[2]) return urlMatch[2]; // channel/UC...
      handle = urlMatch[1]; // @handle or c/xxx or user/xxx
    }

    // @핸들 검색
    if (handle.startsWith('@')) {
      const params = new URLSearchParams({
        part: 'snippet',
        q: handle,
        type: 'channel',
        maxResults: '1',
        key: this.apiKey,
      });
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
      this._addQuota(QUOTA_COST.search);
      const data = await res.json();
      return data.items?.[0]?.snippet?.channelId || null;
    }

    return null;
  }

  // ---------- Loading ----------
  _showLoading(text, subtext) {
    document.getElementById('loadingOverlay').classList.add('active');
    document.querySelector('.loading-text').textContent = text;
    document.getElementById('loadingSubtext').textContent = subtext;
  }
  _hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
  }

  // ---------- Quota Tracking ----------
  _resetQuotaIfNewDay() {
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem(STORAGE_KEYS.quotaDate);
    if (savedDate !== today) {
      localStorage.setItem(STORAGE_KEYS.quotaDate, today);
      localStorage.setItem(STORAGE_KEYS.quotaCount, '0');
    }
  }
  _addQuota(units) {
    this._resetQuotaIfNewDay();
    const cur = parseInt(localStorage.getItem(STORAGE_KEYS.quotaCount) || '0', 10);
    const next = cur + units;
    localStorage.setItem(STORAGE_KEYS.quotaCount, String(next));
    this._updateQuotaUI();
  }
  _updateQuotaUI() {
    const cur = parseInt(localStorage.getItem(STORAGE_KEYS.quotaCount) || '0', 10);
    const pct = Math.min(100, (cur / 10000) * 100);
    const bar = document.getElementById('quotaUsed');
    const text = document.getElementById('quotaCount');
    if (bar) bar.style.width = `${pct}%`;
    if (text) text.textContent = cur.toLocaleString();
  }

  loadMore() { /* placeholder for pagination */ }

  // ---------- Saved Channels ----------
  _loadSavedChannels() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.savedChannels) || '[]'); }
    catch { return []; }
  }

  _saveSavedChannels() {
    localStorage.setItem(STORAGE_KEYS.savedChannels, JSON.stringify(this.savedChannels));
    this._renderSavedChannelsCount();
  }

  _isChannelSaved(channelId) {
    return this.savedChannels.some(c => c.channelId === channelId);
  }

  async toggleSaveChannel(channelId, channelTitle) {
    const idx = this.savedChannels.findIndex(c => c.channelId === channelId);
    if (idx >= 0) {
      this.savedChannels.splice(idx, 1);
      this._saveSavedChannels();
      this.sortResults();
      return;
    }

    // Add with basic info first, then enrich with API
    const stub = { channelId, channelTitle, savedAt: new Date().toISOString(), loading: true };
    this.savedChannels.push(stub);
    this._saveSavedChannels();
    this.sortResults();

    if (!this.apiKey) return;
    try {
      const meta = await this._fetchChannelMeta(channelId);
      const existing = this.savedChannels.find(c => c.channelId === channelId);
      if (existing) Object.assign(existing, meta, { loading: false });
      this._saveSavedChannels();
    } catch (err) {
      console.warn('Channel meta fetch failed:', err.message);
    }
  }

  async _fetchChannelMeta(channelId) {
    const params = new URLSearchParams({
      part: 'snippet,statistics,contentDetails',
      id: channelId,
      key: this.apiKey,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
    this._addQuota(QUOTA_COST.channels);
    if (!res.ok) throw new Error(`channels.list: ${res.status}`);
    const data = await res.json();
    const ch = data.items?.[0];
    if (!ch) throw new Error('Channel not found');

    const totalViews = parseInt(ch.statistics.viewCount || '0', 10);
    const totalVideos = parseInt(ch.statistics.videoCount || '0', 10);
    const subscribers = parseInt(ch.statistics.subscriberCount || '0', 10);
    const avgViews = totalVideos > 0 ? Math.round(totalViews / totalVideos) : 0;

    let recentAvg = 0;
    try {
      recentAvg = await this._getRecentVideosAvg(ch.contentDetails.relatedPlaylists.uploads, channelId);
    } catch {}

    return {
      channelTitle: ch.snippet.title,
      thumbnail: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url,
      description: ch.snippet.description || '',
      subscribers,
      totalVideos,
      totalViews,
      avgViews,
      recentAvg: Math.round(recentAvg),
    };
  }

  async refreshSavedChannels() {
    if (this.savedChannels.length === 0) return;
    if (!this.apiKey) { alert('API 키를 먼저 설정하세요.'); return; }

    this._showLoading('채널 통계 갱신 중...', `${this.savedChannels.length}개 채널 조회`);
    try {
      for (const ch of this.savedChannels) {
        try {
          const meta = await this._fetchChannelMeta(ch.channelId);
          Object.assign(ch, meta, { loading: false });
        } catch (err) {
          console.warn(`Refresh failed for ${ch.channelTitle}:`, err.message);
        }
      }
      this._saveSavedChannels();
      this._renderSavedChannels();
    } finally {
      this._hideLoading();
    }
  }

  _renderSavedChannels() {
    const el = document.getElementById('savedChannelsList');
    this._renderSavedChannelsCount();

    if (this.savedChannels.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <h3>저장된 채널이 없습니다</h3>
          <p>영상 카드에서 <strong>⭐ 채널 저장</strong> 버튼을 클릭하면 채널을 저장할 수 있습니다.</p>
        </div>`;
      return;
    }

    const sorted = [...this.savedChannels].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    el.innerHTML = sorted.map(ch => this._savedChannelCardHTML(ch)).join('');

    el.querySelectorAll('.saved-channel-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        window.open(`https://www.youtube.com/channel/${card.dataset.id}`, '_blank');
      });
    });
    el.querySelectorAll('.analyze-saved-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('channelInput').value = btn.dataset.id;
        this.showTab('channel');
        this.analyzeChannel();
      });
    });
    el.querySelectorAll('.remove-saved-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm(`"${btn.dataset.title}" 채널을 저장 목록에서 삭제할까요?`)) return;
        this.toggleSaveChannel(btn.dataset.id, btn.dataset.title);
        this._renderSavedChannels();
      });
    });
  }

  _renderSavedChannelsCount() {
    const el = document.getElementById('savedChannelsCount');
    if (el) el.textContent = `${this.savedChannels.length}개 채널`;
  }

  _savedChannelCardHTML(ch) {
    const avatar = ch.thumbnail
      ? `<img src="${ch.thumbnail}" alt="">`
      : `<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#e5e7eb;color:#9ca3af;font-weight:700;font-size:20px;">${this._esc(ch.channelTitle.charAt(0))}</div>`;
    const savedDate = new Date(ch.savedAt).toLocaleDateString('ko-KR');
    const loading = ch.loading ? ' (로딩중)' : '';

    return `
      <div class="saved-channel-card" data-id="${ch.channelId}">
        <div class="saved-channel-header">
          <div class="saved-channel-avatar">${avatar}</div>
          <div class="saved-channel-meta">
            <div class="saved-channel-name">${this._esc(ch.channelTitle)}${loading}</div>
            <div class="saved-channel-subs">구독 ${this._fmtNum(ch.subscribers || 0)} · 영상 ${this._fmtNum(ch.totalVideos || 0)}개</div>
            <div class="saved-date">${savedDate} 저장</div>
          </div>
        </div>
        <div class="saved-channel-stats">
          <div class="mini-stat">
            <div class="mini-stat-label">전체 평균</div>
            <div class="mini-stat-value">${this._fmtNum(ch.avgViews || 0)}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">최근 10개</div>
            <div class="mini-stat-value">${this._fmtNum(ch.recentAvg || 0)}</div>
          </div>
        </div>
        <div class="saved-channel-actions">
          <button class="btn-mini analyze-saved-btn" data-id="${ch.channelId}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            상세 분석
          </button>
          <button class="btn-mini danger remove-saved-btn" data-id="${ch.channelId}" data-title="${this._esc(ch.channelTitle)}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/></svg>
            삭제
          </button>
        </div>
      </div>`;
  }

  exportSavedChannels() {
    if (this.savedChannels.length === 0) { alert('저장된 채널이 없습니다.'); return; }
    const header = ['채널명','채널ID','구독자','총영상','전체평균','최근10개평균','저장일','URL'];
    const rows = this.savedChannels.map(c => [
      (c.channelTitle || '').replaceAll('"', '""'),
      c.channelId,
      c.subscribers || 0,
      c.totalVideos || 0,
      c.avgViews || 0,
      c.recentAvg || 0,
      c.savedAt,
      `https://www.youtube.com/channel/${c.channelId}`,
    ]);
    const csv = '\ufeff' + [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saved-channels-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Initialize
const app = new TrendScannerApp();
document.addEventListener('DOMContentLoaded', () => app.init());
window.app = app;
