# 주요경혈 · 장부생리 암기

홈 화면에서 덱을 고르고, 상단의 가로 스크롤 탭으로 이동하는 정적 PWA입니다.

| 덱 | 형식 | 카드 수 | 데이터 |
| --- | --- | --- | --- |
| 주요경혈 | 기존 이미지 플래시카드 | 51 | `public/data/cards.json` |
| 장부생리 | OX 문제·정답·해설·출처 | 321 | `public/data/jangbu.json` |
| 김우진 의학용어 A · 최우선 | 한글 → 영어·설명·출처 | 156 | `public/data/kimwoojin-a.json` |
| 김우진 의학용어 B · 중요 | 한글 → 영어·설명·출처 | 217 | `public/data/kimwoojin-b.json` |
| 김우진 의학용어 C · 보충 | 한글 → 영어·설명·출처 | 96 | `public/data/kimwoojin-c.json` |

장부생리 덱은 제공된 `장부생리.apkg`의 모든 카드를 가져왔습니다. 총론 39장, 간 51장, 심 47장, 비 42장, 폐 45장, 신 60장, 종합 함정 37장이며, 원본의 문장·정답·해설·출처·태그·분류를 유지합니다.

## 학습

- 주요경혈은 카드를 누르거나 **정답 보기**로 뒤집습니다.
- 김우진 의학용어는 한글 용어를 보고 **정답 보기**를 누르면 영어·설명·출처를 확인합니다. 원본 469장의 필드와 태그를 보존하며, 세 덱의 학습 기록은 각각 저장합니다.
- 장부생리는 **O / X**를 선택하면 선택 결과와 정답·해설·출처를 확인할 수 있습니다.
- 정답을 확인한 뒤 **완벽·중간·실패**로 직접 분류합니다. OX 선택만으로 분류가 자동 저장되지는 않습니다.
- 덱별·학습 모드별로 위치와 정답 공개 상태를 저장합니다. 탭 전환이나 새로고침 후 해당 모드에서 이어갈 수 있습니다.
- **처음부터**는 해당 덱·모드의 순서를 새로 섞고 첫 카드부터 시작합니다. 기존 분류 기록과 다른 덱의 학습 위치는 유지합니다.
- 단축키: 이미지 정답 보기 `Space` / `Enter`, OX 선택 `O` / `X`, 정답 공개 후 실패 `1` / 중간 `2` / 완벽 `3`.

기존 `major-acupoints` IndexedDB와 주요경혈 카드 ID·세션 키를 유지하므로 같은 주소에서 업데이트하면 기존 학습 기록을 그대로 사용합니다. 장부생리 카드 ID와 세션 키에는 `jangbu:` 접두사를 사용해 덱 간 기록을 분리합니다.

프로덕션 앱은 첫 방문 시 모든 덱과 이미지들을 캐시한 후 오프라인에서도 동작합니다. 개발 서버에서는 서비스 워커를 등록하지 않습니다.

## 실행

Node.js 24 기준입니다.

```powershell
npm install
npm start
```

브라우저에서 Vite가 표시하는 로컬 주소를 열면 됩니다. 학습 결과는 IndexedDB에 저장됩니다.

프로덕션 빌드:

```powershell
npm run build
```

## 장부생리 데이터 다시 가져오기

Node.js 내장 SQLite와 `tar`를 사용합니다. 원본 APKG를 변경하지 않고, 필드와 O/X 정답을 검증한 뒤 JSON을 생성합니다.

```powershell
npm run import:jangbu -- "C:\project\한입1-2중간\장부생리.apkg"
```

덱 목록은 `public/data/decks.json`에서 관리합니다. 배포 파일이나 덱 데이터를 수정할 때는 `public/sw.js`의 캐시 버전도 올려야 합니다.

## 검증

김우진 단어 데이터는 `npm run import:kimwoojin -- "C:\Users\polar\Downloads\김우진_단어.apkg"`로 다시 가져올 수 있습니다.

```powershell
npx playwright install chromium
npm test
```

프로덕션 빌드 후 데스크톱·모바일 Chromium에서 홈·덱 이동, 기존 기록 유지, 덱별 이어하기·재시작, OX 정오답·해설, 작은 화면 배치, 오프라인 학습을 검사합니다. 기존 Chromium을 사용하려면 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 환경 변수에 실행 파일 경로를 지정할 수 있습니다.

## 호스팅

`main` 브랜치에 푸시하면 GitHub Actions가 Vite 앱을 빌드해 GitHub Pages에 배포합니다.

배포 주소: <https://ywha350.github.io/major-acupoints/>
