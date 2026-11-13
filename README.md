# 함께하는 날들이 모이는 곳

수원 할머니와 울산 할머니의 방문, 가족 생일과 행사를 함께 관리하는 한국어 월별 달력입니다.

## 운영 사이트

**https://jutopia-family-calendar.bluishferry16.chatgpt.site**

Sites에 배포되어 있으며 Cloudflare D1 공유 저장소가 연결되어 있습니다. 추가 Cloudflare 계정 설정 없이 사용 가능합니다. 사이트는 로그인 없이 접속할 수 있는 공개 설정입니다. 일정 API는 가족 코드를 요구하며, 가족끼리 같은 초대 링크를 사용해야 같은 일정이 표시됩니다. 화면의 **가족과 공유 → 초대 링크 복사**로 보낸 링크를 사용하세요. 기본 사이트 주소만 각각 열면 기기마다 별도 달력이 생성됩니다.

운영 서버에서 HTML·CSS·JS·공휴일 응답과 일정 등록 → 별도 요청에서 조회 → 수정 → 삭제 및 가족별 격리를 확인했습니다. 검증 데이터는 삭제했습니다. 브라우저 화면 렌더링 검증은 이 환경의 브라우저 도구 미제공으로 수행하지 못했습니다.

일정을 저장하면 서버에 즉시 반영되고 다른 가족의 열린 페이지는 약 15초 내 갱신됩니다. GitHub 코드 변경은 Sites 소스 동기화·재배포가 필요합니다. 아래 Cloudflare 자동 배포는 별도 선택 사항이며, 설정 전에는 실행하지 않습니다.

## 기능

- 달력을 첫 화면에 표시하고 그 아래 수원·울산 할머니 방문 요약 배치
- 2020–2035년 월별 조회, 오늘 이동, 연·월 선택, 터치 좌우 스와이프로 월 이동
- 양력·음력(윤달 포함) 일정 등록, 음력 매년 반복, 파스텔 표시 색상 10종 선택
- 한국 공휴일, 음력 설·추석, 부처님오신날, 대체공휴일 및 알려진 선거일
- 할머니 방문·생일·가족 행사, 기간 일정, 아이콘·메모
- 날짜별 일정 아이콘 표시: 여러 아이콘은 작게 모아 표시하며 아이콘으로도 일정 편집 가능
- 2주마다 또는 매년 반복 등록. 반복 일정은 개별 레코드로 만들어지며 수정·삭제는 선택한 건에만 적용됩니다.
- 일정 클릭 또는 550ms 길게 누르기로 수정·삭제. 날짜를 눌러 등록
- 오늘부터 3개월까지 다가오는 일정과 다음 할머니 방문 표시
- 공유 링크로 같은 가족 달력 사용. 서버 D1에 저장하며 다른 기기에서 15초마다 갱신, 페이지 복귀 시 즉시 갱신
- 저장 시 revision 검사로 동시 수정 덮어쓰기 방지
- 전체 글씨 확대 및 상단 글자 크기 조절 (100·115·130·150%, 기기별 저장, 기본 크기 복원)
- 모바일 대응, 키보드 조작, 상태·오류 메시지

## 실행·검증

Node.js 24 권장 (22.13 이상). 기본 실행은 Node.js만 필요하며, 스키마 생성 도구를 사용하려면 먼저 `npm ci`로 개발 의존성을 설치합니다.

```sh
npm run build
npm test
npm run dev
```

`http://localhost:3000`에서 확인합니다. 로컬 데이터는 `work/calendar.sqlite`에 저장됩니다. `npm run dev`는 시작할 때 빌드합니다. 코드를 수정하면 재시작해야 합니다. 운영 환경 데이터는 별도의 Cloudflare D1에 저장됩니다.

`index.html`만 파일로 열거나 GitHub Pages만으로 호스팅하면 공유 API가 없어 일정 저장이 작동하지 않습니다. HTML·CSS·JS와 API를 함께 제공하는 Worker로 배포해야 합니다.

## 공유 방법

처음 접속하면 추측하기 어려운 가족 코드가 생성됩니다. 우측 상단 **가족과 공유 → 초대 링크 복사**로 가족에게 링크를 전달합니다. 같은 링크를 이용해야 같은 달력이 표시됩니다. 서로 따로 처음 접속하면 별도 달력이 만들어집니다. 다른 달력에서 참여하려면 공유 메뉴에서 받은 링크를 입력합니다.

코드는 URL의 `#family=...`와 기기의 localStorage에 보관됩니다. API는 헤더로 코드를 받고 SHA-256 해시만 DB에 저장합니다. 달력 코드나 가족 일정은 Git에 저장되지 않습니다. 링크를 가진 누구나 해당 가족 일정을 조회·수정·삭제할 수 있으므로 링크는 가족끼리만 전달하세요. 회원별 권한·링크 만료·복구 기능은 없습니다. 브라우저 데이터를 삭제하기 전에 링크를 안전하게 보관해 주세요.

저장 성공 시 현재 화면에 반영하고 다른 열린 페이지는 최대 약 15초 뒤 갱신됩니다. 네트워크 지연·단절 시 상태를 표시하며 다시 연결되면 갱신합니다. 오프라인 저장은 지원하지 않습니다. 일정 데이터 수정에는 Git 커밋·사이트 재배포가 필요하지 않습니다.

## 선택 사항: 독립 Cloudflare 계정으로 자동 배포

현재 운영 사이트는 Sites입니다. `.github/workflows/deploy.yml`은 모든 `main` push에서 빌드·테스트를 실행합니다. 저장소 Variable `DEPLOY_TARGET=cloudflare`를 설정한 경우에만 별도 Cloudflare Worker 배포도 실행합니다. 이 경로를 선택하려면 최초 1회 아래 설정이 필요합니다. 이후 GitHub 웹에서 HTML을 편집하고 **Commit changes**로 main에 저장하거나 로컬에서 commit/push하면 같은 주소로 자동 배포됩니다. 보통 수분이 걸리며 Actions에서 완료 여부를 확인합니다. GitHub 편집기의 임시 저장이나 로컬 파일 저장만으로는 배포되지 않습니다.

### 최초 Cloudflare 설정

1. Cloudflare 계정에서 Workers를 활성화하고 D1 데이터베이스를 만듭니다. 이름은 `jutopia-calendar`로 지정합니다.
2. API Token을 생성합니다. 해당 계정에 대해 **Workers Scripts: Edit**, **D1: Edit** 권한을 부여합니다. 토큰은 채팅이나 Git 파일에 넣지 마세요.
3. GitHub 저장소 **Settings → Secrets and variables → Actions**에 등록합니다.

| 종류 | 이름 | 값 |
| --- | --- | --- |
| Variable | `DEPLOY_TARGET` | `cloudflare` (독립 배포 활성화) |
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare API 토큰 |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| Variable | `CLOUDFLARE_D1_DATABASE_ID` | 생성한 DB의 UUID |
| Variable (선택) | `CLOUDFLARE_WORKER_NAME` | 기본 `jutopia-calendar` |

4. GitHub **Actions → Validate and deploy family calendar → Run workflow**를 실행합니다. 첫 배포에서 스키마가 적용됩니다.
5. 배포 로그에 출력된 `https://jutopia-calendar.<계정>.workers.dev` 주소를 이용합니다. Cloudflare에 공개된 앱이지만 개별 일정 접근에는 가족 코드가 필요합니다.

`DEPLOY_TARGET`이 없으면 독립 배포 job은 건너뜁니다. `DEPLOY_TARGET=cloudflare`인데 필수 값이 없으면 명확한 오류를 표시합니다. 테스트 job은 독립적으로 실행됩니다. 이 설정은 위 Sites 운영 사이트에 영향을 주지 않습니다. GitHub 조직 정책이나 production 환경 승인 규칙이 설정되어 있으면 승인까지 배포가 대기할 수 있습니다.

Sites 운영 설정은 `.openai/hosting.json`에 포함합니다. Sites 운영과 Cloudflare 독립 배포는 서로 별도 환경·별도 DB입니다. 한 운영 주소를 정해서 가족 모두 같은 주소와 초대 링크를 사용해야 합니다. 현재 Sites 운영 사이트는 공개 접속을 허용하며, 개별 일정은 가족 코드로 보호합니다.

## 공휴일 데이터

`data/holidays.json`은 python-holidays **0.108**의 한국 데이터를 2020–2035년까지 포함합니다. 기본 실행·배포에는 Python이나 외부 공휴일 API가 필요하지 않습니다. 데이터 갱신:

```sh
python -m pip install holidays==0.108
python scripts/update-holidays.py
npm run build
npm test
```

향후 임시공휴일·보궐선거일·법령 변경은 미리 확정할 수 없습니다. 정부 발표에 따라 JSON을 보완하거나 python-holidays 버전을 갱신한 뒤 커밋·배포해야 합니다. 근로자의 날 등 표시 대상은 해당 라이브러리의 한국 공휴일 기준을 따릅니다.

## 구조

- `web/`: HTML, 반응형 스타일, 화면·동기화 로직
- `src/calendar.js`: 날짜, 반복, 3개월 필터
- `src/worker.js`: 공유 API와 정적 파일 응답
- `data/holidays.json`: 오프라인 공휴일 데이터
- `db/schema.ts`, `drizzle/`: Sites용 스키마 및 자동 적용 마이그레이션 (`npm run db:generate`)
- `migrations/`: 독립 Cloudflare 및 로컬 SQLite용 스키마
- `scripts/build.mjs`: 정적 파일을 포함하는 단일 Worker 빌드
- `scripts/dev.mjs`: SQLite 기반 로컬 서버
- `tests/`: 날짜 경계, 공휴일, 공유 저장·격리·수정 충돌 테스트

적용된 마이그레이션은 수정하지 않고 새 파일을 추가합니다. 가족 데이터 백업은 운영 Cloudflare D1의 export 기능을 사용하세요.

## 음력 일정 등록

일정 등록에서 **날짜 기준 → 음력**을 선택하고 음력 연도·월·일, 윤달 여부, 기간(일)을 입력합니다. 달력에 표시되는 양력 날짜를 저장 전에 확인할 수 있습니다. 매년 반복은 같은 음력 월·일을 따릅니다. 해당 윤달이 없는 해는 건너뛰고, 음력 30일이 없는 해는 해당 월의 29일에 등록합니다. 반복 종료일은 양력 기준이며, 각 반복 일정의 기간은 최초 설정한 일수로 유지합니다. 수정·삭제는 선택한 일정에만 적용됩니다.

한국 음력 월 경계 데이터는 `korean-lunar-calendar==0.3.1`로 생성했으며, 운영 중 외부 변환 API는 사용하지 않습니다. 데이터 재생성은 해당 Python 패키지 설치 후 `python scripts/update-lunar-data.py`로 실행합니다. 기존 DB에는 새 항목을 추가하는 마이그레이션만 적용하며 기존 기록을 삭제하거나 초기화하지 않습니다.
