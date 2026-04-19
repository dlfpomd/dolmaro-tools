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

[키워드 반복 제한 — 매우 중요]
아래 항목은 본문 전체에서 각각 **20회 미만**으로만 사용하세요. 반복이 필요할 땐 유사어·지시대명사·우회 표현으로 대체합니다. 네이버 블로그는 동일 키워드 반복을 스팸으로 간주하여 노출에 불이익을 줍니다.
- 질환명 (쇼그렌증후군, 구강작열감증후군, 자가면역질환, 신경병증 등)
  → "이 질환", "해당 증후군", "본 자가면역 문제"
- 핵심 증상어 (구강건조, 안구건조, 작열감, 통증, 염증, 피로)
  → "이 불편함", "해당 증상", "이러한 변화"
- 치료·기전어 (면역, 신경, 침치료, 한약, 타액)
  → "이 접근", "본원의 치료 방법", "해당 기전"

[금지 표현]
❌ "반드시 ~하셔야" → ✅ "~할 필요가 있겠습니다"
❌ "완치 가능" → ✅ "증상 개선에 도움이 될 수 있겠습니다"
❌ 획기적, 놀라운, 반드시, 100%, 즉효, 부작용 없음, 가장 좋은 → 의료광고법 위반 위험
❌ "치료해드리겠습니다" → ✅ "동행하겠습니다"

[마크다운 서식 금지]
본문에는 다음 마크다운을 **절대 사용하지 않습니다** (네이버 블로그 에디터에서 깨짐):
❌ **굵게** 표시 — 강조는 별도 문단이나 줄바꿈으로 표현
❌ ---, ***, ___ 구분선 — 섹션 구분은 소제목(## )으로만 처리
✅ 허용: # ## ### (제목), - • (리스트), Q. A. (Q&A)

[영문 병기 — 현대의학 개념]
- 질환명: 한글(영문 약어) — 쇼그렌증후군(Sjogren's syndrome, SS)
- 의학 개념: 한글 먼저, 영문 괄호 병기

[한자 병기 — 한의학 개념 (필수)]
한의학 고유 용어는 반드시 한자를 괄호로 병기합니다. 한의원 블로그의 전문성 시그널이자 차별점입니다.
- 음허(陰虛), 양허(陽虛), 기허(氣虛), 혈허(血虛)
- 조증(燥症), 담음(痰飮), 어혈(瘀血), 풍열(風熱)
- 비위(脾胃), 간신(肝腎), 심폐(心肺)
- 기체혈어(氣滯血瘀), 기혈양허(氣血兩虛), 음양실조(陰陽失調)
- 변증(辨證), 상초(上焦)·중초(中焦)·하초(下焦)
→ 본문에 **최소 3~4개** 이상의 한자 병기 한의학 용어 자연스럽게 포함

[AEO — AI 답변 최적화]
- 블록2 마지막 Q&A 3개는 각 답변이 **질문 없이 단독 인용돼도 뜻이 통하는 완결형 문장**으로 작성 (명제형, 3~4줄)
- 답변은 "~입니다", "~할 수 있습니다" 같은 명확한 서술 (ChatGPT·Perplexity가 그대로 인용 가능하게)

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

/** 모델이 실수로 삽입한 네이버 블로그 비친화 서식을 제거 */
function sanitizeContent(c) {
  if (!c) return "";
  return c
    .replace(/\*\*/g, "")             // 굵게 표시 ** 제거 (내용은 보존)
    .replace(/^\s*-{3,}\s*$/gm, "")   // --- 구분선 라인 삭제
    .replace(/^\s*\*{3,}\s*$/gm, "")  // *** 구분선
    .replace(/^\s*_{3,}\s*$/gm, "")   // ___ 구분선
    .replace(/\n{3,}/g, "\n\n")       // 빈 줄 3개 이상 → 2개로 축약
    .trim();
}

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
  const content = sanitizeContent(contentM ? contentM[1].trim() : raw.trim());
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
// Image generation (Nano Banana Pro via Gemini API)
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
            },
            required: ["text", "imageType"],
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

/** 블로그 글을 분석해 AEO 최적 대표 이미지 프롬프트를 작성하고 바로 이미지를 생성. */
async function generateHeroImage({ apiKey, blogText, title, keywords, aspectRatio = "1:1" }) {
  // 1) 주제 선택 + 프롬프트 작성 (텍스트 모델, JSON 스키마 강제)
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
- 쇼그렌증후군 안구건조, 건조성 각결막염 → 사람의 눈 클로즈업 (건조·충혈 시각화)
- 쇼그렌증후군 구강건조 → 사람의 입·입술 클로즈업
- 류마티스 관절염, 손/손가락 통증 → 손가락 관절 클로즈업 (주먹을 살짝 쥐거나 관절이 부어있는 느낌)
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
  "subject": "한국어로 선택한 주제 (예: 손가락 관절 클로즈업 — 류마티스 관절염 표현)",
  "imagePrompt": "Ultra high-resolution photo-realistic close-up photograph ... (영문, 4~6문장, 이미지 생성기에 그대로 전달)"
}`;

  const craftRes = await fetch(craftUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: craftPrompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4000,
        // Gemini 2.5 Flash는 기본 thinking 모드에서 내부 추론에 토큰을 쓰기 때문에
        // 실제 응답 전에 maxOutputTokens가 소진되어 잘리는 문제가 있음.
        // 단순한 JSON 포맷 변환 작업이라 thinking이 필요 없으므로 완전히 끈다.
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            subject: { type: "STRING" },
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
  let rawImgPrompt = "";

  // 1차: JSON 스키마 응답 파싱
  try {
    const clean = craftText.replace(/```json\n?|```\n?/g, "").trim();
    const json = JSON.parse(clean);
    if (json.imagePrompt) {
      subject = json.subject || subject;
      rawImgPrompt = json.imagePrompt;
    }
  } catch (e) { /* fall through to tolerant parser */ }

  // 2차: 과거 XML 태그 호환 (이전 버전 응답 유지 or 폴백)
  if (!rawImgPrompt) {
    const subjectM = craftText.match(/<SUBJECT>([\s\S]*?)(?:<\/SUBJECT>|$)/);
    const promptM = craftText.match(/<PROMPT>([\s\S]*?)(?:<\/PROMPT>|$)/);
    if (promptM && promptM[1].trim().length > 20) {
      subject = subjectM ? subjectM[1].trim() : subject;
      rawImgPrompt = promptM[1].trim();
    }
  }

  // 3차: "subject:" / "prompt:" 평문 포맷
  if (!rawImgPrompt) {
    const subLine = craftText.match(/(?:^|\n)\s*(?:\*\*)?\s*subject\s*(?:\*\*)?\s*[:：]\s*(.+?)(?:\n|$)/i);
    const prmLine = craftText.match(/(?:^|\n)\s*(?:\*\*)?\s*(?:image\s*)?prompt\s*(?:\*\*)?\s*[:：]\s*([\s\S]+)$/i);
    if (prmLine && prmLine[1].trim().length > 20) {
      subject = subLine ? subLine[1].trim() : subject;
      rawImgPrompt = prmLine[1].trim();
    }
  }

  // 4차: 마지막 fallback — 응답 전체가 영문 paragraph면 그대로 사용
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

  // AEO/Naver AI 친화 문구 강제 추가
  const finalPrompt = `${rawImgPrompt}

CRITICAL: Photo-realistic, ultra high-resolution, sharp focus, professional medical photography quality.
Subject must be centered, front-facing, instantly recognizable.
Aspect ratio ${aspectRatio}. Clean composition, no text, no watermarks, no logos.
Natural lighting, clinically clean environment if any background is visible.`;

  // 2) 이미지 생성
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
        subject,
        prompt: finalPrompt,
        aspectRatio,
      };
    }
  }
  throw new Error("대표 이미지 생성 응답에 이미지 데이터 없음");
}

/** 자유 프롬프트로 단일 이미지 생성 (사용자가 직접 입력) */
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
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: { aspectRatio },
      },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  for (const part of data.candidates?.[0]?.content?.parts || []) {
    const inline = part.inline_data || part.inlineData;
    if (inline && inline.data) {
      return {
        imageUrl: `data:${inline.mime_type || inline.mimeType || "image/png"};base64,${inline.data}`,
        aspectRatio,
        style,
        userPrompt: prompt.trim(),
        fullPrompt,
      };
    }
  }
  throw new Error("커스텀 이미지 생성 응답에 이미지 데이터가 없습니다.");
}

async function downloadImagesAsZip(paragraphs, filenamePrefix = "blog-images", hero = null, customs = null) {
  if (!window.JSZip) throw new Error("JSZip 라이브러리가 로드되지 않았습니다.");
  const zip = new window.JSZip();
  const folder = zip.folder(filenamePrefix);
  if (hero && hero.imageUrl && hero.imageUrl.startsWith("data:")) {
    const heroB64 = hero.imageUrl.split(",")[1];
    const aspectTag = (hero.aspectRatio || "1:1").replace(":", "x");
    folder.file(`00_hero_${aspectTag}.png`, heroB64, { base64: true });
  }
  paragraphs.forEach((p, i) => {
    if (p.imageUrl && p.imageUrl.startsWith("data:")) {
      const b64 = p.imageUrl.split(",")[1];
      folder.file(`${String(i + 1).padStart(2, "0")}_${p.imageType}.png`, b64, { base64: true });
    }
  });
  (customs || []).forEach((c, i) => {
    if (c.imageUrl && c.imageUrl.startsWith("data:")) {
      const b64 = c.imageUrl.split(",")[1];
      folder.file(`custom_${String(i + 1).padStart(2, "0")}_${c.style || "photo"}.png`, b64, { base64: true });
    }
  });
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filenamePrefix}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
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
            <CheckItem ok={checklist.patientCase} label="환자 사례 도입 (내면 독백)" />
            <CheckItem ok={checklist.paperCited} label={`논문 서지사항 (연도+저널)`} />
            <CheckItem ok={checklist.statistics} label="통계 수치 (%·P·OR·HR)" />
            <CheckItem ok={checklist.reservedTone} label={`유보적 어미 (${checklist._reservedCount ?? 0}회)`} />
            <CheckItem ok={checklist.companionEnding} label="마지막에 동행 마무리" />
            <CheckItem ok={checklist.faqSection} label={`Q&A ${checklist._qCount ?? 0}개`} />
            <CheckItem ok={checklist.hanjaBilingual} label={`한자 병기 (${checklist._hanjaCount ?? 0}자)`} />
            <CheckItem ok={checklist.keywordRepeat} label={`질환명 반복 ${checklist._diseaseCount ?? 0}회 (<20)`} />
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
  const [subtopicTarget, setSubtopicTarget] = useState("5");
  const [extraInstruction, setExtraInstruction] = useState("");
  const [paperFile, setPaperFile] = useState(null);
  const [paperText, setPaperText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [rawDebug, setRawDebug] = useState("");
  const [copied, setCopied] = useState(false);
  const [htmlCopied, setHtmlCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("preview");
  const fileRef = useRef();

  // ── 이미지 생성 상태
  const [portrait, setPortrait] = useState("");
  const [clinicName, setClinicName] = useState(() => localStorage.getItem("mediblog_clinic") || "이레한의원");
  const [doctorName, setDoctorName] = useState(() => localStorage.getItem("mediblog_doctor") || "박석민 원장");
  const [imageParagraphCount, setImageParagraphCount] = useState("6");
  const [imageParagraphs, setImageParagraphs] = useState([]);
  const [imageStatus, setImageStatus] = useState("idle"); // idle | generating | done | error
  const [imageError, setImageError] = useState("");
  const [imageProgress, setImageProgress] = useState("");
  const [zipping, setZipping] = useState(false);
  const portraitRef = useRef();

  // ── 대표 이미지 (AEO 썸네일)
  const [heroAspect, setHeroAspect] = useState("1:1");
  const [hero, setHero] = useState(null); // { imageUrl, subject, prompt, aspectRatio }
  const [heroStatus, setHeroStatus] = useState("idle");
  const [heroError, setHeroError] = useState("");

  // ── 자유 프롬프트 이미지
  const [customPrompt, setCustomPrompt] = useState("");
  const [customAspect, setCustomAspect] = useState("1:1");
  const [customStyle, setCustomStyle] = useState("photo");
  const [customImages, setCustomImages] = useState([]); // [{ id, imageUrl, userPrompt, aspectRatio, style, status, error }]
  const [customGenerating, setCustomGenerating] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("mediblog_portrait");
    if (saved) setPortrait(saved);
  }, []);

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

  // 마크다운 → 네이버 블로그 에디터 친화 HTML (붙여넣기 시 서식 보존)
  function markdownToNaverHtml(md) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = md.split("\n");
    const out = [];
    let inList = false;
    const flushList = () => { if (inList) { out.push("</ul>"); inList = false; } };

    for (let raw of lines) {
      const line = raw.replace(/\r$/, "");
      if (/^# /.test(line)) {
        flushList();
        out.push(`<h2 style="font-size:20px;font-weight:700;margin:24px 0 12px;color:#1a1a1a;">${esc(line.slice(2))}</h2>`);
      } else if (/^## /.test(line)) {
        flushList();
        out.push(`<h3 style="font-size:17px;font-weight:700;color:#1a3a5c;margin:20px 0 8px;border-bottom:2px solid #d4c9a8;padding-bottom:4px;">${esc(line.slice(3))}</h3>`);
      } else if (/^### /.test(line)) {
        flushList();
        out.push(`<h4 style="font-size:15px;font-weight:700;color:#8b6f3e;margin:14px 0 6px;">${esc(line.slice(4))}</h4>`);
      } else if (/^[-•]\s+/.test(line)) {
        if (!inList) { out.push(`<ul style="margin:6px 0 10px 0;padding-left:20px;">`); inList = true; }
        out.push(`<li style="margin:3px 0;line-height:1.8;">${esc(line.replace(/^[-•]\s+/, ""))}</li>`);
      } else if (/^Q\./.test(line)) {
        flushList();
        out.push(`<p style="font-weight:700;color:#1a3a5c;background:#1a3a5c0d;padding:8px 12px;border-left:3px solid #1a3a5c;margin:12px 0 4px;border-radius:4px;">${esc(line)}</p>`);
      } else if (/^A\./.test(line)) {
        flushList();
        out.push(`<p style="color:#444;margin:0 0 10px 14px;line-height:1.8;">${esc(line)}</p>`);
      } else if (line.trim() === "") {
        flushList();
        out.push("<br>");
      } else {
        flushList();
        out.push(`<p style="line-height:1.9;margin:6px 0;color:#333;">${esc(line)}</p>`);
      }
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
      try { localStorage.setItem("mediblog_portrait", dataUrl); } catch (err) {
        console.warn("포트레이트 localStorage 저장 실패:", err.message);
      }
    };
    r.readAsDataURL(f);
  }

  function clearPortrait() {
    if (!confirm("저장된 인물 사진을 삭제하시겠습니까?\n삭제 후에도 '📥 백업' 버튼으로 미리 받아둔 파일이 있다면 다시 업로드할 수 있습니다.")) return;
    setPortrait("");
    try { localStorage.removeItem("mediblog_portrait"); } catch (e) {}
    if (portraitRef.current) portraitRef.current.value = "";
  }

  function backupPortrait() {
    if (!portrait) return;
    // data URL 에서 mime type 추출 (data:image/png;base64,... 또는 image/jpeg 등)
    const mimeMatch = portrait.match(/^data:([^;]+);base64,/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const ext = mime.split("/")[1] || "png";
    const a = document.createElement("a");
    a.href = portrait;
    a.download = `original-portrait-backup.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function generateHeroOnly() {
    if (!result?.content) { setHeroError("먼저 블로그 글을 생성해주세요."); return; }
    if (!apiKey.trim() || provider !== "gemini") {
      setHeroError("이미지 생성은 Gemini API 키가 필요합니다.");
      return;
    }
    setHeroError(""); setHeroStatus("generating");
    try {
      const h = await generateHeroImage({
        apiKey: apiKey.trim(),
        blogText: result.content,
        title: result.meta?.title,
        keywords: (result.meta?.keywords || []).join(", "),
        aspectRatio: heroAspect,
      });
      setHero(h);
      setHeroStatus("done");
    } catch (err) {
      setHeroError(err.message);
      setHeroStatus("error");
    }
  }

  async function generateAllImages() {
    if (!result?.content) { setImageError("먼저 블로그 글을 생성해주세요."); return; }
    if (!apiKey.trim() || provider !== "gemini") {
      setImageError("이미지 생성은 Gemini API 키가 필요합니다. 상단에서 Gemini를 선택하고 키를 저장해주세요.");
      return;
    }
    setImageError(""); setImageStatus("generating"); setImageParagraphs([]);
    setHero(null); setHeroStatus("idle"); setHeroError("");
    try {
      localStorage.setItem("mediblog_clinic", clinicName);
      localStorage.setItem("mediblog_doctor", doctorName);
    } catch (e) {}

    try {
      // 0단계: 대표 이미지 생성 (AEO 썸네일)
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
        setHero(h);
        setHeroStatus("done");
      } catch (err) {
        console.warn("대표 이미지 생성 실패, 단락 이미지로 계속:", err.message);
        setHeroStatus("error");
        setHeroError(err.message);
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
            clinicName,
            doctorName,
          });
          working[i] = { ...working[i], imageUrl: imgUrl, status: "completed" };
          setImageParagraphs(prev => prev.map((p, idx) => idx === i ? { ...p, imageUrl: imgUrl, status: "completed" } : p));
        } catch (err) {
          console.error(`단락 ${i + 1} 이미지 생성 실패:`, err);
          working[i] = { ...working[i], status: "error", error: err.message };
          setImageParagraphs(prev => prev.map((p, idx) => idx === i ? { ...p, status: "error", error: err.message } : p));
          if (/not\s*found|billing|permission|unsupported/i.test(err.message || "")) {
            setImageError(`모델 접근 실패: ${err.message}. ${IMAGE_GEN_MODEL}은 결제가 활성화된 API 키에서만 작동합니다.`);
            setImageStatus("error");
            return;
          }
        }
      }
      setImageStatus("done");
      setImageProgress("");
    } catch (err) {
      setImageError(err.message);
      setImageStatus("error");
      setImageProgress("");
    }
  }

  async function retryImage(idx) {
    const p = imageParagraphs[idx];
    if (!p) return;
    setImageParagraphs(prev => prev.map((x, i) => i === idx ? { ...x, status: "generating", error: undefined } : x));
    try {
      const imgUrl = await generateParagraphImage({
        apiKey: apiKey.trim(),
        paragraph: p,
        portrait: portrait || undefined,
        clinicName,
        doctorName,
      });
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
      const safeTitle = (result?.meta?.title || "blog-images").replace(/[^\w가-힣]+/g, "-").slice(0, 40);
      await downloadImagesAsZip(imageParagraphs, safeTitle, hasHero ? hero : null, completedCustoms);
    } catch (err) {
      alert("ZIP 다운로드 실패: " + err.message);
    }
    setZipping(false);
  }

  function downloadHeroOnly() {
    if (!hero?.imageUrl) return;
    const safeTitle = (result?.meta?.title || "hero").replace(/[^\w가-힣]+/g, "-").slice(0, 40);
    const a = document.createElement("a");
    a.href = hero.imageUrl;
    a.download = `${safeTitle}_hero_${hero.aspectRatio.replace(":", "x")}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function generateCustomImage() {
    const p = customPrompt.trim();
    if (!p) { alert("이미지 프롬프트를 입력해주세요."); return; }
    if (!apiKey.trim() || provider !== "gemini") {
      alert("Gemini API 키가 필요합니다.");
      return;
    }
    const placeholderId = Date.now();
    setCustomImages(prev => [...prev, {
      id: placeholderId,
      userPrompt: p,
      aspectRatio: customAspect,
      style: customStyle,
      status: "generating",
      imageUrl: null,
    }]);
    setCustomGenerating(true);
    try {
      const img = await generateFromPrompt({
        apiKey: apiKey.trim(),
        prompt: p,
        aspectRatio: customAspect,
        style: customStyle,
      });
      setCustomImages(prev => prev.map(x => x.id === placeholderId
        ? { ...x, ...img, status: "completed" }
        : x));
    } catch (err) {
      setCustomImages(prev => prev.map(x => x.id === placeholderId
        ? { ...x, status: "error", error: err.message }
        : x));
      alert("커스텀 이미지 생성 실패: " + err.message);
    } finally {
      setCustomGenerating(false);
    }
  }

  function removeCustomImage(id) {
    setCustomImages(prev => prev.filter(x => x.id !== id));
  }

  function downloadCustomImage(img) {
    if (!img?.imageUrl) return;
    const safeTitle = (result?.meta?.title || "custom").replace(/[^\w가-힣]+/g, "-").slice(0, 40);
    const slug = (img.userPrompt || "image").replace(/[^\w가-힣]+/g, "-").slice(0, 30);
    const a = document.createElement("a");
    a.href = img.imageUrl;
    a.download = `${safeTitle}_custom_${slug}_${img.aspectRatio.replace(":", "x")}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function copyAsHtml() {
    if (!result?.content) return;
    const html = markdownToNaverHtml(result.content);
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([result.content], { type: "text/plain" }),
          }),
        ]);
      } else {
        // Fallback: 숨김 div에서 선택 후 execCommand
        const div = document.createElement("div");
        div.innerHTML = html;
        div.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
        document.body.appendChild(div);
        const range = document.createRange();
        range.selectNodeContents(div);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("copy");
        sel.removeAllRanges();
        document.body.removeChild(div);
      }
      setHtmlCopied(true);
      setTimeout(() => setHtmlCopied(false), 2500);
    } catch (e) {
      alert("HTML 복사 실패: " + e.message);
    }
  }

  const generate = async () => {
    if (!apiKey.trim()) { setError(`${PROVIDERS[provider].keyLabel}를 먼저 저장해주세요.`); return; }
    if (!topic.trim()) { setError("블로그 주제를 입력해주세요."); return; }
    if (!finalDisease.trim()) { setError("질환명을 입력해주세요."); return; }
    setError(""); setResult(null); setRawDebug(""); setLoading(true);

    const userPrompt = `질환명: ${finalDisease}
블로그 주제/핵심 증상: ${topic}
추가 타겟 키워드: ${keywords || "자동 선정"}

첨부된 논문을 꼼꼼히 읽고, 실제 데이터(연구 대상자 수, 통계 수치, OR/HR, P값, %)를 정확히 추출하여 반영해 주세요.
소주제(H2)를 **정확히 ${subtopicTarget}개** 구성하고, 공백 제외 한글 2,000~2,500자로 작성해 주세요.
4막 구조를 따르고, Q&A 3개 포함, 마무리는 "그 과정에 이레한의원이 동행하겠습니다."로 끝내주세요.
본문에 ** (굵게) 나 --- (구분선) 표시는 절대 사용하지 마세요.
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

      const subtopicCount = (content.match(/^#{2}\s+/gm) || []).length;

      // 본문의 시작/끝/중간 구간 분리해서 정확도 높은 체크
      const head = content.slice(0, 500);
      const tail = content.slice(-200);

      // 환자 사례: 연령+성별 패턴 또는 "이레한의원에서" + 도입부에 따옴표(내면 독백)
      const hasQuote = /["'「『"']/.test(head) || /['"].*[.?!]['"]/.test(head);
      const hasPatientFrame = /(이레한의원에서|\d+대\s*(남|여)|\d+세\s*(남|여)|환자|내원|받고 계신)/.test(head);

      // 논문 서지: 연도 + 저널명(영문/한글) 같은 문단 내 — 정식 인용 패턴
      const paperPattern = /20\d{2}[^\n]{0,60}(저널|Journal|journal|연구|논문)/;
      const statsStrict = /[\d.]+\s*%|[\d.]+\s*배|P\s*[=<]\s*0\.\d|OR\s*[=:]?\s*\d|HR\s*[=:]?\s*\d|95%\s*CI|n\s*=\s*\d/;

      // 유보적 어미: 최소 3회 이상 반복되어야 통과 (한두 번만 있으면 전체 톤 아님)
      const reservedMatches = content.match(/있겠습니다|필요가 있|수 있겠|보입니다|해 보겠습니다|정리할 수 있겠/g) || [];

      // 동행 마무리: 반드시 마지막 200자 내에 있어야 통과
      const companionInTail = /동행하겠습니다/.test(tail);

      // Q&A: 최소 3개의 Q. 패턴
      const qMatches = content.match(/^\s*Q\.\s*/gm) || [];

      // 한자 병기: 한자 문자가 본문에 존재하는지 (3자 이상)
      const hanjaCount = (content.match(/[\u4E00-\u9FFF]/g) || []).length;

      // 키워드 반복 (질환명이 20회 이상이면 스팸 경고)
      const diseaseMentions = finalDisease
        ? (content.match(new RegExp(finalDisease.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
        : 0;

      const checklist = {
        patientCase: hasPatientFrame && hasQuote,
        paperCited: paperPattern.test(content),
        statistics: statsStrict.test(content),
        reservedTone: reservedMatches.length >= 3,
        companionEnding: companionInTail,
        faqSection: qMatches.length >= 3,
        hanjaBilingual: hanjaCount >= 3,
        keywordRepeat: diseaseMentions < 20,
        subtopicCount,
        // 디버그용 카운트
        _reservedCount: reservedMatches.length,
        _qCount: qMatches.length,
        _hanjaCount: hanjaCount,
        _diseaseCount: diseaseMentions,
      };

      // 3차 보정: 브랜드 DNA 체크리스트에서 2개 이상 실패하면 자동 재요청
      const failed = [];
      if (!checklist.patientCase) failed.push("- 첫 단락에서 반드시 환자 내면 독백을 큰따옴표로 인용하세요. 예: 최근 [질환명]으로 이레한의원에서 치료받고 계신 50대 여성분이 \"…\"라고 말씀하셨습니다.");
      if (!checklist.paperCited) failed.push("- 논문 서지사항을 '2024년 Journal of Autoimmunity에서 발표된 연구' 형태로 **연도+저널명** 동시에 명시하세요.");
      if (!checklist.statistics) failed.push("- 통계 수치를 최소 2개 이상 포함하세요 (%, P값, OR, HR 중).");
      if (!checklist.reservedTone) failed.push("- '있겠습니다', '수 있겠', '필요가 있겠습니다' 같은 유보적 어미를 본문에 3회 이상 사용하세요.");
      if (!checklist.companionEnding) failed.push("- 본문 맨 마지막 문장은 반드시 '그 과정에 이레한의원이 동행하겠습니다.'로 끝내세요.");
      if (!checklist.faqSection) failed.push("- 블록2 마지막에 'Q. …' / 'A. …' 형식의 Q&A를 정확히 3개 포함하세요.");
      if (!checklist.hanjaBilingual) failed.push("- 음허(陰虛), 조증(燥症), 기체혈어(氣滯血瘀) 등 한의학 개념을 한자 병기로 최소 3개 이상 포함하세요.");
      if (!checklist.keywordRepeat) failed.push(`- 질환명 "${finalDisease}"가 본문에 ${checklist._diseaseCount}회 나타납니다. 20회 미만으로 줄이고 "이 질환", "해당 증후군" 등으로 대체하세요.`);

      if (failed.length >= 2) {
        setLoadingMsg(`3단계: 브랜드 DNA 보강 (${failed.length}개 항목 재적용)...`);
        const fixPrompt = `아래는 작성된 블로그 글입니다. 다음 항목이 누락 또는 부족하므로 반드시 보강해서 다시 출력해주세요.

${failed.join("\n")}

위 지시사항을 모두 반영하되, 글자 수(공백 제외 한글 2,000~2,500자)와 4막 구조, Q&A 3개, 금지 표현 규칙은 그대로 유지하세요.
반드시 동일한 <BLOG_META>...</BLOG_META> <BLOG_CONTENT>...</BLOG_CONTENT> 형식으로만 출력하세요.

${raw1}`;
        try {
          const raw3 = await call({ apiKey: apiKey.trim(), messages: [{ role: "user", content: [{ type: "text", text: fixPrompt }] }] });
          setRawDebug(raw3);
          const p3 = parseRaw(raw3);
          if (p3.content) {
            content = p3.content;
            if (p3.meta.title) meta = p3.meta;
            charCount = countKorean(content);
            meta.charCount = charCount;
            // 체크리스트 재계산
            const newSubtopicCount = (content.match(/^#{2}\s+/gm) || []).length;
            const newHead = content.slice(0, 500);
            const newTail = content.slice(-200);
            const newReserved = content.match(/있겠습니다|필요가 있|수 있겠|보입니다|해 보겠습니다|정리할 수 있겠/g) || [];
            const newQ = content.match(/^\s*Q\.\s*/gm) || [];
            const newHanja = (content.match(/[\u4E00-\u9FFF]/g) || []).length;
            const newDiseaseCount = finalDisease
              ? (content.match(new RegExp(finalDisease.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
              : 0;
            Object.assign(checklist, {
              patientCase: /["'「『"']/.test(newHead) && /(이레한의원에서|\d+대\s*(남|여)|\d+세\s*(남|여)|환자|받고 계신)/.test(newHead),
              paperCited: /20\d{2}[^\n]{0,60}(저널|Journal|journal|연구|논문)/.test(content),
              statistics: /[\d.]+\s*%|[\d.]+\s*배|P\s*[=<]\s*0\.\d|OR\s*[=:]?\s*\d|HR\s*[=:]?\s*\d|95%\s*CI|n\s*=\s*\d/.test(content),
              reservedTone: newReserved.length >= 3,
              companionEnding: /동행하겠습니다/.test(newTail),
              faqSection: newQ.length >= 3,
              hanjaBilingual: newHanja >= 3,
              keywordRepeat: newDiseaseCount < 20,
              subtopicCount: newSubtopicCount,
              _reservedCount: newReserved.length,
              _qCount: newQ.length,
              _hanjaCount: newHanja,
              _diseaseCount: newDiseaseCount,
            });
          }
        } catch (e) {
          console.warn("3차 보정 실패, 2차 결과 유지:", e.message);
        }
      }

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

        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={s.label}>📑 소주제 갯수</label>
            <select style={s.select} value={subtopicTarget} onChange={e => setSubtopicTarget(e.target.value)}>
              <option value="4">4개</option>
              <option value="5">5개</option>
              <option value="6">6개</option>
              <option value="7">7개</option>
            </select>
          </div>
          <div>
            <label style={s.label}>✏️ 추가 / 제외 지침 <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>(선택 — 이번 글에만 적용)</span></label>
            <textarea
              value={extraInstruction}
              onChange={e => setExtraInstruction(e.target.value)}
              placeholder={`예1) 침치료 관련 내용을 강조해주세요.\n예2) 특정 환자 성별/연령을 사용하지 마세요.\n예3) 블록3 임상 해석을 더 길게 써주세요.`}
              style={{ ...s.input, height: 68, resize: "vertical", fontSize: 13, lineHeight: 1.5, fontFamily: "inherit" }}
            />
          </div>
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
            <div style={{ display: "flex", gap: 6 }}>
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
              }} style={{ padding: "7px 14px", background: copied ? "#27ae60" : "#f0ebe0", color: copied ? "#fff" : "#555", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {copied ? "✅ 복사됨" : "📋 마크다운"}
              </button>
              <button onClick={copyAsHtml} title="네이버 블로그 에디터에 붙여넣으면 서식(제목·리스트·Q&A)이 그대로 유지됩니다"
                style={{ padding: "7px 14px", background: htmlCopied ? "#27ae60" : "#1a3a5c", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {htmlCopied ? "✅ HTML 복사됨" : "🎨 네이버용 HTML"}
              </button>
            </div>
          </div>
          {activeTab === "preview" && <div style={{ lineHeight: 1.8 }}>{renderMd(result.content)}</div>}
          {activeTab === "raw" && <textarea readOnly value={result.content} style={{ ...s.input, height: 540, resize: "vertical", fontFamily: "monospace", fontSize: 13, lineHeight: 1.7 }} />}
          {activeTab === "debug" && <textarea readOnly value={rawDebug} style={{ ...s.input, height: 540, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6, background: "#1a1a2e", color: "#a8d8a8" }} />}
        </div>
      )}

      {/* 🎨 이미지 생성 (Nano Banana Pro) — 블로그 생성 후 표시 */}
      {result && (() => {
        const customCompleted = customImages.filter(c => c.status === "completed").length;
        return (
        <div style={{ ...s.card, borderColor: "#bae6fd", background: "#f0f9ff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🎨</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0c4a6e" }}>이미지 자동 생성 (Nano Banana Pro)</div>
              <div style={{ fontSize: 11, color: "#075985", marginTop: 2 }}>
                블로그를 {imageParagraphCount}개 단락으로 나눠 각 단락에 맞는 한글 의료 이미지 생성 · 16:9 · ZIP 다운로드
              </div>
            </div>
          </div>

          <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#78350f", marginBottom: 12, lineHeight: 1.5 }}>
            ⚠️ <strong>{IMAGE_GEN_MODEL}</strong>은 <strong>결제가 활성화된 Gemini API 키</strong>에서만 작동합니다. 무료 티어 키로는 이미지 생성이 막혀 있습니다. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" style={{ color: "#1a3a5c" }}>결제 설정 안내</a>
          </div>

          {/* 인물 사진 업로드 */}
          <div style={{ marginBottom: 12 }}>
            <label style={s.label}>👤 인물 사진 (첫 단락의 "원장" 변신에 사용, 선택)</label>
            {!portrait ? (
              <div onClick={() => portraitRef.current?.click()}
                style={{ border: "2px dashed #94a3b8", borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer", background: "#fff" }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>📸</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>클릭하여 업로드</div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 3 }}>얼굴이 잘 나온 정면 사진 · 최대 5MB · localStorage 저장</div>
                <input ref={portraitRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePortraitUpload} />
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, padding: 10 }}>
                <img src={portrait} alt="portrait" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid #1a3a5c" }} />
                <div style={{ flex: 1, fontSize: 12, color: "#0c4a6e" }}>
                  <div style={{ fontWeight: 700 }}>✅ 인물 사진 저장됨 (브라우저 localStorage)</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>이 PC/브라우저에서 쓰는 모든 글의 첫 단락에 자동 재사용됩니다. 다른 기기 동기화는 안 되며, 만약을 위해 📥 백업 파일을 받아두시길 권합니다.</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button onClick={backupPortrait} title="현재 저장된 사진을 파일로 다운로드. 저장소가 지워져도 이 파일을 다시 업로드하면 복원됩니다." style={{ background: "#0369a1", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>📥 백업</button>
                  <button onClick={clearPortrait} title="저장된 사진 삭제" style={{ background: "none", border: "1px solid #fecaca", color: "#dc2626", cursor: "pointer", fontSize: 11, padding: "3px 10px", borderRadius: 4 }}>✕ 삭제</button>
                </div>
              </div>
            )}
          </div>

          {/* 원장/한의원 이름 & 단락 갯수 & hero 비율 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px 110px", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={s.label}>🏥 한의원</label>
              <input value={clinicName} onChange={e => setClinicName(e.target.value)} style={{ ...s.input, fontSize: 13 }} />
            </div>
            <div>
              <label style={s.label}>👨‍⚕️ 원장 표시</label>
              <input value={doctorName} onChange={e => setDoctorName(e.target.value)} style={{ ...s.input, fontSize: 13 }} />
            </div>
            <div>
              <label style={s.label}>📑 단락</label>
              <select value={imageParagraphCount} onChange={e => setImageParagraphCount(e.target.value)} style={s.select}>
                <option value="6">6개</option>
                <option value="7">7개</option>
                <option value="8">8개</option>
              </select>
            </div>
            <div>
              <label style={s.label}>🖼️ 대표 비율</label>
              <select value={heroAspect} onChange={e => setHeroAspect(e.target.value)} style={s.select}>
                <option value="1:1">1:1 (썸네일)</option>
                <option value="16:9">16:9 (배너)</option>
                <option value="4:3">4:3</option>
              </select>
            </div>
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

          {/* 🖼️ 대표 이미지 (AEO 썸네일) */}
          {(hero || heroStatus === "generating" || heroStatus === "error") && (
            <div style={{ marginTop: 16, background: "#fff", border: "1.5px solid #0369a1", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", background: "#0369a1", color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>🖼️ 대표 이미지 (AEO 썸네일 · Naver AI 최적화)</span>
                <span style={{ fontSize: 10, opacity: 0.8 }}>{hero?.aspectRatio || heroAspect}</span>
              </div>
              {hero?.subject && (
                <div style={{ padding: "6px 14px", background: "#e0f2fe", fontSize: 11, color: "#0c4a6e", borderBottom: "1px solid #bae6fd" }}>
                  <strong>AI 선택 주제:</strong> {hero.subject}
                </div>
              )}
              <div style={{ aspectRatio: (hero?.aspectRatio || heroAspect).replace(":", " / "), background: "#f1f5f9", position: "relative" }}>
                {hero?.imageUrl ? (
                  <img src={hero.imageUrl} alt={hero.subject || "대표 이미지"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 12 }}>
                    {heroStatus === "generating" ? "⟳ 대표 이미지 생성 중…" : heroStatus === "error" ? `❌ ${heroError?.slice(0, 100)}` : ""}
                  </div>
                )}
              </div>
              <div style={{ padding: "8px 14px", display: "flex", gap: 8, justifyContent: "flex-end", background: "#f8fafc" }}>
                {hero?.imageUrl && (
                  <button onClick={downloadHeroOnly} style={{ padding: "5px 12px", background: "#0369a1", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    📥 대표만 다운로드
                  </button>
                )}
                <button onClick={generateHeroOnly} disabled={heroStatus === "generating" || imageStatus === "generating"}
                  style={{ padding: "5px 12px", background: "#fff", color: "#0369a1", border: "1px solid #0369a1", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: heroStatus === "generating" ? "wait" : "pointer" }}>
                  {heroStatus === "generating" ? "생성 중…" : "🔄 대표만 다시 생성"}
                </button>
              </div>
            </div>
          )}

          {/* ⬇️ 전체 다운로드 바 — hero / 단락 / 커스텀 중 하나라도 있으면 노출 */}
          {(hero?.imageUrl || imageParagraphs.some(p => p.status === "completed") || customImages.some(c => c.status === "completed")) && (
            <div style={{ marginTop: 16, padding: "10px 14px", background: "#0f172a", color: "#fff", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                📦 준비된 이미지:&nbsp;
                {hero?.imageUrl && <span style={{ marginRight: 10 }}>대표 1장</span>}
                {imageParagraphs.some(p => p.status === "completed") && <span style={{ marginRight: 10 }}>단락 {imageParagraphs.filter(p => p.status === "completed").length}장</span>}
                {customImages.some(c => c.status === "completed") && <span style={{ marginRight: 10 }}>커스텀 {customImages.filter(c => c.status === "completed").length}장</span>}
              </div>
              <button onClick={handleDownloadZip} disabled={zipping}
                style={{ padding: "8px 16px", background: zipping ? "#94a3b8" : "#22c55e", color: "#fff", border: "none", borderRadius: 8, cursor: zipping ? "wait" : "pointer", fontSize: 12, fontWeight: 700 }}>
                {zipping ? "압축 중…" : "⬇️ 전부 ZIP 다운로드"}
              </button>
            </div>
          )}

          {/* ✏️ 자유 프롬프트 이미지 섹션 */}
          <div style={{ marginTop: 18, background: "#fff", border: "1.5px solid #a855f7", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>✏️</span>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#6b21a8" }}>직접 프롬프트로 이미지 만들기</div>
              <span style={{ fontSize: 10, background: "#f3e8ff", color: "#6b21a8", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{customCompleted}장 생성됨</span>
            </div>
            <div style={{ fontSize: 11, color: "#6b21a8", marginBottom: 8, lineHeight: 1.5 }}>
              원하는 장면·주제를 한국어 또는 영어로 자유롭게 입력하세요. 여러 번 생성해 누적할 수 있고, 맨 위 "⬇️ 전부 ZIP 다운로드"에 함께 담깁니다.
            </div>
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder={"예1) 쇼그렌증후군 환자의 침샘이 부어있는 모습을 측면에서 포착한 실사 사진\n예2) 한의사가 환자의 손목에 침을 놓는 장면, 클로즈업\n예3) 구강 건조증을 표현하는 입 내부 클로즈업, 혀 질감이 선명하게 보이는 사진"}
              style={{ width: "100%", minHeight: 70, padding: 10, border: "1px solid #d8b4fe", borderRadius: 8, fontSize: 12, fontFamily: "inherit", lineHeight: 1.5, background: "#faf5ff", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.5fr", gap: 8, marginTop: 10 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#6b21a8", display: "block", marginBottom: 4 }}>스타일</label>
                <select value={customStyle} onChange={e => setCustomStyle(e.target.value)} style={{ ...s.select, fontSize: 12 }}>
                  <option value="photo">📷 실사 사진</option>
                  <option value="illustration">🎨 일러스트</option>
                  <option value="infographic">📊 인포그래픽</option>
                  <option value="auto">자동</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#6b21a8", display: "block", marginBottom: 4 }}>비율</label>
                <select value={customAspect} onChange={e => setCustomAspect(e.target.value)} style={{ ...s.select, fontSize: 12 }}>
                  <option value="1:1">1:1 정사각</option>
                  <option value="16:9">16:9 가로</option>
                  <option value="9:16">9:16 세로</option>
                  <option value="4:3">4:3</option>
                  <option value="3:4">3:4</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button onClick={generateCustomImage} disabled={customGenerating || !customPrompt.trim()}
                  style={{ width: "100%", padding: "9px 10px", background: customGenerating ? "#c4b5fd" : "#7c3aed", color: "#fff", border: "none", borderRadius: 8, cursor: customGenerating ? "wait" : "pointer", fontSize: 12, fontWeight: 700 }}>
                  {customGenerating ? "생성 중…" : "✨ 이미지 생성"}
                </button>
              </div>
            </div>

            {customImages.length > 0 && (
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {customImages.map((img) => (
                  <div key={img.id} style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ aspectRatio: img.aspectRatio.replace(":", " / "), background: "#f1f5f9", position: "relative" }}>
                      {img.imageUrl ? (
                        <img src={img.imageUrl} alt={img.userPrompt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#7c3aed", fontSize: 12 }}>
                          {img.status === "generating" ? "⟳ 생성 중…" : `❌ ${img.error?.slice(0, 60) || "실패"}`}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "6px 10px", fontSize: 11, color: "#6b21a8", lineHeight: 1.5, borderTop: "1px solid #e9d5ff" }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 3 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#e9d5ff", color: "#6b21a8" }}>{img.style.toUpperCase()}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#e9d5ff", color: "#6b21a8" }}>{img.aspectRatio}</span>
                      </div>
                      <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{img.userPrompt}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                        {img.imageUrl && (
                          <button onClick={() => downloadCustomImage(img)} style={{ flex: 1, padding: "4px 8px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                            📥 다운
                          </button>
                        )}
                        <button onClick={() => removeCustomImage(img.id)} style={{ padding: "4px 8px", background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 생성된 단락 이미지 리스트 */}
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
                      <span style={{ flex: 1, color: "#475569", fontSize: 12, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.text}</span>
                      {p.status === "completed" && <span style={{ color: "#16a34a" }}>✓</span>}
                      {p.status === "generating" && <span style={{ color: "#0369a1" }}>⟳</span>}
                      {p.status === "error" && <button onClick={() => retryImage(i)} title={p.error || ""} style={{ background: "none", border: "1px solid #dc2626", color: "#dc2626", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer" }}>재시도</button>}
                    </div>
                    <div style={{ aspectRatio: "16 / 9", background: "#f1f5f9", position: "relative" }}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={`단락 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, color: "#94a3b8", fontSize: 12 }}>
                          {p.status === "generating" ? "⟳ 생성 중…" : p.status === "error" ? `❌ 실패 · ${p.error?.slice(0, 60) || ""}` : "⏳ 대기"}
                        </div>
                      )}
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
        인천 송도 국제 신도시 이레한의원 · Powered by {PROVIDERS[provider].short}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<BlogWriter />);
