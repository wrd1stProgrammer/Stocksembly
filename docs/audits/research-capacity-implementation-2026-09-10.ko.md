# 리서치 동시 실행 배분 구현·서버 검증

- 기준: 2026-09-10, `origin/main` / `3140a398ca4e42023789218509d56f72217ac84f`.
- 작업 브랜치: `codex/research-capacity-routing`.
- 작업 위치: `/Users/minsikchae/projects/Stocksembly-research-capacity`.
- 기존 `/Users/minsikchae/projects/Stocksembly`의 미커밋 작업은 수정하지 않았다.
- 커밋·푸시·PR·운영 배포는 하지 않았다.

## 구현

| 항목 | 동작 |
|---|---|
| 구독 경로 | 서버의 기존 ChatGPT Pro Codex 로그인으로 동시 리서치 4건 |
| API 경로 | 구독 4건이 사용 중이면 별도 API-key 인증으로 추가 6건 |
| 모델 | 기존 전체 리서치 Luna 정책 유지 |
| 초과 요청 | 총 10건 실행 중이면 SQLite 대기열에 저장, 리서치 룸에서 순번 모달 표시 |
| API 비활성 | 동시 4건만 실행하고 이후 요청은 대기 |
| 접수 한도 | 대기 중인 요청 최대 50건, 넘으면 미접수 안내 |
| 작업 배분 | 실행 중인 작업이 적은 리서치 우선, 오래 배정받지 못한 요청 우선 |
| 서버 작업 한도 | 전역 작업 슬롯 기본 12개, 리서치당 최대 3개, Q&A 동시 최대 2개 |
| 재시도 | 일반 재시도와 관리자 chair 재개도 대기열을 거쳐 실행 한도를 적용 |

실행 경로는 DB에 저장하며 활성 리서치 도중 변경하지 않는다. 종료된 리서치를
재시도하면 다시 입장할 때 경로를 배정한다. API 오류를 구독 경로로 우회하여
다섯 번째 구독 리서치를 실행하지 않는다. API와 구독은 같은 서버의 전역 작업
슬롯을 공유하므로 API 6건이 서버 자원을 전혀 사용하지 않는 구조는 아니다.

기존 배치 `Promise.all` 스케줄러를 교체해 느린 작업 하나가 남아 있어도 빈 슬롯을
계속 채운다. 기존 lease/heartbeat/fencing과 실제 호출 예산 제한은 유지했다.

API 인증 파일은 기존 Pro 인증 파일과 다른 경로여야 하며 worker 소유의 0600 파일이다.
API 키가 들어 있고 ChatGPT 토큰이 없는 파일만 허용한다. 실제 작업이 해당 경로로
배정되기 전에는 API 포트나 readiness probe를 실행하지 않는다.

설정 예시는 `infra/aws/app.env.example`, 운영 설명은 `infra/aws/README.md`에 있다.
현재 예시 설정은 API 비활성이며 이번 검증에서도 유료 API 호출은 하지 않았다.

## 화면과 자동 검사

- 네이티브 dialog에서 실제 순번, 대기 유지, 닫은 뒤 다시 열기, 취소, 실행 시작 시
  자동 닫힘을 실제 브라우저에서 확인했다. 실제 컴포넌트를 불러오는 로컬 Vite
  검증 화면을 사용했으며 브라우저 경고·오류 로그는 없었다.
- 대기열이 가득 찬 미접수 상태는 순번이나 취소 버튼 없이 확인 버튼만 표시한다.
- 기존 5초 polling이 다른 요청의 완료에 따른 순번 변화를 반영한다.
- 배분·연속 스케줄링·인증 격리·재시도 관련 68개 테스트 통과.
- API 라우트 및 클라이언트 projection 36개 테스트 통과.
- 실행 파일 보호 7개 테스트 통과, admission 경계 3개 테스트 통과.
- 앱 production build와 TypeScript 검사 통과. API live 호출 검사는 제외했다.

기존 실패는 숨기지 않았다. `limits.test.ts`의 3개 예산 테스트는 현재 기준 코드의
41회/아티팩트당 재작성 3회 정책과 달리 34회/재작성 1회를 기대한다. 이번에는 실행
배분에 관한 기대값만 변경했고 이 세 테스트와 예산 정책은 유지했다. Codex runner의
로컬 live PONG 테스트는 현재 Mac의 고정 실행 환경 검사에서 실패했다. 실제 Linux
서버 검증은 아래 별도로 수행했다. 과거 copied-DB를 요구하는 chair resume 테스트는
해당 로컬 fixture가 없어 기존 조건에 따라 건너뛰었다.

## 실제 서버 검증

운영 이미지와 같은 베이스 이미지에 새 worker bundle을 사용했다. 운영 DB, 사용자
크레딧, S3/SQS와 분리한 `/home/ec2-user/stocksembly-capacity-20260910/data`를 사용했다.
서버는 2 vCPU / 약 8GB RAM이며, 검증 컨테이너 메모리 한도는 6GiB이다.

AAPL, MSFT, NVDA, AMZN 네 건의 전체 committee 리서치를 18:24 KST에 시작했다.
네 건이 동시에 subscription 경로로 실행되고 리서치별 작업이 분배되는 것을 확인했다.
API는 시작부터 끝까지 비활성화했다.

초기 실행에서 `origin_untrusted` / `link_untrusted` 및 readiness 재시도가 발생했다.
실행 파일의 하드링크가 다른 작업에서 생성·정리될 때 inode ctime이 바뀌는 상황을
기존 보호 코드가 실패로 처리하는 동시성 문제를 테스트로 재현했다. 메타데이터만
바뀐 읽기는 최대 3회 처음부터 다시 해시 계산하도록 수정했다. 안정되지 않은 읽기,
파일 내용·권한·소유자 변경, 심볼릭 링크, 파일 교체는 계속 거부하며 최종 해시와
inode 검증을 유지한다. 기존 코드에서 재현 테스트 실패, 수정 후 통과를 확인했다.

18:39:26 KST에 수정본으로 같은 네 리서치를 재개했다. 기존에 소비한 호출 예산이나
실패 이력은 초기화하지 않았다. 서버에 올린 worker와 최종 로컬 worker의 SHA-256은 같다:

`4804b89fd4859fe536bdbfec81bae0f4e1c289f371079ccc57b9b0142ca87a2d`

수정 후 관측에서는 실행 파일 보호 오류가 재발하지 않았다. 다만 기존 실행에서
누적된 시도와 수치 검증 오류가 재시도 예산을 소모했다. 이에 따라 AAPL/NVDA는
`logical_artifact_replacement_exhausted`, MSFT는 `physical_launch_budget_exhausted`로
미완료가 되었다. 실제 호출 예산을 높이거나 실패를 성공으로 바꿔 검사하지 않았다.

최종 결과는 아래에 기록한다. 이 실행은 수정 전 이력을 포함한 재개 검증이므로
새 코드로 새 요청 네 건이 모두 완주한다는 증거로 사용할 수 없다.

| 종목 | 최종 상태 | 성공 처리된 작업 | 예약된 호출 횟수 |
|---|---|---:|---:|
| AAPL | incomplete | 11 | 28 |
| MSFT | incomplete | 17 | 41 |
| NVDA | incomplete | 12 | 28 |
| AMZN | complete-with-limitations | 29 | 41 |

**판정: 동시 4건의 실제 실행과 배분은 확인했으나, 전체 4건 완주 검증은 실패했다.**
AMZN만 제한사항을 포함한 보고서가 실제 publish되었다. AAPL·MSFT·NVDA는 미완료다.
인증/실행 파일 오류와 내용 검증 재시도가 섞인 초기 실행 이력이 원인에 포함되므로,
이 결과만으로 수정 후 깨끗한 실행의 성공률을 추정해서는 안 된다.

기록된 agent runner evidence 86건의 모델은 모두 `gpt-5.6-luna`였다. 수정 후 완료 시점까지
origin/link 오류나 isolation readiness 실패는 새로 기록되지 않았다. API 과금 경로는
실행하지 않았다. 관측한 서버 자원은 검증 중 대략 CPU 91~137%(100%=1코어), 메모리
210~381MiB 수준이었고, 마지막 유휴 관측에서는 약 184MiB였다. 이는 표본 관측값이며
전체 구간의 최고치나 10건 부하 성능 보장은 아니다. 운영 웹은 관측 요청에 HTTP 200을
반환했고 운영 web/worker 컨테이너는 원래 이미지, restartCount=0을 유지했다.

검증 완료 후 검증 컨테이너를 중지·삭제하고 복사한 임시 환경 파일도 삭제했다.
검증 DB와 산출물은 서버의 위 전용 data 디렉터리에 보존했다. 기존 운영 데이터 및
계정·결제 데이터는 변경하지 않았다. 추가 전체 리서치를 반복 실행하거나 API 호출을
해 성공률 검사를 확대하지 않았다.

## 남은 사항

1. 운영 반영 전, 수정된 실행 환경에서 네 개의 새 요청이 모두 보고서 생성까지 끝나는지
   확인해야 한다. 이번 결과를 4건 안정 운영 보증으로 사용하지 않는다.
2. 수치 근거 검증 실패와 한도에 도달한 재시도 처리의 안정화가 필요하다. 단순히 호출
   한도를 늘리거나 기존 한도를 초기화하면 비용과 실패율을 가릴 수 있다.
3. API 키 경로는 설정·격리·배분까지 구현했지만 요청대로 실제 호출·과금·처리량은
   검증하지 않았다. 키 파일 준비와 web/worker의 동일 설정이 있어야 추가 6건을 켤 수 있다.

근거: `docs/audits/research-capacity-2026-09-10.server-evidence.json`,
`.artifacts/capacity/live-observations.jsonl`, `focused-tests.log`,
`queue-integration-tests.log`, `origin-regression-before.log`,
`origin-regression-after.log`, `admission-tests.log`, `build.log`, `typecheck.log`,
`browser-qa.md`.
