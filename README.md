# PlaneScan ✈️

여행 일정(출발지·목적지·날짜·출발 시간대·목표가)을 먼저 등록해두면, **네이버 항공권을 주기적으로 크롤링해 최저가를 감시**하다가 조건에 맞는 티켓이 나타나는 순간 **알림 + 검색조건이 채워진 예매 딥링크**로 원클릭 예매를 유도하는 서비스입니다.

> 결제(카카오페이 등)는 딥링크로 이동한 네이버 항공권/항공사·여행사 페이지에서 **사용자가 직접** 진행합니다. 타사 사이트에서의 자동 결제는 약관·법적 리스크 때문에 구현 대상이 아닙니다.

## 실행

| 모드 | 명령 | 포트 | 데이터 소스 | 스캔 주기 |
|---|---|---|---|---|
| 개발 (HMR) | `npm run dev` | 3000 | `mock` (시뮬레이션) | 1분 |
| 데모·운영 | `npm run build` → `npm run start` | 3100 | `naver` (크롤링) | 5분 |

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

1. **일정 등록** — 대시보드 상단 검색 폼에서 노선·날짜·출발 시간대·목표가를 등록
2. **감시** — 서버 부팅 시 시작되는 스캔 루프가 활성 일정마다 소스를 조회해 요금 스냅샷(`fares`)을 저장
3. **매칭** — 출발 시간대 안이면서 목표가 이하인 요금이 있으면, 기존 알림보다 저렴할 때만 알림(`alerts`) 생성
4. **알림** — 대시보드 인앱 피드 + 브라우저 Notification. "예매하러 가기" 버튼이 조건이 채워진 네이버 항공권 딥링크를 엶
5. **일정 관리** — 등록된 일정 카드에서 확인·편집·삭제·감시 on/off·가격 히스토리 조회

## 구조

```
src/
  lib/
    db.ts            # SQLite (better-sqlite3) + 스키마
    scanner.ts       # 스캔 엔진 (주기 루프·매칭·알림 생성)
    deeplink.ts      # 네이버 항공권 예매 URL 생성
    sources/         # FlightSource 어댑터 (mock / naver) — env FLIGHT_SOURCE 로 전환
  app/
    page.tsx         # 대시보드 (등록 폼 · 일정 목록 · 알림 피드 · 편집 모달)
    api/             # watches / alerts / scan REST
    dev/diagrams/    # Mermaid 설계 다이어그램 뷰어 (개발 전용)
  components/        # WatchForm · WatchCard · AlertFeed · DiagramViewer
  docs/diagrams/     # architecture.md · flow.md · database.md
data/plane-scan.db   # 로컬 DB (git 제외)
```

## 크롤링 관련 유의사항 (중요)

- `naver` 소스는 **비공식 내부 API**(`flight-api.naver.com/flight/international/searchFlights`, SSE 스트림)를 사용합니다. 스키마가 예고 없이 바뀔 수 있으며, 그 경우 `src/lib/sources/naver.ts` 어댑터만 교체하면 됩니다.
- 네이버 서비스 약관상 자동 수집은 회색지대입니다. **개인 사용 범위에서 보수적인 주기(기본 5분, 일정 간 3초 지연)를 유지**하고, 스캔 주기를 공격적으로 줄이지 마세요.
- 403/429 등 차단 신호를 받으면 해당 스캔 사이클을 즉시 중단하고 다음 주기에 재시도합니다. **차단 우회(프록시 로테이션, CAPTCHA 해제 등)는 구현하지 않으며, 추가하지 않는 것을 원칙으로 합니다.**
- 상용 서비스로 확장하려면 크롤링 대신 정식 데이터 계약(GDS/NDC, Amadeus 등)과 여행업 등록·PG 가맹이 필요합니다.

## 후속 과제

- 카카오톡 "나에게 보내기" 알림 연동
- 가격 추이 차트
- 국내선 지원 (별도 크롤러 어댑터)
- 다중 사용자·인증 (현재는 개인용 단일 사용자 전제)
