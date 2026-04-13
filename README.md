# 학원 업무 관리 시스템

HTML/CSS/JS 기반의 학원 내부 업무 관리 웹앱입니다.

---

## 📁 파일 구조

```
academy-app/
├── index.html              ← 메인 랜딩 페이지
├── settlement.html         ← 퇴원생 교재 정산 페이지
├── css/
│   └── style.css           ← 전체 스타일 (인쇄 포함)
├── js/
│   ├── config.js           ← 컬럼명 등 설정 (커스터마이징 가능)
│   └── settlement.js       ← 정산 기능 로직
└── apps-script/
    └── Code.gs             ← 구글 시트 연동 스크립트
```

---

## 🚀 사용 시작 전 설정

### 1단계: Google Apps Script 배포

구글 시트에 직접 접근하기 위해 Apps Script를 미들웨어로 배포합니다.

1. [Google Apps Script](https://script.google.com) 접속 → **새 프로젝트** 생성
2. `apps-script/Code.gs` 파일의 내용을 전체 복사 → 에디터에 붙여넣기
3. 상단 `SPREADSHEET_ID` 에 구글 시트 ID 입력
   - 시트 URL: `https://docs.google.com/spreadsheets/d/[여기가 ID]/edit`
4. `STUDENT_SHEET_NAME`, `TEXTBOOK_SHEET_NAME` 확인 (탭 이름과 다르면 수정)
5. **배포** 버튼 → **새 배포** → **웹 앱**
   - 실행 계정: **나(본인)**
   - 액세스: **모든 사용자** (또는 조직 내 사용자)
6. 배포 후 나오는 **웹 앱 URL** 복사

### 2단계: 앱에 URL 입력

1. `index.html` 을 브라우저에서 열기
2. **퇴원생 교재 정산** 카드 클릭
3. 상단 **⚙️ 구글 시트 연동 설정** 패널 열기
4. 복사한 URL 붙여넣기 → **연결 테스트** 클릭

### 3단계: 컬럼명 확인

구글 시트의 헤더 이름과 `js/config.js` 의 설정이 다르면 수정이 필요합니다.

```js
// js/config.js 예시
STUDENT_COLS: {
  ID:    '학번',   // ← 실제 시트 헤더와 동일하게
  NAME:  '이름',
  CLASS: '반',
  ...
},
```

---

## 📋 교재 정산 사용법

1. **학번 입력** → **조회** 버튼 클릭
2. 학생의 수강반/탐구반 정보가 자동으로 표시됨
3. 해당 반에 배부된 교재 목록이 자동으로 불러와짐
4. 이상 내역(과목 변경, 오배부 등)은 **이상 체크박스** 체크
5. 필요시 **비고** 칸에 메모 입력
6. **환불 금액** 및 **공제 금액** 입력 → 최종 환불 예정액 자동 계산
7. **인쇄 / PDF 저장** 버튼으로 출력

---

## 🖨️ 인쇄 안내

- 브라우저의 인쇄 기능 또는 앱 내 **인쇄 버튼** 사용
- 인쇄 시 헤더, 설정 패널, 버튼 등은 자동으로 숨겨지고 정산 내역만 출력됨
- PDF로 저장하려면 프린터를 "PDF로 저장"으로 선택

---

## 🔧 깃허브 업로드 방법

```bash
# 프로젝트 폴더에서 터미널 열기
cd academy-app

# Git 초기화
git init

# 모든 파일 추가
git add .

# 첫 커밋
git commit -m "첫 번째 커밋: 학원 업무 관리 시스템 초기 버전"

# GitHub에서 새 레포 만든 뒤 아래 명령어 실행
# (레포 주소는 GitHub에서 복사)
git remote add origin https://github.com/[계정명]/[레포명].git
git branch -M main
git push -u origin main
```

---

## ➕ 기능 추가 방법

새 업무 기능을 추가할 때는:

1. 새 HTML 파일 생성 (예: `attendance.html`)
2. `index.html` 의 **기능 추가 예정** 카드 중 하나를 실제 기능 카드로 교체
3. `js/` 폴더에 해당 기능의 JS 파일 추가

---

## ⚠️ 주의사항

- 이 앱은 내부 업무용으로만 사용하세요.
- `Code.gs` 에 작성된 Apps Script는 구글 시트에 대한 읽기 권한이 필요합니다.
- Apps Script URL은 브라우저 로컬스토리지에 저장되므로 공용 PC에서는 사용 후 URL을 삭제하세요.
