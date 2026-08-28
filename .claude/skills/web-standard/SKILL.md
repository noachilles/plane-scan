---
name: web-standard
description: 반응형 디자인·Mermaid 라이브 뷰어·dev/prod 모드 전환·웹 보안 함정(인증 가드·docker·rate limit)을 한 번에 적용하는 웹 작업 표준 스킬.
tool: claude-code
tags: [web, responsive, mermaid, auth-guard, rate-limit, docker]
author: 박경태
---# 웹 프로젝트 작업 표준

> TRIGGER: package.json에 web 프레임워크(react/next/vue/svelte/astro/vite) · index.html · tailwind.config · next.config 발견 / 사용자가 "웹·UI·프론트엔드·랜딩" 언급 / `/web` 호출. SKIP: CLI·라이브러리·Python 백엔드·데이터 분석·자동화 스크립트.

이 스킬이 발동되면 아래 4개 영역의 원칙·체크리스트를 모두 적용:
1. **반응형 디자인** (모바일 퍼스트, 이미지 최적화 포함)
2. **시각적 설계** (Mermaid 다이어그램 + 라이브 뷰어를 앱에 통합)
3. **개발·프로덕션 모드 전환** (한 줄 명령으로 왔다갔다)
4. **보안·운영 함정** (인증 가드·docker 함정·rate limit) — 웹 일반 패턴

> 사내 직원이 사용할 웹이면 **사번 인증·인사 데이터·webhook 은 `/hr-rp` 스킬로 위임**. 본 스킬에서는 옛 CONVERSE/data-hub 패턴을 다루지 않음.

---

## 1. 반응형 웹 (모바일 퍼스트 기본)

모든 웹 프로젝트는 **모바일 퍼스트 + 반응형**을 기본 전제로 설계·구현:

- **뷰포트 기준**: 모바일(~640px) → 태블릿(641~1024px) → 데스크톱(1025px~) 3단계 이상 고려
- **레이아웃**: Flexbox·Grid 우선, 고정 `px` 대신 `rem`·`%`·`clamp()`·`min/max` 활용
- **메타 태그**: `<meta name="viewport" content="width=device-width, initial-scale=1">` 항상 포함
- **이미지·미디어**: `max-width: 100%`, `<picture>`·`srcset`·WebP/AVIF로 해상도별 최적화
- **터치 대응**: 버튼·링크 최소 44×44px, hover-only UX 금지 (터치 디바이스 대체 동작 제공)
- **CSS 프레임워크**: Tailwind CSS를 기본 추천 (반응형 prefix `sm: md: lg: xl:` 적극 활용)
- **브라우저 호환**: Chrome·Safari(iOS 포함)·Firefox·Edge 최신 2버전 지원, `caniuse.com` 기준 검증
- **접근성(a11y)**: 시맨틱 태그, `aria-*` 속성, 키보드 네비게이션, 색상 대비(WCAG AA 이상)
- **검증 필수**: 완성 후 DevTools 반응형 모드로 모바일/태블릿/데스크톱 모두 확인한 후 제출
- **성능**: Lighthouse 90+ 지향, Core Web Vitals(LCP·FID·CLS) 고려

### 이미지 압축 (필수)
원본 그대로 사용 금지. 용도별로 품질·해상도 차등 적용 (로딩 속도와 화질의 균형):

- **도구**: `sharp`(Node), `Pillow`(Python), `squoosh`, `imagemin`, `cwebp`, `avifenc` 등
- **일반 콘텐츠 (썸네일·카드·본문 이미지)**: WebP 품질 75~82 / JPEG 80, 표시 크기의 2배(최대 2x DPR 대응)
- **풀스크린·Hero·배경 이미지**: WebP/AVIF 품질 85~90, **최소 3840px(4K) 이상** 원본 보유, `srcset`으로 해상도별(1920/2560/3840/5120) 분기 제공 — 4K·5K 모니터 풀화면에서도 픽셀·밴딩 없도록
- **AVIF 우선**: 같은 품질에서 WebP보다 20~30% 작음, Safari 16+·Chrome·Firefox 지원. fallback으로 WebP·JPEG 순 제공 (`<picture>` 태그)
- **아이콘은 Bootstrap Icons 단독 사용** (https://icons.getbootstrap.com/) — Lucide·Heroicons·FontAwesome·Material Icons·Tabler 등 다른 아이콘 라이브러리 금지. 이모지로 UI 의미 표현(상태·동작·카테고리)도 금지
  - 설치: `npm install bootstrap-icons` 또는 CDN `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@latest/font/bootstrap-icons.css">`
  - 사용: `<i class="bi bi-check-circle"></i>` / React: `<i className="bi bi-check-circle" />`
  - 컬러·크기는 CSS로 (`font-size`, `color`) — 인라인 SVG variant도 OK
  - **로고·일러스트는 SVG 자체 파일** (Bootstrap Icons에 없음)
- `loading="lazy"` + `decoding="async"` 기본 적용 (단, LCP 대상 hero는 `loading="eager"` + `fetchpriority="high"`)
- **검증**: 4K 모니터·Retina 디스플레이에서 실제 풀스크린으로 열어 밴딩·블록 노이즈·경계 뭉개짐 확인

---

## 2. 시각적 설계 (Mermaid + D2 + 라이브 뷰어)

모든 웹 프로젝트는 **다이어그램으로 구조·흐름·데이터를 시각화**하고, **브라우저에서 즉시 렌더링**해 볼 수 있게 기본 구성:

### 도구 선택
- **Mermaid (기본)**: GitHub·VSCode·Notion 네이티브 렌더링, 텍스트 기반, 생태계 최대. 대부분의 다이어그램은 이걸로
- **D2 (보조)**: 복잡한 시스템 아키텍처에서 Mermaid 레이아웃이 깨질 때. 테마·레이아웃 엔진 선택 가능, 심미성 우수
- **Excalidraw (선택)**: 화이트보딩·와이어프레임용. source of truth로는 사용 금지 (텍스트 diff 불가)
- 단일 프로젝트에서는 **Mermaid 우선**, 필요할 때만 D2 추가

### 시작 시점 자유
다이어그램 우선(설계→코드) / 코드 우선(코드→다이어그램 역추출) / 병행 — 모두 허용. 어느 경로든 **짝은 반드시 맞춤**

### 다이어그램 종류 (필요한 것 선택, 최대한 풍부하게 활용)

**구조·아키텍처**
- `architecture-beta` — **클라우드·서비스 아키텍처** (v11 신규, AWS·GCP 스타일)
- `block-beta` — 블록 기반 구조도 (레이어드 아키텍처)
- `C4Context` / `classDiagram` — 시스템 맥락·모듈·의존성
- `flowchart` — 범용 흐름도

**동적 흐름·상호작용**
- `sequenceDiagram` — API 호출, 인증, 컴포넌트 간 통신
- `stateDiagram-v2` — 상태 머신 (주문·인증·세션 등)
- `journey` — **사용자 여정** (UX 관점 단계별 감정)
- `packet-beta` — 네트워크 패킷·프로토콜 구조

**데이터·관계**
- `erDiagram` — DB 스키마 (테이블·관계·필드 타입)
- `mindmap` — 브레인스토밍·개념 맵
- `sankey-beta` — 흐름 가중치 (데이터 파이프라인)
- `Venn` / `Ishikawa` — 집합 관계·원인분석 (v11.13 신규)

**일정·전략**
- `gantt` — 프로젝트 타임라인
- `timeline` — 연대기·릴리스 히스토리
- `gitGraph` — 브랜칭 전략
- `quadrantChart` — 우선순위 매트릭스 (2x2)
- `requirementDiagram` — 요구사항 추적

**차트·시각화**
- `pie`, `xychart-beta` — 간단한 데이터 시각화 (리포트용)

### 파일 위치
- **웹 앱**: `<project>/src/docs/diagrams/*.md` + 앱 내부에 `/_dev/diagrams` 라우트(개발 모드 전용)로 통합. HMR로 변경 즉시 반영
- **도메인별 분리**: `flow.md` · `database.md` · `api.md` · `architecture.md` · `state.md` · `journey.md` 등 의미 단위로 파일 분리

### 라이브 뷰어 구성
- **Next/Vite/React 앱**: `mermaid` + (선택)`@mermaid-js/mermaid-cli` npm 설치 → `DiagramViewer` 컴포넌트 + `/_dev/diagrams` 라우트. 다크·라이트 테마 자동, 검색·목차·개별 확대 기능 포함
- **정적 HTML**: Mermaid CDN(`@latest`) + fetch로 `.md` 자동 로드·파싱·렌더. D2 사용 시 `d2-wasm` 추가
- **풍부한 표현**: Mermaid 커스텀 테마(`%%{init: {'theme':'base', 'themeVariables': {...}}}%%`)로 브랜드 컬러 적용, `classDef`·아이콘 FontAwesome 활용
- **에디터 통합**: VSCode `Mermaid Preview` 확장 권장 (로컬 즉시 확인)

### 동기화 규칙 (Same-PR + 자동 체크)
현업 검증 결과 **"same commit(엄격)"은 작업 흐름을 끊어 오히려 스킵 유발**. 대신:
- **구조 변경(API·스키마·상태·흐름)은 같은 PR**에 다이어그램 업데이트 필수 — 리뷰어가 함께 본다
- **구현 디테일 변경**(버그 수정·리팩토링)은 다이어그램 업데이트 불필요
- **CI 자동 체크**(선택): 각 `.md` 상단 메타에 `관련 코드: src/...` 명시 → 해당 경로 변경 시 다이어그램도 변경됐는지 검사, 아니면 경고
- **각 파일 상단 메타**:
  ```markdown
  > 최종 수정: 2026-04-24 · 관련 코드: src/api/auth.ts, prisma/schema.prisma
  ```
- **폐기된 다이어그램은 즉시 삭제** — 오래된 정보가 없는 정보보다 위험
- 새 기능은 **다이어그램 먼저 합의 → 구현** (큰 기능일수록 효과 큼, 작은 수정은 스킵 가능)

### 기본 스캐폴드
새 프로젝트 시작 시 자동 생성:
- 디렉토리 구조 + 빈 템플릿 (`architecture.md`, `flow.md`, `database.md` 등)
- 뷰어 (앱 통합 또는 정적 HTML)
- README에 접근 방법 안내: `npm run dev` 후 `/_dev/diagrams` 방문
- `.gitignore`에 렌더 캐시 제외 (`.mermaid-cache/`)

### 검증
- 작업 완료 전 다이어그램이 실제 코드와 일치하는지 점검
- PR 설명에 관련 다이어그램 스크린샷 또는 링크 포함
- 큰 구조 변경은 다이어그램을 먼저 리뷰어에게 공유

---

## 3. 개발·프로덕션 모드 전환

실행 환경을 **목적에 따라 분리**하고 **한 줄 명령으로 즉시 전환** 가능하게 구성:

- **개발 중 (dev)**: HMR·소스맵·verbose 에러·핫 리로드 → 변경 즉시 반영, 생산성 우선
- **데모·발표·평상시 (production)**: 빌드 최적화·미니파이·캐싱 → 안정·빠름, 체감 성능 우선
- **전환은 한 줄** — 같은 프로젝트에서 모드만 바꿔 즉시 왔다갔다

### 한 줄 명령 구성 (이름·포트는 프로젝트마다 자유)
**중요한 건 "한 줄로 모드 전환"이라는 원칙**. 스크립트 이름과 포트는 프로젝트 성격·팀 관례·기존 컨벤션에 맞춰 그때그때 결정 — 다만 README에 반드시 명시해 누가 봐도 바로 실행 가능하게.

**Node (`package.json`) — 예시**
```json
"scripts": {
  "dev": "...",      // HMR 모드
  "build": "...",    // 프로덕션 빌드
  "start": "...",    // 빌드된 결과 실행 (관례에 따라 "prod", "serve" 등 선택)
  "preview": "..."   // 이미 빌드된 것 빠르게 보기 (선택)
}
```
→ `npm run dev` / `npm run <prod 스크립트>` — **정확한 이름은 프로젝트마다**

**Docker — 예시**
`docker-compose.dev.yml` / `docker-compose.prod.yml` 같이 파일 분리 + 전환 명령 README에 명시. 또는 `--profile`·`target` 스테이지로 하나의 compose에서 분기해도 됨.

### 환경 변수 분리
- `.env.development` / `.env.production` 분리 (git 포함 OK, 민감 정보 제외)
- `.env.local` — 개인 키·비밀번호 (git 제외 필수)
- 프레임워크별 자동 로드: Next(`NEXT_PUBLIC_*`), Vite(`VITE_*`), 일반(`NODE_ENV`)
- **공통 원칙**: API 엔드포인트·로그 레벨·기능 플래그는 환경별로 다르게

### 기본 스캐폴드
- 새 프로젝트 시작 시 dev·prod 두 모드 진입 스크립트·설정 자동 포함 (이름은 프로젝트 맥락에 맞게)
- **README 필수 기재** — 실행 방법 섹션에 두 모드 명령을 **실제 이름으로** 명기:
  ```
  ## 실행
  - 개발 중: <해당 프로젝트의 dev 명령>   (HMR·자동 반영)
  - 데모·운영: <해당 프로젝트의 prod 명령>  (최적화·안정)
  ```
- **포트**: 프로젝트마다 자유롭게 정하되, **dev와 prod를 다른 포트**로 분리해 동시 실행 가능하게 (기존 프로젝트·팀 관례 우선)
- **모드 가시성**: dev 환경이 실수로 운영에 노출되지 않도록 dev임이 식별 가능하게 (배지·콘솔 로그·타이틀 prefix 등 — 프로젝트에 맞는 방식 선택)

### 검증
- 새 프로젝트는 **dev·prod 둘 다 한 번씩 돌려보고** 모두 정상인지 확인 후 작업 완료
- 빌드 에러·환경변수 누락·프로덕션에서만 나오는 버그를 조기 발견

---

## 4. 보안·운영 함정 (보편)

사내 사번 인증·인사 데이터·webhook 은 본 스킬에서 다루지 않음 — **별도 `/hr-rp` 스킬 표준** 사용. 옛 CONVERSE 직접 호출, data-hub `/api/v1/users` 캐시, `password_hash IS NULL` dual-mode 패턴은 폐기되고 HR 단일 소스로 통합됨. 사내 RP 작업이면 `/hr-rp` 호출 또는 hr-rp 스킬 자동 발동에 맡길 것.

아래는 웹 일반의 **HR 무관한 보편 패턴**: 인증 가드(라우트 보호 빵꾸 방지)·docker 운영 함정·rate limit (NAT 환경 대응).

### J. 인증 가드 — 2중 안전망 (라우트 보호 빵꾸 방지)

**원칙: middleware/proxy = 1차 가드, layout = 2차 가드. 둘 중 하나만 있으면 빵꾸.**

#### 함정 1 — "루트(/)는 공개" 라고 middleware 예외 두기

대부분의 SaaS 에서 `/` 는 곧 대시보드. App Router 의 `app/(app)/page.tsx` 가 보통 root 라우트. middleware 의 공개 경로 리스트에 `pathname === "/"` 를 넣어두면 **대시보드가 비인증 노출**.

```ts
// ❌ 잘못 — 루트가 대시보드라면 절대 금지
if (pathname === "/" || pathname.startsWith("/login") || ...) {
  return NextResponse.next();
}

// ✅ 올바름 — 공개 랜딩 페이지가 정말 필요하면 별도 라우트 그룹(`(public)`)으로 분리
if (pathname.startsWith("/login") || pathname.startsWith("/api/auth/login") || ...) {
  return NextResponse.next();
}
```

공개 랜딩이 진짜 필요하면 `app/(public)/page.tsx` 로 분리하고, 대시보드는 `app/(app)/dashboard/page.tsx` 같은 명시 경로로 이동. **루트 = 대시보드 = 인증 필요** 가 기본.

#### 함정 2 — Layout 이 user null 일 때 redirect 안 함

middleware 가 1차 가드라도, 코드 리팩토링·예외 경로 추가·matcher 누락으로 우회될 수 있음. **인증 페이지 그룹의 layout 은 반드시 user null 체크 + redirect**:

```tsx
// ✅ app/(app)/layout.tsx — 또는 AppShell 컴포넌트
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function AuthedLayout({ children }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");           // ← 핵심: null 이면 무조건 차단
  if (user.mustChangePassword) redirect("/change-password");
  // ... 이후 코드는 user 가 non-null 임이 보장됨
  return <AppShell user={user}>{children}</AppShell>;
}
```

**자주 보이는 안티패턴** — `if (user) { ... }` 로 데이터 fetch 만 감싸고 redirect 안 함. user 가 null 이어도 페이지 자체는 렌더되어 **빈 대시보드·메뉴 셸이 노출**. 데이터만 비어있을 뿐 구조·로직은 다 보임.

```tsx
// ❌ 안티패턴 — 페이지는 렌더됨
const user = await getSessionUser();
let stats = null;
if (user) {
  stats = await db.stats.find();  // user 없으면 그냥 skip — 페이지는 계속 렌더
}
return <Dashboard stats={stats} />;

// ✅ early redirect
const user = await getSessionUser();
if (!user) redirect("/login");
const stats = await db.stats.find();
return <Dashboard stats={stats} />;
```

#### 함정 3 — middleware matcher 누락

Next 의 `config.matcher` 가 정적 자원 외 모두 매칭하는지 확인. 흔한 누락: API · 동적 라우트 · 미들웨어가 RSC 요청은 처리 못 함.

```ts
// 안전한 기본형 — 정적 자원만 제외
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

#### 배포 후 검증 — `curl` 로 비인증 응답 확인 (필수)

배포 직후 무조건 아래 4개 확인. 하나라도 200/HTML 이 떨어지면 빵꾸:

```bash
echo "=== 비인증 접근 ===" && \
curl -sk -o /dev/null -w "GET / → HTTP %{http_code} | %{redirect_url}\n"        https://<domain>/ && \
curl -sk -o /dev/null -w "GET /<인증페이지> → HTTP %{http_code} | %{redirect_url}\n" https://<domain>/<인증페이지> && \
curl -sk -o /dev/null -w "GET /api/<인증API> → HTTP %{http_code}\n"              https://<domain>/api/<인증API> && \
echo "=== 공개 ===" && \
curl -sk -o /dev/null -w "GET /login → HTTP %{http_code}\n"                     https://<domain>/login
```

**기대값**:
- 비인증 HTML 경로 → **307/302** + `Location: /login`
- 비인증 API → **401**
- `/login` → **200**

200 + HTML 본문이 나오면 즉시 패치. 어떤 변명도 무용.

#### 체크리스트 (인증 코드 손댈 때마다 본다)

- [ ] middleware/proxy 의 공개 경로 리스트에 `pathname === "/"` 가 **없다**
- [ ] 인증 페이지 그룹의 layout 에 `if (!user) redirect("/login")` 가 **함수 진입 직후** 있다
- [ ] middleware matcher 가 보호 대상 경로를 빠짐없이 포함
- [ ] API 라우트 핸들러도 `requireAuth()`/`requireAdmin()` 호출 (middleware 가 1차지만 핸들러도 2차 가드)
- [ ] 배포 후 `curl` 4종 검증 통과
- [ ] 신규 페이지 추가 시 같은 패턴 따르는지 확인 (`(app)/` 가 아닌 새 그룹 만들었다면 layout 의 가드 있는지 재확인)

**실제 사고 사례 (사내 RP)**: proxy 에 `pathname === "/"` 예외 + AppShell 의 `if (user)` 만 있고 `if (!user) redirect` 없음 → 비로그인으로 대시보드 + 데이터 노출. 두 곳 모두 동시에 빵꾸가 있어야 발생. 1중 안전망의 한계 입증.

---

### K. Docker·환경변수 운영 함정 (보편)

- **`docker-compose.yml` 의 `service.environment` 에 명시 매핑 필수**: `.env` 에만 변수 두면 컨테이너 안에 안 보임. 운영변수는 `override.yml` 의 `service.environment` 에 `KEY: ${KEY:-}` 형태로 명시해야 컨테이너 내부에서 읽힘.
- **docker compose `restart` 는 `env_file` 다시 안 읽음**: `.env` 변경 후 `up -d` 로 recreate 해야 새 값 적용. `restart` 는 옛 env 그대로.
- **사내 도구에 IP 기반 rate-limit 금지**: 사내 인원이 모두 같은 NAT 게이트웨이로 나가서 `req.ip` 가 단일 값으로 수렴. 한 사람이 빠르게 반복하면 같은 NAT 뒤 전체 사용자가 함께 차단됨. **사용자별 키**(`req.user?.sub` 같은 사번/uuid) 로 잡을 것. 정공법은 § L 참조.

---

### L. Rate Limit — brute force 방어 + 사내 NAT 환경 대응

인증·민감 엔드포인트에 분당 N회 제한을 걸어 brute force·이메일 폭탄·자동화 남용을 차단. 사내 NAT 환경(전 직원이 단일 출구 IP)을 고려한 키 설계가 핵심.

#### 핵심 원칙 — IP 가 아니라 식별자

- **로그인 후**: `서비스:사용자ID` 또는 `사용자ID` 단독을 키로 (사번·이메일·uuid 등 어떤 안정 식별자든)
- **로그인 전**(자격 검증 전엔 ID 모름): username 입력값 + IP 조합. 입력 ID 가 같으면 같은 키 — 한 사용자의 brute force 만 막힘, 옆 사용자 영향 X
- **토큰 검증류**(reset 등 사용자 미식별): IP 만 사용해도 OK — 어차피 옆 사용자도 token 안 가지고 있음

→ 결과: 100명이 같은 NAT 에서 동시 로그인해도 **각자 독립 카운터**

#### 사무실 IP 화이트리스트 (관대 모드)

사내 IP 에는 더 관대한 limit (정상 사용자 차단 가능성 ↓). CIDR 지원 권장 — `/24` 같은 서브넷 매칭으로 미래 IP 추가 대응.

```ts
// lib/rate-limit.ts — CIDR 매칭 (IPv4)
function ipv4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let v = 0;
  for (const s of p) {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    v = (v << 8) | n;
  }
  return v >>> 0;
}

type CidrRange = { network: number; mask: number };
const OFFICE_RULES: ({ ip?: number } | { cidr: CidrRange })[] = (
  process.env.OFFICE_IPS ?? ""
).split(",").map(s => s.trim()).filter(Boolean).map(entry => {
  if (entry.includes("/")) {
    const [ip, bits] = entry.split("/");
    const ipInt = ipv4ToInt(ip);
    const b = Number(bits);
    if (ipInt === null || !Number.isInteger(b) || b < 0 || b > 32) return null;
    const mask = b === 0 ? 0 : (~0 << (32 - b)) >>> 0;
    return { cidr: { network: ipInt & mask, mask } };
  }
  const ipInt = ipv4ToInt(entry);
  return ipInt === null ? null : { ip: ipInt };
}).filter((x): x is { ip?: number } | { cidr: CidrRange } => x !== null);

export function isOfficeIp(ip: string | null): boolean {
  if (!ip) return false;
  const i = ipv4ToInt(ip);
  if (i === null) return false;
  for (const r of OFFICE_RULES) {
    if ("ip" in r && r.ip === i) return true;
    if ("cidr" in r && (i & r.cidr.mask) === r.cidr.network) return true;
  }
  return false;
}
```

`.env`:
```
OFFICE_IPS=<사무실CIDR1>/24,<추가IP>/32,<추가서브넷>/29
```

#### In-memory bucket (단일 컨테이너 전제)

```ts
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// 5분 GC — 만료 버킷 정리, 메모리 누수 방지
let gcTimer: ReturnType<typeof setInterval> | null = null;
function ensureGc() {
  if (gcTimer) return;
  gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }, 5 * 60_000);
}

export function checkRate(key: string, max: number, windowMs: number):
  | { ok: true } | { ok: false; retryAfter: number } {
  ensureGc();
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (b.count >= max) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { ok: true };
}

/** 성공 시 호출 — good behavior wins (정상 사용자 차단 풀림) */
export function resetRate(key: string): void { buckets.delete(key); }
```

멀티 컨테이너로 가면 Redis 로 이전 (`SET key count EX window NX`) — 단 일반 사내 도구는 단일 컨테이너 충분.

#### 429 응답 표준

```ts
export function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      error_description: `요청이 너무 잦습니다. ${retryAfter}초 후 다시 시도해주세요.`,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
```

RFC 6585 표준 — 클라이언트가 `Retry-After` 헤더 보고 자동 재시도 가능.

#### 엔드포인트별 권장 limit (출발점, 운영하며 조정)

```ts
export const LIMITS = {
  // 로그인 검증 — 가장 자주 호출
  verify:         { external: 10, office: 30, windowMs: 60_000 },
  // PW 변경 — 빈번할 일 X
  changePassword: { external: 5,  office: 15, windowMs: 60_000 },
  // 이메일 발송류 — 메일 폭탄·과금 방어
  forgot:         { external: 3,  office: 5,  windowMs: 60_000 },
  // 토큰 검증 (사용자 미식별)
  reset:          { external: 5,  office: 15, windowMs: 60_000 },
};
```

라우트 진입부 사용:
```ts
const ip = clientIp(req);
const max = isOfficeIp(ip) ? LIMITS.verify.office : LIMITS.verify.external;
const key = `verify:${service.id}:${username}`;        // ← 서비스+사용자별 키
const r = checkRate(key, max, LIMITS.verify.windowMs);
if (!r.ok) return rateLimitResponse(r.retryAfter);

// ... 인증 시도 ...

if (success) resetRate(key);  // ← good behavior wins
```

#### clientIp() — 프록시 뒤 실제 IP

CF Tunnel + Traefik 환경:
```ts
export function clientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}
```

#### 체크리스트

- [ ] 키가 **IP 단독이 아닌** 사용자/RP 식별자 포함
- [ ] 사무실 IP 화이트리스트 적용 (CIDR 지원)
- [ ] 성공 시 `resetRate()` 호출 — 정상 사용자 차단 풀림
- [ ] 429 응답에 `Retry-After` 헤더 포함
- [ ] 엔드포인트별 limit 분리 (verify·forgot·reset 모두 다른 threshold)
- [ ] 5분 GC 로 메모리 누수 방지
- [ ] `cf-connecting-ip` 등 프록시 헤더 우선 사용

#### 함정·고려사항

- **컨테이너 재시작 시 카운터 리셋** — 단일 컨테이너 운영이면 OK. 멀티 컨테이너면 Redis 필수
- **로그인 단계의 username 신뢰 X** — 공격자가 매번 다른 username 으로 시도하면 키가 분산되어 limit 우회 가능. 이 경우 username+IP 또는 username 만으로 키 잡되, IP 단독은 피함 (NAT 공동 차단)
- **CAPTCHA / 2FA / WebAuthn 와 조합** — rate limit 만으론 약한 PW 못 막음. 사내 RP 의 PW 정책은 hr-rp 스킬(HR 가 9자+4종+haveibeenpwned 강제) 사용, 외부 SaaS 는 자체 정책 + MFA 와 함께 layered defense
- **OFFICE_IPS 화이트리스트 범위** — `/24` 가 회사 단독 블록인지 IT팀 확인. 모르면 안전하게 `/32` 단일 IP 로 시작 후 점진 확장
- **`Set` 기반 in-memory 카운트는 동시 트래픽 race** — 1초 단위 정확도가 필요한 시나리오엔 atomic 연산(Redis INCR) 권장. 일반 분당 limit 에선 무관

**실제 사고·교훈** (사내 RP 운영 경험):
- 사내 RP A: `/login` IP 단독 키 → 같은 NAT 사용자 공동 차단 사고 발생. § K "사내 도구에 IP 기반 rate-limit 금지" 참조
- 사내 RP B: 사용자 키 + CIDR + 성공 리셋 패턴 적용 후 30회 통과 → 31번째 정상 429. 사무실 다수 사용자 동시 사용 가능 확인

---

## 부록 — 스킬 인덱스 노트 (Obsidian companion)

이 스킬 디렉토리에는 아래의 짧은 인덱스 노트(`web-skill.md`)가 함께 있었다. Obsidian vault용 네비게이션 노트이므로 wikilink는 각자 환경에 맞게 조정해서 쓰면 된다.

```markdown
# Web Skill

웹 개발용 Claude Skill — SKILL.md 안에 정의된 자동 호출 트리거.

워크플로우(`/web:*` 수동 호출)와 다르게, 이건 컨텍스트 기반 자동 사용됨.

## 상위

- [[skills]]

## 자식 노트

- [[SKILL]]
```
