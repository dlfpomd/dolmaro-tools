// ============================================================
// 쇼츠 라이터 — 자가면역 의학 대본 생성기
// ============================================================

import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs';

const STORAGE_KEYS = {
  apiKey:   'shorts_writer_api_key',
  model:    'shorts_writer_model',
  proxy:    'shorts_writer_proxy',
  custom:   'shorts_writer_custom_proxy',
  history:  'shorts_writer_history',
};

// All user-authored reference scripts. The app picks a rotating subset per
// generation (see _pickSamples) to keep the prompt tight while still varying
// the style anchors across regenerations.
const SAMPLE_FILES = [
  '쇼그렌증후군 소금.txt',
  '쇼그렌증후군 커피.txt',
  '쇼그렌증후군 골다공증.txt',
  '쇼그렌 이급후중.txt',
  '쇼그렌 치과 완견.txt',
  '자가면역성 위축성 위염.txt',
  '루푸스 유전 환경.txt',
  '루푸스 초기 5년.txt',
  '루푸스 조기 진단.txt',
  '갑상선기능항진증 재발한다면 이유는.txt',
  '간질성과 감염성 구분.txt',
  '구강작열감 불안우울건조.txt',
  '마음챙김 명상 뇌신경계 변화.txt',
  '1020 (1).txt',
  '1127(1).txt',
];

const PROXY_URLS = {
  allorigins: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  corsproxy:  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
};

class ShortsWriterApp {
  constructor() {
    this.state = {
      step: 1,
      inputTab: 'url',
      sources: [],
      extractedContent: '',
      topic: '',
      script: '',
      pdfFiles: [],
      generating: false,
      samples: null,
    };

    this.settings = {
      apiKey:      localStorage.getItem(STORAGE_KEYS.apiKey) || '',
      model:       localStorage.getItem(STORAGE_KEYS.model) || 'claude-sonnet-4-6',
      proxy:       localStorage.getItem(STORAGE_KEYS.proxy) || 'allorigins',
      customProxy: localStorage.getItem(STORAGE_KEYS.custom) || '',
    };

    this.history = this._loadHistory();

    this._init();
  }

  _init() {
    this._bindPdfDropArea();
    this._bindExtractedContent();
    this._renderHistory();
    this._updateWorkflowUI();

    if (!this.settings.apiKey) {
      setTimeout(() => this.toast('먼저 API 설정에서 Anthropic API 키를 입력해주세요', 'error'), 600);
    }
  }

  // ------------------------------------------------------------
  // Step Navigation
  // ------------------------------------------------------------
  goToStep(n) {
    this.state.step = n;
    document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${n}`).classList.add('active');
    this._updateWorkflowUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  _updateWorkflowUI() {
    document.querySelectorAll('.workflow-step').forEach(el => {
      const s = Number(el.dataset.step);
      el.classList.remove('active', 'completed');
      if (s < this.state.step) el.classList.add('completed');
      if (s === this.state.step) el.classList.add('active');
    });
  }

  // ------------------------------------------------------------
  // Input Tabs
  // ------------------------------------------------------------
  switchInputTab(tab) {
    this.state.inputTab = tab;
    document.querySelectorAll('.input-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
    document.querySelectorAll('.input-panel').forEach(el => el.classList.remove('active'));
    document.getElementById(`input-${tab}`).classList.add('active');
  }

  // ------------------------------------------------------------
  // URL Extraction (Naver Blog)
  // ------------------------------------------------------------
  async extractFromUrl() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) return this.toast('URL을 입력하세요', 'error');

    this.showLoading('블로그 불러오는 중...', 'CORS 프록시를 통해 자료 추출');
    try {
      const { text, title } = await this._fetchNaverBlog(url);
      if (!text || text.length < 50) {
        throw new Error('본문을 찾을 수 없음 (비공개 글이거나 다른 플랫폼일 수 있음)');
      }
      this._addSource({ type: 'url', label: title || url, size: text.length });
      this._appendExtracted(text, title);
      this.goToStep(2);
      this.toast(`자료 추출 완료 (${text.length.toLocaleString()}자)`, 'success');
    } catch (e) {
      console.error(e);
      this.toast(`블로그 추출 실패: ${e.message}`, 'error');
    } finally {
      this.hideLoading();
    }
  }

  async _fetchNaverBlog(rawUrl) {
    const { mobileUrl, blogId, logNo } = this._parseNaverUrl(rawUrl);
    const proxyFn = this._getProxyFn();

    const candidates = [mobileUrl];
    if (blogId && logNo) {
      candidates.push(`https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`);
    }

    let lastErr;
    for (const target of candidates) {
      try {
        const res = await fetch(proxyFn(target), { cache: 'no-cache' });
        if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
        const html = await res.text();
        const parsed = this._parseBlogHtml(html);
        if (parsed.text.length >= 50) return parsed;
        lastErr = new Error('본문 파싱 실패');
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('알 수 없는 오류');
  }

  _parseNaverUrl(url) {
    // Handle: blog.naver.com/{id}/{no}, m.blog.naver.com/{id}/{no}, PostView.naver?blogId=...&logNo=...
    let blogId, logNo;
    try {
      const u = new URL(url);
      if (u.searchParams.get('blogId')) {
        blogId = u.searchParams.get('blogId');
        logNo = u.searchParams.get('logNo');
      } else {
        const m = u.pathname.match(/\/([^/]+)\/(\d+)/);
        if (m) { blogId = m[1]; logNo = m[2]; }
      }
    } catch {}
    const mobileUrl = (blogId && logNo)
      ? `https://m.blog.naver.com/${blogId}/${logNo}`
      : url;
    return { mobileUrl, blogId, logNo };
  }

  _parseBlogHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Try to get title
    let title = '';
    const titleEl = doc.querySelector('.se-title-text, .se_title, .pcol1, title');
    if (titleEl) title = titleEl.textContent.trim().split('\n')[0].slice(0, 80);

    // Find the main article body. Try SE4 → SE2 → legacy
    const containerSelectors = [
      '.se-main-container',       // SE4
      '#postViewArea',            // SE2
      '#post-view',               // Some variants
      '.post_ct',
      '.se_component_wrap',
    ];
    let container = null;
    for (const sel of containerSelectors) {
      const el = doc.querySelector(sel);
      if (el && el.textContent.trim().length > 50) { container = el; break; }
    }

    if (!container) {
      // fallback: grab body but drop navigation
      container = doc.body;
    }

    // Drop scripts/styles/nav/comments
    container.querySelectorAll('script, style, nav, footer, iframe, .comment, .btn_area, .area_button').forEach(n => n.remove());

    // Extract text with line breaks preserved
    const blocks = container.querySelectorAll(
      '.se-text-paragraph, p, h1, h2, h3, h4, h5, h6, li, blockquote, .se_textarea, .se_paragraph'
    );

    let text;
    if (blocks.length >= 3) {
      text = Array.from(blocks)
        .map(b => b.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n\n');
    } else {
      text = container.textContent.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
    }

    // Final cleanup
    text = text
      .replace(/\u200b/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { text, title };
  }

  _getProxyFn() {
    const p = this.settings.proxy;
    if (p === 'custom' && this.settings.customProxy) {
      return (url) => this.settings.customProxy.replace(/\{url\}|$/, encodeURIComponent(url));
    }
    return PROXY_URLS[p] || PROXY_URLS.allorigins;
  }

  // ------------------------------------------------------------
  // PDF Extraction
  // ------------------------------------------------------------
  _bindPdfDropArea() {
    const drop = document.getElementById('fileDropArea');
    const input = document.getElementById('pdfInput');
    if (!drop || !input) return;

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      this._addPdfFiles(files);
    });
    input.addEventListener('change', (e) => {
      this._addPdfFiles(Array.from(e.target.files));
      input.value = '';
    });
  }

  _addPdfFiles(files) {
    for (const f of files) this.state.pdfFiles.push(f);
    this._renderPdfFileList();
  }

  _renderPdfFileList() {
    const wrap = document.getElementById('selectedFiles');
    const btn = document.getElementById('extractPdfBtn');
    wrap.innerHTML = this.state.pdfFiles.map((f, i) => `
      <div class="file-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span class="file-name">${this._esc(f.name)}</span>
        <span class="file-size">${(f.size/1024).toFixed(0)}KB</span>
        <button class="file-remove" data-index="${i}" title="제거">✕</button>
      </div>
    `).join('');
    wrap.querySelectorAll('.file-remove').forEach(b => {
      b.onclick = () => {
        this.state.pdfFiles.splice(Number(b.dataset.index), 1);
        this._renderPdfFileList();
      };
    });
    btn.disabled = this.state.pdfFiles.length === 0;
  }

  async extractFromPdf() {
    if (!this.state.pdfFiles.length) return;
    this.showLoading('PDF 추출 중...', `${this.state.pdfFiles.length}개 파일 처리`);
    try {
      const chunks = [];
      for (let i = 0; i < this.state.pdfFiles.length; i++) {
        const f = this.state.pdfFiles[i];
        this._setLoadingSub(`${i+1}/${this.state.pdfFiles.length}: ${f.name}`);
        const text = await this._extractPdfText(f);
        this._addSource({ type: 'pdf', label: f.name, size: text.length });
        chunks.push(`=== ${f.name} ===\n\n${text}`);
      }
      this._appendExtracted(chunks.join('\n\n'));
      this.state.pdfFiles = [];
      this._renderPdfFileList();
      this.goToStep(2);
      this.toast(`PDF 추출 완료`, 'success');
    } catch (e) {
      console.error(e);
      this.toast(`PDF 추출 실패: ${e.message}`, 'error');
    } finally {
      this.hideLoading();
    }
  }

  async _extractPdfText(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const parts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = content.items.map(it => ('str' in it ? it.str : '')).join(' ');
      parts.push(line);
    }
    return parts.join('\n\n').replace(/[ \t]+/g, ' ').trim();
  }

  // ------------------------------------------------------------
  // Text Input
  // ------------------------------------------------------------
  useTextInput() {
    const text = document.getElementById('textInput').value.trim();
    if (!text || text.length < 20) return this.toast('최소 20자 이상 입력해주세요', 'error');
    this._addSource({ type: 'text', label: '직접 입력', size: text.length });
    this._appendExtracted(text);
    this.goToStep(2);
  }

  // ------------------------------------------------------------
  // Shared: Extract → Step 2 state
  // ------------------------------------------------------------
  _addSource(s) { this.state.sources.push(s); }

  _appendExtracted(text, title) {
    const prev = this.state.extractedContent;
    const block = title ? `=== ${title} ===\n\n${text}` : text;
    this.state.extractedContent = prev ? `${prev}\n\n${block}` : block;
    this._renderStep2();
  }

  _renderStep2() {
    const sourcesEl = document.getElementById('contentSources');
    sourcesEl.innerHTML = this.state.sources.map(s => `
      <span class="source-badge">
        ${s.type === 'url' ? '🔗' : s.type === 'pdf' ? '📄' : '📝'}
        ${this._esc(s.label.slice(0, 60))}
        <small>(${s.size.toLocaleString()}자)</small>
      </span>
    `).join('');

    const ta = document.getElementById('extractedContent');
    ta.value = this.state.extractedContent;
    this._updateCharCounter();
  }

  _bindExtractedContent() {
    const ta = document.getElementById('extractedContent');
    if (!ta) return;
    ta.addEventListener('input', () => {
      this.state.extractedContent = ta.value;
      this._updateCharCounter();
    });
    const topic = document.getElementById('topicInput');
    topic.addEventListener('input', () => { this.state.topic = topic.value; });
  }

  _updateCharCounter() {
    const n = this.state.extractedContent.length;
    document.getElementById('charCounter').textContent = `${n.toLocaleString()}자`;
  }

  // ------------------------------------------------------------
  // Script Generation
  // ------------------------------------------------------------
  async generateScript() {
    const topic = document.getElementById('topicInput').value.trim();
    const content = document.getElementById('extractedContent').value.trim();

    if (!topic) return this.toast('주제를 입력해주세요', 'error');
    if (!content || content.length < 100) return this.toast('자료가 너무 짧습니다', 'error');
    if (!this.settings.apiKey) {
      this.openSettings();
      return this.toast('Anthropic API 키를 설정해주세요', 'error');
    }

    this.state.topic = topic;
    this.state.extractedContent = content;

    const length = document.getElementById('lengthSelect').value;
    const tone   = document.getElementById('toneSelect').value;

    this.showLoading('AI가 대본을 생성하는 중...', '30초~1분 정도 걸립니다');
    try {
      const samples = await this._loadSamples();
      const prompt = this._buildPrompt({ topic, content, length, tone, samples });

      const script = await this._callClaude(prompt);
      this.state.script = script;
      this._renderStep3();
      this._saveToHistory();
      this.goToStep(3);
      this.toast('대본 생성 완료', 'success');
    } catch (e) {
      console.error(e);
      this.toast(`대본 생성 실패: ${e.message}`, 'error');
    } finally {
      this.hideLoading();
    }
  }

  async regenerateScript() {
    await this.generateScript();
  }

  async _loadSamples() {
    if (this.state.samples) return this.state.samples;
    const results = [];
    for (const f of SAMPLE_FILES) {
      try {
        const res = await fetch(`samples/${encodeURIComponent(f)}`);
        if (res.ok) {
          const text = await res.text();
          if (text.trim().length > 30) results.push({ file: f, text: text.trim() });
        }
      } catch {}
    }
    this.state.samples = results;
    return results;
  }

  // Pick a rotating subset of samples. The first slot is a "canonical" anchor
  // (쇼그렌증후군 소금 — covers hook, research citation, 4-reason enumeration,
  // closing advisory all in one). The rest rotate by time so regenerations
  // get varied style anchors.
  _pickSamples(all, count = 5) {
    if (!all || all.length === 0) return [];
    const canonical = all.find(s => s.file.startsWith('쇼그렌증후군 소금'));
    const rest = all.filter(s => s !== canonical);
    // Shuffle "rest" with a seeded rotation so consecutive regenerations differ
    const seed = Math.floor(Date.now() / 1000);
    const rotated = rest
      .map((s, i) => ({ s, k: (i * 2654435761 + seed) >>> 0 }))
      .sort((a, b) => a.k - b.k)
      .map(x => x.s);
    const picked = [];
    if (canonical) picked.push(canonical);
    for (const s of rotated) {
      if (picked.length >= count) break;
      picked.push(s);
    }
    return picked;
  }

  _buildPrompt({ topic, content, length, tone, samples }) {
    const [lenMin, lenMax] = length.split('-');
    const toneLabel = { medical: '전문 의학 + 환자 친화적', casual: '좀 더 구어체', academic: '학술적/엄밀한' }[tone];

    const picked = this._pickSamples(samples, 5);
    const samplesBlock = picked.length
      ? picked.map((s, i) => `### 샘플 ${i+1}: ${s.file.replace(/\.txt$/, '')}\n\n${s.text}`).join('\n\n---\n\n')
      : '';

    // Style spec derived from analysis of 15+ user-authored scripts.
    // This is what the user sounds like — any generic "YouTube Shorts style"
    // template must be overridden by these concrete patterns.
    const STYLE_SPEC = `
# 작성자 스타일 명세 (반드시 준수)

## 오프닝 훅 (첫 2~4줄) — 아래 패턴 중 하나를 고르세요
1. **직접 권고형**: "[질환] 환자분들은 [X]을/를 [신중하게/반드시/조심해서] 복용/섭취/관리하셔야 합니다"
2. **수치 제시형**: "[질환] 환자의 약 X%는 [증상/합병증]을 경험하고 있습니다"
3. **증상 제시형**: "[증상 A]이 아닌 [증상 B]가 계속된다면 [질환]을/를 의심해야 됩니다"
4. **정의형**: "[질환]은 ... [짧은 설명] 자가면역질환입니다"
5. **환자 질문형**: "이레한의원에서 [질환] 치료를 받고 계신 [나이대] [성별]분께서 다음과 같은 질문을 하셨습니다"
훅은 짧고 단호하게. 설명은 뒤로 미룸.

## 말투·경어
- 환자를 가리킬 때는 반드시 **"환자분들" / "환자분들은" / "환자분들께서는"** (존대)
- 당위: **"~하셔야 합니다" / "~해야 됩니다"** (혼용 OK)
- 가능성: **"~할 수 있습니다" / "~나타날 수 있게 됩니다"** — 단정보다 여지를 둠
- 부드러운 연결 어미 **"~는데요"** 를 전환 지점에 자주 사용
- 화자는 1인칭 "저" 대신 **"알아보겠습니다" / "말씀드리면"** 같은 간접 경어체

## 연구 인용 — 아주 중요
근거는 반드시 구체적으로 적음. 아래 포맷을 따르세요:
- **연도 + 국가/기관 + 표본수 + 수치 + 결과**의 조합
- 예: "2022년 로마대 연구에서는 ... PPI를 장기 복용하면 ... 약 10배 가까이 높아진다고 보고했습니다"
- 예: "128명의 SS환자를 대상으로 한 연구에서는 51.6%에서 골다공증 소견을 보였으며..."
- 예: "대만인 2365만명의 국민건강보험 데이터를 분석한 연구"
- 기관 이름을 알고 있다면 표기 (로마대, 토론토대, 존스홉킨스, 영국 버밍험대 등)
- 수치는 **약 X%, 약 X배, X.X%** 형태
- 숫자 중간에 공백을 쓰기도 함 (예: "3 000명")

## 나열 구조 (본문)
- "이유는 크게 N가지입니다" → "첫 번째 [명사형 제목]" → 설명 → "두 번째 [명사형 제목]" → 설명
- 콜론/따옴표 없음. 제목 바로 뒤 줄바꿈 후 설명.
- 예: "첫 번째 비타민D 부족" / "두 번째 에스트로겐 감소" / "세 번째 자가면역성 염증" / "네 번째 약물 부작용"

## 전환·강조 어구 (자주 등장하는 작성자 특유 표현)
- "문제는 ~ 이라는 건데요" — 문제 제기 도입
- "여기서 주의가 필요한데요" — 주의 환기
- "결론부터 말씀드리면" — 본론 진입
- "즉, ..." — 요약/환원
- "쉽게 말해 ..." — 풀어서 설명
- "이것이 왜 중요할까요?" — 수사 의문 (드물게, 중요한 전환에서만)
- "오히려 ..." — 반전 도입
- "저자들은 ... 평가했습니다" / "... 보고했습니다" — 연구 결론 인용

## 마무리 (마지막 2~4줄)
아래 중 하나의 패턴을 사용:
- "따라서 [대상]분들이라면 [행동]에 신중을 기할 필요가 있겠습니다"
- "만약 [증상]이 있다면 [행동]이 꼭 필요합니다"
- "본인의 몸 상태를 관찰하며 [권장 행동]을 추천"
- 가끔 (해당 주제에 맞을 때만): "한의학 치료로 해결해 볼 수 있습니다"
- "~할 필요가 있겠습니다" 어미를 선호

## 줄바꿈 구조 (매우 중요)
- **한 줄 = 말할 때 2~3초, 평균 15~25자**
- 각 줄은 자막처럼 화면에 독립적으로 표시됨을 가정
- 한 문장이 길면 의미 단위로 줄바꿈
- 문장 끝에 마침표를 붙일 수도, 생략할 수도 있음 (샘플처럼)
- 어떤 줄은 "... 나빠질 수." 처럼 미완으로 짧게 끊기기도 함 (빠른 전달을 위해)

## 금지
- 이모지, 느낌표, 물음표(수사 의문 외)
- "정말!", "엄청!", "진짜 대박" 같은 과장 표현
- "지금 바로 병원에 가세요" 같은 직접 권유
- "오늘은 ~에 대해 알려드리겠습니다" 같은 유튜브 상투적 서론
- 자기소개, 인사말, "구독 좋아요" 같은 CTA
- 제목, 헤더, "[도입]" 같은 메타 표시
- 영어 학술어를 그대로 써도 됨 (PPI, RANKL, TSHR Ab 등). 번역 강요 금지.
- 없는 연구/통계 **절대 지어내지 말 것**. 제공된 자료에 있는 수치만 사용.`.trim();

    return `당신은 한국 자가면역질환 전문 한의사(이레한의원)의 YouTube 쇼츠 대본 작가 페르소나로 글을 씁니다. 아래 **작성자 스타일 명세**와 **15개 실제 샘플**의 문체를 엄격히 모방해 새 대본을 작성하세요.

${STYLE_SPEC}

# 길이·톤
- 분량: **${lenMin}~${lenMax}줄**
- 톤 추가 지시: ${toneLabel}

# 참고 샘플 (이 사람이 이렇게 씁니다. 문장 호흡·어미·구조를 흉내내세요)

${samplesBlock}

# 주제 (이번에 작성할 대본의 주제)
${topic}

# 근거 자료 (이 자료에만 근거해서 작성. 여기 없는 수치/연구는 지어내지 말 것.)
${content.slice(0, 20000)}${content.length > 20000 ? '\n\n[...자료가 잘렸습니다]' : ''}

# 최종 지시
위 주제로 **${lenMin}~${lenMax}줄** 분량의 쇼츠 대본을 작성하세요.
- 출력은 대본 본문만. 설명·서론·제목·헤더·메타 표시 없이 바로 첫 줄부터 시작.
- 반드시 샘플과 같은 문체·어미·경어·줄바꿈 습관을 따를 것.
- 자료에 구체적 연구·수치가 있으면 반드시 활용 (연도+기관+표본수+수치 포맷).
- 자료에 없는 내용은 쓰지 말 것.`;
  }

  async _callClaude(prompt) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.settings.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        errMsg = err.error?.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || '';
  }

  _renderStep3() {
    document.getElementById('scriptTopic').textContent = `주제: ${this.state.topic}`;
    const ta = document.getElementById('generatedScript');
    ta.value = this.state.script;
    const lines = this.state.script.split('\n').filter(l => l.trim()).length;
    document.getElementById('scriptLines').textContent = `${lines}줄`;
    document.getElementById('scriptChars').textContent = `${this.state.script.length.toLocaleString()}자`;

    ta.oninput = () => {
      this.state.script = ta.value;
      const l = ta.value.split('\n').filter(x => x.trim()).length;
      document.getElementById('scriptLines').textContent = `${l}줄`;
      document.getElementById('scriptChars').textContent = `${ta.value.length.toLocaleString()}자`;
    };
  }

  // ------------------------------------------------------------
  // Script Actions
  // ------------------------------------------------------------
  copyScript() {
    if (!this.state.script) return;
    navigator.clipboard.writeText(this.state.script)
      .then(() => this.toast('클립보드에 복사됨', 'success'))
      .catch(() => this.toast('복사 실패', 'error'));
  }

  downloadScript() {
    if (!this.state.script) return;
    const filename = `${(this.state.topic || '쇼츠대본').slice(0, 30).replace(/[\\/:*?"<>|]/g, '_')}.txt`;
    const blob = new Blob([this.state.script], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.toast('다운로드 시작', 'success');
  }

  newScript() {
    if (this.state.script && !confirm('현재 작업을 새로 시작할까요?')) return;
    this.state = {
      ...this.state,
      sources: [],
      extractedContent: '',
      topic: '',
      script: '',
      pdfFiles: [],
    };
    document.getElementById('urlInput').value = '';
    document.getElementById('textInput').value = '';
    document.getElementById('topicInput').value = '';
    document.getElementById('extractedContent').value = '';
    document.getElementById('generatedScript').value = '';
    this._renderPdfFileList();
    this.goToStep(1);
    this.switchInputTab('url');
  }

  // ------------------------------------------------------------
  // History
  // ------------------------------------------------------------
  _loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]'); }
    catch { return []; }
  }

  _saveToHistory() {
    const entry = {
      id: Date.now(),
      topic: this.state.topic,
      script: this.state.script,
      date: new Date().toISOString(),
    };
    this.history.unshift(entry);
    this.history = this.history.slice(0, 30);
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(this.history));
    this._renderHistory();
  }

  _renderHistory() {
    const el = document.getElementById('historyList');
    if (!this.history.length) {
      el.innerHTML = '<p class="empty-hint">생성한 대본이 여기에 저장됩니다</p>';
      return;
    }
    el.innerHTML = this.history.map(h => `
      <div class="history-item" data-id="${h.id}" title="${this._esc(h.topic)}">
        ${this._esc(h.topic.slice(0, 32))}
        <span class="history-date">${new Date(h.date).toLocaleDateString('ko-KR')}</span>
      </div>
    `).join('');
    el.querySelectorAll('.history-item').forEach(item => {
      item.onclick = () => this._loadHistoryItem(Number(item.dataset.id));
    });
  }

  _loadHistoryItem(id) {
    const h = this.history.find(x => x.id === id);
    if (!h) return;
    this.state.topic = h.topic;
    this.state.script = h.script;
    this._renderStep3();
    this.goToStep(3);
  }

  // ------------------------------------------------------------
  // Settings Modal
  // ------------------------------------------------------------
  openSettings() {
    document.getElementById('apiKeyInput').value = this.settings.apiKey;
    document.getElementById('modelSelect').value = this.settings.model;
    document.getElementById('proxySelect').value = this.settings.proxy;
    document.getElementById('customProxyInput').value = this.settings.customProxy;
    this._toggleCustomProxyInput();
    document.getElementById('settingsModal').classList.add('active');

    document.getElementById('proxySelect').onchange = () => this._toggleCustomProxyInput();
  }

  _toggleCustomProxyInput() {
    const val = document.getElementById('proxySelect').value;
    const input = document.getElementById('customProxyInput');
    input.style.display = val === 'custom' ? 'block' : 'none';
  }

  closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
  }

  saveSettings() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const model = document.getElementById('modelSelect').value;
    const proxy = document.getElementById('proxySelect').value;
    const customProxy = document.getElementById('customProxyInput').value.trim();

    if (apiKey && !apiKey.startsWith('sk-ant-')) {
      this._setApiStatus('error', '올바른 Anthropic API 키가 아닙니다 (sk-ant-로 시작)');
      return;
    }

    this.settings = { apiKey, model, proxy, customProxy };
    localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
    localStorage.setItem(STORAGE_KEYS.model, model);
    localStorage.setItem(STORAGE_KEYS.proxy, proxy);
    localStorage.setItem(STORAGE_KEYS.custom, customProxy);

    this._setApiStatus('success', '저장되었습니다');
    setTimeout(() => this.closeSettings(), 800);
  }

  _setApiStatus(type, msg) {
    const el = document.getElementById('apiStatus');
    el.className = `api-status ${type}`;
    el.textContent = msg;
  }

  toggleKeyVisibility() {
    const input = document.getElementById('apiKeyInput');
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  // ------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------
  showLoading(text, subtext = '') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingSubtext').textContent = subtext;
    document.getElementById('loadingOverlay').classList.add('active');
  }

  _setLoadingSub(subtext) {
    document.getElementById('loadingSubtext').textContent = subtext;
  }

  hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
  }

  toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show ${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
  }
}

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
const app = new ShortsWriterApp();
window.app = app;
