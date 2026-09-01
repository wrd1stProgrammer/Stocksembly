# UI 스모크 테스트 시나리오 (초안 · 팀 논의용)

> 상태: **초안** — 2026-09-01 최인규 작성. 9/12 서버 점검 전 "런칭 필수 통과" UI 시나리오 목록을 확정하기 위한 제안이다. 팀 회의에서 필수/선택 구분과 담당을 확정하면 "초안" 표기를 지운다.

## 1. 실행 환경

| 구분 | 내용 |
|---|---|
| fixture 모드 | `RESEARCH_MODE=fixture pnpm dev` → `/research/<symbol>`이 `app/research-fixture/[symbol]`로 rewrite. 지원 심볼 NVDA·AAPL·MSFT·TSLA·AMZN. 진행은 클라이언트 로컬 재생(외부 요청 0), `?view=report`로 완료 상태, `?lang=`으로 로케일. |
| fixture가 없는 화면 | `/research-room`(카탈로그·발행 리포트), `/briefing-room`, 인증, 크레딧/결제 — 로컬 DB 또는 스테이징 데이터 필요. |
| e2e 실행 | `pnpm test:e2e`(프로덕션 빌드 후 4174 기동). `playwright.config.ts`의 `fixture` 프로젝트는 `research-composition-fixture.spec.ts` 하나만 매칭하므로, 스모크 스펙을 fixture 프로젝트에 넣으려면 `testMatch` 확장이 필요하다. |
| CI | `.github/workflows/pipeline.yml`은 e2e·vitest 전체를 돌리지 않는다(typecheck·build·변경 파일 lint·research:quality만). 스모크는 런칭 전 **수동 실행**이 전제이며, CI 편입은 §5 열린 질문. |

## 2. 런칭 필수 시나리오 (제안)

자동화 열: **기존** = 이미 있는 스펙이 커버, **신규** = fixture 스펙으로 추가 예정, **수동** = 스테이징/프로덕션에서 사람이 확인.

| ID | 시나리오 | 경로 | 전제 | 단계 | 기대 결과 | 자동화 | 필수 |
|---|---|---|---|---|---|---|---|
| S1 | 홈 진입 → 티커 검색 → 리서치 시작 | `/` → `/research/NVDA` | fixture | 홈 로드 → 검색창에 `NVDA` 입력 → 제안 선택 → "팀 리서치 시작" | hero·검색 콘솔·오피스 소개·설명 3카드 렌더, 제안 목록 표시, 시작 후 `/research/NVDA?lang=…`로 이동하고 리서치 룸 헤더 표시 | 신규(`home.spec.ts` 재작성) | ✅ |
| S2 | 리서치 진행 화면 | `/research/NVDA?lang=ko` | fixture | 로드 → 오피스 캔버스 페인트 대기 → 진행률·단계 라벨·회의록 이벤트 증가 확인 | 캔버스 페인트, `data-moving-actor-count` 변화, 회의록 항목 증가, 콘솔 에러 0, 가로 스크롤 0 | 기존(`research-composition-fixture`, `office-visual`) + 신규(진행률) | ✅ |
| S3 | 완료 리포트 열람 | `/research/NVDA?lang=ko&view=report` | fixture | 로드 → 리포트 섹션·출처 표·질문 목록 확인 → 언어 전환 | 리포트 본문·출처 표(`ResearchFileSources`) 렌더, 10개 질문, en↔ko 전환 시 동일 구조 | 신규 | ✅ |
| S3b | 근거 링크·PDF | 실 리포트 | official + 토큰 | 출처 링크 클릭, PDF 다운로드 | 링크 응답 < 500, PDF `content-type` | 기존(`research-official-five-report`) | ✅ |
| S4 | 리서치룸 카탈로그 | `/research-room` | 발행 리포트 있는 DB | 로드 → 카드 목록 → 잠김/열림 카드 클릭 | 카드 렌더, 잠김 카드는 안내 모달, 열림 카드는 리포트로 이동, 페이지네이션 | 수동(스테이징) | ✅ |
| S5 | 로그인 / 가입 / 콜백 | `/login`, `/signup`, `/auth/callback` | 렌더만 fixture, 흐름은 스테이징 계정 | 폼 렌더 → 잘못된 입력 → 유효 입력 | 검증 메시지, 비활성 제출, 로그인 후 리다이렉트 | 렌더 신규 / 흐름 수동 | ✅ |
| S6 | 크레딧 부족 안내 | 검색 콘솔 / 잠긴 리포트 | 잔여 크레딧 < 필요 | 리서치 시작 시도 | `CreditShortageModal` 표시, "요금제 보기" 동작 | 단위(vitest) + 수동 | ✅ |
| S7 | 요금제 → Whop 결제 모달 | `/pricing` | Whop 샌드박스 | 플랜 선택 → 모달 | 플랜 그리드 렌더, 결제 모달 임베드 | 수동 | ✅ |
| S8 | 로케일 전환 유지 | `/?lang=ko` → 다른 경로 | fixture | 언어 선택 → 페이지 이동 → 새로고침 | 쿠키 `stocksembly_locale`·localStorage 저장, 이동 후 `html[lang]` 유지 | 신규 | ✅ |
| S9 | 브리핑룸 | `/briefing-room` | 백엔드 | 로드 → 최신 브리핑 카드 → 상세 | 카드·상세 렌더, 발행 시각 | 수동 | ☐ |
| S10 | 정적 페이지 | `/ko/glossary`, `/about`, `/terms` | 없음 | 로드 | 렌더, 푸터 링크, 404 없음 | 신규(1개 스펙) | ☐ |
| S11 | 반응형 4 뷰포트 | S1~S3 화면 | fixture | 390 / 820 / 1180 / 1440 | 가로 스크롤 0, 사이드바 시세 표시(태블릿), 회의록 패널 접기/펼치기 | 기존(`office-responsive` 일부) + 신규 | ✅ |

## 3. 기존 e2e 스펙 커버리지

| 스펙 | 모드 | 커버 | 상태 |
|---|---|---|---|
| `home.spec.ts` | fixture | S1 | **stale** — 삭제된 랜딩 섹션 문구·`#methodology` 앵커·구 버튼 라벨 단언. B-1 이후 재작성 필요 |
| `research-composition-fixture.spec.ts` | fixture 프로젝트 | S2 | 유효(외부 요청 0, 캔버스 페인트, 테스트 브리지) |
| `research-redesign-visual.spec.ts` | fixture | S2·S11 | 유효(스크린샷 증거, 하드코딩 가격 `$181.46`) |
| `office-visual.spec.ts` | fixture(+`OFFICE_CALIBRATION=1`) | S2 | 유효 |
| `office-responsive.spec.ts` | fixture | S11 | 5건 중 4건 **stale**(70/30 비율·768 단일 컬럼·모바일 camera-mode·KO/EN 버튼 클릭) — HEAD에서도 실패. 태블릿 사이드바 시세 케이스 1건은 유효 |
| `office-v7.spec.ts` | fixture | S2 | 유효(결정적 리플레이) |
| `research-room-published-responsive.spec.ts` | 백엔드 필요 | S4·S11 | fixture 없음 → 로컬에서 실행 불가 |
| `research-official-five-report.spec.ts` | official + 토큰 | S3b | 스테이징/프로덕션 전용 |
| `research-quality-live.spec.ts` | live 옵트인 | 품질 ledger | 스테이징 전용 |

## 4. 자동화 계획 (fixture)

- 신규 스펙: `tests/e2e/smoke-landing.spec.ts`(S1·S8·S10), `tests/e2e/smoke-research-flow.spec.ts`(S2 진행률·S3), `tests/e2e/smoke-auth-pages.spec.ts`(S5 렌더). `home.spec.ts`는 S1로 흡수.
- 클라이언트 `fetch` 표면(`/api/research-room?limit=5`, `/api/research/tickers`)은 스펙 안에서 `page.route()`로 응답을 고정한다 — 앱 코드·API 변경 없음.
- `CreditShortageModal`·`MembershipAccessModal`은 props 주도 컴포넌트라 vitest로 렌더 검증(S6).
- `playwright.config.ts`의 `fixture` 프로젝트 `testMatch`를 `/(research-composition-fixture|smoke-.*)\.spec\.ts/`로 확장한다.

## 5. 열린 질문 (팀)

1. S4·S6·S9 자동화를 위한 **로컬용 SQLite 스냅샷(발행 리포트 포함)** 또는 `/research-room` fixture 라우트 제공 여부.
2. fixture 스모크를 CI(PR)에 넣을지, 넣는다면 어느 프로젝트까지(빌드 시간 수 분).
3. 스테이징 환경·테스트 계정(`provision-test-account.yml`, 100 크레딧) 사용 절차와 S5/S7 담당.
4. 필수(✅)/선택(☐) 구분 확정과 9/12 점검 당일 실행 담당.
