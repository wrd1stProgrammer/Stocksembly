# 리서치 파이프라인 개선 및 실생성 평가

2026-09-06 KST. 기준 커밋 `origin/main 1dc3944`, 작업 브랜치 `codex/research-quality-evaluation`.
작업 공간: `/Users/minsikchae/projects/Stocksembly-research-quality-evaluation`. 기존 Stocksembly 작업 공간의 수정 파일은 보존했다. omo와 하위 에이전트를 사용하지 않았다. 이 초기 평가를 마친 시점에는 커밋·푸시·운영 배포하지 않았다. 이후 추가 개선과 PR 제출 기록은 [추가 개선 결과](research-quality-upgrade-results-2026-09-06.md)에 있다.

## 수행 결과

질문 해석 → 수치 정규화 → 전문 조사 → 팀 합의 → 위원회 편집 → 최종 발행 → 화면 표시에서 반복되던 공통 오류를 수정했다. 종목별 예외나 완성 보고서 문장 교정은 추가하지 않았다.

실제 Codex 모델과 SEC·시장 데이터로 **5회 생성**했다. TSLA 2회, MU 1회는 전체 위원회, NVDA와 MSFT는 각각 재무팀과 기업팀이다. 모두 로컬에서 `complete-with-limitations` 상태로 발행됐다. 원문·주장·반론·Q&A·출처를 직접 읽고 NVDA와 TSLA의 실제 화면을 확인했다.

**판정: 수치와 근거 전달은 개선됐지만, 5개 결과를 모두 고품질 리서치로 합격시키지는 않는다.** 질문의 고유명사 해석, 반증의 논리 방향, 최신 공시 우선 사용은 추가 개선이 필요하다. 아래 점수는 자동 지표나 정확도 확률이 아니라 질문 적합성·수치/기간·근거 연결·반론·실용성·중복을 함께 본 주관적 편집 평가다.

## 실제 생성물 평가

| 생성물 | 평가 | 직접 읽고 확인한 내용 |
| --- | --- | --- |
| [TSLA · 위원회 1차](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/reports/TSLA-0db2e96d-d2f7-4963-b6e6-5c969175b872.md) | 4/10 | 장기 증액 질문의 결론이 1시간 차트에 끌림. 팀 판단은 분리됐지만 매출 한 줄이 운영 시나리오로 노출되고 일반 문구가 분석을 대체함. |
| [MU · 위원회](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/reports/MU-f812884e-afc8-4c69-8903-54ee2fea8022.md) | 5/10 | 260.49억 달러 단위는 보존됨. 그러나 최근 분기보다 FY2025 수치를 앞세우고, 최종 요약은 단기 RSI 중심. 팀 합의로 수정된 재무 주장이 최종 주장 목록에서 빠지는 원인을 발견함. |
| [NVDA · 재무팀](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/reports/NVDA-14205a2f-6192-4953-b6fe-443027241886.md) | 6/10 | 최신 분기 현금전환율 40.3%와 GAAP EPS 2.46을 확인. TTM과 분기 지표를 구분함. 반면 재무상태 질문을 신규 진입 판단으로 확장하고 무효화 조건의 논리 방향이 뒤집힌 문장이 남음. |
| [MSFT · 기업팀](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/reports/MSFT-59e34eff-bbb2-489c-aef1-5ac39884037b.md) | 6/10 | 장기 AI 경쟁력·재투자 효율이라는 질문을 유지하고 경영진 설명과 채택 지표 부재를 구분. 내부 평가 문구 반복을 발견했으며 실제 자료로 발행 단계를 다시 실행해 제거 확인. |
| [TSLA · 위원회 2차](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/reports/TSLA-96c7c19a-ab26-4ca6-a9ca-e811464787d9.md) | 6/10 | 핵심 결론이 매출 성장 26.13%, GAAP 영업마진 1.41%로 변경됨. 무효화 조건도 마진 회복에 연결. 반론의 방향과 사이버캡을 사이버 보안으로 오해한 리스크 분석은 여전히 결함. |

생성 기록: [발행 ID·시각·해시](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/published-ledger.json).

이 다섯 원문은 수정 과정의 실제 결과를 그대로 보존했다. 최종 추가 수정이 모든 원문에 소급 반영된 것은 아니다. 마지막 수정은 같은 실생성 자료를 사용한 아래 재실행과 회귀 검사로 확인했다. 재실행을 새로운 AI 리서치 생성 횟수로 세지 않았다.

## 공통 파이프라인 변경

1. **질문 의도와 핵심 주장 선택.** 기본 프로필에서 장기/단기와 추가 보유/보유 점검 의도를 질문으로 보완한다. 위원회 요약의 첫 주장을 단순 목록 순서로 고르던 로직을 투자 기간과 목적에 따라 정렬한다. 장기 증액은 재무·사업 근거를 우선하고, 주가 한 시간 추세가 결론을 차지하는 문제를 줄였다.
2. **회계 기간 정규화.** SEC의 6개월·9개월 누적 수치를 YTD로 인식하고 동일 회계연도·태그·단위의 누적 차액으로 독립 분기를 계산한다. 원래 분기 수치가 있으면 그것을 우선한다. EPS·가중평균 주식수처럼 단순 차감할 수 없는 지표는 제외한다. 계산 경로와 원천 값 참조를 유지한다.
3. **최신 수치와 단위.** 조사에 넘기는 등록 수치를 기간 종료일·공시 시각 기준으로 정렬한다. 달러/백만/십억/억/조와 퍼센트를 구별하고 반올림 오차만 허용한다. 검증할 수 없는 비율을 지운 뒤 무난한 문장으로 통과시키던 처리를 제거하고 기존 조사 수정 경로로 돌린다.
4. **기간이 같은 비율만 계산.** FQ와 TTM을 섞은 비율을 만들지 않는다. 설비투자 비율은 현금 유출의 크기로 표시한다. 화면의 주요 지표에 FQ·TTM 등 기간을 붙였다.
5. **팀과 주장에 속한 근거 보존.** 팀 요약의 복구 시 해당 팀의 합의·표결·주장만 사용한다. 화면에서 다른 절이나 반증 조건을 해당 주장의 증거·반론으로 돌려 쓰던 로직을 제거했다. 반론과 무효화 조건은 핵심 주장 ID와의 연결을 우선한다.
6. **실제 반대 관찰 전달.** 전문 메모가 기록한 `strongestContraryObservation`을 위원회 근거 목록에 전달한다. 단순히 부정적인 주장을 가장 강한 반론으로 선택하는 일을 줄이고, 원래 주장에 대한 반대 관찰을 우선한다.
7. **합의에서 수정된 주장까지 발행.** 원래 메모만 최종 주장으로 만들던 과정에 팀 합의의 수정 ID·문장·반증·출처를 함께 전달한다. 결론의 핵심 주장이 빠졌을 때 첫 번째 남은 주장 ID로 조용히 대체하던 동작은 발행 오류로 바꿨다.
8. **내용을 보존하는 편집.** ‘대기/조건부’가 반복됐다는 이유로 구체적 분석을 ‘검증된 근거가 균형을 이룹니다’로 치환하지 않는다. 개별 팀 본문에는 내부 채택 사유 대신 조사 결과와 실제 반대 관찰을 보여준다. 무효화 조건을 반론처럼 감싸던 템플릿도 제거했다.

## 수정 후 실자료 재실행

- [위원회의 주장·반론 선택](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/chair-selection-replay.json): 3개 위원회 입력을 재사용했다. TSLA 2차의 마진 악화 논거에는 매출 성장과 영업현금흐름이 순이익을 웃돈다는 실제 반대 관찰이 연결된다. MU에도 FY2024의 낮은 마진이라는 업황 의존 반론이 선택된다. MU가 최신 분기보다 과거 연도에 의존하는 문제는 이 재실행으로 해결됐다고 보지 않는다.
- [수정된 주장의 발행 연결](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/publication-replay-ledger.json): 기존 서명·해시가 있는 위원회 자료를 읽어 핵심 주장 ID가 실제 수정된 주장과 연결되는지 확인했다. 전체 원문을 다시 생성하거나 덮어쓴 작업은 아니다.
- [NVDA 발행 재실행](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/reports/NVDA-publication-replay.md), [MSFT 발행 재실행](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/reports/MSFT-publication-replay.md): 복제한 로컬 DB에서 실제 메모·팀 합의 자료로 발행 함수를 실행했다. 내부 평가 문구가 사라지고 반론과 무효화 조건이 분리됐다. 원래 생성물의 의미 오류는 고쳐 쓴 것으로 간주하지 않았다.

## 핵심 수치와 원문 대조

- NVIDIA FY27 Q2: GAAP 순이익 59,688백만 달러, 영업현금흐름 24,077백만 달러. 현금전환율은 **40.338%**다. 이전 결과의 86.3%는 전 분기 수치를 최신 분기로 쓴 문제였고 새 NVDA 결과는 40.3%를 사용했다. [NVIDIA SEC 실적 발표](https://www.sec.gov/Archives/edgar/data/1045810/000104581026000073/q2fy27pr.htm)
- 같은 자료의 GAAP EPS는 2.46달러, non-GAAP EPS는 2.22달러다. 새 보고서는 둘의 차이를 노출하지만 제공자 수치의 회계 기준을 확정하는 단계는 더 보강해야 한다.
- Tesla Q2: 매출 28,236백만 달러, 영업이익 398백만 달러로 마진 1.41%. 마지막 TSLA의 중심 근거로 사용됐다. [Tesla Q2 10-Q](https://www.sec.gov/Archives/edgar/data/1318605/000162828026049270/tsla-20260630.htm)
- Micron 최신 분기 매출·이익률과 현금 단위는 [Micron Q3 10-Q](https://www.sec.gov/Archives/edgar/data/723125/000072312526000015/mu-20260528.htm)로 대조했다. 새 보고서의 현금 260.49억 달러는 이전의 단위 탈락과 달리 금액 크기를 유지한다.
- Microsoft의 FY27 보고 부문 재편은 경영진 전망을 사실처럼 지어낸 문장이 아니라 9월 2일 공시에 있다. AI 투자 효율 개선을 입증하는 근거로는 별도 취급해야 한다. [Microsoft 8-K](https://www.sec.gov/Archives/edgar/data/789019/000119312526380280/d291965d8k.htm)

## 디자인 변경과 직접 확인

보고서의 좁은 실제 표시 폭에 맞춰 헤더와 위원회 판단 요약을 한 열로 배치했다. 긴 질문의 제목 크기를 줄이고 원시 ISO 날짜를 한국 시간과 시간대가 보이는 날짜로 표시한다. 주가 소수점이 줄 사이에서 갈라지는 배치도 조정했다.

NVDA 실제 화면에서 팀 확신도 ‘보통’, 지표의 TTM/FQ 표시, 설비투자 비율 +2.4%를 확인했다. TSLA 화면에서는 354.08이 끊기지 않고 표시되고, 판단 무효화 영역에 위원회의 마진 회복 조건이 표시되는 것을 확인했다. 서로 다른 팀의 판단과 원문 분량은 유지했다. 모바일 기기 전체 회귀 검사는 수행하지 않았다.

남은 화면 문제: 실제 본문에 실적일이 있어도 상단에 ‘일정 미확정’이 표시되는 경우가 있다. 날짜를 본문에서 추측해 채우기보다 수집된 이벤트를 구조화해 전달해야 한다. ‘균형’이라는 표결 라벨이 조건부 증액 보류라는 본문과 다르게 읽힐 수 있다. 근거 검증 점수도 투자 성과의 신뢰 확률처럼 해석되지 않도록 정의를 더 명확히 해야 한다.

## 다음 품질 개선의 우선순위

1. **조사 전에 제품·사건의 뜻 확정.** ‘사이버캡’을 사이버 보안으로 해석한 결과는 주제 이탈이다. 고유명사 정의와 질문의 검증 대상을 1차 출처로 확정한 뒤 각 팀에 동일한 범위를 제공하고, 확인되지 않은 해석은 보류해야 한다.
2. **의미 검증에서 반증의 방향과 비교 기간 검사.** NVDA의 ‘마진 하락 → 고마진이 일시적이었다는 판단 약화’는 논리 방향이 뒤집혔다. 분기 EPS를 NTM EPS와 직접 비교하는 조건도 남았다. 숫자 존재·출처 일치만으로 이런 문장을 합격시키면 안 된다.
3. **최신 공시의 사용 의무와 사업 자료 확보.** MU는 최신 분기 자료를 가져왔어도 FY2025 수치가 중심이 된다. 기업팀의 채택·가격·고객 유지·투자 수익 자료가 빈약하면 최신 IR 자료 확보나 명시적 보류가 필요하다.
4. **가격 내재 기대를 계산으로 연결.** 현재 배수의 나열에서 끝나지 않고 성장·마진·재투자·희석 가정이 가치에 미치는 민감도를 계산해야 한다. 근거 없는 시나리오 숫자나 확률을 채우지는 않는다.

## 검증과 실행 범위

최종 `pnpm build`가 워커 타입 검사·번들·Next 빌드·standalone 준비까지 통과했다. 관련 수치·기간·주장 선택·발행·표시 회귀 검사와 실제 생성/재실행을 사용했다. 마지막 발행 변경의 54개 회귀 검사가 통과했다. 전체 테스트 모음은 실행하지 않았다. `CommitteeReportSurface.test.tsx`의 2개 실패는 원래 기준 커밋을 별도 디렉터리에서 실행했을 때도 같은 위치와 이유로 재현됐다. 빈 시나리오/비교 자료에 2개 이상 항목을 기대하는 기존 테스트이며, 이를 맞추려고 가짜 항목을 추가하지 않았다.

실행은 Node 20.20.2, 격리된 로컬 데이터 디렉터리와 포트 3106을 사용했다. 운영 인증·결제·S3·SQS·동기화 환경은 전달하지 않았다. 현재 설치된 서명 검증된 Codex 0.153.1에 맞춰 macOS 실행 파일 pin과 허용 버전 목록을 갱신했으며 기존 격리 정책은 유지했다. 실행 바이너리가 다른 환경에서는 해당 배포 바이너리와 pin을 일치시켜야 한다.

검사 로그: [최종 빌드](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/final-build.log), [발행 회귀](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/primary-publication-tests.log), [주장 선택 회귀](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/selection-tests.log), [현재 화면 테스트](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/surface-current.log), [기준 커밋의 동일 실패](/Users/minsikchae/projects/Stocksembly-research-quality-evaluation/.artifacts/quality-evaluation/surface-baseline.log).

## 진행 계획

- 완료: 공통 데이터·질문·근거·발행 로직 수정.
- 완료: 격리된 로컬 환경에서 실제 모델로 5건 생성.
- 완료: 생성 원문과 핵심 출처, 실제 화면을 읽고 평가 및 수정.
- 완료: 마지막 발행 연결 수정의 실자료 확인, 최종 빌드 및 결과 기록.
