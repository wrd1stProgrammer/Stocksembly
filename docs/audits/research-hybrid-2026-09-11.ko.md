# Codex Pro + API 작업별 하이브리드

2026-09-11. 브랜치 `codex/research-capacity-routing`. 원격 main은 `3140a398ca4e42023789218509d56f72217ac84f`이며 현재 작업 베이스와 일치한다. 변경은 로컬 미커밋 상태이고 PR/운영 배포는 수행하지 않았다.

## 동작

- API 활성화 시 리서치 최대 10개, 초과 요청은 기존 대기열/모달. 비활성화 시 4개.
- 작업별 Pro 우선: 전체 워커가 Pro 슬롯 10개를 공유하며, 실행 중인 수와 최근 배분 순서로 리서치 사이를 공정하게 배분한다. 한 리서치의 워커 작업 제한은 10개다.
- Pro 대기 30초 후 API 슬롯 사용 가능. API 슬롯은 전체 6개. 전체 워커 작업 상한 12개는 유지하므로 두 풀의 상한을 더한 만큼 항상 실행되는 것은 아니다.
- Pro 인증 오류 발생 시 해당 워커의 새 작업/대기 작업은 API로 즉시 전환한다. 정상 실행 중인 Pro 작업은 취소하지 않는다.
- 실행 전 readiness 인증 실패는 작업 실행 전에 API로 전환한다. 실제 시도 후 인증 실패는 즉시 transient로 반환하고, 다음 워커 시도가 새 디렉터리/예약 ordinal로 API를 사용한다. 동일 예약으로 중복 실행하지 않는다. 기존 총 호출 예산은 유지된다.
- 워커 시작 시 Pro 인증 만료도 API readiness로 진행한다. 로그인 파일 변경 시 Pro를 다시 사용할 수 있으며 재시작 시에도 인증을 재검사한다.
- API 인증 오류는 무한 재시도하지 않는다. 네트워크/429/바이너리 오류를 로그인 만료로 취급하지 않는다. stderr 인증 오류는 boolean만 전달하고 원문을 노출하지 않는다.
- 모든 모델은 기존 Luna 유지. 각 launch manifest/lifecycle에 실제 `executionBackend`를 기록한다. 기존 run backend는 admission 구분용이다.

## 설정

운영 적용 시 웹과 워커에 동일하게 `STOCKSEMBLY_CODEX_API_ENABLED=1`과 `STOCKSEMBLY_CODEX_API_AUTH_PATH=/home/ec2-user/.codex/api/auth.json`이 필요하다. 별도 API 인증 파일은 이전 작업에서 서버에 저장되어 있다. 실제 서버 활성화/재시작은 이번 작업에서 하지 않았다. 예제 설정은 키 없는 환경의 자동 과금을 막기 위해 enabled=0을 유지한다.

기본값: `STOCKSEMBLY_CODEX_PRO_CONCURRENCY=10`, `STOCKSEMBLY_CODEX_API_CONCURRENCY=6`, `STOCKSEMBLY_CODEX_API_SPILL_AFTER_MS=30000`. 풀과 인증 상태는 워커 프로세스 단위로 공유한다. 기존 단일 워커 lease 전제를 유지한다.

## 검증

- 관련 테스트 5개 파일, 26개 테스트 통과. 큐 시간/상한/공정성/취소, 실행 중 및 시작 시 인증 실패, API 실패 종료, 로그인 복구, 기존 리서치 admission을 포함한다.
- `pnpm research:worker:build` 통과: 워커 TypeScript 검사와 번들 생성. 로컬 Node 24로 실행되어 프로젝트 Node 20 범위 경고는 있었으나 명령은 성공했다.
- 별도 빌드한 드라이버를 실제 Node 프로세스로 실행했다. 실제 runner의 예약 검증/임시 인증 홈/manifest/결과 수집 경로를 통과하되 모델 프로세스 응답은 모의 값으로 대체했다. 4개 Pro 인증 실패 후 API 새 시도 4개가 성공했고 ordinal 2, API backend, 기존 Pro 인증 불변을 확인했다. 워커 시작 전환과 로그인 복구도 확인했다.
- 실제 OpenAI API 호출은 하지 않았다. 저장된 키의 유효성, Luna API 권한, 실제 API 지연/부하/비용은 검증하지 않았다.

워커 번들 SHA-256: `16970c0efd9071a741e4efd910a1c16c1337faf3391c87923921c0a2304f0829`.

수동 드라이버 결과:

```json
{
  "scenario": "four concurrent authentication failures then fresh API attempts",
  "proCalls": 4,
  "apiCalls": 4,
  "apiPeak": 1,
  "completed": 4,
  "startup": [
    "subscription",
    "api"
  ],
  "proAuthUnchanged": true,
  "loginRecovery": true,
  "liveApiCalled": false
}
```
