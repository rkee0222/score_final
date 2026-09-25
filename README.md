# ScoreView

PDF와 사진 악보를 **한 곡으로 묶어 저장하고 한 페이지씩 터치로 넘기는** 아이패드 중심 PWA입니다. 자동 재생이나 악보 인식 없이 연주 중 빠르고 안정적으로 페이지를 넘기는 데 집중합니다.

- 앱 저장소: `rkee0222/score_final` (공개 코드와 GitHub Pages)
- 악보 저장소: `rkee0222/score_final_data` (**비공개 사용자 데이터**)
- 예상 앱 주소: `https://rkee0222.github.io/score_final/`

## 주요 기능

- JPG, PNG, PDF 가져오기
- 여러 파일/PDF 페이지를 한 곡으로 저장
- 저장 전 썸네일 확인, 순서 이동·드래그, 90° 회전, 삭제, 추가
- 표지 썸네일·제목·페이지 수·마지막 페이지가 표시되는 보관함
- 좌우 화면 터치, 좌우 스와이프, 하단 버튼, 키보드로 페이지 넘김
- 전체 페이지 / 너비 맞춤 / 두 페이지 보기
- 100~300% 확대, 페이지 슬라이더, 중앙 터치로 조작부 숨김
- 세로·가로 방향 및 iPad safe area 대응
- 가능한 환경에서 화면 꺼짐 방지(Wake Lock)
- 곡별 마지막 페이지와 보기 모드 기억
- IndexedDB 오프라인 저장 및 서비스 워커 기반 PWA
- 비공개 GitHub 저장소를 이용한 아이폰·아이패드 간 동기화

## 아이패드 설치

GitHub Pages 배포 후:

1. 아이패드 **Safari**에서 `https://rkee0222.github.io/score_final/`을 엽니다.
2. 공유 버튼(네모 + 위 화살표)을 누릅니다.
3. **홈 화면에 추가** → **추가**를 선택합니다.
4. 홈 화면의 ScoreView 아이콘으로 앱을 한 번 온라인에서 완전히 엽니다.
5. 이후 앱 셸과 로컬 악보는 인터넷 없이 열 수 있습니다.

오프라인에서도 가져오기, 편집, 페이지 넘김, 로컬 저장이 가능합니다. GitHub 동기화만 인터넷 연결이 필요합니다.

## 악보 추가와 연주

1. 보관함에서 **새 악보 가져오기**를 누릅니다.
2. 사진 앱 또는 파일 앱에서 JPG/PNG/PDF를 선택합니다.
3. 곡 제목을 입력합니다.
4. 페이지를 드래그하거나 좌우 화살표로 순서를 정리합니다.
5. 잘못 돌아간 페이지는 `↻`로 회전하고, 필요 없는 페이지는 `×`로 삭제합니다.
6. **이 순서로 저장**을 누릅니다.
7. 보관함에서 곡을 열어 다음 방식으로 넘깁니다.
   - 화면 오른쪽 32% 터치: 다음 페이지
   - 화면 왼쪽 32% 터치: 이전 페이지
   - 왼쪽 스와이프: 다음 페이지
   - 오른쪽 스와이프: 이전 페이지
   - 중앙 터치: 상·하단 메뉴 표시/숨김
   - 키보드: `←`/`PageUp`, `→`/`PageDown`/`Space`, `Esc`

PDF와 이미지는 기기에서 최대 긴 변 2200px JPEG로 압축됩니다. 원본 파일은 GitHub로 그대로 올라가지 않고, 뷰어용 페이지 이미지가 저장됩니다.

## 여러 기기 동기화 설정

동기화는 로그인 화면을 반복해서 거치는 방식이 아닙니다. **각 기기에서 최초 한 번 토큰을 붙여 넣으면** 이후 앱 실행, 온라인 복귀, 앱 복귀, 보관함 복귀 시 자동 동기화됩니다. 필요하면 동기화 화면에서 **지금 동기화**를 누를 수 있습니다.

### 1. Fine-grained token 만들기

1. GitHub 로그인 후 `https://github.com/settings/personal-access-tokens/new`을 엽니다.
2. Token name에 `ScoreView sync`처럼 알아볼 이름을 입력합니다.
3. 만료 기간을 선택합니다. 만료되면 각 기기에 새 토큰을 한 번 다시 입력해야 합니다.
4. **Resource owner**: `rkee0222`
5. **Repository access**: `Only select repositories`
6. 저장소는 **`score_final_data` 하나만** 선택합니다.
7. **Repository permissions**에서 `Contents`를 **Read and write**로 설정합니다.
8. 토큰을 생성하고 즉시 복사합니다. 생성된 값은 GitHub에서 다시 전부 보여주지 않습니다.

앱 코드가 있는 공개 `score_final` 저장소에는 토큰 권한을 주지 마세요. 데이터 저장소 하나에만 최소 권한을 부여합니다.

### 2. 아이패드에서 연결

1. ScoreView → 상단 **동기화**를 엽니다.
2. 사용자명 `rkee0222`, 저장소 `score_final_data`가 입력되어 있는지 확인합니다.
3. 복사한 `github_pat_…` 토큰을 붙여 넣습니다.
4. **연결하고 첫 동기화**를 누릅니다.
5. `동기화 완료`가 표시될 때까지 앱을 닫지 않습니다.

### 3. 아이폰/다른 아이패드에서 연결

1. 같은 ScoreView 주소를 Safari 홈 화면에 설치합니다.
2. 동기화 화면에서 같은 토큰을 최초 한 번 입력합니다.
3. 첫 동기화가 끝나면 비공개 저장소의 곡들이 자동으로 내려옵니다.

토큰은 각 기기의 IndexedDB에만 저장됩니다. GitHub Pages, 공개 앱 저장소, 다른 외부 서비스에는 저장하지 않습니다. 다만 브라우저 저장소는 운영체제의 보안 영역 안에 있을 뿐 별도 암호화 금고는 아니므로 기기 암호와 Face ID/Touch ID를 사용하세요.

## 동기화 규칙

- 로컬 저장이 항상 먼저 완료되므로 오프라인에서도 작업할 수 있습니다.
- 앱 시작, 온라인 복귀, 앱이 다시 활성화될 때 자동 동기화합니다.
- iOS 제한상 앱이 완전히 종료된 동안 백그라운드에서 동기화하지 않습니다.
- 같은 곡이 양쪽에서 수정되면 ISO 수정 시각이 더 최신인 전체 곡이 우선합니다.
- 페이지 순서·회전·추가·삭제·제목과 마지막으로 본 페이지가 동기화됩니다.
- 보기만 하며 페이지가 바뀐 경우 메타데이터만 갱신하고 이미지 전체를 재업로드하지 않습니다.
- 곡 삭제는 tombstone으로 기록되어 다른 기기에도 전파됩니다.
- 동기화 실패 시 로컬 악보는 삭제되지 않습니다.
- 토큰 만료, Safari 사이트 데이터 삭제, 새 기기에서는 다시 연결해야 합니다.

데이터 저장소 구조:

```text
score_final_data (Private)
├── score-library.json
└── books/<book-id>/
    ├── book.json
    └── pages/0001-<page-id>.jpg ...
```

한 곡의 변경은 GitHub Git Data API로 하나의 tree/commit에 기록됩니다. `score_final_data`는 데이터 저장소이므로 직접 파일을 편집하지 않는 것을 권장합니다.

## 로컬 개발

Node.js 20 이상이 필요합니다.

```bash
npm install
npm run dev
```

프로덕션 확인:

```bash
npm run build
npm run preview
```

빌드 결과는 `dist/`에 생성되는 순수 정적 파일입니다. 별도 Python/Node 백엔드는 없습니다.

## GitHub Pages 배포

`.github/workflows/deploy.yml`이 `main` 브랜치 변경 시 자동으로 빌드하고 GitHub Pages에 배포합니다. 저장소의 **Settings → Pages → Build and deployment → Source**가 `GitHub Actions`인지 확인합니다.

## 기술 구조

```text
src/App.tsx          보관함, 편집기, 수동 뷰어, 화면 흐름
src/importer.ts      이미지 압축 및 pdf.js PDF 페이지 변환
src/db.ts            IndexedDB books/pages/settings/deletions 저장소
src/github-sync.ts   Private GitHub 저장소 양방향 병합·커밋
src/sync-ui.tsx      토큰 연결, 자동/수동 동기화 상태 UI
src/styles.css       iPad/휴대폰/가로·세로 반응형 디자인
public/sw.js         정적 앱 셸 오프라인 캐시
```

## 제한과 주의사항

- 업로드는 한 번에 파일 60개·합계 200MB, PDF 한 파일은 80페이지까지입니다.
- 긴 악보/고해상도 사진은 변환 중 아이패드 메모리 사용량이 증가합니다. 큰 PDF는 여러 곡으로 나누는 것이 안전합니다.
- Safari의 사이트 데이터나 홈 화면 앱 데이터를 삭제하면 아직 동기화되지 않은 로컬 악보가 사라질 수 있습니다.
- GitHub는 개인용 파일 동기화에 사용하며 실시간 공동 편집 데이터베이스가 아닙니다.
- 앱이 닫힌 동안 자동 동기화하지 않습니다.
- GitHub API 요청 한도와 저장소 용량 정책이 적용됩니다.
- 현재 별도의 zip 백업/복원 기능은 포함하지 않습니다. 동기화된 데이터는 Private 저장소에 남습니다.
- arbitrary-element Fullscreen API는 iPad에서 제한적이므로 홈 화면 PWA의 standalone 전체 화면을 기준으로 설계했습니다.
