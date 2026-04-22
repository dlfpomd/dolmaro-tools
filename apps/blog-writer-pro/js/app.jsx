const { useState, useRef, useEffect, useMemo } = React;

// ══════════════════════════════════════════════════════════════════
//  이레 블로그 작성기 PRO
//  - TL;DR 블록 강제 / 가짜 논문 감지·재작성 / Q&A Answer-first
//  - 스키마 JSON-LD(FAQPage + MedicalWebPage) 자동 생성
//  - 제목·메타·소주제 수 엄격 체크 / 중간 개행 sanitize
//  - 플랫폼 분기(네이버 2000~2500자 / 홈페이지 2500~3500자 + 목차)
//  - 이미지 SEO: 키워드 기반 한글 슬러그 파일명 + alt 텍스트 + WebP
//  - 관련 글 제안(ireaomd.co.kr WP REST API)
//  - Claude 최신 모델(Sonnet 4.6 / Opus 4.7) + 브라우저 직접 호출
// ══════════════════════════════════════════════════════════════════

const STORAGE_KEYS = {
  claude: "anthropic_api_key",
  gemini: "gemini_api_key",
};
const PROVIDER_STORAGE = "blog_provider";
const CLAUDE_MODEL_STORAGE = "blog_claude_model";
const PLATFORM_STORAGE = "bwp_platform";

const CLAUDE_MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (권장 · 가성비)", note: "장문 의료 글에 균형 잡힌 품질" },
  { id: "claude-opus-4-7", label: "Opus 4.7 (최고 품질)", note: "논문 해석·치밀한 문체가 중요할 때" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (빠른 초안)", note: "빠른 테스트·초안" },
];

const PROVIDERS = {
  gemini: {
    id: "gemini",
    short: "Gemini",
    keyPrefix: "AIza",
    keyLabel: "Google AI Studio API Key",
    keyPlaceholder: "AIza...로 시작하는 Gemini API 키",
    docUrl: "https://aistudio.google.com/apikey",
    docLabel: "aistudio.google.com/apikey",
    note: "무료 티어: gemini-2.5-pro 하루 50회 · 분당 5회. 쿼타 초과 시 flash로 자동 전환.",
  },
  claude: {
    id: "claude",
    short: "Claude",
    keyPrefix: "sk-ant",
    keyLabel: "Anthropic API Key",
    keyPlaceholder: "sk-ant-api03-...",
    docUrl: "https://console.anthropic.com/settings/keys",
    docLabel: "console.anthropic.com",
    note: "건당 약 $0.02~0.10. API 사용량만큼 과금. 모델은 아래에서 선택.",
  },
};

const DISEASES = [
  "쇼그렌증후군", "루푸스(SLE)", "전신경화증", "구강작열감증후군",
  "류마티스관절염", "기타 자가면역질환", "직접 입력",
];

const PLATFORMS = {
  naver: {
    id: "naver",
    label: "네이버 블로그",
    minChars: 2000,
    maxChars: 2500,
    note: "공백 제외 한글 2,000~2,500자 · 굵게/구분선 금지 · 모바일 친화",
    allowToc: false,
  },
  homepage: {
    id: "homepage",
    label: "홈페이지 (ireaomd.co.kr)",
    minChars: 2500,
    maxChars: 3500,
    note: "공백 제외 한글 2,500~3,500자 · 목차 포함 · 내부링크 삽입 · 스키마 자동",
    allowToc: true,
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
// System prompt — 확장판. 플랫폼·소스·연도 변수 주입
// ────────────────────────────────────────────────
function buildSystemPrompt({ platform, currentYear, hasVerifiedSource }) {
  const pf = PLATFORMS[platform];
  const charRange = `${pf.minChars.toLocaleString()}자~${pf.maxChars.toLocaleString()}자`;
  const tocBlock = pf.allowToc
    ? `- [목차] 블록 필요: 블록1 이전에 "## 이 글에서 다루는 내용" H2 + 각 본론 H2 제목을 리스트로 나열`
    : `- 목차 블록 없음 (네이버 블로그는 목차 불필요)`;

  // 논문/참고 블로그 없이 생성 시 가짜 인용 금지 규정 강화
  const sourceGuard = hasVerifiedSource
    ? `[검증된 소스 제공됨] 첨부 논문/참고 글의 정확한 서지·수치·저자를 본문에 명시하세요. 임의 지어내기 금지.`
    : `[소스 미제공 — 환각 방지 필수]
❌ 가상의 저널명, 권·호, 페이지, DOI, 저자명 **절대 생성 금지**
❌ "Journal of ... 2024;35(4):245" 같은 구체적 서지 패턴 금지
✅ 허용: "여러 임상 연구에 따르면", "최근 한의학 문헌에서는", "한 관찰 연구에서" 같은 익명 인용
✅ 통계 수치도 출처 단언 불가능한 구체 P값/OR/HR 지어내기 금지 — "상당수 환자에서", "다수의 경우" 같은 정성 표현`;

  return `당신은 인천 송도 국제 신도시 이레한의원의 ${pf.label} 전문 콘텐츠 작가입니다.
${hasVerifiedSource ? "첨부된 논문 원문을 꼼꼼히 읽고" : "질환/증상 정보만으로"}, 아래 브랜드 보이스 DNA와 SEO/GEO/AEO 규칙에 따라 블로그 글을 작성합니다.

[현재 시점] ${currentYear}년 기준. 본문 어딘가에 최신성 신호(예: "${currentYear}년 현재", "최근") 자연스럽게 1회 이상 포함.

[브랜드 보이스]
"논문으로 증명하고, 사례로 공감하며, 동행으로 마무리하는 — 학술 기반 신뢰형 의료 콘텐츠"

[5대 보이스 키워드]
1. 근거 중심: 관찰·임상 자료와 함께
2. 절제된 권위: 단정 대신 유보, 과장 없는 전문성
3. 사례 기반 공감: 실제 환자 여정으로 공감 진입
4. 교육자적 친절: 비유와 단계적 설명
5. 동행자 포지셔닝: "치료해드립니다" → "함께 하겠습니다"

[제목 공식]
[질환명] + [핵심 키워드/증상] + [관계성 표현 또는 질문형 어미]
- 25~35자 권장, 메인 키워드 반드시 포함
- 클릭을 유도하는 질문형("혹시 나도?") 또는 숫자형("3가지 이유") 어미

${tocBlock}

[블록 구조 — TL;DR이 맨 앞, Q&A는 맨 마지막]

블록0 (50~80자) 핵심 요약 TL;DR:
- 형식: "## 핵심 요약" H2 + 바로 다음 줄에 "> " 로 시작하는 2~3문장
- 질환의 핵심·주요 원인·치료 방향을 압축한 완결형 명제
- AI 검색(AIO/Perplexity/ChatGPT)이 통째로 인용할 앵커 — 출처 없이 인용돼도 뜻이 통해야 함
- 예: "> 구강작열감증후군은 뚜렷한 병변 없이 혀·입에서 화끈거림과 쇠맛이 지속되는 신경병증성 질환입니다. 말초·중추신경의 기능 이상, 타액 변화, 만성 스트레스가 복합적으로 작용합니다. 한의학에서는 음허(陰虛)·기체혈어(氣滯血瘀)의 관점으로 전신 균형을 회복하는 치료를 시도해 볼 수 있겠습니다."

블록1 (10~15%) 환자 사례 도입:
- "최근 [질환명]으로 이레한의원에서 한의학 치료를 받고 계신 [연령대] [성별]분이 계십니다."
- 환자 내면 독백 따옴표 재현, 일상 불편함 묘사
- 전환 질문 1문장으로 마무리

블록2 (40~50%) 본론:
${hasVerifiedSource
  ? `- "[연도]년 [저널]에서 출간된 연구를 리뷰해 보겠습니다." + 풀 서지사항
- 소주제(H2) 여러 개로 논문 핵심 내용 전개
- 통계 수치 불릿 포인트: "• [지표]: [수치]% / [수치]배 (P=0.xxx)"`
  : `- 소주제(H2) 여러 개로 질환의 기전·증상·일상 영향을 설명
- "여러 임상 관찰에서", "한의학 문헌에서는" 같은 익명 인용만 사용
- 구체적 서지·DOI·저자명·P값/OR/HR 지어내기 **절대 금지**`}
- 핵심 결론은 짧은 문장 + 줄바꿈 강조
- **이 블록에 Q&A 넣지 말 것**

블록3 (15~20%) 임상 해석:
- "위 내용을 종합해 보면 / [결론1] / [결론2] / 라고 정리할 수 있겠습니다."
- 실용 조언: "만약 ~하다면, ~할 필요가 있겠습니다"${pf.allowToc ? `
- 홈페이지 내부 링크 제안: "(관련 글: [링크 텍스트])" 형태로 1~2개 삽입 자리 마련 — 실제 URL은 발행 시 교체` : ""}

블록4 (10~15%) 이레한의원 연결:
- "인천 송도 국제 신도시 이레한의원은 [질환명]과 같은 자가면역질환을 주로 다루고 있습니다."
- 치료 철학·접근 방식 소개 (여기서는 "동행하겠습니다" 문구를 쓰지 않음)

블록5 (10~15%) 자주 묻는 질문 — **반드시 맨 마지막 블록**:
- H2 소제목 예: "자주 묻는 질문" / "환자분들이 많이 여쭤보시는 것"
- Q&A 3개를 아래 형식으로 나열:
  Q. (환자가 실제 검색할 질문 — "~인가요?", "~할 수 있나요?", "~는 무엇인가요?")
  A. (**답변의 첫 문장은 반드시 질문에 대한 완결형 명제**. 예: "반드시 그렇지는 않습니다." / "치료 기간은 보통 3~6개월입니다." 이후 2~3문장 부연.)
- AEO 최적화 — 답변은 질문 없이 단독 인용돼도 뜻이 통해야 함
- **3번째 Q&A 답변 직후, 마지막 한 문장으로 "그 과정에 이레한의원이 동행하겠습니다."** 로 전체 글을 마무리

[글자 수] 공백 제외 한글 기준 반드시 ${charRange}.

${sourceGuard}

[SEO/GEO/AEO]
- 메인 키워드를 제목·TL;DR·첫문단·소제목에 배치
- 롱테일 키워드 3~5개 자연 삽입
- E-E-A-T: 경험·전문성·권위·신뢰를 문장에서 드러내기
- 메타 디스크립션에 메인 키워드 반드시 포함 + 클릭 유도 어미

[키워드 반복 제한 — 매우 중요]
아래 항목은 본문 전체에서 각각 **20회 미만**으로만 사용하세요. 반복이 필요할 땐 유사어·지시대명사·우회 표현으로 대체합니다.
- 질환명 → "이 질환", "해당 증후군", "본 자가면역 문제"
- 핵심 증상어 → "이 불편함", "해당 증상", "이러한 변화"
- 치료·기전어 → "이 접근", "본원의 치료 방법", "해당 기전"

[금지 표현]
❌ "반드시 ~하셔야" → ✅ "~할 필요가 있겠습니다"
❌ "완치 가능" → ✅ "증상 개선에 도움이 될 수 있겠습니다"
❌ 획기적, 놀라운, 반드시, 100%, 즉효, 부작용 없음, 가장 좋은 → 의료광고법 위반 위험
❌ "치료해드리겠습니다" → ✅ "동행하겠습니다"

[마크다운 서식]
- 허용: # ## ### (제목), - • (리스트), > (인용 — TL;DR 전용), Q. A. (Q&A)
- **금지(네이버 모드)**: **굵게**, --- 구분선, *** ___ 구분선 — 강조는 줄바꿈/소제목으로
${pf.id === "homepage" ? "- 홈페이지 모드는 **굵게** 허용(WP가 잘 렌더)" : ""}

[영문 병기 — 현대의학 개념]
- 질환명: 한글(영문 약어) — 쇼그렌증후군(Sjogren's syndrome, SS)
- 의학 개념: 한글 먼저, 영문 괄호 병기

[한자 병기 — 한의학 개념 (필수)]
음허(陰虛), 양허(陽虛), 기허(氣虛), 혈허(血虛), 조증(燥症), 담음(痰飮), 어혈(瘀血), 풍열(風熱), 비위(脾胃), 간신(肝腎), 기체혈어(氣滯血瘀), 기혈양허(氣血兩虛), 음양실조(陰陽失調), 변증(辨證), 상초(上焦)·중초(中焦)·하초(下焦)
→ 본문에 **최소 3~4개** 이상의 한자 병기 한의학 용어 자연스럽게 포함

[출력 형식] 반드시 아래 태그 형식으로만 출력. 다른 텍스트 없이.
<BLOG_META>
제목: (25~35자, 메인 키워드 포함)
설명: (메타 디스크립션 120~160자, 메인 키워드 포함)
슬러그: (url-slug, 영문 소문자·하이픈만, 40자 이내)
키워드: (키워드1, 키워드2, 키워드3, 키워드4, 키워드5)
${hasVerifiedSource ? "논문요약: (논문 핵심 정보 2~3문장)" : "논문요약: (소스 미제공)"}
TL;DR: (블록0과 동일한 2~3문장 요약)
</BLOG_META>
<BLOG_CONTENT>
(마크다운 본문. # 제목으로 시작, 이어서 ## 핵심 요약 블록, 이후 블록1~5 순서)
</BLOG_CONTENT>
<SCHEMA_HINTS>
주요_entity: (본문에 등장한 의학 용어 entity들을 쉼표 구분, 영문 포함. 예: 구강작열감증후군, Burning Mouth Syndrome, dysgeusia)
faq_items: (블록5 Q&A 3개를 JSON 배열로. [{"q":"...","a":"..."}, ...] — 한 줄 문자열)
</SCHEMA_HINTS>`;
}

// ────────────────────────────────────────────────
// Utils
// ────────────────────────────────────────────────
const toBase64 = (f) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(",")[1]);
  r.onerror = () => rej(new Error("파일 읽기 실패"));
  r.readAsDataURL(f);
});

const countKorean = (t) => (t || "").replace(/[^가-힣]/g, "").length;

// 한글 제목 → 파일명 슬러그 (한글 유지, 특수문자 제거)
function koreanSlug(s, max = 40) {
  if (!s) return "image";
  return s.replace(/[^\w가-힣]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "image";
}

/** 모델이 실수로 삽입한 네이버 블로그 비친화 서식 제거 + 문장 중간 개행 병합 */
function sanitizeContent(c, { keepBold = false } = {}) {
  if (!c) return "";
  let out = c;
  if (!keepBold) out = out.replace(/\*\*/g, "");
  out = out
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/^\s*\*{3,}\s*$/gm, "")
    .replace(/^\s*_{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");

  // 문장 중간에 떨어진 개행 병합:
  //   이전 줄이 [.?!」"')」] 로 끝나지 않고, 다음 줄이 한글/영문 소문자로 시작할 때 공백으로 합침
  //   단, 다음 줄이 #, -, •, >, Q., A., 숫자., 로 시작하면 구조물이므로 제외
  const lines = out.split("\n");
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (
      cur && next &&
      cur.trim() !== "" &&
      next.trim() !== "" &&
      !/[.?!。…」"')\]:：]\s*$/.test(cur) &&
      !/^[#\-•>]/.test(next.trim()) &&
      !/^Q\.|^A\.|^\d+\./.test(next.trim()) &&
      !/^[|｜]/.test(next.trim())
    ) {
      merged.push(cur.trimEnd() + " " + next.trimStart());
      i++; // skip next
    } else {
      merged.push(cur);
    }
  }
  return merged.join("\n").trim();
}

function parseRaw(raw) {
  const metaM = raw.match(/<BLOG_META>([\s\S]*?)<\/BLOG_META>/);
  const contentM = raw.match(/<BLOG_CONTENT>([\s\S]*?)<\/BLOG_CONTENT>/);
  const schemaM = raw.match(/<SCHEMA_HINTS>([\s\S]*?)<\/SCHEMA_HINTS>/);
  const meta = { title: "", metaDescription: "", keywords: [], paperSummary: "", tldr: "", slug: "" };
  if (metaM) {
    const get = (k) => { const r = metaM[1].match(new RegExp(`${k}:\\s*(.+)`)); return r ? r[1].trim() : ""; };
    meta.title = get("제목");
    meta.metaDescription = get("설명");
    meta.slug = get("슬러그");
    meta.paperSummary = get("논문요약");
    meta.tldr = get("TL;DR") || get("TL\\.DR") || get("TLDR");
    const kw = get("키워드");
    meta.keywords = kw ? kw.split(/[,，]/).map(k => k.trim()).filter(Boolean) : [];
  }
  const schema = { entities: [], faqItems: [] };
  if (schemaM) {
    const entM = schemaM[1].match(/주요_entity:\s*(.+)/);
    if (entM) schema.entities = entM[1].split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const faqM = schemaM[1].match(/faq_items:\s*(\[[\s\S]*\])/);
    if (faqM) {
      try { schema.faqItems = JSON.parse(faqM[1]); } catch (e) { /* parse later from content */ }
    }
  }
  const content = contentM ? contentM[1].trim() : raw.trim();
  return { meta, content, schema };
}

// Fallback FAQ 추출 (본문에서)
function extractFaqFromContent(content) {
  const items = [];
  const lines = content.split("\n");
  let curQ = null;
  for (const line of lines) {
    const mq = line.match(/^\s*Q\.\s*(.+)$/);
    const ma = line.match(/^\s*A\.\s*(.+)$/);
    if (mq) { curQ = mq[1].trim(); continue; }
    if (ma && curQ) { items.push({ q: curQ, a: ma[1].trim() }); curQ = null; }
  }
  return items;
}

// ────────────────────────────────────────────────
// Schema JSON-LD builders
// ────────────────────────────────────────────────
function buildFaqPageSchema(faqItems) {
  if (!faqItems || !faqItems.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

function buildMedicalWebPageSchema({ meta, url, datePublished, clinicName, doctorName, entities, heroImageUrl }) {
  const about = (entities || []).slice(0, 8).map(name => ({ "@type": "MedicalCondition", name }));
  return {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    name: meta.title,
    headline: meta.title,
    description: meta.metaDescription,
    inLanguage: "ko",
    url: url || undefined,
    datePublished,
    dateModified: datePublished,
    keywords: (meta.keywords || []).join(", "),
    about: about.length ? about : undefined,
    image: heroImageUrl || undefined,
    author: {
      "@type": "Person",
      name: doctorName || "박석민 원장",
      affiliation: { "@type": "MedicalOrganization", name: clinicName || "이레한의원" },
    },
    publisher: {
      "@type": "MedicalOrganization",
      name: clinicName || "이레한의원",
      address: { "@type": "PostalAddress", addressLocality: "인천 송도", addressRegion: "인천", addressCountry: "KR" },
    },
  };
}

function buildBreadcrumbSchema({ clinicName, categoryLabel, title, baseUrl }) {
  const base = baseUrl || "https://ireaomd.co.kr";
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: clinicName || "이레한의원", item: base },
      { "@type": "ListItem", position: 2, name: "블로그", item: `${base}/blog` },
      ...(categoryLabel ? [{ "@type": "ListItem", position: 3, name: categoryLabel, item: `${base}/blog?category=${encodeURIComponent(categoryLabel)}` }] : []),
      { "@type": "ListItem", position: categoryLabel ? 4 : 3, name: title },
    ],
  };
}

function schemasToLdJson(schemas) {
  const nonNull = schemas.filter(Boolean);
  return nonNull.map(s => `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`).join("\n\n");
}

// ────────────────────────────────────────────────
// LLM callers
// ────────────────────────────────────────────────
async function callClaude({ apiKey, systemPrompt, messages, model, tools }) {
  const body = {
    model: model || "claude-sonnet-4-6",
    max_tokens: 8000,
    system: systemPrompt,
    messages,
    ...(tools && tools.length ? { tools } : {}),
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return (data.content || []).map(c => c.type === "text" ? c.text : "").join("");
}

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

async function callGemini({ apiKey, systemPrompt, messages, tools }) {
  const models = ["gemini-2.5-pro", "gemini-2.5-flash"];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: toGeminiContents(messages),
    generationConfig: { maxOutputTokens: 8000, temperature: 0.7 },
    ...(tools && tools.length ? { tools } : {}),
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
// Image generation — 기존 blog-writer 코드 그대로 (파일명만 개선)
// ────────────────────────────────────────────────
const IMAGE_SPLIT_MODEL = "gemini-2.5-flash";
const IMAGE_GEN_MODEL = "gemini-3.1-flash-image-preview"; // Nano Banana Pro

async function splitBlogForImages({ apiKey, blogText, paragraphCount = 6 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_SPLIT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = `다음 블로그 글을 정확히 ${paragraphCount}개의 논리적 단락으로 나누어주세요. 각 단락에 가장 적합한 이미지 유형을 다음 중 하나로 지정하세요.

유형 3가지:
- "photo": 일반 설명·일상 묘사 (사실적 사진 스타일)
- "illustration": 의학 용어·해부학·개념 설명 (의학 일러스트)
- "infographic": 통계·수치·구조·비교 (의학 인포그래픽)

또한 각 단락마다 이미지의 한국어 alt 텍스트(30자 내외, 이미지 설명 + 관련 핵심 용어 포함)를 반드시 함께 반환하세요.

원본 단락을 그대로 쓰지 말고 이미지 생성에 적합한 1~3문장으로 핵심을 간추려 작성하세요.

블로그 글:
${blogText}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 4000,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              text: { type: "STRING" },
              imageType: { type: "STRING", enum: ["photo", "illustration", "infographic"] },
              altText: { type: "STRING" },
            },
            required: ["text", "imageType", "altText"],
          },
        },
      },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const raw = (data.candidates || [])[0]?.content?.parts?.[0]?.text || "";
  let arr;
  try { arr = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?$/g, "").trim()); }
  catch { throw new Error("단락 분할 응답을 JSON으로 파싱하지 못했습니다."); }
  return arr.map((p, i) => ({ ...p, id: i, status: "pending", imageUrl: null }));
}

async function generateParagraphImage({ apiKey, paragraph, portrait, clinicName, doctorName }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_GEN_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const styles = {
    photo: `Realistic professional medical photography, high quality, natural lighting. If a doctor is present, they must have the facial features of the person in the provided reference image and their name tag or embroidery on the white coat must clearly say '${doctorName}' in Korean (한글). Any text in the image must be in Korean (한글).`,
    illustration: `Clean medical illustration, professional anatomical style, clear and educational. Use Korean (한글) for any labels or descriptions in the image.`,
    infographic: `Medical infographic style, including charts, diagrams, and medical icons. Professional layout. Use Korean (한글) for all titles, labels, and data descriptions in the image.`,
  };
  let prompt;
  if (paragraph.id === 0 && portrait) {
    const shortName = doctorName.split(" ")[0] || doctorName;
    prompt = `Transform the person in the reference image into a professional doctor named '${shortName}' in a bright and welcoming ${clinicName} medical clinic environment.
The doctor's white coat must have '${doctorName}' clearly written in Korean (한글) on the chest area.
The doctor has a natural, average hairstyle appropriate for a 30-year-old male.
The doctor is kindly explaining medical details while looking at a patient and having a conversation.
In the background, there is a computer monitor displaying a professional medical illustration.
Ensure there are NO heavy medical machines like ultrasound or X-ray devices in the room.
Maintain the facial features of the person in the image.
Professional bright lighting, 16:9 aspect ratio, high quality, realistic modern medical setting.
All text in the image must be in Korean (한글).`;
  } else {
    prompt = `Create an image for the following medical blog paragraph.
Style: ${styles[paragraph.imageType]}.
Content: ${paragraph.text}.
Aspect ratio: 16:9. High resolution, professional medical aesthetic.
IMPORTANT: All text within the image (labels, titles, signs) MUST be written in Korean (한글).`;
    if (portrait && paragraph.imageType === "photo") {
      prompt += ` If a doctor appears in the scene, ensure they look exactly like the person in the reference image and have '${doctorName}' written on their white coat.`;
    }
  }

  const parts = [{ text: prompt }];
  if (portrait) {
    const b64 = portrait.split(",")[1] || portrait;
    parts.push({ inline_data: { mime_type: "image/png", data: b64 } });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: { aspectRatio: "16:9" },
      },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  for (const part of data.candidates?.[0]?.content?.parts || []) {
    const inline = part.inline_data || part.inlineData;
    if (inline && inline.data) {
      return `data:${inline.mime_type || inline.mimeType || "image/png"};base64,${inline.data}`;
    }
  }
  throw new Error("이미지 생성 응답에 이미지 데이터가 없습니다.");
}

async function generateHeroImage({ apiKey, blogText, title, keywords, aspectRatio = "1:1" }) {
  const craftUrl = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_SPLIT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const craftPrompt = `당신은 한의학 블로그의 대표 이미지(썸네일)를 위한 이미지 생성 프롬프트를 작성하는 전문가입니다.

[대표 이미지 목표 — AEO 최적화]
- Naver AI, Google Lens, 검색 엔진이 한 장으로 "글의 주제"를 즉시 식별
- 사실적인(photo-realistic) 실사 사진처럼 보이는 클로즈업
- 주제와 가장 직접 관련된 신체 부위 또는 현상
- 이미지 안에 어떤 글자도 없음
- 의료적·전문적 분위기, 선정적·과도한 병변 묘사 금지

[주제 선택 가이드 — 예시]
- 구강작열감증후군, 혀 통증, 미각이상 → 사람의 혀 클로즈업 (입 약간 벌린 상태)
- 쇼그렌증후군 안구건조, 건조성 각결막염 → 사람의 눈 클로즈업
- 쇼그렌증후군 구강건조 → 사람의 입·입술 클로즈업
- 류마티스 관절염, 손/손가락 통증 → 손가락 관절 클로즈업
- 섬유근육통, 만성통증 → 어깨·목 부위, 통증 표현 자세
- 루푸스, 자가면역 피부 증상 → 얼굴·피부 클로즈업
- 하시모토 갑상선염 → 목 앞부분 클로즈업
- 베체트병, 구강 궤양 → 입술·입 안 클로즈업
- 신경병증, 말초신경 통증 → 발·손 저림 표현
- 안면신경마비 → 얼굴 표정 비대칭 클로즈업

[블로그 정보]
제목: ${title || "(제목 없음)"}
키워드: ${keywords || "(없음)"}
본문 요약 (일부):
${blogText.slice(0, 1800)}

위 정보를 기반으로 가장 적합한 **한 장의 대표 이미지**를 결정하고, 영문 이미지 생성 프롬프트를 작성해 아래 JSON 형식으로 출력하세요.

{
  "subject": "한국어로 선택한 주제",
  "altText": "한국어 alt 텍스트 30자 내외 — 이미지 설명 + 메인 키워드 포함",
  "imagePrompt": "Ultra high-resolution photo-realistic close-up photograph ... (영문, 4~6문장)"
}`;

  const craftRes = await fetch(craftUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: craftPrompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4000,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            subject: { type: "STRING" },
            altText: { type: "STRING" },
            imagePrompt: { type: "STRING" },
          },
          required: ["subject", "imagePrompt"],
        },
      },
    }),
  });
  const craftData = await craftRes.json();
  if (craftData.error) throw new Error(craftData.error.message || "대표 이미지 프롬프트 생성 실패");

  const cand = (craftData.candidates || [])[0];
  const craftText = cand?.content?.parts?.map(p => p.text || "").join("") || "";
  const finishReason = cand?.finishReason;

  let subject = "대표 이미지";
  let altText = title || "대표 이미지";
  let rawImgPrompt = "";

  try {
    const clean = craftText.replace(/```json\n?|```\n?/g, "").trim();
    const json = JSON.parse(clean);
    if (json.imagePrompt) {
      subject = json.subject || subject;
      altText = json.altText || altText;
      rawImgPrompt = json.imagePrompt;
    }
  } catch (e) { /* fallback below */ }

  if (!rawImgPrompt) {
    const englishChars = (craftText.match(/[a-zA-Z]/g) || []).length;
    if (englishChars > 100 && craftText.trim().length > 60) {
      rawImgPrompt = craftText.trim();
    }
  }

  if (!rawImgPrompt) {
    throw new Error(
      `대표 이미지 프롬프트 파싱 실패 (finish=${finishReason || "?"}, ${craftText.length}자).\n` +
      `원본 처음 400자: ${craftText.slice(0, 400)}`
    );
  }

  const finalPrompt = `${rawImgPrompt}

CRITICAL: Photo-realistic, ultra high-resolution, sharp focus, professional medical photography quality.
Subject must be centered, front-facing, instantly recognizable.
Aspect ratio ${aspectRatio}. Clean composition, no text, no watermarks, no logos.
Natural lighting, clinically clean environment if any background is visible.`;

  const imgUrl = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_GEN_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const imgRes = await fetch(imgUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: { aspectRatio },
      },
    }),
  });
  const imgData = await imgRes.json();
  if (imgData.error) throw new Error(imgData.error.message || JSON.stringify(imgData.error));
  for (const part of imgData.candidates?.[0]?.content?.parts || []) {
    const inline = part.inline_data || part.inlineData;
    if (inline && inline.data) {
      return {
        imageUrl: `data:${inline.mime_type || inline.mimeType || "image/png"};base64,${inline.data}`,
        subject, altText, prompt: finalPrompt, aspectRatio,
      };
    }
  }
  throw new Error("대표 이미지 생성 응답에 이미지 데이터 없음");
}

async function generateFromPrompt({ apiKey, prompt, aspectRatio = "1:1", style = "photo" }) {
  const styleHints = {
    photo: "Photo-realistic, ultra high-resolution medical photography, natural lighting, sharp focus, professional quality.",
    illustration: "Clean medical illustration, professional anatomical style, educational clarity.",
    infographic: "Medical infographic style with charts, diagrams, and icons. Clean professional layout.",
    auto: "High quality, professional medical aesthetic.",
  };
  const fullPrompt = `${prompt.trim()}

Style: ${styleHints[style] || styleHints.photo}
Aspect ratio: ${aspectRatio}.
Subject must be centered and front-facing, instantly recognizable.
No text, no watermarks, no logos in the image.
If any labels are unavoidable, use Korean (한글).`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_GEN_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio } },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  for (const part of data.candidates?.[0]?.content?.parts || []) {
    const inline = part.inline_data || part.inlineData;
    if (inline && inline.data) {
      return {
        imageUrl: `data:${inline.mime_type || inline.mimeType || "image/png"};base64,${inline.data}`,
        aspectRatio, style, userPrompt: prompt.trim(), fullPrompt,
      };
    }
  }
  throw new Error("커스텀 이미지 생성 응답에 이미지 데이터가 없습니다.");
}

// ────────────────────────────────────────────────
// WebP 변환 — Canvas API. data:image/png → data:image/webp
// ────────────────────────────────────────────────
async function dataUrlToWebp(dataUrl, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const webp = canvas.toDataURL("image/webp", quality);
        if (!webp.startsWith("data:image/webp")) return reject(new Error("브라우저가 WebP 인코딩을 지원하지 않습니다."));
        resolve(webp);
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("이미지 로딩 실패"));
    img.src = dataUrl;
  });
}

async function downloadImagesAsZip({ paragraphs, hero, customs, filenamePrefix, mainKeyword, useWebp }) {
  if (!window.JSZip) throw new Error("JSZip 라이브러리가 로드되지 않았습니다.");
  const zip = new window.JSZip();
  const folder = zip.folder(filenamePrefix);
  const kw = koreanSlug(mainKeyword || filenamePrefix, 30);

  async function addImage(baseName, dataUrl) {
    if (!dataUrl || !dataUrl.startsWith("data:")) return;
    if (useWebp) {
      try {
        const webp = await dataUrlToWebp(dataUrl, 0.9);
        folder.file(`${baseName}.webp`, webp.split(",")[1], { base64: true });
        return;
      } catch (e) { /* fallback to png */ }
    }
    const mime = (dataUrl.match(/^data:([^;]+)/) || [])[1] || "image/png";
    const ext = mime.split("/")[1] || "png";
    folder.file(`${baseName}.${ext}`, dataUrl.split(",")[1], { base64: true });
  }

  if (hero && hero.imageUrl) {
    const tag = (hero.aspectRatio || "1:1").replace(":", "x");
    await addImage(`00-${kw}-대표-${tag}`, hero.imageUrl);
  }
  const altTxtLines = [];
  if (hero?.altText) altTxtLines.push(`00-${kw}-대표 | ${hero.altText}`);
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.imageUrl) {
      const name = `${String(i + 1).padStart(2, "0")}-${kw}-${p.imageType || "photo"}`;
      await addImage(name, p.imageUrl);
      if (p.altText) altTxtLines.push(`${name} | ${p.altText}`);
    }
  }
  for (let i = 0; i < (customs || []).length; i++) {
    const c = customs[i];
    if (c.imageUrl) {
      await addImage(`custom-${String(i + 1).padStart(2, "0")}-${c.style || "photo"}`, c.imageUrl);
    }
  }
  if (altTxtLines.length) folder.file("_alt-text.txt", altTxtLines.join("\n"));

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filenamePrefix}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

// ────────────────────────────────────────────────
// 가짜 논문 인용 감지 (소스 없을 때)
// ────────────────────────────────────────────────
function detectFakeReferences(content) {
  const hits = [];
  // 구체 서지 패턴: "Journal of X 2021;35(4):245"
  const serial = content.match(/[A-Z][A-Za-z ]{3,40}\s+(20\d{2}|19\d{2})\s*[;:]\s*\d+\s*\(\s*\d+\s*\)\s*:\s*\d+/);
  if (serial) hits.push(`저널 권호 패턴: "${serial[0]}"`);
  // "(Reference:" "Ref." "DOI"
  if (/\(Reference\s*:|\bdoi\s*:\s*10\.\d+/i.test(content)) hits.push("Reference/DOI 표기 발견");
  // "저자 et al., 연도"
  const authorYear = content.match(/[A-Z][a-z]+\s+et\s+al\.?\s*,?\s*\(?20\d{2}\)?/);
  if (authorYear) hits.push(`저자 et al. 패턴: "${authorYear[0]}"`);
  return hits;
}

// ────────────────────────────────────────────────
// WordPress 관련 글 검색 (ireaomd.co.kr)
// ────────────────────────────────────────────────
async function fetchRelatedPosts({ keywords, max = 5 }) {
  const base = "https://ireaomd.co.kr/wp-json/wp/v2/posts";
  const search = encodeURIComponent((keywords || []).slice(0, 2).join(" "));
  const url = `${base}?search=${search}&per_page=${max}&_fields=id,title,link,excerpt,date`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.map(p => ({
      id: p.id,
      title: (p.title?.rendered || "").replace(/<[^>]+>/g, ""),
      url: p.link,
      excerpt: (p.excerpt?.rendered || "").replace(/<[^>]+>/g, "").trim().slice(0, 120),
      date: p.date,
    }));
  } catch (e) {
    throw new Error(`ireaomd.co.kr 관련 글 조회 실패: ${e.message}`);
  }
}

// ════════════════════════════════════════════════════════
//  Sub components
// ════════════════════════════════════════════════════════
function Spinner({ msg }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0b3d5c" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
        </path>
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0b3d5c" }}>{msg}</div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>TL;DR · 스키마 · 가짜 논문 차단 · SEO/GEO/AEO</div>
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

function MetaCard({ result, platform }) {
  const { meta, checklist } = result;
  const pf = PLATFORMS[platform];
  const inRange = meta.charCount >= pf.minChars && meta.charCount <= pf.maxChars;
  return (
    <div style={{ background: "#f0f7fc", border: "1px solid #b5d0e4", borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#0b3d5c", letterSpacing: 1, marginBottom: 12 }}>📊 SEO / AEO 메타</div>
      {meta.tldr && (
        <div style={{ background: "#fff", border: "1px solid #b5d0e4", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0b3d5c", marginBottom: 4 }}>💡 TL;DR (AI 검색 인용 앵커)</div>
          <div style={{ fontSize: 13, color: "#0b3d5c", lineHeight: 1.7 }}>{meta.tldr}</div>
        </div>
      )}
      {meta.paperSummary && meta.paperSummary !== "(소스 미제공)" && (
        <div style={{ background: "#0b3d5c0d", border: "1px solid #0b3d5c20", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0b3d5c", marginBottom: 4 }}>📄 논문 핵심 정보</div>
          <div style={{ fontSize: 12, color: "#334", lineHeight: 1.7 }}>{meta.paperSummary}</div>
        </div>
      )}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 3 }}>
          SEO 제목 <span style={{ color: checklist?.titleLengthOk ? "#27ae60" : "#e67e22" }}>({(meta.title || "").length}자)</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{meta.title}</div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 3 }}>메타 디스크립션</div>
        <div style={{ fontSize: 13, color: "#444", lineHeight: 1.6 }}>{meta.metaDescription}</div>
        <div style={{ fontSize: 11, color: meta.metaDescription && meta.metaDescription.length > 160 ? "#e74c3c" : "#27ae60", marginTop: 2 }}>
          {(meta.metaDescription || "").length}자 / 160자
        </div>
      </div>
      {meta.slug && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 3 }}>URL 슬러그</div>
          <div style={{ fontSize: 12, color: "#444", fontFamily: "monospace" }}>{meta.slug}</div>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 6 }}>타겟 키워드</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {(meta.keywords || []).map((k, i) => (
            <span key={i} style={{ background: i === 0 ? "#0b3d5c18" : "#8b6f3e18", color: i === 0 ? "#0b3d5c" : "#8b6f3e", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20, border: `1px solid ${i === 0 ? "#0b3d5c30" : "#8b6f3e30"}` }}>{k}</span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, paddingTop: 10, borderTop: "1px solid #c9dbe8", flexWrap: "wrap" }}>
        <div style={{ fontSize: 12 }}>
          📝 글자 수: <strong style={{ color: inRange ? "#27ae60" : "#e74c3c" }}>{meta.charCount?.toLocaleString()}자</strong>
          <span style={{ marginLeft: 4, color: inRange ? "#27ae60" : "#e74c3c" }}>
            {inRange ? "✅" : "⚠️"} {pf.minChars.toLocaleString()}~{pf.maxChars.toLocaleString()}
          </span>
        </div>
        {checklist?.subtopicCount !== undefined && (
          <div style={{ fontSize: 12 }}>
            📑 소주제: <strong style={{ color: checklist.subtopicExact ? "#27ae60" : "#e67e22" }}>{checklist.subtopicCount}개</strong>
            {checklist.subtopicTarget ? ` / 목표 ${checklist.subtopicTarget}` : ""}
          </div>
        )}
        <div style={{ fontSize: 12 }}>
          🖥️ 플랫폼: <strong style={{ color: "#0b3d5c" }}>{pf.label}</strong>
        </div>
      </div>
      {checklist && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #c9dbe8" }}>
          <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 6 }}>PRO 체크리스트</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <CheckItem ok={checklist.tldrPresent} label="TL;DR 블록 (AI 인용 앵커)" />
            <CheckItem ok={checklist.titleLengthOk} label={`제목 길이 (${(meta.title || "").length}자, 25~35)`} />
            <CheckItem ok={checklist.titleHasKeyword} label="제목에 메인 키워드" />
            <CheckItem ok={checklist.metaDescHasKeyword} label="메타 설명에 메인 키워드" />
            <CheckItem ok={checklist.noFakeReference} label={`가짜 논문 인용 없음${checklist._fakeHits?.length ? ` (${checklist._fakeHits.length}건 감지)` : ""}`} />
            <CheckItem ok={checklist.currencyStamp} label="최신성 신호 (연도/최근)" />
            <CheckItem ok={checklist.patientCase} label="환자 사례 도입 (내면 독백)" />
            <CheckItem ok={checklist.statistics || !checklist._needsStats} label={checklist._needsStats ? "통계 수치" : "통계 수치(선택)"} />
            <CheckItem ok={checklist.reservedTone} label={`유보적 어미 (${checklist._reservedCount ?? 0}회)`} />
            <CheckItem ok={checklist.companionEnding} label="마지막에 동행 마무리" />
            <CheckItem ok={checklist.faqSection} label={`Q&A ${checklist._qCount ?? 0}개`} />
            <CheckItem ok={checklist.answerFirst} label="Q&A 답변 Answer-first" />
            <CheckItem ok={checklist.hanjaBilingual} label={`한자 병기 (${checklist._hanjaCount ?? 0}자)`} />
            <CheckItem ok={checklist.keywordRepeat} label={`질환명 반복 ${checklist._diseaseCount ?? 0}회 (<20)`} />
            <CheckItem ok={checklist.subtopicExact} label={`소주제 정확 매칭 (${checklist.subtopicCount}/${checklist.subtopicTarget})`} />
          </div>
          {checklist._fakeHits?.length > 0 && (
            <div style={{ marginTop: 8, padding: "8px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 11, color: "#991b1b", lineHeight: 1.6 }}>
              ⚠️ 가짜 논문 인용 의심: {checklist._fakeHits.join(" / ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 마크다운 → HTML 렌더 (TL;DR 블록 시각적 강조)
function renderMd(text) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("# ")) return <h1 key={i} style={{ fontSize: 21, fontWeight: 800, color: "#1a1a1a", margin: "22px 0 10px", fontFamily: "Georgia,serif", lineHeight: 1.4 }}>{line.slice(2)}</h1>;
    if (line.startsWith("## ")) {
      const isTldr = /핵심\s*요약|TL.?DR/i.test(line);
      return <h2 key={i} style={{ fontSize: 17, fontWeight: 700, color: isTldr ? "#0369a1" : "#0b3d5c", margin: "20px 0 7px", borderBottom: `2px solid ${isTldr ? "#7dd3fc" : "#c9dbe8"}`, paddingBottom: 4 }}>{line.slice(3)}</h2>;
    }
    if (line.startsWith("### ")) return <h3 key={i} style={{ fontSize: 14, fontWeight: 700, color: "#8b6f3e", margin: "14px 0 5px" }}>{line.slice(4)}</h3>;
    if (line.startsWith("> ")) return <blockquote key={i} style={{ background: "#f0f9ff", borderLeft: "4px solid #0369a1", margin: "8px 0", padding: "10px 14px", fontSize: 14, lineHeight: 1.85, color: "#0c4a6e", borderRadius: "0 8px 8px 0" }}>{line.slice(2)}</blockquote>;
    if (line.startsWith("- ") || line.startsWith("• ")) return <div key={i} style={{ display: "flex", gap: 8, margin: "3px 0 3px 8px" }}><span style={{ color: "#8b6f3e", marginTop: 3, flexShrink: 0 }}>•</span><span style={{ fontSize: 14, color: "#333", lineHeight: 1.85 }}>{line.slice(2)}</span></div>;
    if (/^Q\./.test(line)) return <div key={i} style={{ fontSize: 14, fontWeight: 700, color: "#0b3d5c", margin: "10px 0 2px", background: "#0b3d5c0a", padding: "6px 10px", borderRadius: 6, borderLeft: "3px solid #0b3d5c" }}>{line}</div>;
    if (/^A\./.test(line)) return <div key={i} style={{ fontSize: 13, color: "#444", margin: "0 0 8px", paddingLeft: 13, lineHeight: 1.8 }}>{line}</div>;
    if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
    return <p key={i} style={{ fontSize: 14, color: "#333", lineHeight: 1.9, margin: "3px 0" }}>{line}</p>;
  });
}

// ════════════════════════════════════════════════════════
//  Main
// ════════════════════════════════════════════════════════
function BlogWriterPro() {
  // Provider + API key + model
  const [provider, setProvider] = useState(() => localStorage.getItem(PROVIDER_STORAGE) || "gemini");
  const [claudeModel, setClaudeModel] = useState(() => localStorage.getItem(CLAUDE_MODEL_STORAGE) || "claude-sonnet-4-6");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [bookmarkUrl, setBookmarkUrl] = useState("");
  const [bookmarkCopied, setBookmarkCopied] = useState(false);

  // 플랫폼 분기
  const [platform, setPlatform] = useState(() => localStorage.getItem(PLATFORM_STORAGE) || "naver");

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

  function switchPlatform(next) {
    if (next === platform) return;
    localStorage.setItem(PLATFORM_STORAGE, next);
    setPlatform(next);
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
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(bookmarkUrl).then(ok, fallback);
    else fallback();
  }

  // App state
  const [disease, setDisease] = useState("쇼그렌증후군");
  const [customDisease, setCustomDis] = useState("");
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [subtopicTarget, setSubtopicTarget] = useState("5");
  const [extraInstruction, setExtraInstruction] = useState("");
  const [paperFile, setPaperFile] = useState(null);
  const [referenceMode, setReferenceMode] = useState("url");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [paperText, setPaperText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [rawDebug, setRawDebug] = useState("");
  const [copied, setCopied] = useState(false);
  const [htmlCopied, setHtmlCopied] = useState(false);
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("preview");
  const fileRef = useRef();

  // 관련 글
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState("");

  // 이미지 생성 상태
  const [portrait, setPortrait] = useState("");
  const [clinicName, setClinicName] = useState(() => localStorage.getItem("mediblog_clinic") || "이레한의원");
  const [doctorName, setDoctorName] = useState(() => localStorage.getItem("mediblog_doctor") || "박석민 원장");
  const [imageParagraphCount, setImageParagraphCount] = useState("6");
  const [imageParagraphs, setImageParagraphs] = useState([]);
  const [imageStatus, setImageStatus] = useState("idle");
  const [imageError, setImageError] = useState("");
  const [imageProgress, setImageProgress] = useState("");
  const [zipping, setZipping] = useState(false);
  const [useWebp, setUseWebp] = useState(() => localStorage.getItem("bwp_use_webp") !== "false");
  const portraitRef = useRef();

  const [heroAspect, setHeroAspect] = useState("1:1");
  const [hero, setHero] = useState(null);
  const [heroStatus, setHeroStatus] = useState("idle");
  const [heroError, setHeroError] = useState("");

  const [customPrompt, setCustomPrompt] = useState("");
  const [customAspect, setCustomAspect] = useState("1:1");
  const [customStyle, setCustomStyle] = useState("photo");
  const [customImages, setCustomImages] = useState([]);
  const [customGenerating, setCustomGenerating] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("mediblog_portrait");
    if (saved) setPortrait(saved);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("bwp_use_webp", String(useWebp)); } catch (e) {}
  }, [useWebp]);

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

  const caller = () => provider === "claude"
    ? (args) => callClaude({ ...args, model: claudeModel })
    : callGemini;

  // 마크다운 → 네이버/홈페이지 HTML
  function markdownToNaverHtml(md) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = md.split("\n");
    const out = [];
    let inList = false;
    const flushList = () => { if (inList) { out.push("</ul>"); inList = false; } };

    for (let raw of lines) {
      const line = raw.replace(/\r$/, "");
      if (/^# /.test(line)) { flushList(); out.push(`<h2 style="font-size:20px;font-weight:700;margin:24px 0 12px;color:#1a1a1a;">${esc(line.slice(2))}</h2>`); }
      else if (/^## /.test(line)) { flushList(); out.push(`<h3 style="font-size:17px;font-weight:700;color:#0b3d5c;margin:20px 0 8px;border-bottom:2px solid #c9dbe8;padding-bottom:4px;">${esc(line.slice(3))}</h3>`); }
      else if (/^### /.test(line)) { flushList(); out.push(`<h4 style="font-size:15px;font-weight:700;color:#8b6f3e;margin:14px 0 6px;">${esc(line.slice(4))}</h4>`); }
      else if (/^> /.test(line)) { flushList(); out.push(`<blockquote style="background:#f0f9ff;border-left:4px solid #0369a1;margin:10px 0;padding:10px 14px;color:#0c4a6e;border-radius:0 8px 8px 0;">${esc(line.slice(2))}</blockquote>`); }
      else if (/^[-•]\s+/.test(line)) {
        if (!inList) { out.push(`<ul style="margin:6px 0 10px 0;padding-left:20px;">`); inList = true; }
        out.push(`<li style="margin:3px 0;line-height:1.8;">${esc(line.replace(/^[-•]\s+/, ""))}</li>`);
      }
      else if (/^Q\./.test(line)) { flushList(); out.push(`<p style="font-weight:700;color:#0b3d5c;background:#0b3d5c0d;padding:8px 12px;border-left:3px solid #0b3d5c;margin:12px 0 4px;border-radius:4px;">${esc(line)}</p>`); }
      else if (/^A\./.test(line)) { flushList(); out.push(`<p style="color:#444;margin:0 0 10px 14px;line-height:1.8;">${esc(line)}</p>`); }
      else if (line.trim() === "") { flushList(); out.push("<br>"); }
      else { flushList(); out.push(`<p style="line-height:1.9;margin:6px 0;color:#333;">${esc(line)}</p>`); }
    }
    flushList();
    return out.join("\n");
  }

  function handlePortraitUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { alert("이미지 파일만 업로드 가능합니다."); return; }
    if (f.size > 5 * 1024 * 1024) { alert("이미지가 너무 큽니다 (최대 5MB)."); return; }
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result;
      setPortrait(dataUrl);
      try { localStorage.setItem("mediblog_portrait", dataUrl); } catch (err) { console.warn("저장 실패:", err.message); }
    };
    r.readAsDataURL(f);
  }

  function clearPortrait() {
    if (!confirm("저장된 인물 사진을 삭제하시겠습니까?")) return;
    setPortrait("");
    try { localStorage.removeItem("mediblog_portrait"); } catch (e) {}
    if (portraitRef.current) portraitRef.current.value = "";
  }

  function backupPortrait() {
    if (!portrait) return;
    const mime = (portrait.match(/^data:([^;]+);base64,/) || [])[1] || "image/png";
    const ext = mime.split("/")[1] || "png";
    const a = document.createElement("a");
    a.href = portrait; a.download = `original-portrait-backup.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function generateHeroOnly() {
    if (!result?.content) { setHeroError("먼저 블로그 글을 생성해주세요."); return; }
    if (!apiKey.trim() || provider !== "gemini") { setHeroError("이미지 생성은 Gemini API 키가 필요합니다."); return; }
    setHeroError(""); setHeroStatus("generating");
    try {
      const h = await generateHeroImage({
        apiKey: apiKey.trim(),
        blogText: result.content,
        title: result.meta?.title,
        keywords: (result.meta?.keywords || []).join(", "),
        aspectRatio: heroAspect,
      });
      setHero(h); setHeroStatus("done");
    } catch (err) { setHeroError(err.message); setHeroStatus("error"); }
  }

  async function generateAllImages() {
    if (!result?.content) { setImageError("먼저 블로그 글을 생성해주세요."); return; }
    if (!apiKey.trim() || provider !== "gemini") { setImageError("이미지 생성은 Gemini API 키가 필요합니다. 상단에서 Gemini를 선택하고 키를 저장해주세요."); return; }
    setImageError(""); setImageStatus("generating"); setImageParagraphs([]);
    setHero(null); setHeroStatus("idle"); setHeroError("");
    try { localStorage.setItem("mediblog_clinic", clinicName); localStorage.setItem("mediblog_doctor", doctorName); } catch (e) {}

    try {
      setImageProgress("0단계: AEO 대표 이미지 생성 중…");
      setHeroStatus("generating");
      try {
        const h = await generateHeroImage({
          apiKey: apiKey.trim(),
          blogText: result.content,
          title: result.meta?.title,
          keywords: (result.meta?.keywords || []).join(", "),
          aspectRatio: heroAspect,
        });
        setHero(h); setHeroStatus("done");
      } catch (err) {
        console.warn("대표 이미지 생성 실패, 단락 이미지로 계속:", err.message);
        setHeroStatus("error"); setHeroError(err.message);
      }

      setImageProgress(`1단계: 블로그를 ${imageParagraphCount}개 단락으로 분할 중…`);
      const split = await splitBlogForImages({
        apiKey: apiKey.trim(),
        blogText: result.content,
        paragraphCount: parseInt(imageParagraphCount, 10),
      });
      setImageParagraphs(split);

      const working = [...split];
      for (let i = 0; i < working.length; i++) {
        setImageProgress(`2단계: 이미지 생성 (${i + 1}/${working.length})…`);
        setImageParagraphs(prev => prev.map((p, idx) => idx === i ? { ...p, status: "generating" } : p));
        try {
          const imgUrl = await generateParagraphImage({
            apiKey: apiKey.trim(),
            paragraph: working[i],
            portrait: portrait || undefined,
            clinicName, doctorName,
          });
          working[i] = { ...working[i], imageUrl: imgUrl, status: "completed" };
          setImageParagraphs(prev => prev.map((p, idx) => idx === i ? { ...p, imageUrl: imgUrl, status: "completed" } : p));
        } catch (err) {
          console.error(`단락 ${i + 1} 이미지 생성 실패:`, err);
          working[i] = { ...working[i], status: "error", error: err.message };
          setImageParagraphs(prev => prev.map((p, idx) => idx === i ? { ...p, status: "error", error: err.message } : p));
          if (/not\s*found|billing|permission|unsupported/i.test(err.message || "")) {
            setImageError(`모델 접근 실패: ${err.message}. ${IMAGE_GEN_MODEL}은 결제가 활성화된 API 키에서만 작동합니다.`);
            setImageStatus("error"); return;
          }
        }
      }
      setImageStatus("done"); setImageProgress("");
    } catch (err) { setImageError(err.message); setImageStatus("error"); setImageProgress(""); }
  }

  async function retryImage(idx) {
    const p = imageParagraphs[idx];
    if (!p) return;
    setImageParagraphs(prev => prev.map((x, i) => i === idx ? { ...x, status: "generating", error: undefined } : x));
    try {
      const imgUrl = await generateParagraphImage({ apiKey: apiKey.trim(), paragraph: p, portrait: portrait || undefined, clinicName, doctorName });
      setImageParagraphs(prev => prev.map((x, i) => i === idx ? { ...x, imageUrl: imgUrl, status: "completed" } : x));
    } catch (err) {
      setImageParagraphs(prev => prev.map((x, i) => i === idx ? { ...x, status: "error", error: err.message } : x));
    }
  }

  async function handleDownloadZip() {
    const hasHero = hero && hero.imageUrl;
    const completedParagraphs = imageParagraphs.filter(p => p.status === "completed");
    const completedCustoms = customImages.filter(c => c.status === "completed" && c.imageUrl);
    if (!hasHero && completedParagraphs.length === 0 && completedCustoms.length === 0) return;
    setZipping(true);
    try {
      const mainKeyword = result?.meta?.keywords?.[0] || result?.meta?.title || finalDisease;
      const safeTitle = koreanSlug(result?.meta?.title || "blog-images", 40);
      await downloadImagesAsZip({
        paragraphs: imageParagraphs,
        hero: hasHero ? hero : null,
        customs: completedCustoms,
        filenamePrefix: safeTitle,
        mainKeyword,
        useWebp,
      });
    } catch (err) { alert("ZIP 다운로드 실패: " + err.message); }
    setZipping(false);
  }

  function downloadHeroOnly() {
    if (!hero?.imageUrl) return;
    const kw = koreanSlug(result?.meta?.keywords?.[0] || result?.meta?.title || finalDisease, 30);
    const a = document.createElement("a");
    a.href = hero.imageUrl;
    a.download = `00-${kw}-대표-${hero.aspectRatio.replace(":", "x")}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function generateCustomImage() {
    const p = customPrompt.trim();
    if (!p) { alert("이미지 프롬프트를 입력해주세요."); return; }
    if (!apiKey.trim() || provider !== "gemini") { alert("Gemini API 키가 필요합니다."); return; }
    const placeholderId = Date.now();
    setCustomImages(prev => [...prev, { id: placeholderId, userPrompt: p, aspectRatio: customAspect, style: customStyle, status: "generating", imageUrl: null }]);
    setCustomGenerating(true);
    try {
      const img = await generateFromPrompt({ apiKey: apiKey.trim(), prompt: p, aspectRatio: customAspect, style: customStyle });
      setCustomImages(prev => prev.map(x => x.id === placeholderId ? { ...x, ...img, status: "completed" } : x));
    } catch (err) {
      setCustomImages(prev => prev.map(x => x.id === placeholderId ? { ...x, status: "error", error: err.message } : x));
      alert("커스텀 이미지 생성 실패: " + err.message);
    } finally { setCustomGenerating(false); }
  }

  function removeCustomImage(id) { setCustomImages(prev => prev.filter(x => x.id !== id)); }

  function downloadCustomImage(img) {
    if (!img?.imageUrl) return;
    const slug = koreanSlug(img.userPrompt || "image", 30);
    const a = document.createElement("a");
    a.href = img.imageUrl; a.download = `custom-${slug}-${img.aspectRatio.replace(":", "x")}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function copyAsHtml() {
    if (!result?.content) return;
    const html = markdownToNaverHtml(result.content);
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([result.content], { type: "text/plain" }),
        })]);
      } else {
        const div = document.createElement("div");
        div.innerHTML = html;
        div.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
        document.body.appendChild(div);
        const range = document.createRange(); range.selectNodeContents(div);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        document.execCommand("copy"); sel.removeAllRanges();
        document.body.removeChild(div);
      }
      setHtmlCopied(true); setTimeout(() => setHtmlCopied(false), 2500);
    } catch (e) { alert("HTML 복사 실패: " + e.message); }
  }

  const schemaJsonLd = useMemo(() => {
    if (!result) return "";
    const faqItems = (result.schema?.faqItems?.length ? result.schema.faqItems : extractFaqFromContent(result.content)) || [];
    const today = new Date().toISOString().slice(0, 10);
    const baseUrl = platform === "homepage" ? "https://ireaomd.co.kr" : "";
    const slug = result.meta.slug || koreanSlug(result.meta.title || "post", 40);
    const url = platform === "homepage" ? `${baseUrl}/blog/${slug}` : "";
    const schemas = [
      buildMedicalWebPageSchema({
        meta: result.meta, url,
        datePublished: today,
        clinicName, doctorName,
        entities: result.schema?.entities,
        heroImageUrl: hero?.imageUrl ? "[HERO_IMAGE_URL_HERE]" : undefined,
      }),
      buildFaqPageSchema(faqItems),
      platform === "homepage" ? buildBreadcrumbSchema({ clinicName, categoryLabel: finalDisease, title: result.meta.title, baseUrl }) : null,
    ];
    return schemasToLdJson(schemas);
  }, [result, platform, clinicName, doctorName, hero, finalDisease]);

  async function copySchema() {
    if (!schemaJsonLd) return;
    try {
      await navigator.clipboard.writeText(schemaJsonLd);
      setSchemaCopied(true); setTimeout(() => setSchemaCopied(false), 2500);
    } catch (e) { alert("스키마 복사 실패: " + e.message); }
  }

  async function loadRelatedPosts() {
    if (!result) return;
    setRelatedLoading(true); setRelatedError(""); setRelatedPosts([]);
    try {
      const kw = result.meta.keywords?.length ? result.meta.keywords : [finalDisease, topic];
      const posts = await fetchRelatedPosts({ keywords: kw, max: 5 });
      setRelatedPosts(posts);
    } catch (e) { setRelatedError(e.message); }
    finally { setRelatedLoading(false); }
  }

  // ═══════════════════════════════════════════════
  //  GENERATE — 메인 생성 함수
  // ═══════════════════════════════════════════════
  const generate = async () => {
    if (!apiKey.trim()) { setError(`${PROVIDERS[provider].keyLabel}를 먼저 저장해주세요.`); return; }
    if (!topic.trim()) { setError("블로그 주제를 입력해주세요."); return; }
    if (!finalDisease.trim()) { setError("질환명을 입력해주세요."); return; }
    setError(""); setResult(null); setRawDebug(""); setLoading(true);
    setRelatedPosts([]); setRelatedError("");

    const hasPaper = !!(paperFile || paperText);
    const useRefUrl = referenceMode === "url" && referenceUrl.trim();
    const useRefText = referenceMode === "text" && referenceText.trim();
    const hasReference = useRefUrl || useRefText;
    const hasVerifiedSource = hasPaper || hasReference;

    const geminiTools = useRefUrl && provider === "gemini" ? [{ urlContext: {} }] : undefined;
    // Claude web fetch 도구 시도 (Claude 4.6+ 지원)
    const claudeTools = useRefUrl && provider === "claude" ? [{ type: "web_search_20250305", name: "web_search" }] : undefined;

    const currentYear = new Date().getFullYear();
    const systemPrompt = buildSystemPrompt({ platform, currentYear, hasVerifiedSource });
    const pf = PLATFORMS[platform];

    let sourceBlock = "";
    if (hasPaper) sourceBlock += "\n[소스1 · 논문 PDF/텍스트] 첨부된 논문을 꼼꼼히 읽고, 실제 데이터(연구 대상자 수, 통계 수치, OR/HR, P값, %)를 정확히 추출하여 반영해 주세요.";
    if (useRefUrl) sourceBlock += `\n\n[소스2 · 참고할 기존 블로그 URL]\n${referenceUrl.trim()}\n위 URL에 접속해서 글을 꼼꼼히 읽은 뒤, 원본의 핵심 정보·흐름·사례는 유지하되 이레한의원 브랜드 보이스 DNA로 완전히 **새롭게 재작성**해주세요.`;
    if (useRefText) sourceBlock += `\n\n[소스2 · 참고할 기존 블로그 원문]\n${referenceText.trim()}\n\n위 기존 글의 핵심 정보·흐름·사례는 유지하되, 이레한의원 브랜드 보이스 DNA로 완전히 **새롭게 재작성**해주세요.`;
    if (!hasVerifiedSource) sourceBlock = "\n[소스 없음 — 환각 방지 모드] 첨부 논문이나 참고 블로그 없이 질환명·주제·키워드 정보만으로 작성합니다. 구체적 저널명/권호/DOI/저자명/수치는 **절대** 지어내지 말고 익명 인용만 사용하세요.";

    const userPrompt = `질환명: ${finalDisease}
블로그 주제/핵심 증상: ${topic}
추가 타겟 키워드: ${keywords || "자동 선정"}
플랫폼: ${pf.label} (${pf.minChars}~${pf.maxChars}자)
${sourceBlock}

소주제(H2 — "핵심 요약"·"자주 묻는 질문" 제외)를 **정확히 ${subtopicTarget}개** 구성하고, 공백 제외 한글 ${pf.minChars.toLocaleString()}~${pf.maxChars.toLocaleString()}자로 작성해 주세요.
반드시 **블록0 TL;DR → 블록1 환자사례 → 블록2 본론 → 블록3 임상해석 → 블록4 이레한의원 연결 → 블록5 Q&A 3개** 순서.
3번째 Q&A 답변 직후 "그 과정에 이레한의원이 동행하겠습니다." 로 전체 글을 마무리하세요.
본문에 --- 구분선은 절대 쓰지 마세요.${platform === "naver" ? " **굵게 표시도 네이버 모드에서는 사용 금지**." : ""}
${extraInstruction.trim() ? `
[이번 글 추가 지침 — 최우선 반영]
${extraInstruction.trim()}` : ""}`;

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
      setLoadingMsg(`1단계: ${PROVIDERS[provider].short}${provider === "claude" ? ` (${claudeModel})` : ""}로 초안 생성...`);
      const call = caller();
      const callArgs = { apiKey: apiKey.trim(), systemPrompt, messages: [{ role: "user", content: msgContent }] };
      if (geminiTools) callArgs.tools = geminiTools;
      if (claudeTools) callArgs.tools = claudeTools;

      let raw1;
      try {
        raw1 = await call(callArgs);
      } catch (e) {
        // Claude web_search가 지원 안 되는 경우 tool 제거 후 재시도
        if (claudeTools && /tool|web_search|unsupported/i.test(e.message)) {
          delete callArgs.tools;
          raw1 = await call(callArgs);
          setError("ℹ️ Claude web_search 도구 지원 안 됨 — URL fetch 없이 진행했습니다. 정확도가 필요하면 텍스트 탭에 본문을 붙여넣으세요.");
        } else throw e;
      }
      setRawDebug(raw1);
      let parsed = parseRaw(raw1);
      parsed.content = sanitizeContent(parsed.content, { keepBold: platform === "homepage" });
      let { meta, content, schema } = parsed;
      let charCount = countKorean(content);

      // 2차 보정: 글자 수
      if (charCount < pf.minChars || charCount > pf.maxChars) {
        const dir = charCount < pf.minChars ? "늘려" : "줄여";
        const diff = charCount < pf.minChars ? pf.minChars - charCount : charCount - pf.maxChars;
        setLoadingMsg(`2단계: 글자 수 보정 (${charCount} → ${pf.minChars}~${pf.maxChars})...`);
        const fixPrompt = `아래는 작성된 블로그 본문입니다. 현재 공백 제외 한글 글자 수가 ${charCount}자입니다.
약 ${diff}자를 ${dir}서 ${pf.minChars}~${pf.maxChars}자 범위에 맞게 수정해 주세요.
TL;DR·블록 구조·Q&A 3개·동행 마무리는 그대로 유지하세요.
반드시 동일한 <BLOG_META>...</BLOG_META> <BLOG_CONTENT>...</BLOG_CONTENT> <SCHEMA_HINTS>...</SCHEMA_HINTS> 형식으로 출력하세요.

${raw1}`;
        const raw2 = await call({ apiKey: apiKey.trim(), systemPrompt, messages: [{ role: "user", content: [{ type: "text", text: fixPrompt }] }] });
        setRawDebug(raw2);
        const p2 = parseRaw(raw2);
        p2.content = sanitizeContent(p2.content, { keepBold: platform === "homepage" });
        if (p2.meta.title) meta = p2.meta;
        content = p2.content || content;
        if (p2.schema?.faqItems?.length || p2.schema?.entities?.length) schema = p2.schema;
        charCount = countKorean(content);
      }

      const subtopicNum = parseInt(subtopicTarget, 10);
      const subtopicMatches = (content.match(/^#{2}\s+(.+)$/gm) || []);
      const bodySubtopics = subtopicMatches.filter(h => !/핵심\s*요약|TL.?DR|자주\s*묻는|많이\s*여쭤|이\s*글에서\s*다루는/i.test(h)).length;

      const head = content.slice(0, 500);
      const tail = content.slice(-200);

      // 체크리스트 계산
      const compute = (txt) => {
        const h = txt.slice(0, 600);
        const t = txt.slice(-200);
        const tldrPresent = /^##\s*핵심\s*요약/m.test(txt) && /^>\s/m.test(txt);
        const titleLen = (meta.title || "").length;
        const titleLengthOk = titleLen >= 20 && titleLen <= 40;
        const mainKw = (meta.keywords?.[0] || finalDisease || topic || "").trim();
        const titleHasKeyword = !!(mainKw && meta.title && meta.title.includes(mainKw.split(/\s+/)[0]));
        const metaDescHasKeyword = !!(mainKw && meta.metaDescription && meta.metaDescription.includes(mainKw.split(/\s+/)[0]));
        const fakeHits = hasVerifiedSource ? [] : detectFakeReferences(txt);
        const noFakeReference = fakeHits.length === 0;
        const currentYr = new Date().getFullYear();
        const currencyStamp = new RegExp(`${currentYr}|${currentYr - 1}|최근|올해|요즘`).test(txt);
        const hasQuote = /["'「『"']/.test(h);
        const hasPatientFrame = /(이레한의원에서|\d+대\s*(남|여)|\d+세\s*(남|여)|환자|내원|받고 계신)/.test(h);
        const paperPattern = /20\d{2}[^\n]{0,60}(저널|Journal|journal|연구|논문)/;
        const statsStrict = /[\d.]+\s*%|[\d.]+\s*배|P\s*[=<]\s*0\.\d|OR\s*[=:]?\s*\d|HR\s*[=:]?\s*\d|95%\s*CI|n\s*=\s*\d/;
        const reservedMatches = txt.match(/있겠습니다|필요가 있|수 있겠|보입니다|해 보겠습니다|정리할 수 있겠/g) || [];
        const companionInTail = /동행하겠습니다/.test(t);
        const qMatches = txt.match(/^\s*Q\.\s*/gm) || [];
        // Answer-first: A. 다음 첫 문장이 "반드시", "네", "아닙니다", "~입니다" 같은 서술형으로 시작
        const aLines = txt.match(/^\s*A\.\s*(.+)$/gm) || [];
        const answerFirst = aLines.length >= 3 && aLines.filter(a => {
          const first = a.replace(/^\s*A\.\s*/, "").split(/[.?!]/)[0];
          return first && first.length > 5 && /(입니다|습니다|않습니다|맞습니다|아닙니다|그렇지는|가능합니다)/.test(first);
        }).length >= 2;
        const hanjaCount = (txt.match(/[一-鿿]/g) || []).length;
        const diseaseMentions = finalDisease ? (txt.match(new RegExp(finalDisease.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length : 0;
        return {
          tldrPresent, titleLengthOk, titleHasKeyword, metaDescHasKeyword,
          noFakeReference, currencyStamp,
          patientCase: hasPatientFrame && hasQuote,
          paperCited: paperPattern.test(txt),
          statistics: statsStrict.test(txt),
          reservedTone: reservedMatches.length >= 3,
          companionEnding: companionInTail,
          faqSection: qMatches.length >= 3,
          answerFirst,
          hanjaBilingual: hanjaCount >= 3,
          keywordRepeat: diseaseMentions < 20,
          subtopicCount: bodySubtopics,
          subtopicTarget: subtopicNum,
          subtopicExact: bodySubtopics === subtopicNum,
          _reservedCount: reservedMatches.length,
          _qCount: qMatches.length,
          _hanjaCount: hanjaCount,
          _diseaseCount: diseaseMentions,
          _fakeHits: fakeHits,
          _needsStats: hasVerifiedSource,
        };
      };

      let checklist = compute(content);

      // 3차 보정: 실패 2개 이상 또는 가짜 논문 감지 시
      const failed = [];
      if (!checklist.tldrPresent) failed.push("- 글 맨 앞에 `## 핵심 요약` H2 + 바로 `> ` 인용 블록으로 2~3문장 TL;DR을 반드시 배치하세요.");
      if (!checklist.titleLengthOk) failed.push(`- 제목을 25~35자 내외로 조정하세요 (현재 ${(meta.title || "").length}자). 메인 키워드 유지.`);
      if (!checklist.titleHasKeyword) failed.push(`- 제목에 메인 키워드 "${(meta.keywords?.[0] || finalDisease)}"가 반드시 포함되어야 합니다.`);
      if (!checklist.metaDescHasKeyword) failed.push(`- 메타 디스크립션(설명)에 메인 키워드 "${(meta.keywords?.[0] || finalDisease)}"를 포함하세요.`);
      if (!checklist.noFakeReference) failed.push(`- 가짜 논문 인용 의심 (${checklist._fakeHits.join(", ")}). 구체적 저널명·권호·DOI·저자명을 모두 삭제하고 "여러 관찰에서", "한의학 문헌에서는" 같은 익명 인용으로 교체하세요.`);
      if (!checklist.currencyStamp) failed.push(`- 본문 어딘가에 "${new Date().getFullYear()}년" 또는 "최근" 같은 최신성 신호를 1회 자연스럽게 삽입하세요.`);
      if (!checklist.patientCase) failed.push("- 블록1에서 반드시 환자 내면 독백을 큰따옴표로 인용하세요.");
      if (!checklist.statistics && hasVerifiedSource) failed.push("- 통계 수치(%, P, OR, HR)를 최소 2개 포함 — 단, 논문에 실제 있는 값만.");
      if (!checklist.reservedTone) failed.push("- '있겠습니다', '수 있겠', '필요가 있겠습니다' 같은 유보적 어미를 본문에 3회 이상 사용하세요.");
      if (!checklist.companionEnding) failed.push("- 본문 맨 마지막 문장은 반드시 '그 과정에 이레한의원이 동행하겠습니다.'로 끝내세요.");
      if (!checklist.faqSection) failed.push("- **글의 맨 마지막 블록**에 'Q./A.' Q&A를 정확히 3개 포함하세요.");
      if (!checklist.answerFirst) failed.push("- Q&A의 각 답변은 반드시 첫 문장에 '반드시 그렇지는 않습니다', '치료 기간은 ~입니다' 같은 완결형 명제로 시작하세요.");
      if (!checklist.hanjaBilingual) failed.push("- 음허(陰虛), 조증(燥症) 등 한자 병기 한의학 용어를 최소 3개 포함하세요.");
      if (!checklist.keywordRepeat) failed.push(`- 질환명 "${finalDisease}"가 ${checklist._diseaseCount}회 반복됨. 20회 미만으로 줄이세요.`);
      if (!checklist.subtopicExact) failed.push(`- 본론 소주제 H2가 ${checklist.subtopicCount}개인데 목표는 ${subtopicNum}개. (TL;DR·Q&A 제외한 본론 H2 갯수)`);

      const fakeBoost = !checklist.noFakeReference; // 가짜 논문은 단독으로도 재작성
      if (failed.length >= 2 || fakeBoost) {
        setLoadingMsg(`3단계: 품질 보강 (${failed.length}개 항목 재적용)...`);
        const fixPrompt = `아래는 작성된 블로그 글입니다. 다음 항목이 누락 또는 부족하므로 반드시 보강해서 다시 출력해주세요.

${failed.join("\n")}

위 지시사항을 모두 반영하되, 글자 수(공백 제외 한글 ${pf.minChars}~${pf.maxChars}자), 블록 구조, TL;DR, Q&A 3개, 동행 마무리, 금지 표현 규칙은 그대로 유지하세요.
반드시 동일한 <BLOG_META>...</BLOG_META> <BLOG_CONTENT>...</BLOG_CONTENT> <SCHEMA_HINTS>...</SCHEMA_HINTS> 형식으로만 출력하세요.

${raw1}`;
        try {
          const raw3 = await call({ apiKey: apiKey.trim(), systemPrompt, messages: [{ role: "user", content: [{ type: "text", text: fixPrompt }] }] });
          setRawDebug(raw3);
          const p3 = parseRaw(raw3);
          p3.content = sanitizeContent(p3.content, { keepBold: platform === "homepage" });
          if (p3.content) {
            content = p3.content;
            if (p3.meta.title) meta = p3.meta;
            if (p3.schema?.faqItems?.length || p3.schema?.entities?.length) schema = p3.schema;
            charCount = countKorean(content);
            checklist = compute(content);
          }
        } catch (e) { console.warn("3차 보정 실패, 2차 결과 유지:", e.message); }
      }

      meta.charCount = charCount;
      // schema에 faqItems 비어있으면 본문에서 추출
      if (!schema.faqItems?.length) schema.faqItems = extractFaqFromContent(content);

      setResult({ meta, checklist, content, schema });
      setActiveTab("preview");
    } catch (e) {
      setError(`오류: ${e.message || "알 수 없는 오류"}`);
    } finally { setLoading(false); }
  };

  // Styles
  const s = {
    wrap: { maxWidth: 860, margin: "0 auto", padding: "24px 18px", fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif", background: "#f7fafc", minHeight: "100vh" },
    card: { background: "#fff", border: "1px solid #d9e4ec", borderRadius: 14, padding: "22px", marginBottom: 18, boxShadow: "0 2px 8px #0000000a" },
    label: { fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" },
    input: { width: "100%", padding: "10px 14px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 14, color: "#222", background: "#fafafa", outline: "none", boxSizing: "border-box" },
    select: { width: "100%", padding: "10px 14px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 14, color: "#222", background: "#fafafa", outline: "none", boxSizing: "border-box" },
    btn: { width: "100%", padding: "14px", background: "#0b3d5c", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" },
    tab: (a) => ({ padding: "8px 16px", border: "none", background: a ? "#0b3d5c" : "transparent", color: a ? "#fff" : "#888", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }),
  };

  const hasPaper = !!(paperFile || paperText);

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24, paddingTop: 36 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 26 }}>🏥</span>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#0b3d5c" }}>이레 블로그 작성기 <span style={{ color: "#0369a1", fontSize: 16 }}>PRO</span></div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>TL;DR · 스키마 JSON-LD · 가짜 논문 차단 · 이미지 SEO · 플랫폼 분기</div>
          </div>
        </div>
        <div style={{ display: "inline-block", background: "#0b3d5c10", color: "#0b3d5c", fontSize: 12, fontWeight: 600, padding: "4px 14px", borderRadius: 20, border: "1px solid #0b3d5c25" }}>
          "AI 검색 인용 가능한 E-E-A-T 의료 콘텐츠"
        </div>
      </div>

      {/* Platform toggle */}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 8 }}>🖥️ 발행 플랫폼</div>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.values(PLATFORMS).map(pf => (
            <button key={pf.id} onClick={() => switchPlatform(pf.id)} style={{
              flex: 1, padding: "10px", borderRadius: 8,
              border: `1.5px solid ${platform === pf.id ? "#0b3d5c" : "#ddd"}`,
              background: platform === pf.id ? "#0b3d5c" : "#fff",
              color: platform === pf.id ? "#fff" : "#555",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              textAlign: "left",
            }}>
              <div>{pf.label}</div>
              <div style={{ fontSize: 10, opacity: 0.8, marginTop: 3, fontWeight: 400 }}>{pf.note}</div>
            </button>
          ))}
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
              border: `1.5px solid ${provider === p.id ? "#0b3d5c" : "#ddd"}`,
              background: provider === p.id ? "#0b3d5c" : "#fff",
              color: provider === p.id ? "#fff" : "#666",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{p.short}</button>
          ))}
        </div>
        {provider === "claude" && (
          <div style={{ marginBottom: 10 }}>
            <label style={s.label}>Claude 모델</label>
            <select style={s.select} value={claudeModel} onChange={e => { setClaudeModel(e.target.value); localStorage.setItem(CLAUDE_MODEL_STORAGE, e.target.value); }}>
              {CLAUDE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              {CLAUDE_MODELS.find(m => m.id === claudeModel)?.note}
            </div>
          </div>
        )}
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
                <div style={{ display: "flex", gap: 6 }}>
                  <input readOnly value={bookmarkUrl} onFocus={e => e.target.select()}
                    style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 5, fontSize: 11, fontFamily: "monospace" }} />
                  <button onClick={copyBookmark} style={{ padding: "6px 12px", background: "#0b3d5c", color: "#fff", border: "none", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
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
              if (!t.startsWith(PROVIDERS[provider].keyPrefix)) { alert(`${PROVIDERS[provider].short} 키는 ${PROVIDERS[provider].keyPrefix}로 시작합니다.`); return; }
              try { await window.storage.set(STORAGE_KEYS[provider], t); localStorage.setItem(PROVIDER_STORAGE, provider); } catch (e) {}
              setApiKey(t); setApiKeySaved(true);
            }} style={{ ...s.btn, marginTop: 8, padding: 10, fontSize: 13 }}>저장</button>
            <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
              키 발급 → <a href={PROVIDERS[provider].docUrl} target="_blank" rel="noreferrer" style={{ color: "#0b3d5c" }}>{PROVIDERS[provider].docLabel}</a>
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
          <label style={s.label}>🔑 추가 타겟 키워드 <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>(선택, 쉼표 구분 · 첫 번째가 메인 키워드)</span></label>
          <input style={s.input} value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="예: 혀 통증, 쇠맛, 한의학 자가면역, 인천 한의원" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={s.label}>📑 소주제 갯수</label>
            <select style={s.select} value={subtopicTarget} onChange={e => setSubtopicTarget(e.target.value)}>
              <option value="3">3개</option>
              <option value="4">4개</option>
              <option value="5">5개</option>
              <option value="6">6개</option>
              <option value="7">7개</option>
            </select>
          </div>
          <div>
            <label style={s.label}>✏️ 추가 / 제외 지침 <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>(선택 — 이번 글에만 적용)</span></label>
            <textarea value={extraInstruction} onChange={e => setExtraInstruction(e.target.value)}
              placeholder={`예) 침치료 강조, 블록3을 더 길게, 특정 나이대 사용 금지`}
              style={{ ...s.input, height: 68, resize: "vertical", fontSize: 13, lineHeight: 1.5, fontFamily: "inherit" }} />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={s.label}>📄 논문 원문 첨부 <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>(PDF/TXT · 없으면 환각 방지 모드로 생성)</span></label>
          {!hasPaper ? (
            <div onClick={() => fileRef.current?.click()}
              style={{ border: "2px dashed #a3c2d6", borderRadius: 10, padding: 28, textAlign: "center", cursor: "pointer", background: "#f7fafc" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>클릭하여 논문 파일 업로드</div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>업로드 안 하면 소스 없는 안전 모드(가짜 인용 금지)로 생성</div>
              <input ref={fileRef} type="file" accept=".pdf,.txt,text/plain,application/pdf" style={{ display: "none" }} onChange={handleFile} />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 10, padding: "12px 16px" }}>
              <span style={{ fontSize: 22 }}>{paperFile ? "📄" : "📝"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#2e7d32" }}>{paperFile ? paperFile.name : "텍스트 논문 업로드됨"}</div>
                <div style={{ fontSize: 11, color: "#66bb6a", marginTop: 2 }}>
                  {paperFile ? `${(paperFile.size / 1024).toFixed(1)} KB · 본문 서지·수치 추출 가능` : `${paperText.length.toLocaleString()}자 · 본문 서지·수치 추출 가능`}
                </div>
              </div>
              <button onClick={removePaper} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 18, padding: 12, background: "#fefce8", border: "1px dashed #eab308", borderRadius: 10 }}>
          <label style={{ ...s.label, color: "#713f12", marginBottom: 8 }}>📝 참고할 기존 블로그 글 (선택)</label>
          <div style={{ fontSize: 11, color: "#78350f", marginBottom: 8, lineHeight: 1.5 }}>
            이미 쓴 글이나 타 블로그를 넣으면 이레 보이스로 <strong>완전히 새롭게 재작성</strong>됩니다.
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <button onClick={() => setReferenceMode("url")}
              style={{ flex: 1, padding: "6px 10px", fontSize: 12, fontWeight: 600, border: `1.5px solid ${referenceMode === "url" ? "#ca8a04" : "#fde68a"}`, background: referenceMode === "url" ? "#ca8a04" : "#fff", color: referenceMode === "url" ? "#fff" : "#78350f", borderRadius: 6, cursor: "pointer" }}>
              🔗 URL
            </button>
            <button onClick={() => setReferenceMode("text")}
              style={{ flex: 1, padding: "6px 10px", fontSize: 12, fontWeight: 600, border: `1.5px solid ${referenceMode === "text" ? "#ca8a04" : "#fde68a"}`, background: referenceMode === "text" ? "#ca8a04" : "#fff", color: referenceMode === "text" ? "#fff" : "#78350f", borderRadius: 6, cursor: "pointer" }}>
              📋 텍스트 붙여넣기
            </button>
          </div>
          {referenceMode === "url" ? (
            <>
              <input type="url" value={referenceUrl} onChange={e => setReferenceUrl(e.target.value)}
                placeholder="https://blog.naver.com/dlfpomd2/... 또는 다른 블로그 URL"
                style={{ ...s.input, background: "#fff", fontSize: 13 }} />
              <div style={{ fontSize: 10, color: "#78350f", marginTop: 4, lineHeight: 1.5 }}>
                💡 Gemini는 urlContext, Claude는 web_search 도구로 가져갑니다. 지원 안 되는 경우 텍스트 탭으로 복사해주세요.
              </div>
            </>
          ) : (
            <textarea value={referenceText} onChange={e => setReferenceText(e.target.value)}
              placeholder="기존 블로그 글 전체를 복사해서 여기에 붙여넣으세요..."
              style={{ ...s.input, background: "#fff", height: 120, resize: "vertical", fontSize: 13, lineHeight: 1.5, fontFamily: "inherit" }} />
          )}
          {((referenceMode === "url" && referenceUrl) || (referenceMode === "text" && referenceText)) && (
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#166534" }}>
              <span>✅</span>
              <span>참고 블로그 {referenceMode === "url" ? "URL" : `텍스트 (${referenceText.length.toLocaleString()}자)`} 반영됨</span>
              <button onClick={() => { setReferenceUrl(""); setReferenceText(""); }} style={{ marginLeft: "auto", background: "none", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>지우기</button>
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
          {loading ? "작성 중..." : `✍️ ${PROVIDERS[provider].short}${provider === "claude" ? ` (${claudeModel.replace("claude-", "").replace("-20251001", "")})` : ""}로 이레 PRO 생성`}
        </button>
      </div>

      {loading && (
        <div style={{ ...s.card, display: "flex", justifyContent: "center", padding: "32px 24px" }}>
          <Spinner msg={loadingMsg} />
        </div>
      )}

      {result && (
        <div style={s.card}>
          <MetaCard result={result} platform={platform} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <button style={s.tab(activeTab === "preview")} onClick={() => setActiveTab("preview")}>미리보기</button>
              <button style={s.tab(activeTab === "raw")} onClick={() => setActiveTab("raw")}>텍스트 원본</button>
              <button style={s.tab(activeTab === "schema")} onClick={() => setActiveTab("schema")}>📊 스키마 JSON-LD</button>
              <button style={s.tab(activeTab === "related")} onClick={() => { setActiveTab("related"); if (!relatedPosts.length && !relatedLoading) loadRelatedPosts(); }}>🔗 관련 글</button>
              {rawDebug && <button style={s.tab(activeTab === "debug")} onClick={() => setActiveTab("debug")}>🔍 디버그</button>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => {
                try {
                  const ta = document.createElement("textarea");
                  ta.value = result.content;
                  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
                  document.body.appendChild(ta); ta.focus(); ta.select();
                  document.execCommand("copy"); document.body.removeChild(ta);
                  setCopied(true); setTimeout(() => setCopied(false), 2000);
                } catch (e) { alert("복사 실패"); }
              }} style={{ padding: "7px 14px", background: copied ? "#27ae60" : "#f0ebe0", color: copied ? "#fff" : "#555", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {copied ? "✅" : "📋 MD"}
              </button>
              <button onClick={copyAsHtml} title="네이버 블로그 에디터에 붙여넣으면 서식 유지"
                style={{ padding: "7px 14px", background: htmlCopied ? "#27ae60" : "#0b3d5c", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {htmlCopied ? "✅" : "🎨 HTML"}
              </button>
            </div>
          </div>
          {activeTab === "preview" && <div style={{ lineHeight: 1.8 }}>{renderMd(result.content)}</div>}
          {activeTab === "raw" && <textarea readOnly value={result.content} style={{ ...s.input, height: 540, resize: "vertical", fontFamily: "monospace", fontSize: 13, lineHeight: 1.7 }} />}
          {activeTab === "schema" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "#666" }}>HTML <code>&lt;head&gt;</code> 또는 <code>&lt;body&gt;</code> 아무 곳에 그대로 붙여넣으세요.</div>
                <button onClick={copySchema} style={{ padding: "6px 12px", background: schemaCopied ? "#27ae60" : "#0b3d5c", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {schemaCopied ? "✅ 복사됨" : "📋 스키마 복사"}
                </button>
              </div>
              <textarea readOnly value={schemaJsonLd} style={{ ...s.input, height: 540, resize: "vertical", fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, background: "#0f172a", color: "#a5f3fc" }} />
              <div style={{ marginTop: 8, fontSize: 11, color: "#666", lineHeight: 1.6 }}>
                포함: <strong>MedicalWebPage</strong>(의료 전문 페이지 · 저자·발행기관·질환 entity) + <strong>FAQPage</strong>(Q&A 3개 · Google rich result) {platform === "homepage" && <>+ <strong>BreadcrumbList</strong>(사이트 경로)</>}
                <br />※ 대표 이미지 URL은 생성 후 실제 URL로 수동 교체 필요 (현재는 <code>[HERO_IMAGE_URL_HERE]</code> 플레이스홀더)
              </div>
            </div>
          )}
          {activeTab === "related" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#666" }}>ireaomd.co.kr에서 같은 키워드의 기존 글을 찾아 내부 링크 후보로 제안합니다.</div>
                <button onClick={loadRelatedPosts} disabled={relatedLoading} style={{ padding: "6px 12px", background: "#0b3d5c", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: relatedLoading ? "wait" : "pointer" }}>
                  {relatedLoading ? "조회 중…" : "🔄 다시 조회"}
                </button>
              </div>
              {relatedError && <div style={{ color: "#dc2626", fontSize: 12, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6 }}>⚠️ {relatedError}</div>}
              {!relatedLoading && !relatedError && relatedPosts.length === 0 && <div style={{ color: "#888", fontSize: 13, padding: 20, textAlign: "center" }}>관련 글을 찾지 못했습니다.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {relatedPosts.map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "10px 14px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, textDecoration: "none", color: "#1a1a1a" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0b3d5c", marginBottom: 4 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>{p.excerpt}</div>
                    <div style={{ fontSize: 10, color: "#999", marginTop: 4, fontFamily: "monospace" }}>{p.url}</div>
                  </a>
                ))}
              </div>
              {relatedPosts.length > 0 && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 6, fontSize: 11, color: "#065f46", lineHeight: 1.6 }}>
                  💡 위 URL을 블록3 임상 해석 부분에 "(관련 글: [제목])" 형태로 삽입하면 내부 링크 SEO 효과.
                </div>
              )}
            </div>
          )}
          {activeTab === "debug" && <textarea readOnly value={rawDebug} style={{ ...s.input, height: 540, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6, background: "#1a1a2e", color: "#a8d8a8" }} />}
        </div>
      )}

      {/* 🎨 이미지 생성 — blog-writer와 동일 기능, 파일명·WebP·alt 개선 */}
      {result && (() => {
        const customCompleted = customImages.filter(c => c.status === "completed").length;
        return (
        <div style={{ ...s.card, borderColor: "#bae6fd", background: "#f0f9ff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🎨</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0c4a6e" }}>이미지 자동 생성 (Nano Banana Pro)</div>
              <div style={{ fontSize: 11, color: "#075985", marginTop: 2 }}>
                블로그를 {imageParagraphCount}개 단락으로 나눠 한글 의료 이미지 생성 · 파일명 한글 슬러그 · alt 텍스트 · WebP 변환
              </div>
            </div>
          </div>

          <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#78350f", marginBottom: 12, lineHeight: 1.5 }}>
            ⚠️ <strong>{IMAGE_GEN_MODEL}</strong>은 <strong>결제가 활성화된 Gemini API 키</strong>에서만 작동합니다. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" style={{ color: "#0b3d5c" }}>결제 설정</a>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={s.label}>👤 인물 사진 (첫 단락 "원장" 변신용, 선택)</label>
            {!portrait ? (
              <div onClick={() => portraitRef.current?.click()}
                style={{ border: "2px dashed #94a3b8", borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer", background: "#fff" }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>📸</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>클릭하여 업로드</div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 3 }}>얼굴 정면 · 최대 5MB · localStorage 저장</div>
                <input ref={portraitRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePortraitUpload} />
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, padding: 10 }}>
                <img src={portrait} alt="portrait" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid #0b3d5c" }} />
                <div style={{ flex: 1, fontSize: 12, color: "#0c4a6e" }}>
                  <div style={{ fontWeight: 700 }}>✅ 인물 사진 저장됨</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>첫 단락에 자동 재사용. 백업 파일을 받아두시길 권합니다.</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button onClick={backupPortrait} style={{ background: "#0369a1", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>📥 백업</button>
                  <button onClick={clearPortrait} style={{ background: "none", border: "1px solid #fecaca", color: "#dc2626", cursor: "pointer", fontSize: 11, padding: "3px 10px", borderRadius: 4 }}>✕ 삭제</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px 110px", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={s.label}>🏥 한의원</label>
              <input value={clinicName} onChange={e => setClinicName(e.target.value)} style={{ ...s.input, fontSize: 13 }} />
            </div>
            <div>
              <label style={s.label}>👨‍⚕️ 원장</label>
              <input value={doctorName} onChange={e => setDoctorName(e.target.value)} style={{ ...s.input, fontSize: 13 }} />
            </div>
            <div>
              <label style={s.label}>📑 단락</label>
              <select value={imageParagraphCount} onChange={e => setImageParagraphCount(e.target.value)} style={s.select}>
                <option value="6">6개</option><option value="7">7개</option><option value="8">8개</option>
              </select>
            </div>
            <div>
              <label style={s.label}>🖼️ 대표 비율</label>
              <select value={heroAspect} onChange={e => setHeroAspect(e.target.value)} style={s.select}>
                <option value="1:1">1:1</option><option value="16:9">16:9</option><option value="4:3">4:3</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: "#0c4a6e" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={useWebp} onChange={e => setUseWebp(e.target.checked)} />
              <span><strong>WebP 변환</strong> (파일 크기 30~70% 감소 · CLS 개선)</span>
            </label>
          </div>

          <button onClick={generateAllImages} disabled={imageStatus === "generating" || heroStatus === "generating"}
            style={{ ...s.btn, background: imageStatus === "generating" ? "#93c5fd" : "#0369a1", opacity: imageStatus === "generating" ? 0.8 : 1, cursor: imageStatus === "generating" ? "wait" : "pointer" }}>
            {imageStatus === "generating"
              ? (imageProgress || "생성 중…")
              : imageParagraphs.length > 0 || hero
                ? "🔄 전체 다시 생성"
                : `🎨 대표 1장 + 단락 ${imageParagraphCount}장 생성 시작`}
          </button>

          {imageError && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 10, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>⚠️ {imageError}</div>}

          {(hero || heroStatus === "generating" || heroStatus === "error") && (
            <div style={{ marginTop: 16, background: "#fff", border: "1.5px solid #0369a1", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", background: "#0369a1", color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>🖼️ 대표 이미지 (AEO 썸네일)</span>
                <span style={{ fontSize: 10, opacity: 0.8 }}>{hero?.aspectRatio || heroAspect}</span>
              </div>
              {hero?.subject && (
                <div style={{ padding: "6px 14px", background: "#e0f2fe", fontSize: 11, color: "#0c4a6e", borderBottom: "1px solid #bae6fd" }}>
                  <strong>AI 선택:</strong> {hero.subject}
                  {hero.altText && <span style={{ marginLeft: 8, background: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 10 }}>alt: {hero.altText}</span>}
                </div>
              )}
              <div style={{ aspectRatio: (hero?.aspectRatio || heroAspect).replace(":", " / "), background: "#f1f5f9", position: "relative" }}>
                {hero?.imageUrl ? <img src={hero.imageUrl} alt={hero.altText || hero.subject || "대표 이미지"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 12 }}>
                      {heroStatus === "generating" ? "⟳ 생성 중…" : heroStatus === "error" ? `❌ ${heroError?.slice(0, 100)}` : ""}
                    </div>}
              </div>
              <div style={{ padding: "8px 14px", display: "flex", gap: 8, justifyContent: "flex-end", background: "#f8fafc" }}>
                {hero?.imageUrl && <button onClick={downloadHeroOnly} style={{ padding: "5px 12px", background: "#0369a1", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>📥 대표만</button>}
                <button onClick={generateHeroOnly} disabled={heroStatus === "generating" || imageStatus === "generating"}
                  style={{ padding: "5px 12px", background: "#fff", color: "#0369a1", border: "1px solid #0369a1", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: heroStatus === "generating" ? "wait" : "pointer" }}>
                  {heroStatus === "generating" ? "생성 중…" : "🔄 대표만 다시"}
                </button>
              </div>
            </div>
          )}

          {(hero?.imageUrl || imageParagraphs.some(p => p.status === "completed") || customImages.some(c => c.status === "completed")) && (
            <div style={{ marginTop: 16, padding: "10px 14px", background: "#0f172a", color: "#fff", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                📦 준비된 이미지:&nbsp;
                {hero?.imageUrl && <span style={{ marginRight: 10 }}>대표 1장</span>}
                {imageParagraphs.some(p => p.status === "completed") && <span style={{ marginRight: 10 }}>단락 {imageParagraphs.filter(p => p.status === "completed").length}장</span>}
                {customImages.some(c => c.status === "completed") && <span style={{ marginRight: 10 }}>커스텀 {customImages.filter(c => c.status === "completed").length}장</span>}
                <span style={{ fontSize: 10, opacity: 0.7 }}>({useWebp ? "WebP" : "PNG"} · 파일명 한글 슬러그 · alt 텍스트 포함)</span>
              </div>
              <button onClick={handleDownloadZip} disabled={zipping}
                style={{ padding: "8px 16px", background: zipping ? "#94a3b8" : "#22c55e", color: "#fff", border: "none", borderRadius: 8, cursor: zipping ? "wait" : "pointer", fontSize: 12, fontWeight: 700 }}>
                {zipping ? "압축 중…" : "⬇️ ZIP 다운로드"}
              </button>
            </div>
          )}

          {/* 자유 프롬프트 */}
          <div style={{ marginTop: 18, background: "#fff", border: "1.5px solid #a855f7", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>✏️</span>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#6b21a8" }}>직접 프롬프트로 이미지 만들기</div>
              <span style={{ fontSize: 10, background: "#f3e8ff", color: "#6b21a8", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{customCompleted}장</span>
            </div>
            <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
              placeholder={"예) 쇼그렌 환자의 침샘이 부어있는 모습 측면 실사 사진"}
              style={{ width: "100%", minHeight: 70, padding: 10, border: "1px solid #d8b4fe", borderRadius: 8, fontSize: 12, fontFamily: "inherit", lineHeight: 1.5, background: "#faf5ff", resize: "vertical", boxSizing: "border-box" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.5fr", gap: 8, marginTop: 10 }}>
              <select value={customStyle} onChange={e => setCustomStyle(e.target.value)} style={{ ...s.select, fontSize: 12 }}>
                <option value="photo">📷 실사</option><option value="illustration">🎨 일러스트</option><option value="infographic">📊 인포</option><option value="auto">자동</option>
              </select>
              <select value={customAspect} onChange={e => setCustomAspect(e.target.value)} style={{ ...s.select, fontSize: 12 }}>
                <option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="4:3">4:3</option><option value="3:4">3:4</option>
              </select>
              <button onClick={generateCustomImage} disabled={customGenerating || !customPrompt.trim()}
                style={{ width: "100%", padding: "9px 10px", background: customGenerating ? "#c4b5fd" : "#7c3aed", color: "#fff", border: "none", borderRadius: 8, cursor: customGenerating ? "wait" : "pointer", fontSize: 12, fontWeight: 700 }}>
                {customGenerating ? "생성 중…" : "✨ 이미지 생성"}
              </button>
            </div>
            {customImages.length > 0 && (
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {customImages.map((img) => (
                  <div key={img.id} style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ aspectRatio: img.aspectRatio.replace(":", " / "), background: "#f1f5f9", position: "relative" }}>
                      {img.imageUrl ? <img src={img.imageUrl} alt={img.userPrompt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#7c3aed", fontSize: 12 }}>
                            {img.status === "generating" ? "⟳ 생성 중…" : `❌ ${img.error?.slice(0, 60) || "실패"}`}
                          </div>}
                    </div>
                    <div style={{ padding: "6px 10px", fontSize: 11, color: "#6b21a8", lineHeight: 1.5, borderTop: "1px solid #e9d5ff" }}>
                      <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{img.userPrompt}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                        {img.imageUrl && <button onClick={() => downloadCustomImage(img)} style={{ flex: 1, padding: "4px 8px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>📥</button>}
                        <button onClick={() => removeCustomImage(img.id)} style={{ padding: "4px 8px", background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {imageParagraphs.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0c4a6e", marginBottom: 10 }}>
                📑 단락별 이미지: {imageParagraphs.filter(p => p.status === "completed").length} / {imageParagraphs.length}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                {imageParagraphs.map((p, i) => (
                  <div key={i} style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "8px 12px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ background: "#e2e8f0", color: "#334155", fontWeight: 700, width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{i + 1}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: 0.5,
                        background: p.imageType === "photo" ? "#dcfce7" : p.imageType === "illustration" ? "#fef3c7" : "#e0e7ff",
                        color: p.imageType === "photo" ? "#166534" : p.imageType === "illustration" ? "#78350f" : "#3730a3",
                      }}>{(p.imageType || "").toUpperCase()}</span>
                      <span style={{ flex: 1, color: "#475569", fontSize: 12, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {p.text}
                        {p.altText && <span style={{ display: "block", marginTop: 2, fontSize: 10, color: "#94a3b8" }}>alt: {p.altText}</span>}
                      </span>
                      {p.status === "completed" && <span style={{ color: "#16a34a" }}>✓</span>}
                      {p.status === "generating" && <span style={{ color: "#0369a1" }}>⟳</span>}
                      {p.status === "error" && <button onClick={() => retryImage(i)} title={p.error || ""} style={{ background: "none", border: "1px solid #dc2626", color: "#dc2626", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer" }}>재시도</button>}
                    </div>
                    <div style={{ aspectRatio: "16 / 9", background: "#f1f5f9", position: "relative" }}>
                      {p.imageUrl ? <img src={p.imageUrl} alt={p.altText || `단락 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 12 }}>
                            {p.status === "generating" ? "⟳ 생성 중…" : p.status === "error" ? `❌ ${p.error?.slice(0, 60) || ""}` : "⏳ 대기"}
                          </div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        );
      })()}

      <div style={{ textAlign: "center", fontSize: 11, color: "#ccc", marginTop: 8, paddingBottom: 20 }}>
        인천 송도 국제 신도시 이레한의원 · PRO · {PROVIDERS[provider].short}{provider === "claude" ? ` ${claudeModel}` : ""}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<BlogWriterPro />);
