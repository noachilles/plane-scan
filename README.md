# PlaneScan ✈️

여행 일정(출발지·목적지·날짜·출발 시간대·목표가)을 먼저 등록해두면, **네이버 항공권을 주기적으로 크롤링해 최저가를 감시**하다가 조건에 맞는 티켓이 나타나는 순간 **알림 + 검색조건이 채워진 예매 딥링크**로 원클릭 예매를 유도하는 서비스입니다.

> 결제(카카오페이 등)는 딥링크로 이동한 네이버 항공권/항공사·여행사 페이지에서 **사용자가 직접** 진행합니다. 타사 사이트에서의 자동 결제는 약관·법적 리스크 때문에 구현 대상이 아닙니다.

## 실행

| 모드 | 명령 | 포트 | 데이터 소스 | 스캔 주기 |
|---|---|---|---|---|
| 개발 (HMR) | `npm run dev` | 3000 | `naver` (실크롤링) | 5분 |
| 데모·운영 | `npm run build` → `npm run start` | 3100 | `naver` (실크롤링) | 5분 |

> 두 모드 모두 실제 네이버 크롤링을 사용합니다. 모의 데이터로 개발하려면 `.env.development` 의 `FLIGHT_SOURCE=mock` 주석을 참고하세요 (mock 알림에는 "모의 데이터" 배지가 붙고 편 지정 링크가 비활성화됩니다).

```bash
npm install
npm run dev        # http://localhost:3000 — DEV·MOCK 뱃지 표시
# 또는
npm run build && npm run start   # http://localhost:3100
```

- 개발 모드는 화면 우상단에 `DEV · MOCK` 뱃지가 떠서 운영과 즉시 구분됩니다.
- 설계 다이어그램 라이브 뷰어(개발 전용): http://localhost:3000/dev/diagrams
- 환경 변수는 `.env.development` / `.env.production` 에서 관리 (`FLIGHT_SOURCE`, `SCAN_INTERVAL_MIN`, `SCAN_DELAY_MS`)

## 동작 방식

1. **일정 등록** — 상단 검색 폼에서 노선·날짜·출발 시간대를 입력. 출장 용도에 맞춰 **가는편·오는편 출발 시간대를 개별 설정**할 수 있고(아침/오전/오후/퇴근 후 프리셋, "출장 추천 세팅" = 가는편 아침·오는편 퇴근 후), **직항만** 토글로 경유 편을 제외할 수 있습니다. 자주 타는 노선은 ★로 저장해두면 칩 한 번으로 채워집니다
2. **목표가 정하기** — 목표가를 알면 직접 입력, 모르면 비워두세요. **현재 최저가를 먼저 찾아 "이보다 싼 가격을 원하시나요?"** (5/10/20% · 현재가 이하 · 직접 입력) 로 제안합니다
3. **자동 감시** — 등록 즉시 1회 검색하고, 이후 서버가 주기적으로(버튼 없이) 요금을 수집합니다. 화면은 SSE 로 실시간 갱신되며 헤더에 "자동 감시 중 · 마지막/다음 스캔"이 표시됩니다
4. **알림** — 가는편·오는편 시간대와 직항 조건, 목표가를 모두 만족하는 요금이 나오면(유효한 기존 알림보다 저렴할 때만) 알림 생성 → 인앱 피드 + **Web Push(탭을 닫아도 OS 알림)**. 알림에는 귀가 시각·직항 여부·소요시간·판매처 이름까지 표시됩니다. 미확정 요금(`isConfirmed: false`)은 아예 수집 대상에서 제외
5. **특가 소멸 관리** — 매 스캔마다 기존 알림의 특가가 아직 있는지 검사해, 사라졌으면 "특가 종료"(취소선)로 표시하고 그 편의 현재 가격을 보여줍니다. 알림 카드에는 "N분 전 확인된 가격" 신선도와 **"가격 다시 확인"**(즉시 재조회) 버튼이 있습니다. dev(mock) 알림에는 "모의 데이터" 배지가 붙어 실제 가격과 무관함을 표시합니다
6. **예매** — 알림 생성 시 그 편의 **판매처(OTA) 실예매 링크**를 함께 확보합니다(`selectedItineraries` 조회의 `reservationUrl`). "바로 예매하기"가 아고다·트립닷컴 등 **판매처 예매 페이지로 직행**하며(해당 편·날짜·가격 반영), 보조 버튼 "네이버"는 편이 선택된 네이버 페이지(`selectedFlight`)를 엽니다. 판매처 링크는 세션성 토큰이라 오래되면 "가격 다시 확인"으로 갱신하세요. 결제는 사용자가 직접
7. **일정 관리** — 카드에서 확인·편집·삭제·감시 on/off·목표가 다시 정하기·가격 히스토리

## 구조

```
src/
  lib/
    db.ts            # SQLite (better-sqlite3) + 스키마·마이그레이션
    scanner.ts       # 스캔 엔진 (주기 루프 · 등록 즉시 단건 스캔 · 매칭 · 알림 · 푸시)
    events.ts        # 서버 이벤트 버스 → /api/events SSE
    push.ts          # Web Push (VAPID 키는 data/vapid.json 에 자동 생성)
    deeplink.ts      # 네이버 항공권 URL (selectedFlight 로 특정 편 선택)
    sources/         # FlightSource 어댑터 (mock / naver) + 검색 캐시 — env FLIGHT_SOURCE 로 전환
  app/
    page.tsx         # 대시보드 (등록 폼 · 노선 칩 · 일정 목록 · 알림 피드 · 목표가 제안/편집 모달)
    api/             # watches / quote / routes / alerts / scan / status / events / push
    dev/diagrams/    # Mermaid 설계 다이어그램 뷰어 (개발 전용)
  components/        # WatchForm · QuoteSheet · RouteChips · ScanStatus · WatchCard · AlertFeed · DiagramViewer
  docs/diagrams/     # architecture.md · flow.md · database.md
public/sw.js         # 푸시 수신 서비스워커
data/                # 로컬 DB · VAPID 키 (git 제외)
```

## 서버 배포 (운영 구성 명세)

로컬 PC가 아니라 **상시 서버에서 운용**하는 것을 전제로 합니다. 감시 루프가 서버에서 24시간 돌고, 사용자는 어느 기기에서든 웹으로 접속해 알림(Web Push)을 받습니다.

```
[사용자 브라우저/폰] ── HTTPS ──▶ [리버스 프록시 (Caddy/Nginx, TLS)]
                                        │
                                  [Docker: plane-scan 컨테이너]
                                    Next.js standalone (node) :3100
                                    · 스캔 루프 (instrumentation)
                                    · (예정) Playwright 자동 예매 워커
                                        │
                                  [볼륨: /app/data] ← SQLite·VAPID 키 영속화
```

**구성 원칙**

- **단일 컨테이너** — 앱·스캔 루프가 한 프로세스이므로 컨테이너 하나로 충분. `next build` 후 `next start`(포트 3100)
- **데이터 영속화** — `data/`(SQLite `plane-scan.db`, `vapid.json`)를 반드시 볼륨 마운트. 컨테이너 재생성에도 감시 일정·푸시 구독 유지
- **HTTPS 필수** — Web Push(서비스워커)는 `localhost` 외에는 HTTPS에서만 동작. 도메인 + TLS 종단(리버스 프록시) 필요
- **환경변수** — 운영값은 compose 의 `environment:` 에 **명시 매핑**으로 주입 (`env_file` 만으로는 컨테이너에 안 들어가는 함정 주의). `.env` 변경 후에는 `restart` 가 아니라 `up -d` 로 재생성해야 반영됨
- **이미지** — better-sqlite3(네이티브 모듈)는 이미지 빌드 시 컴파일되도록 node 베이스에서 `npm ci` 수행. 자동 예매(Playwright) 도입 시 `mcr.microsoft.com/playwright` 계열 베이스로 전환해 chromium 포함
- **크롤링 예절 유지** — 서버 상시 운용이어도 스캔 주기 5분 미만 금지. 서버 IP(데이터센터 대역)는 차단 가능성이 상대적으로 높으므로 403/429 시 중단 정책이 더 중요함
- **접근 제어** — 현재 인증이 없으므로 공개 인터넷에 그대로 노출하지 말 것: 리버스 프록시에서 Basic Auth/IP 제한을 걸거나, 다중 사용자 필요 시 인증 기능(후속 과제)을 먼저 구현
- **백업** — `data/plane-scan.db` 파일 단위 백업이면 충분 (WAL 모드이므로 `sqlite3 .backup` 권장)

> Dockerfile·docker-compose.yml 실물 파일은 아직 리포에 없습니다(명세 단계). 배포 착수 시 이 명세대로 생성합니다.

## 크롤링 관련 유의사항 (중요)

- `naver` 소스는 **비공식 내부 API**(`flight-api.naver.com/flight/international/searchFlights`, SSE 스트림)를 사용합니다. 스키마가 예고 없이 바뀔 수 있으며, 그 경우 `src/lib/sources/naver.ts` 어댑터만 교체하면 됩니다.
- 네이버 서비스 약관상 자동 수집은 회색지대입니다. **개인 사용 범위에서 보수적인 주기(기본 5분, 일정 간 3초 지연)를 유지**하고, 스캔 주기를 공격적으로 줄이지 마세요.
- 403/429 등 차단 신호를 받으면 해당 스캔 사이클을 즉시 중단하고 다음 주기에 재시도합니다. **차단 우회(프록시 로테이션, CAPTCHA 해제 등)는 구현하지 않으며, 추가하지 않는 것을 원칙으로 합니다.**
- 상용 서비스로 확장하려면 크롤링 대신 정식 데이터 계약(GDS/NDC, Amadeus 등)과 여행업 등록·PG 가맹이 필요합니다.

## 특정 편 딥링크에 대해

네이버 검색 결과 URL 은 필터를 파라미터로 싣지 않지만, 프론트가 내부적으로 쓰는 `selectedFlight` 파라미터를 재현하면 특정 편이 선택된 상태로 열립니다 (`src/lib/deeplink.ts`).

```
…/international/ICN-KIX-20261015/KIX-ICN-20261019?adult=1&fareType=Y
  &selectedFlight=1:20261015ICNKIXOZ0118:A01:HK:OZ,2:20261019KIXICNOZ0115:A01:HK:OZ
  &selectType=concurrent
```

비공식 형식이라 네이버 개편 시 깨질 수 있으며, 그 경우 기본 검색 결과 링크로 자연 강등됩니다(노선·날짜는 유지).

## 국내선 지원

출발·도착이 모두 국내 공항(김포·제주·부산 등, `src/lib/airports.ts`의 `KR_DOMESTIC_AIRPORTS`)이면 자동으로 **국내선 API**(`/flight/domestic/searchFlights`)로 검색합니다.

- 국내선은 가는편·오는편이 **분리 검색**되며 요금도 편도 단위 → 왕복 감시는 "가는편 요금 + 오는편 최저가" 합산으로 다룹니다 (알림·카드의 가격은 왕복 합산액)
- 딥링크는 `/flights/domestic/…?adult=1&fareType=YC` — 국내선엔 특정 편 선택 파라미터·판매처 직링크(reservationUrl)가 없어 알림 버튼은 네이버 검색 결과로 열립니다

## 후속 과제

- 카카오톡 "나에게 보내기" 알림 연동
- 가격 추이 차트
- 재알림 정책 옵션 (가격이 다시 내려올 때마다 / 하루 요약)
- 다중 사용자·인증 (현재는 개인용 단일 사용자 전제)
