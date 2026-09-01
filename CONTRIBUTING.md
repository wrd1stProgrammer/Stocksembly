# Stocksembly 협업 및 릴리즈 흐름

`main`은 현재 프로덕션에 배포된 코드를 유지합니다. 기능과 수정 사항은 버전별 `release/x.y.z` 브랜치에 모은 뒤, 릴리즈 PR을 `main`에 병합해 배포합니다.

## 작업 흐름

1. 작업 전에 GitHub Issue를 만들고 담당자와 완료 조건을 정합니다.
2. 이번 배포의 `release/x.y.z` 브랜치에서 작업 브랜치를 만듭니다.
3. 작업 브랜치에서 `release/x.y.z`를 대상으로 PR을 엽니다.
4. 팀원 리뷰와 CI 통과 후 작업 PR을 병합합니다.
5. 포함할 작업이 모두 모이면 `release/x.y.z`에서 `main`으로 릴리즈 PR을 엽니다.
6. 릴리즈 PR에 포함된 이슈를 `Closes #번호`로 나열합니다.
7. 릴리즈 PR을 병합해 프로덕션을 최신화하고, 완료된 릴리즈 브랜치를 삭제합니다.

## 브랜치 이름

| 용도 | 형식 | 예시 |
| --- | --- | --- |
| 릴리즈 취합 | `release/x.y.z` | `release/0.2.0` |
| 기능 | `feat/이슈번호-설명` | `feat/123-watchlist` |
| 버그 수정 | `fix/이슈번호-설명` | `fix/145-login-timeout` |
| 긴급 수정 | `hotfix/이슈번호-설명` | `hotfix/201-payment-error` |

버전은 `major.minor.patch` 형식을 사용합니다. 호환되지 않는 큰 변경은 `major`, 기능 추가는 `minor`, 버그 수정은 `patch`를 올립니다.

## Issue와 PR 연결

작업 PR은 기본 브랜치가 아닌 `release/x.y.z`를 대상으로 하므로 `Related to #123`처럼 관련 이슈를 표시합니다. Issue는 실제 프로덕션 배포 전까지 열어둡니다.

최종 릴리즈 PR은 `main`을 대상으로 하고, `Closes #123` 형식으로 포함된 Issue를 모두 적습니다. 릴리즈 PR이 `main`에 병합되면 해당 Issue가 자동으로 닫힙니다.

## 릴리즈 브랜치 만들기

릴리즈 담당자는 최신 `main`에서 브랜치를 만듭니다.

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c release/0.2.0
git push -u origin release/0.2.0
```

작업자는 해당 릴리즈 브랜치를 최신화한 뒤 작업 브랜치를 만듭니다.

```bash
git fetch origin
git switch release/0.2.0
git pull --ff-only origin release/0.2.0
git switch -c feat/123-watchlist
```

## 긴급 수정

현재 프로덕션 문제를 바로 수정해야 하면 최신 `main`에서 `hotfix/이슈번호-설명` 브랜치를 만들고 `main` 대상 PR을 엽니다. 배포 후 같은 수정이 빠지지 않도록 활성화된 `release/x.y.z` 브랜치에도 반영합니다.

## 기본 원칙

- `main`과 `release/*`에는 직접 push하지 않습니다.
- 하나의 Issue는 가능한 한 하나의 작업 PR로 해결합니다.
- PR은 팀원 한 명 이상의 리뷰를 받은 뒤 병합합니다.
- 카카오톡에서 결정한 작업도 Issue나 PR에 결과를 남깁니다.
