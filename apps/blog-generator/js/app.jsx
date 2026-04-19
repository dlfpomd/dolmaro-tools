const { useState, useRef, useEffect } = React;

const STORAGE_KEYS = {
  claude: "anthropic_api_key",
  gemini: "gemini_api_key",
};
const PROVIDER_STORAGE = "blog_provider";

const PROVIDERS = {
  gemini: {
    id: "gemini",
    label: "Gemini 2.5 Pro (무료)",
    short: "Gemini",
    keyPrefix: "AIza",
    keyLabel: "Google AI Studio API Key",
    keyPlaceholder: "AIza...로 시작하는 Gemini API 키",
    docUrl: "https://aistudio.google.com/apikey",
    docLabel: "aistudio.google.com/apikey",
    note: "무료 티어: gemini-2.5-pro는 하루 50회 · 분당 5회. 쿼타 초과 시 flash로 자동 전환.",
  },
  claude: {
    id: "claude",
    label: "Claude Sonnet 4 (유료)",
    short: "Claude",
    keyPrefix: "sk-ant",
    keyLabel: "Anthropic API Key",
    keyPlaceholder: "sk-ant-api03-...",
    docUrl: "https://console.anthropic.com/settings/keys",
    docLabel: "console.anthropic.com",
    note: "건당 약 $0.03~0.10. API 사용량만큼 과금.",
  },
};

function detectProviderFromKey(key) {
  if (!key) return null;
  if (key.startsWith(PROVIDERS.claude.keyPrefix)) return "claude";
  if (key.startsWith(PROVIDERS.gemini.keyPrefix)) return "gemini";
  return null;
}

const STYLE_ITEMS = [
  "도입부: 논문 주제에 맞게 AI가 패턴 자동 선택",
  "환자 목소리→질문형 ↔ 질문형→환자공감 번갈아 사용",
  "질환·연구 설명 + 연도+저널명 포함 인용",
  "한의학 용어: 한글+괄호 한자 병기 예) 음허(陰虛)",
  "핵심 연구 결과 별도 박스 강조",
  "희망·위로 메시지 + 부드러운 내원 안내",
];

const SYSTEM_PROMPT = `당신은 한의사(쇼그렌증후군·구강작열감증후군·자가면역질환·신경병증 전문) 블로그 글쓰기 전문 작가입니다.
반드시 아래 형식 그대로 반환하세요. 다른 설명 절대 금지.

===META_JSON===
{
  "paper_title": "string",
  "paper_authors": "string",
  "paper_journal": "string",
  "paper_year": "string",
  "paper_summary": "string (2~3문장)",
  "key_findings": ["string","string","string"],
  "keywords": ["string x5 SEO최적화"],
  "blog_title": "string"
}
===END_META===
===BLOG_CONTENT===
(여기에 블로그 본문 HTML. 허용 태그: h2 h3 p ul li div.highlight-box div.source-note div.faq-box)
===END_BLOG===
===FAQ===
(여기에 FAQ HTML만. 아래 형식 그대로 3개 모두 작성. div.faq-box 사용 금지)
<h3>Q1. (일반인이 실제로 궁금해할 질문 — "~인가요?", "~할 수 있나요?" 형태)</h3>
<p>(명확하고 친절한 답변, 2~4문장. AI가 단독 인용 가능한 완결형 문장)</p>
<h3>Q2. (두 번째 질문)</h3>
<p>(답변)</p>
<h3>Q3. (세 번째 질문)</h3>
<p>(답변)</p>
===END_FAQ===`;

function buildPrompt(extra, length, secs, disease, cta) {
  const lenMap = { medium: "1400~1600자", long: "2400~2600자", detail: "2900~3100자" };
  const disMap = {
    both: "쇼그렌증후군과 구강작열감증후군 환자 모두 고려",
    sjogren: "쇼그렌증후군 환자 중심",
    bms: "구강작열감증후군 환자 중심",
    auto: "논문 주제에 맞게 자동",
  };
  const ctaMap = {
    soft: '마지막에 "전문 한의사와 상담해보시길 권해드립니다" 수준으로 부드럽게',
    none: "내원 권유 없이 정보로만 마무리",
    direct: "마지막에 명확하게 한의원 내원 권유",
  };
  return `이 의학 논문을 분석하고 아래 지침에 따라 한의사 블로그 글을 작성하세요.

[도입부] 논문 주제에 따라 더 적합한 패턴 선택:
패턴A(증상 중심): 환자 목소리 먼저 → 질문형으로 이어받기
패턴B(기전·치료 중심): 질문형 먼저 → 환자 공감으로 연결

[본문 구성 순서]
1. 질환 배경 + 연구 소개: "2024년 ○○저널에 발표된 연구에서…" (연도+저널명 필수)
2. 논문 핵심 수치/결과 → highlight-box 강조 (첫 줄 <strong>📊 연구 핵심 결과</strong>)
3. 한의학적 해석·치료 연결 (한자 병기: 음허(陰虛), 조증(燥症) 등)
4. 현대 의학 기전과 한의학 원리 비교
5. 희망·위로 메시지로 마무리

[어조] 독자가 "내 얘기네"라고 느낄 수 있는 따뜻하고 공감적인 친근체. 의학 용어는 쉽게 풀어서 설명.
${extra ? `[추가 지시]\n${extra}` : ""}

글 길이: ${lenMap[length]} (글이 더 길어져도 괜찮으니 QnA 3개를 반드시 모두 작성) | 소제목(h2): ${secs}개 | 질환 포커스: ${disMap[disease]} | 내원 안내: ${ctaMap[cta]}

[키워드 반복 제한 - 중요]
아래 항목은 blog_content 전체에서 각각 20회 미만으로만 사용하세요.
- 질환명: 쇼그렌증후군, 구강작열감증후군, 자가면역질환, 신경병증 등 논문에 등장하는 모든 질환명
- 증상어: 구강건조, 안구건조, 작열감, 통증, 염증, 피로, 구강점막 등 핵심 증상 관련 단어
- 치료/기전어: 면역, 신경, 침치료, 한약, 타액 등 핵심 의학·한의학 용어
→ 반복이 필요한 경우 유사어·대명사·우회 표현으로 대체하세요.
   예) 쇼그렌증후군 → "이 질환", "해당 증후군", "자가면역 문제"
   예) 구강작열감 → "이 불편함", "혀의 타는 느낌", "구강 내 열감"

[SEO / GEO / AEO 최적화 - 중요]
■ SEO (검색엔진 최적화 - 네이버·구글)
- 핵심 키워드를 첫 번째 <p>와 첫 번째 <h2>에 자연스럽게 포함
- 각 h2 소제목은 독자가 실제로 검색할 만한 질문형 또는 핵심어 포함 형태로 작성
  예) "쇼그렌증후군, 왜 입이 마를까?", "한의학으로 구강작열감을 다스리는 방법"
- 본문에 내부 의미 연결어 자연스럽게 배치 (예: "이와 관련하여", "특히 주목할 점은")
- 글 전체에 걸쳐 LSI 키워드(연관 검색어) 자연스럽게 분산 포함

■ GEO (생성형 검색 최적화 - Google SGE, Bing Copilot 등)
- 각 섹션 첫 문장은 해당 섹션의 핵심 내용을 1~2문장으로 요약하는 형태로 시작
- 수치·연구 결과는 "○○저널 ○○년 연구에 따르면 ~" 형식으로 출처 명시
- 전문 용어는 반드시 괄호 안에 쉬운 설명 병기

■ AEO (AI 답변 최적화 - ChatGPT, Claude, Perplexity 등)
- 글 마지막에 아래 형식의 FAQ 섹션을 반드시 추가:
  <h2>자주 묻는 질문 (FAQ)</h2>
  <div class="faq-box">
    <h3>Q1. (일반인이 실제로 궁금해할 질문)</h3>
    <p>(명확하고 친절한 답변, 2~4문장)</p>
    <h3>Q2. (두 번째 질문)</h3>
    <p>(답변)</p>
    <h3>Q3. (세 번째 질문)</h3>
    <p>(답변)</p>
  </div>
- FAQ 질문은 "~인가요?", "~할 수 있나요?", "~는 무엇인가요?" 형태의 구어체로 작성
- AI가 직접 인용할 수 있도록 각 답변은 단독으로 읽어도 이해되는 완결형 문장으로 구성`;
}

/** URL 해시 또는 localStorage에서 API 키 읽어오기. 키 접두사로 provider 자동 판별. */
function readKeyFromUrlOrStorage(preferredProvider) {
  const tryParse = (s, name) => {
    if (!s) return "";
    const re = new RegExp(`[?&#]${name}=([^&]+)`);
    const m = s.match(re);
    return m ? decodeURIComponent(m[1]) : "";
  };
  const fromHash =
    tryParse(window.location.hash, "k") ||
    tryParse(window.location.hash, "key") ||
    tryParse(window.location.hash, "apiKey");
  const fromQuery =
    tryParse(window.location.search, "k") ||
    tryParse(window.location.search, "key") ||
    tryParse(window.location.search, "apiKey");
  const fromUrl = fromHash || fromQuery;
  if (fromUrl) {
    const detected = detectProviderFromKey(fromUrl);
    if (detected) {
      try {
        localStorage.setItem(STORAGE_KEYS[detected], fromUrl);
        localStorage.setItem(PROVIDER_STORAGE, detected);
      } catch (e) {}
      return { key: fromUrl, provider: detected };
    }
  }
  const p = preferredProvider || localStorage.getItem(PROVIDER_STORAGE) || "gemini";
  return { key: localStorage.getItem(STORAGE_KEYS[p]) || "", provider: p };
}

/** Claude Messages API 호출 */
async function callClaude({ apiKey, systemPrompt, userPrompt, pdfBase64 }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: userPrompt },
        ],
      }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return (data.content || []).map((i) => i.text || "").join("");
}

/** Gemini generateContent API 호출. 2.5-pro 먼저 시도, 쿼터 초과 시 2.5-flash 자동 fallback. */
async function callGemini({ apiKey, systemPrompt, userPrompt, pdfBase64 }) {
  const models = ["gemini-2.5-pro", "gemini-2.5-flash"];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
        { text: userPrompt },
      ],
    }],
    generationConfig: { maxOutputTokens: 8000, temperature: 0.7 },
  });

  let lastErr = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json();
      if (data.error) {
        const msg = data.error.message || JSON.stringify(data.error);
        // Quota/rate error? try next model
        if (/quota|rate|resource_exhausted|429/i.test(msg) && model !== models[models.length - 1]) {
          lastErr = new Error(`${model}: ${msg}`);
          continue;
        }
        throw new Error(msg);
      }
      const cand = (data.candidates || [])[0];
      if (!cand) throw new Error("Gemini가 응답을 생성하지 못했습니다.");
      if (cand.finishReason === "SAFETY") throw new Error("Gemini 안전 필터에 의해 차단됨");
      return ((cand.content || {}).parts || []).map((p) => p.text || "").join("");
    } catch (e) {
      lastErr = e;
      // If it's not a quota error and we've only tried one model, rethrow
      if (!/quota|rate|resource_exhausted|429/i.test(e.message)) throw e;
    }
  }
  throw lastErr || new Error("Gemini 호출 실패");
}

function BlogGenerator() {
  const [provider, setProvider] = useState(() => localStorage.getItem(PROVIDER_STORAGE) || "gemini");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [bookmarkUrl, setBookmarkUrl] = useState("");
  const [bookmarkCopied, setBookmarkCopied] = useState(false);

  // Initial mount: check URL hash/query first, fall back to storage for current provider
  useEffect(() => {
    const { key, provider: detected } = readKeyFromUrlOrStorage(provider);
    if (detected !== provider) setProvider(detected);
    if (key) { setApiKey(key); setApiKeySaved(true); }
    setApiKeyLoading(false);
  }, []);

  // When provider toggles, load that provider's saved key
  function switchProvider(next) {
    if (next === provider) return;
    localStorage.setItem(PROVIDER_STORAGE, next);
    setProvider(next);
    const saved = localStorage.getItem(STORAGE_KEYS[next]) || "";
    setApiKey(saved);
    setApiKeySaved(!!saved);
  }

  useEffect(() => {
    if (apiKey && apiKeySaved) {
      const base = window.location.origin + window.location.pathname;
      setBookmarkUrl(`${base}#k=${encodeURIComponent(apiKey)}`);
    } else {
      setBookmarkUrl("");
    }
  }, [apiKey, apiKeySaved]);

  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [extraStyle, setExtraStyle] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [length, setLength] = useState("detail");
  const [sections, setSections] = useState("7");
  const [disease, setDisease] = useState("both");
  const [cta, setCta] = useState("soft");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("preview");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [rawDebug, setRawDebug] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const fileRef = useRef();

  const STEPS = [
    "논문 내용 파악",
    "연구 결과 추출 및 한의학 연결",
    "환자 공감 언어로 변환",
    "선생님 스타일 블로그 완성",
  ];

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type === "application/pdf") setFile(f);
    else alert("PDF 파일만 지원합니다.");
  }

  function toBase64(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = () => rej(new Error("파일 읽기 실패"));
      r.readAsDataURL(f);
    });
  }

  async function generate() {
    const pInfo = PROVIDERS[provider];
    if (!apiKey.trim()) { alert(`${pInfo.keyLabel}를 먼저 입력해주세요.`); return; }
    if (!file) { alert("논문 PDF를 먼저 업로드해주세요."); return; }
    if (file.size > 18 * 1024 * 1024) {
      alert("PDF 용량이 너무 큽니다 (최대 18MB). 이미지 해상도를 낮춰 재저장해주세요.");
      return;
    }
    setStatus("loading"); setStepIdx(0); setErrorMsg("");
    const timer = setInterval(() => setStepIdx((p) => Math.min(p + 1, 3)), 2800);
    try {
      const base64 = await toBase64(file);
      const userPrompt = buildPrompt(extraStyle, length, sections, disease, cta);
      const caller = provider === "claude" ? callClaude : callGemini;
      const raw = await caller({
        apiKey: apiKey.trim(),
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        pdfBase64: base64,
      });
      clearInterval(timer);
      setStepIdx(4);
      setRawDebug(raw);

      const metaM = raw.match(/===META_JSON===([\s\S]*?)===END_META===/);
      if (!metaM) throw new Error("META 응답을 찾을 수 없습니다. 디버그 탭을 확인해주세요.");
      const metaJson = metaM[1].trim().replace(/```json|```/g, "").trim();
      const meta = JSON.parse(metaJson);

      const contentM = raw.match(/===BLOG_CONTENT===([\s\S]*?)===END_BLOG===/);
      let blogContent = "";
      if (contentM) {
        blogContent = contentM[1].trim();
      } else {
        const fallback = raw.split("===END_META===")[1] || "";
        blogContent = fallback.replace(/===BLOG_CONTENT===|===END_BLOG===|===FAQ===[\s\S]*?===END_FAQ===/g, "").trim();
      }

      const faqM = raw.match(/===FAQ===([\s\S]*?)===END_FAQ===/);
      const faqHtml = faqM ? faqM[1].trim() : "";

      const fullContent = faqHtml
        ? `${blogContent}\n<h2>자주 묻는 질문 (FAQ)</h2>\n${faqHtml}`
        : blogContent;

      const parsed = { ...meta, blog_content: fullContent, faq_debug: faqHtml, raw_debug: raw };
      setResult(parsed);
      setStatus("done");
      setTab("preview");
    } catch (err) {
      clearInterval(timer);
      setErrorMsg(err.message);
      setStatus("error");
    }
  }

  function copyText() {
    if (!result) return;
    const text = `${result.blog_title}\n\n` + (result.blog_content || "").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
    try {
      navigator.clipboard.writeText(text).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
        () => fallbackCopy(text)
      );
    } catch (e) { fallbackCopy(text); }
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try {
      document.execCommand("copy");
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (e) { alert("복사 실패: 텍스트 탭에서 직접 선택해 복사해주세요."); }
    document.body.removeChild(ta);
  }

  function copyBookmark() {
    if (!bookmarkUrl) return;
    try {
      navigator.clipboard.writeText(bookmarkUrl).then(
        () => { setBookmarkCopied(true); setTimeout(() => setBookmarkCopied(false), 2000); },
        () => fallbackCopyBookmark()
      );
    } catch (e) { fallbackCopyBookmark(); }
  }
  function fallbackCopyBookmark() {
    const ta = document.createElement("textarea");
    ta.value = bookmarkUrl;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand("copy"); setBookmarkCopied(true); setTimeout(() => setBookmarkCopied(false), 2000); } catch (e) {}
    document.body.removeChild(ta);
  }

  const accent = "#8b4513", green = "#2d5016", border = "#d4c9b8", paper = "#f7f4ef", muted = "#6b5e52";

  function styledHtml(html) {
    return (html || "")
      .replace(/<h2>/g, `<h2 style="font-family:serif;font-size:1.1rem;font-weight:700;color:${accent};margin:1.8rem 0 0.55rem">`)
      .replace(/<h3>/g, `<h3 style="font-size:0.97rem;font-weight:600;margin:1.2rem 0 0.4rem">`)
      .replace(/<p>/g, `<p style="font-size:0.91rem;line-height:2.05;color:#252015;margin-bottom:0.75rem">`)
      .replace(/<div class="highlight-box">/g, `<div style="background:#eaf2e0;border-left:4px solid ${green};padding:0.85rem 1rem;border-radius:0 8px 8px 0;margin:1.2rem 0;font-size:0.87rem;line-height:1.9">`)
      .replace(/<div class="source-note">/g, `<div style="margin-top:2rem;padding-top:0.85rem;border-top:1px solid ${border};font-size:0.74rem;color:${muted};font-style:italic;line-height:1.7">`)
      .replace(/<div class="faq-box">/g, `<div style="background:#f4f0ff;border-left:4px solid #7c5cbf;padding:0.85rem 1rem;border-radius:0 8px 8px 0;margin:1.2rem 0;font-size:0.87rem;line-height:1.9">`);
  }

  const s = {
    wrap: { fontFamily: "system-ui,sans-serif", background: paper, minHeight: "100vh", color: "#1a1410" },
    hdr: { background: "#1a1410", color: paper, padding: "0.9rem 1.5rem", display: "flex", alignItems: "center", gap: "0.9rem", borderBottom: `3px solid ${accent}`, paddingLeft: "140px" },
    logo: { width: 34, height: 34, background: accent, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 15, color: "white", fontWeight: "bold", flexShrink: 0 },
    grid: { display: "grid", gridTemplateColumns: "300px 1fr", gap: "1.1rem", padding: "1.2rem 1.5rem" },
    panel: { background: "white", border: `1px solid ${border}`, borderRadius: 10, padding: "1rem 1.1rem", boxShadow: "0 2px 8px rgba(26,20,16,0.07)", marginBottom: "1rem" },
    ptitle: { fontSize: "0.68rem", fontWeight: 700, color: accent, marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em" },
    sel: { width: "100%", padding: "0.4rem 0.5rem", border: `1px solid ${border}`, borderRadius: 6, fontFamily: "inherit", fontSize: "0.75rem", background: paper, color: "#1a1410" },
    btnSm: { padding: "0.32rem 0.7rem", background: "white", border: `1px solid ${border}`, borderRadius: 6, fontSize: "0.72rem", cursor: "pointer", color: muted, fontFamily: "inherit" },
    tab: (a) => ({ padding: "0.26rem 0.65rem", border: `1px solid ${a ? accent : border}`, borderRadius: 20, background: a ? accent : "white", fontSize: "0.72rem", cursor: "pointer", color: a ? "white" : muted, fontFamily: "inherit" }),
    genBtn: (d) => ({ width: "100%", padding: "0.82rem", background: d ? "#c4b5a8" : accent, color: "white", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 700, cursor: d ? "not-allowed" : "pointer" }),
  };

  return (
    <div style={s.wrap}>
      <header style={s.hdr}>
        <div style={s.logo}>論</div>
        <div>
          <div style={{ fontFamily: "serif", fontSize: "1.1rem", fontWeight: 700 }}>논문 → 한의학 블로그 생성기</div>
          <div style={{ fontSize: "0.71rem", color: "#a89880", marginTop: 2 }}>쇼그렌증후군 · 구강작열감증후군 · 자가면역질환 전문</div>
        </div>
      </header>

      <div style={s.grid}>
        <div>
          <div style={s.panel}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
              <div style={s.ptitle}>🔑 AI 제공자 · API 키</div>
              {apiKeySaved && (
                <button style={{ ...s.btnSm, fontSize: "0.66rem", color: "#c0392b" }} onClick={async () => {
                  try { await window.storage.delete(STORAGE_KEYS[provider]); } catch (e) {}
                  if (window.location.hash.includes("k=") || window.location.hash.includes("key=")) {
                    history.replaceState(null, "", window.location.pathname + window.location.search);
                  }
                  setApiKey(""); setApiKeySaved(false);
                }}>삭제</button>
              )}
            </div>

            {/* Provider toggle */}
            <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.6rem" }}>
              {Object.values(PROVIDERS).map((p) => (
                <button
                  key={p.id}
                  onClick={() => switchProvider(p.id)}
                  style={{
                    flex: 1, padding: "0.45rem 0.5rem", borderRadius: 7,
                    border: `1px solid ${provider === p.id ? accent : border}`,
                    background: provider === p.id ? accent : "white",
                    color: provider === p.id ? "white" : muted,
                    fontSize: "0.7rem", fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {p.short}
                </button>
              ))}
            </div>

            {apiKeyLoading ? (
              <div style={{ fontSize: "0.75rem", color: muted, padding: "0.5rem 0" }}>🔄 저장된 키 불러오는 중…</div>
            ) : apiKeySaved ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "#eaf2e0", border: `1px solid #b8d4a0`, borderRadius: 7, padding: "0.5rem 0.75rem" }}>
                  <span style={{ fontSize: "0.85rem" }}>✅</span>
                  <span style={{ fontSize: "0.75rem", color: green, fontWeight: 600 }}>{PROVIDERS[provider].short} 키 등록됨</span>
                  <span style={{ fontSize: "0.72rem", color: muted, marginLeft: "auto", fontFamily: "monospace" }}>{apiKey.slice(0, 10)}…</span>
                </div>
                <div style={{ fontSize: "0.66rem", color: muted, marginTop: "0.4rem", lineHeight: 1.5 }}>
                  {PROVIDERS[provider].note}
                </div>
                {bookmarkUrl && (
                  <div style={{ marginTop: "0.5rem", padding: "0.55rem 0.7rem", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 7 }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#0c4a6e", marginBottom: "0.25rem" }}>🔖 영구 북마크 URL</div>
                    <div style={{ fontSize: "0.65rem", color: "#075985", lineHeight: 1.5, marginBottom: "0.35rem" }}>
                      브라우저 저장소가 지워져도 이 URL로 접속하면 키가 자동 복원됩니다. (접두사로 provider 자동 판별)
                    </div>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      <input type="text" value={bookmarkUrl} readOnly onFocus={(e) => e.target.select()}
                        style={{ flex: 1, minWidth: 0, padding: "0.3rem 0.4rem", border: `1px solid ${border}`, borderRadius: 5, fontSize: "0.65rem", fontFamily: "monospace", background: "white" }} />
                      <button onClick={copyBookmark} style={{ ...s.btnSm, padding: "0.3rem 0.6rem", fontSize: "0.68rem", background: accent, color: "white", borderColor: accent }}>
                        {bookmarkCopied ? "✓" : "복사"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <label style={{ display: "block", fontSize: "0.68rem", fontWeight: 600, color: muted, marginBottom: "0.3rem" }}>
                  {PROVIDERS[provider].keyLabel}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setApiKeySaved(false); }}
                  placeholder={PROVIDERS[provider].keyPlaceholder}
                  style={{ width: "100%", padding: "0.45rem 0.55rem", border: `1px solid ${apiKey ? green : border}`, borderRadius: 7, fontFamily: "monospace", fontSize: "0.73rem", background: paper, color: "#1a1410", boxSizing: "border-box" }}
                />
                <button
                  onClick={async () => {
                    const trimmed = apiKey.trim();
                    const expected = PROVIDERS[provider].keyPrefix;
                    if (!trimmed) { alert("API 키를 입력해주세요."); return; }
                    if (!trimmed.startsWith(expected)) {
                      alert(`${PROVIDERS[provider].short} API 키는 ${expected}로 시작합니다. 제공자를 잘못 선택했다면 위 탭에서 전환해주세요.`);
                      return;
                    }
                    try {
                      await window.storage.set(STORAGE_KEYS[provider], trimmed);
                      localStorage.setItem(PROVIDER_STORAGE, provider);
                    } catch (e) {}
                    setApiKey(trimmed);
                    setApiKeySaved(true);
                  }}
                  style={{ ...s.genBtn(false), marginTop: "0.45rem", padding: "0.5rem", fontSize: "0.78rem" }}
                >저장</button>
                <div style={{ fontSize: "0.67rem", color: "#a89880", marginTop: "0.35rem", lineHeight: 1.6 }}>
                  키 발급 → <a href={PROVIDERS[provider].docUrl} target="_blank" rel="noreferrer" style={{ color: accent }}>{PROVIDERS[provider].docLabel}</a>
                  <br/>
                  <span style={{ color: muted }}>{PROVIDERS[provider].note}</span>
                </div>
              </>
            )}
          </div>

          <div style={s.panel}>
            <div style={s.ptitle}>📄 논문 업로드</div>
            <div
              onClick={() => fileRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              style={{ border: `2px ${file ? "solid" : "dashed"} ${file ? green : dragging ? accent : border}`, background: file ? "#eaf2e0" : dragging ? "#fdf8f4" : paper, borderRadius: 8, padding: "1.4rem 1rem", textAlign: "center", cursor: "pointer" }}
            >
              <div style={{ fontSize: "1.7rem", marginBottom: "0.35rem" }}>{file ? "✅" : "📑"}</div>
              <div style={{ fontSize: "0.83rem", fontWeight: 600, marginBottom: "0.18rem" }}>{file ? "파일 준비 완료" : "PDF 클릭 또는 드래그"}</div>
              <div style={{ fontSize: "0.72rem", color: muted, wordBreak: "break-all" }}>{file ? file.name : "논문, 리뷰, 케이스 스터디"}</div>
            </div>
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => e.target.files[0] && setFile(e.target.files[0])} />
            {file && (
              <button style={{ ...s.btnSm, marginTop: "0.5rem", width: "100%", color: "#c0392b" }} onClick={() => setFile(null)}>
                ✕ 파일 제거
              </button>
            )}
          </div>

          <div style={s.panel}>
            <div style={s.ptitle}>✍️ 블로그 스타일</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#eaf2e0", color: green, border: "1px solid #b8d4a0", borderRadius: 20, padding: "0.18rem 0.65rem", fontSize: "0.69rem", fontWeight: 600, marginBottom: "0.65rem" }}>✅ 선생님 맞춤 스타일 적용</div>
            <div style={{ background: paper, borderRadius: 7, padding: "0.7rem 0.8rem", border: `1px solid ${border}` }}>
              {STYLE_ITEMS.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: "0.4rem", padding: "0.15rem 0", fontSize: "0.73rem", color: muted, lineHeight: 1.5 }}>
                  <span style={{ color: accent, flexShrink: 0 }}>▸</span><span>{item}</span>
                </div>
              ))}
            </div>
            <button style={{ ...s.btnSm, marginTop: "0.5rem", width: "100%" }} onClick={() => setShowExtra((p) => !p)}>
              {showExtra ? "▲ 닫기" : "✏️ 스타일 추가 수정"}
            </button>
            {showExtra && (
              <textarea
                value={extraStyle}
                onChange={(e) => setExtraStyle(e.target.value)}
                placeholder="추가 또는 변경할 스타일을 자유롭게 입력하세요..."
                style={{ width: "100%", marginTop: "0.5rem", height: 85, border: `1px solid ${border}`, borderRadius: 7, padding: "0.55rem", fontFamily: "inherit", fontSize: "0.74rem", lineHeight: 1.7, background: paper, resize: "vertical", boxSizing: "border-box" }}
              />
            )}
          </div>

          <div style={s.panel}>
            <div style={s.ptitle}>⚙️ 생성 옵션</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              {[
                { label: "글 길이", val: length, set: setLength, opts: [["medium", "보통(1500자)"], ["long", "길게(2500자)"], ["detail", "상세(3000자)"]] },
                { label: "소제목 수", val: sections, set: setSections, opts: [["5", "5개"], ["6", "6개"], ["7", "7개"]] },
                { label: "질환 포커스", val: disease, set: setDisease, opts: [["both", "쇼그렌+구강작열감"], ["sjogren", "쇼그렌증후군"], ["bms", "구강작열감증후군"], ["auto", "자동"]] },
                { label: "내원 안내", val: cta, set: setCta, opts: [["soft", "부드럽게"], ["none", "포함 안 함"], ["direct", "직접적으로"]] },
              ].map((o, i) => (
                <div key={i}>
                  <label style={{ display: "block", fontSize: "0.68rem", fontWeight: 600, color: muted, marginBottom: "0.24rem" }}>{o.label}</label>
                  <select style={s.sel} value={o.val} onChange={(e) => o.set(e.target.value)}>
                    {o.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <button style={s.genBtn(status === "loading")} disabled={status === "loading"} onClick={generate}>
            {status === "loading" ? "⏳ 생성 중…" : `✨ ${PROVIDERS[provider].short}로 블로그 생성`}
          </button>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.65rem" }}>
            <div style={{ fontFamily: "serif", fontSize: "0.95rem", fontWeight: 700 }}>생성된 블로그 글</div>
            {status === "done" && (
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button style={s.btnSm} onClick={copyText}>{copied ? "✅ 복사됨!" : "📋 복사"}</button>
                <button style={s.btnSm} onClick={generate}>🔄 재생성</button>
                <button style={{ ...s.btnSm, color: showDebug ? accent : muted }} onClick={() => setShowDebug((p) => !p)}>🔍 디버그</button>
              </div>
            )}
          </div>

          {status === "idle" && (
            <div style={{ ...s.panel, padding: "3.5rem 2rem", textAlign: "center" }}>
              <div style={{ fontSize: "2.8rem", marginBottom: "0.8rem", opacity: 0.28 }}>📝</div>
              <div style={{ fontFamily: "serif", fontSize: "1.05rem", color: muted, marginBottom: "0.5rem" }}>논문을 올리면 블로그 글이 완성됩니다</div>
              <div style={{ fontSize: "0.76rem", color: "#a89880", lineHeight: 1.9 }}>PDF 업로드 → 옵션 확인 → 생성 버튼<br/>선생님 스타일 그대로 자동 작성됩니다</div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
                {["📑 논문 PDF", "🔍 AI 분석", "✍️ 블로그 글"].map((t, i, a) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ background: "white", border: `1px solid ${border}`, borderRadius: 8, padding: "0.45rem 0.85rem", fontSize: "0.74rem", color: muted }}>{t}</span>
                    {i < a.length - 1 && <span style={{ color: accent }}>→</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {status === "error" && (
            <div style={{ ...s.panel, padding: "3rem 2rem", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.7rem" }}>⚠️</div>
              <div style={{ fontFamily: "serif", fontSize: "1rem", color: muted, marginBottom: "0.5rem" }}>오류가 발생했습니다</div>
              <div style={{ fontSize: "0.76rem", color: "#c0392b", lineHeight: 1.7, marginBottom: "1rem" }}>{errorMsg}</div>
              <button style={s.btnSm} onClick={generate}>다시 시도</button>
            </div>
          )}

          {status === "loading" && (
            <div style={{ ...s.panel, padding: "3rem 2rem", textAlign: "center" }}>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ width: 42, height: 42, border: "3px solid #e8e0d0", borderTopColor: accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 1.2rem" }} />
              <div style={{ fontFamily: "serif", fontSize: "1rem", marginBottom: "0.4rem" }}>블로그 글 생성 중…</div>
              <div style={{ fontSize: "0.75rem", color: muted }}>논문을 읽고 환자 눈높이 글로 변환하고 있습니다</div>
              <div style={{ marginTop: "1.2rem", display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: 280, margin: "1.2rem auto 0" }}>
                {STEPS.map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: i <= stepIdx ? "#1a1410" : "#b8a898" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: i < stepIdx ? green : i === stepIdx ? accent : "#e8e0d0" }} />
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {status === "done" && result && (
            <div style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 12px rgba(26,20,16,0.08)" }}>
              <div style={{ background: paper, borderBottom: `1px solid ${border}`, padding: "0.55rem 1.4rem", display: "flex", gap: "0.4rem" }}>
                {[["preview", "미리보기"], ["raw", "텍스트"], ["meta", "논문 정보"], ["debug", "🔍 디버그"]].map(([t, l]) => (
                  <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>{l}</button>
                ))}
              </div>
              <div style={{ padding: "1.75rem 2rem", minHeight: 500 }}>
                {tab === "preview" && (
                  <div>
                    <h1 style={{ fontFamily: "serif", fontSize: "1.55rem", fontWeight: 700, lineHeight: 1.45, marginBottom: "1.1rem", paddingBottom: "0.8rem", borderBottom: "2px solid #e8e0d0" }}>{result.blog_title}</h1>
                    {result.blog_content
                      ? <div dangerouslySetInnerHTML={{ __html: styledHtml(result.blog_content) }} />
                      : <div style={{ color: "#c0392b", fontSize: "0.82rem", marginTop: "1rem" }}>⚠️ 본문이 비어있습니다. 디버그 버튼으로 AI 원본 응답을 확인해주세요.</div>
                    }
                    {showDebug && (
                      <div style={{ marginTop: "2rem", background: "#1a1410", color: "#a8d8a8", borderRadius: 8, padding: "1rem", fontSize: "0.7rem", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 400, overflowY: "auto" }}>
                        <div style={{ color: "#f0c040", marginBottom: "0.5rem", fontWeight: 700 }}>🔍 AI 원본 응답 (rawDebug)</div>
                        {rawDebug || "응답 없음"}
                      </div>
                    )}
                  </div>
                )}
                {tab === "raw" && (
                  <pre style={{ fontFamily: "monospace", fontSize: "0.78rem", lineHeight: 1.9, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {`[제목]\n${result.blog_title}\n\n[본문]\n${(result.blog_content || "").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim()}`}
                  </pre>
                )}
                {tab === "debug" && (
                  <div>
                    <div style={{ marginBottom: "1rem" }}>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: accent, marginBottom: "0.4rem" }}>FAQ 추출 결과</div>
                      <pre style={{ background: "#1a1410", color: "#a8d8a8", borderRadius: 8, padding: "0.8rem", fontSize: "0.7rem", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflowY: "auto" }}>
                        {result.faq_debug || "❌ FAQ가 추출되지 않았습니다"}
                      </pre>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: accent, marginBottom: "0.4rem" }}>AI 원본 응답 (마지막 1000자)</div>
                      <pre style={{ background: "#1a1410", color: "#f0c040", borderRadius: 8, padding: "0.8rem", fontSize: "0.7rem", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto" }}>
                        {(result.raw_debug || "").slice(-1000)}
                      </pre>
                    </div>
                  </div>
                )}
                {tab === "meta" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
                    {[
                      ["논문 제목", result.paper_title, true],
                      ["저자", result.paper_authors, false],
                      ["저널 / 연도", `${result.paper_journal || ""} (${result.paper_year || ""})`, false],
                      ["논문 요약", result.paper_summary, true],
                    ].map(([label, val, full]) => (
                      <div key={label} style={{ background: paper, borderRadius: 8, padding: "0.6rem 0.8rem", gridColumn: full ? "1/-1" : "auto" }}>
                        <div style={{ fontSize: "0.66rem", color: muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "0.25rem" }}>{label}</div>
                        <div style={{ fontSize: "0.79rem", lineHeight: 1.5 }}>{val || "-"}</div>
                      </div>
                    ))}
                    <div style={{ background: paper, borderRadius: 8, padding: "0.6rem 0.8rem", gridColumn: "1/-1" }}>
                      <div style={{ fontSize: "0.66rem", color: muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "0.28rem" }}>핵심 연구 결과</div>
                      {(result.key_findings || []).map((f, i) => (
                        <div key={i} style={{ fontSize: "0.79rem", padding: "0.25rem 0", borderBottom: `1px solid ${border}` }}>• {f}</div>
                      ))}
                    </div>
                    <div style={{ background: paper, borderRadius: 8, padding: "0.6rem 0.8rem", gridColumn: "1/-1" }}>
                      <div style={{ fontSize: "0.66rem", color: muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "0.3rem" }}>SEO 키워드</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                        {(result.keywords || []).map((k, i) => (
                          <span key={i} style={{ background: "#e8e0d0", color: muted, padding: "0.14rem 0.48rem", borderRadius: 12, fontSize: "0.7rem" }}>#{k}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<BlogGenerator />);
