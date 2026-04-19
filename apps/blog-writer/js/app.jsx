const { useState, useRef, useEffect } = React;

// ────────────────────────────────────────────────
// Provider registry — shared storage keys with blog-generator
// ────────────────────────────────────────────────
const STORAGE_KEYS = {
  claude: "anthropic_api_key",
  gemini: "gemini_api_key",
};
const PROVIDER_STORAGE = "blog_provider";

const PROVIDERS = {
  gemini: {
    id: "gemini",
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
    short: "Claude",
    keyPrefix: "sk-ant",
    keyLabel: "Anthropic API Key",
    keyPlaceholder: "sk-ant-api03-...",
    docUrl: "https://console.anthropic.com/settings/keys",
    docLabel: "console.anthropic.com",
    note: "건당 약 $0.03~0.10. API 사용량만큼 과금.",
  },
};

const detectProviderFromKey = (k) => !k ? null : k.startsWith(PROVIDERS.claude.keyPrefix) ? "claude" : k.startsWith(PROVIDERS.gemini.keyPrefix) ? "gemini" : null;

function readKeyFromUrlOrStorage(preferred) {
  const tryParse = (s, name) => {
    if (!s) return "";
    const re = new RegExp(`[?&#]${name}=([^&]+)`);
    const m = s.match(re);
    return m ? decodeURIComponent(m[1]) : "";
  };
  const fromUrl =
    tryParse(window.location.hash, "k") || tryParse(window.location.hash, "key") ||
    tryParse(window.location.search, "k") || tryParse(window.location.search, "key");
  if (fromUrl) {
    const d = detectProviderFromKey(fromUrl);
    if (d) {
      try { localStorage.setItem(STORAGE_KEYS[d], fromUrl); localStorage.setItem(PROVIDER_STORAGE, d); } catch (e) {}
      return { key: fromUrl, provider: d };
    }
  }
  const p = preferred || localStorage.getItem(PROVIDER_STORAGE) || "gemini";
  return { key: localStorage.getItem(STORAGE_KEYS[p]) || "", provider: p };
}

// ────────────────────────────────────────────────
// System prompt — 이레한의원 브랜드 보이스 DNA
// ────────────────────────────────────────────────
const SYSTEM_PROMPT = `당신은 인천 송도 국제 신도시 이레한의원의 네이버 블로그 전문 콘텐츠 작가입니다.
첨부된 논문 원문을 꼼꼼히 읽고, 아래 브랜드 보이스 DNA와 SEO/GEO 규칙에 따라 블로그 글을 작성합니다.

[브랜드 보이스]
"논문으로 증명하고, 사례로 공감하며, 동행으로 마무리하는 — 학술 기반 신뢰형 의료 콘텐츠"

[5대 보이스 키워드]
1. 근거 중심: 논문과 통계를 동반
2. 절제된 권위: 단정 대신 유보, 과장 없는 전문성
3. 사례 기반 공감: 실제 환자 여정으로 공감 진입
4. 교육자적 친절: 비유와 단계적 설명
5. 동행자 포지셔닝: "치료해드립니다" → "함께 하겠습니다"

[제목 공식]
[질환명] + [핵심 키워드/증상] + [관계성 표현 또는 질문형 어미]

[4막 구조]
블록1 (10~15%) 환자 사례 도입:
- "최근 [질환명]으로 이레한의원에서 한의학 치료를 받고 계신 [연령대] [성별]분이 계십니다."
- 환자 내면 독백 따옴표 재현, 일상 불편함 묘사
- 전환 질문 1문장으로 마무리

블록2 (50~60%) 논문 기반 본론:
- "[연도]년 [저널]에서 출간된 연구를 리뷰해 보겠습니다." + 풀 서지사항
- 소주제(H2) 4~5개로 논문 핵심 내용 전개
- 통계 수치 불릿 포인트: "• [지표]: [수치]% / [수치]배 (P=0.xxx)"
- 핵심 결론은 짧은 문장 + 줄바꿈 강조

블록3 (15~20%) 임상 해석:
- "위 연구를 종합해 보면 / [결론1] / [결론2] / 라고 정리할 수 있겠습니다."
- 실용 조언: "만약 ~하다면, ~할 필요가 있겠습니다"
- 관련 글 유도

블록4 (10~15%) 이레한의원 연결:
- "인천 송도 국제 신도시 이레한의원은 [질환명]과 같은 자가면역질환을 주로 다루고 있습니다."
- 반드시 "그 과정에 이레한의원이 동행하겠습니다."로 마무리

[Q&A 섹션] 블록2 마지막 소주제로 반드시 Q&A 3개 포함
형식:
Q. (환자가 실제 검색할 질문)
A. (2~3문장, 유보적 어미)

[글자 수] 공백 제외 한글 기준 반드시 2,000자~2,500자. 섹션별 배분:
- 블록1: 약 250자
- 블록2 소주제 4~5개: 각 250~300자
- Q&A 3개: 각 100자
- 블록3: 약 300자
- 블록4: 약 200자

[SEO/GEO]
- 메인 키워드를 제목·첫문단·소제목에 배치
- 롱테일 키워드 3~5개 삽입
- E-E-A-T 요소, 출처/근거 명시

[금지 표현]
❌ "반드시 ~하셔야" → ✅ "~할 필요가 있겠습니다"
❌ "완치 가능" → ✅ "증상 개선에 도움이 될 수 있겠습니다"
❌ 획기적, 놀라운, 반드시 등 감정적 수식어
❌ "치료해드리겠습니다" → ✅ "동행하겠습니다"

[영문 병기]
- 질환명: 한글(영문 약어) — 쇼그렌증후군(Sjogren's syndrome, SS)
- 의학 개념: 한글 먼저 영문 괄호

[출력 형식] 반드시 아래 태그 형식으로만 출력. 다른 텍스트 없이.
<BLOG_META>
제목: (SEO 최적화 제목)
설명: (메타 디스크립션 160자 이내)
키워드: (키워드1, 키워드2, 키워드3, 키워드4, 키워드5)
논문요약: (논문 핵심 정보 2~3문장)
</BLOG_META>
<BLOG_CONTENT>
(마크다운 블로그 본문. # 제목으로 시작)
</BLOG_CONTENT>`;

const DISEASES = [
  "쇼그렌증후군", "루푸스(SLE)", "전신경화증", "구강작열감증후군",
  "류마티스관절염", "기타 자가면역질환", "직접 입력",
];

// ────────────────────────────────────────────────
// Utils
// ────────────────────────────────────────────────
const toBase64 = (f) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(",")[1]);
  r.onerror = () => rej(new Error("파일 읽기 실패"));
  r.readAsDataURL(f);
});

const countKorean = (t) => (t || "").replace(/[^\uAC00-\uD7A3]/g, "").length;

function parseRaw(raw) {
  const metaM = raw.match(/<BLOG_META>([\s\S]*?)<\/BLOG_META>/);
  const contentM = raw.match(/<BLOG_CONTENT>([\s\S]*?)<\/BLOG_CONTENT>/);
  const meta = { title: "", metaDescription: "", keywords: [], paperSummary: "" };
  if (metaM) {
    const get = (k) => { const r = metaM[1].match(new RegExp(`${k}:\\s*(.+)`)); return r ? r[1].trim() : ""; };
    meta.title = get("제목");
    meta.metaDescription = get("설명");
    meta.paperSummary = get("논문요약");
    const kw = get("키워드");
    meta.keywords = kw ? kw.split(/[,，]/).map(k => k.trim()).filter(Boolean) : [];
  }
  const content = contentM ? contentM[1].trim() : raw.trim();
  return { meta, content };
}

// ────────────────────────────────────────────────
// LLM callers
// ────────────────────────────────────────────────
async function callClaude({ apiKey, messages }) {
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
      system: SYSTEM_PROMPT,
      messages,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return (data.content || []).map(c => c.type === "text" ? c.text : "").join("");
}

/** Claude-style messages -> Gemini contents[]. PDFs become inline_data parts. */
function toGeminiContents(messages) {
  return messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: (Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }]).map(c => {
      if (c.type === "text") return { text: c.text };
      if (c.type === "document") {
        return { inline_data: { mime_type: c.source.media_type, data: c.source.data } };
      }
      return { text: "" };
    }),
  }));
}

async function callGemini({ apiKey, messages }) {
  const models = ["gemini-2.5-pro", "gemini-2.5-flash"];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: toGeminiContents(messages),
    generationConfig: { maxOutputTokens: 8000, temperature: 0.7 },
  });
  let lastErr = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = await res.json();
      if (data.error) {
        const msg = data.error.message || JSON.stringify(data.error);
        if (/quota|rate|resource_exhausted|429/i.test(msg) && model !== models[models.length - 1]) {
          lastErr = new Error(`${model}: ${msg}`); continue;
        }
        throw new Error(msg);
      }
      const cand = (data.candidates || [])[0];
      if (!cand) throw new Error("Gemini가 응답을 생성하지 못했습니다.");
      if (cand.finishReason === "SAFETY") throw new Error("Gemini 안전 필터에 의해 차단됨");
      return ((cand.content || {}).parts || []).map(p => p.text || "").join("");
    } catch (e) {
      lastErr = e;
      if (!/quota|rate|resource_exhausted|429/i.test(e.message)) throw e;
    }
  }
  throw lastErr || new Error("Gemini 호출 실패");
}

// ────────────────────────────────────────────────
// Sub components
// ────────────────────────────────────────────────
function Spinner({ msg }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
        </path>
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1a3a5c" }}>{msg}</div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>브랜드 보이스 DNA · 4막 구조 · SEO/GEO 적용 중...</div>
      </div>
    </div>
  );
}

function CheckItem({ ok, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
      <span>{ok ? "✅" : "❌"}</span>
      <span style={{ color: ok ? "#444" : "#aaa" }}>{label}</span>
    </div>
  );
}

function MetaCard({ result }) {
  const { meta, checklist } = result;
  const inRange = meta.charCount >= 2000 && meta.charCount <= 2500;
  return (
    <div style={{ background: "#f8f5ef", border: "1px solid #d4c9a8", borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#8b6f3e", letterSpacing: 1, marginBottom: 12 }}>📊 SEO 메타 정보</div>
      {meta.paperSummary && (
        <div style={{ background: "#1a3a5c0d", border: "1px solid #1a3a5c20", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1a3a5c", marginBottom: 4 }}>📄 논문 핵심 정보</div>
          <div style={{ fontSize: 12, color: "#334", lineHeight: 1.7 }}>{meta.paperSummary}</div>
        </div>
      )}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 3 }}>SEO 제목</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{meta.title}</div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 3 }}>메타 디스크립션</div>
        <div style={{ fontSize: 13, color: "#444", lineHeight: 1.6 }}>{meta.metaDescription}</div>
        <div style={{ fontSize: 11, color: meta.metaDescription && meta.metaDescription.length > 160 ? "#e74c3c" : "#27ae60", marginTop: 2 }}>
          {(meta.metaDescription || "").length}자 / 160자
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 6 }}>타겟 키워드</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {(meta.keywords || []).map((k, i) => (
            <span key={i} style={{ background: i === 0 ? "#1a3a5c18" : "#8b6f3e18", color: i === 0 ? "#1a3a5c" : "#8b6f3e", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20, border: `1px solid ${i === 0 ? "#1a3a5c30" : "#8b6f3e30"}` }}>{k}</span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, paddingTop: 10, borderTop: "1px solid #e0d8c8", flexWrap: "wrap" }}>
        <div style={{ fontSize: 12 }}>
          📝 글자 수(공백제외): <strong style={{ color: inRange ? "#27ae60" : "#e74c3c" }}>{meta.charCount?.toLocaleString()}자</strong>
          <span style={{ marginLeft: 4, color: inRange ? "#27ae60" : "#e74c3c" }}>{inRange ? "✅ 목표 범위" : "⚠️ 범위 벗어남"}</span>
        </div>
        {checklist?.subtopicCount !== undefined && (
          <div style={{ fontSize: 12 }}>
            📑 소주제: <strong style={{ color: checklist.subtopicCount >= 4 && checklist.subtopicCount <= 7 ? "#27ae60" : "#e67e22" }}>{checklist.subtopicCount}개</strong>
          </div>
        )}
      </div>
      {checklist && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e0d8c8" }}>
          <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 6 }}>브랜드 DNA 체크리스트</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <CheckItem ok={checklist.patientCase} label="환자 사례 도입" />
            <CheckItem ok={checklist.paperCited} label="논문 서지사항 인용" />
            <CheckItem ok={checklist.statistics} label="통계 수치 포함" />
            <CheckItem ok={checklist.reservedTone} label="유보적 어미 사용" />
            <CheckItem ok={checklist.companionEnding} label="동행 마무리" />
            <CheckItem ok={checklist.faqSection} label="Q&A 3개 포함" />
          </div>
        </div>
      )}
    </div>
  );
}

function renderMd(text) {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    if (line.startsWith("# ")) return <h1 key={i} style={{ fontSize: 21, fontWeight: 800, color: "#1a1a1a", margin: "22px 0 10px", fontFamily: "Georgia,serif", lineHeight: 1.4 }}>{line.slice(2)}</h1>;
    if (line.startsWith("## ")) return <h2 key={i} style={{ fontSize: 17, fontWeight: 700, color: "#1a3a5c", margin: "20px 0 7px", borderBottom: "2px solid #d4c9a8", paddingBottom: 4 }}>{line.slice(3)}</h2>;
    if (line.startsWith("### ")) return <h3 key={i} style={{ fontSize: 14, fontWeight: 700, color: "#8b6f3e", margin: "14px 0 5px" }}>{line.slice(4)}</h3>;
    if (line.startsWith("- ") || line.startsWith("• ")) return <div key={i} style={{ display: "flex", gap: 8, margin: "3px 0 3px 8px" }}><span style={{ color: "#8b6f3e", marginTop: 3, flexShrink: 0 }}>•</span><span style={{ fontSize: 14, color: "#333", lineHeight: 1.85 }}>{line.slice(2)}</span></div>;
    if (/^Q\./.test(line)) return <div key={i} style={{ fontSize: 14, fontWeight: 700, color: "#1a3a5c", margin: "10px 0 2px", background: "#1a3a5c08", padding: "6px 10px", borderRadius: 6, borderLeft: "3px solid #1a3a5c" }}>{line}</div>;
    if (/^A\./.test(line)) return <div key={i} style={{ fontSize: 13, color: "#444", margin: "0 0 8px", paddingLeft: 13, lineHeight: 1.8 }}>{line}</div>;
    if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
    return <p key={i} style={{ fontSize: 14, color: "#333", lineHeight: 1.9, margin: "3px 0" }}>{line}</p>;
  });
}

// ────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────
function BlogWriter() {
  // Provider + API key
  const [provider, setProvider] = useState(() => localStorage.getItem(PROVIDER_STORAGE) || "gemini");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [bookmarkUrl, setBookmarkUrl] = useState("");
  const [bookmarkCopied, setBookmarkCopied] = useState(false);

  useEffect(() => {
    const { key, provider: det } = readKeyFromUrlOrStorage(provider);
    if (det !== provider) setProvider(det);
    if (key) { setApiKey(key); setApiKeySaved(true); }
    setApiKeyLoading(false);
  }, []);

  useEffect(() => {
    if (apiKey && apiKeySaved) {
      setBookmarkUrl(`${window.location.origin}${window.location.pathname}#k=${encodeURIComponent(apiKey)}`);
    } else setBookmarkUrl("");
  }, [apiKey, apiKeySaved]);

  function switchProvider(next) {
    if (next === provider) return;
    localStorage.setItem(PROVIDER_STORAGE, next);
    setProvider(next);
    const saved = localStorage.getItem(STORAGE_KEYS[next]) || "";
    setApiKey(saved);
    setApiKeySaved(!!saved);
  }

  function copyBookmark() {
    if (!bookmarkUrl) return;
    const ok = () => { setBookmarkCopied(true); setTimeout(() => setBookmarkCopied(false), 2000); };
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = bookmarkUrl; ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(bookmarkUrl).then(ok, fallback);
    } else fallback();
  }

  // App state
  const [disease, setDisease] = useState("쇼그렌증후군");
  const [customDisease, setCustomDis] = useState("");
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [paperFile, setPaperFile] = useState(null);
  const [paperText, setPaperText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [rawDebug, setRawDebug] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("preview");
  const fileRef = useRef();

  const finalDisease = disease === "직접 입력" ? customDisease : disease;

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.type === "application/pdf" || f.name.endsWith(".pdf")) {
      if (f.size > 18 * 1024 * 1024) { setError("PDF가 18MB를 초과합니다."); return; }
      setPaperFile(f); setPaperText(""); setError("");
    } else if (f.type.startsWith("text/") || f.name.endsWith(".txt")) {
      const r = new FileReader();
      r.onload = (ev) => { setPaperText(ev.target.result); setPaperFile(null); setError(""); };
      r.readAsText(f);
    } else {
      setError("PDF 또는 TXT 파일만 업로드 가능합니다.");
    }
  };

  const removePaper = () => {
    setPaperFile(null); setPaperText("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const caller = () => provider === "claude" ? callClaude : callGemini;

  const generate = async () => {
    if (!apiKey.trim()) { setError(`${PROVIDERS[provider].keyLabel}를 먼저 저장해주세요.`); return; }
    if (!topic.trim()) { setError("블로그 주제를 입력해주세요."); return; }
    if (!finalDisease.trim()) { setError("질환명을 입력해주세요."); return; }
    setError(""); setResult(null); setRawDebug(""); setLoading(true);

    const userPrompt = `질환명: ${finalDisease}
블로그 주제/핵심 증상: ${topic}
추가 타겟 키워드: ${keywords || "자동 선정"}

첨부된 논문을 꼼꼼히 읽고, 실제 데이터(연구 대상자 수, 통계 수치, OR/HR, P값, %)를 정확히 추출하여 반영해 주세요.
소주제(H2)를 4~5개 구성하고, 공백 제외 한글 2,000~2,500자로 작성해 주세요.
4막 구조를 따르고, Q&A 3개 포함, 마무리는 "그 과정에 이레한의원이 동행하겠습니다."로 끝내주세요.`;

    try {
      let msgContent;
      if (paperFile) {
        const b64 = await toBase64(paperFile);
        msgContent = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: userPrompt },
        ];
      } else if (paperText) {
        msgContent = [{ type: "text", text: `[논문 원문]\n${paperText}\n\n[작성 요청]\n${userPrompt}` }];
      } else {
        msgContent = [{ type: "text", text: userPrompt }];
      }

      // 1차 생성
      setLoadingMsg(`1단계: ${PROVIDERS[provider].short}로 블로그 초안 생성 중...`);
      const call = caller();
      const raw1 = await call({ apiKey: apiKey.trim(), messages: [{ role: "user", content: msgContent }] });
      setRawDebug(raw1);
      let { meta, content } = parseRaw(raw1);
      let charCount = countKorean(content);

      // 2차 보정 (범위 벗어난 경우)
      if (charCount < 2000 || charCount > 2500) {
        const dir = charCount < 2000 ? "늘려" : "줄여";
        const diff = charCount < 2000 ? 2000 - charCount : charCount - 2500;
        setLoadingMsg(`2단계: 글자 수 보정 중... (현재 ${charCount}자 → 목표 2,000~2,500자)`);
        const fixPrompt = `아래는 작성된 블로그 본문입니다. 현재 공백 제외 한글 글자 수가 ${charCount}자입니다.
약 ${diff}자를 ${dir}서 2,000자~2,500자 범위에 맞게 수정해 주세요.
내용 흐름, 브랜드 보이스, 4막 구조, Q&A 3개는 그대로 유지하세요.
반드시 동일한 <BLOG_META>...</BLOG_META> <BLOG_CONTENT>...</BLOG_CONTENT> 형식으로 출력하세요.

${raw1}`;
        const raw2 = await call({ apiKey: apiKey.trim(), messages: [{ role: "user", content: [{ type: "text", text: fixPrompt }] }] });
        setRawDebug(raw2);
        const p2 = parseRaw(raw2);
        if (p2.meta.title) meta = p2.meta;
        content = p2.content || content;
        charCount = countKorean(content);
      }

      const subtopicCount = (content.match(/^## /gm) || []).length;
      const checklist = {
        patientCase: /이레한의원에서/.test(content),
        paperCited: /년\s*(논문|연구|저널)/.test(content),
        statistics: /[\d.]+\s*%|배\s*높|P\s*=\s*0\.|OR\s|HR\s/.test(content),
        reservedTone: /있겠습니다|필요가 있|수 있겠/.test(content),
        companionEnding: /동행하겠습니다/.test(content),
        faqSection: /Q\./.test(content),
        subtopicCount,
      };

      meta.charCount = charCount;
      setResult({ meta, checklist, content });
      setActiveTab("preview");
    } catch (e) {
      setError(`오류: ${e.message || "알 수 없는 오류"}`);
    } finally {
      setLoading(false);
    }
  };

  // Styles
  const s = {
    wrap: { maxWidth: 860, margin: "0 auto", padding: "24px 18px", fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif", background: "#fdfbf7", minHeight: "100vh" },
    card: { background: "#fff", border: "1px solid #e8e0d0", borderRadius: 14, padding: "22px", marginBottom: 18, boxShadow: "0 2px 8px #0000000a" },
    label: { fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" },
    input: { width: "100%", padding: "10px 14px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 14, color: "#222", background: "#fafafa", outline: "none", boxSizing: "border-box" },
    select: { width: "100%", padding: "10px 14px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 14, color: "#222", background: "#fafafa", outline: "none", boxSizing: "border-box" },
    btn: { width: "100%", padding: "14px", background: "#1a3a5c", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" },
    tab: (a) => ({ padding: "8px 16px", border: "none", background: a ? "#1a3a5c" : "transparent", color: a ? "#fff" : "#888", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }),
  };

  const hasPaper = !!(paperFile || paperText);

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24, paddingTop: 36 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 26 }}>🏥</span>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#1a3a5c" }}>이레한의원 블로그 작성기</div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>논문 원문 첨부 · 브랜드 보이스 DNA · SEO/GEO · Q&amp;A 3개 · 2,000~2,500자</div>
          </div>
        </div>
        <div style={{ display: "inline-block", background: "#1a3a5c10", color: "#1a3a5c", fontSize: 12, fontWeight: 600, padding: "4px 14px", borderRadius: 20, border: "1px solid #1a3a5c25" }}>
          "논문으로 증명하고, 사례로 공감하며, 동행으로 마무리"
        </div>
      </div>

      {/* API Key */}
      <div style={s.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>🔑 AI 제공자 · API 키</div>
          {apiKeySaved && (
            <button style={{ padding: "5px 10px", background: "none", border: "1px solid #ddd", borderRadius: 6, color: "#c0392b", fontSize: 11, cursor: "pointer" }} onClick={async () => {
              try { await window.storage.delete(STORAGE_KEYS[provider]); } catch (e) {}
              if (window.location.hash.includes("k=")) history.replaceState(null, "", window.location.pathname + window.location.search);
              setApiKey(""); setApiKeySaved(false);
            }}>삭제</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {Object.values(PROVIDERS).map(p => (
            <button key={p.id} onClick={() => switchProvider(p.id)} style={{
              flex: 1, padding: "8px 10px", borderRadius: 8,
              border: `1.5px solid ${provider === p.id ? "#1a3a5c" : "#ddd"}`,
              background: provider === p.id ? "#1a3a5c" : "#fff",
              color: provider === p.id ? "#fff" : "#666",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{p.short}</button>
          ))}
        </div>
        {apiKeyLoading ? (
          <div style={{ fontSize: 13, color: "#999" }}>🔄 저장된 키 불러오는 중…</div>
        ) : apiKeySaved ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 8, padding: "8px 12px" }}>
              <span>✅</span>
              <span style={{ fontSize: 13, color: "#2e7d32", fontWeight: 600 }}>{PROVIDERS[provider].short} 키 등록됨</span>
              <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 12, color: "#666" }}>{apiKey.slice(0, 10)}…</span>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 6, lineHeight: 1.5 }}>{PROVIDERS[provider].note}</div>
            {bookmarkUrl && (
              <div style={{ marginTop: 10, padding: 10, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0c4a6e", marginBottom: 4 }}>🔖 영구 북마크 URL</div>
                <div style={{ fontSize: 11, color: "#075985", marginBottom: 6, lineHeight: 1.4 }}>
                  저장소가 지워져도 이 URL로 접속하면 키가 자동 복원. blog-generator와 키를 공유합니다.
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input readOnly value={bookmarkUrl} onFocus={e => e.target.select()}
                    style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 5, fontSize: 11, fontFamily: "monospace" }} />
                  <button onClick={copyBookmark} style={{ padding: "6px 12px", background: "#1a3a5c", color: "#fff", border: "none", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    {bookmarkCopied ? "✓" : "복사"}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <label style={s.label}>{PROVIDERS[provider].keyLabel}</label>
            <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); setApiKeySaved(false); }}
              placeholder={PROVIDERS[provider].keyPlaceholder}
              style={{ ...s.input, fontFamily: "monospace", fontSize: 12 }} />
            <button onClick={async () => {
              const t = apiKey.trim();
              if (!t) { alert("API 키를 입력해주세요."); return; }
              if (!t.startsWith(PROVIDERS[provider].keyPrefix)) {
                alert(`${PROVIDERS[provider].short} 키는 ${PROVIDERS[provider].keyPrefix}로 시작합니다. 제공자를 확인해주세요.`);
                return;
              }
              try { await window.storage.set(STORAGE_KEYS[provider], t); localStorage.setItem(PROVIDER_STORAGE, provider); } catch (e) {}
              setApiKey(t); setApiKeySaved(true);
            }} style={{ ...s.btn, marginTop: 8, padding: 10, fontSize: 13 }}>저장</button>
            <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
              키 발급 → <a href={PROVIDERS[provider].docUrl} target="_blank" rel="noreferrer" style={{ color: "#1a3a5c" }}>{PROVIDERS[provider].docLabel}</a>
              <br />{PROVIDERS[provider].note}
            </div>
          </>
        )}
      </div>

      {/* Form */}
      <div style={s.card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={s.label}>🩺 질환명</label>
            <select style={s.select} value={disease} onChange={e => setDisease(e.target.value)}>
              {DISEASES.map(d => <option key={d}>{d}</option>)}
            </select>
            {disease === "직접 입력" && (
              <input style={{ ...s.input, marginTop: 8 }} value={customDisease} onChange={e => setCustomDis(e.target.value)} placeholder="질환명 직접 입력" />
            )}
          </div>
          <div>
            <label style={s.label}>📌 블로그 주제 / 핵심 증상 *</label>
            <input style={s.input} value={topic} onChange={e => setTopic(e.target.value)} placeholder="예: 말초신경병증, 브레인포그, 안구건조증" />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>🔑 추가 타겟 키워드 <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>(선택, 쉼표 구분)</span></label>
          <input style={s.input} value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="예: 비수술 치료, 한의학 자가면역, 인천 한의원" />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={s.label}>📄 논문 원문 첨부 <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>(PDF 또는 TXT · 선택)</span></label>
          {!hasPaper ? (
            <div onClick={() => fileRef.current?.click()}
              style={{ border: "2px dashed #c8bfa8", borderRadius: 10, padding: 28, textAlign: "center", cursor: "pointer", background: "#faf8f4" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#1a3a5c"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#c8bfa8"}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>클릭하여 논문 파일 업로드</div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>PDF / TXT 지원 · 논문 원문을 읽고 데이터를 자동 추출합니다</div>
              <input ref={fileRef} type="file" accept=".pdf,.txt,text/plain,application/pdf" style={{ display: "none" }} onChange={handleFile} />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 10, padding: "12px 16px" }}>
              <span style={{ fontSize: 22 }}>{paperFile ? "📄" : "📝"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#2e7d32" }}>{paperFile ? paperFile.name : "텍스트 논문 업로드됨"}</div>
                <div style={{ fontSize: 11, color: "#66bb6a", marginTop: 2 }}>
                  {paperFile ? `${(paperFile.size / 1024).toFixed(1)} KB · 논문 원문이 분석에 활용됩니다` : `${paperText.length.toLocaleString()}자 · 논문 텍스트가 분석에 활용됩니다`}
                </div>
              </div>
              <button onClick={removePaper} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
          )}
        </div>

        {error && <div style={{ color: "#e74c3c", fontSize: 13, marginBottom: 10 }}>⚠️ {error}</div>}
        {error && rawDebug && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>🔍 API 원시 응답:</div>
            <textarea readOnly value={rawDebug} style={{ ...s.input, height: 140, fontFamily: "monospace", fontSize: 11, background: "#1a1a2e", color: "#a8d8a8", lineHeight: 1.5 }} />
          </div>
        )}
        <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={generate} disabled={loading}>
          {loading ? "작성 중..." : `✍️ ${PROVIDERS[provider].short}로 이레 블로그 생성`}
        </button>
      </div>

      {loading && (
        <div style={{ ...s.card, display: "flex", justifyContent: "center", padding: "32px 24px" }}>
          <Spinner msg={loadingMsg} />
        </div>
      )}

      {result && (
        <div style={s.card}>
          <MetaCard result={result} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 5 }}>
              <button style={s.tab(activeTab === "preview")} onClick={() => setActiveTab("preview")}>미리보기</button>
              <button style={s.tab(activeTab === "raw")} onClick={() => setActiveTab("raw")}>텍스트 원본</button>
              {rawDebug && <button style={s.tab(activeTab === "debug")} onClick={() => setActiveTab("debug")}>🔍 디버그</button>}
            </div>
            <button onClick={() => {
              try {
                const ta = document.createElement("textarea");
                ta.value = result.content;
                ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                setCopied(true); setTimeout(() => setCopied(false), 2000);
              } catch (e) { alert("복사 실패. 텍스트 원본에서 직접 복사하세요."); }
            }} style={{ padding: "7px 16px", background: copied ? "#27ae60" : "#f0ebe0", color: copied ? "#fff" : "#555", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              {copied ? "✅ 복사됨" : "📋 복사하기"}
            </button>
          </div>
          {activeTab === "preview" && <div style={{ lineHeight: 1.8 }}>{renderMd(result.content)}</div>}
          {activeTab === "raw" && <textarea readOnly value={result.content} style={{ ...s.input, height: 540, resize: "vertical", fontFamily: "monospace", fontSize: 13, lineHeight: 1.7 }} />}
          {activeTab === "debug" && <textarea readOnly value={rawDebug} style={{ ...s.input, height: 540, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6, background: "#1a1a2e", color: "#a8d8a8" }} />}
        </div>
      )}

      <div style={{ textAlign: "center", fontSize: 11, color: "#ccc", marginTop: 8, paddingBottom: 20 }}>
        인천 송도 국제 신도시 이레한의원 · Powered by {PROVIDERS[provider].short}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<BlogWriter />);
