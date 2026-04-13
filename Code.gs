/**
 * Code.gs — Google Apps Script
 * ─────────────────────────────────────────────────────────────────
 * 학원 업무 관리 시스템 · 구글 시트 연동 미들웨어
 *
 * 설정 방법:
 *  1. Google Drive에서 새 Apps Script 프로젝트 만들기
 *  2. 이 파일 내용을 붙여넣기
 *  3. SPREADSHEET_ID에 구글 시트 ID를 입력 (아래 주석 참고)
 *  4. 탭 이름이 다르면 STUDENT_SHEET_NAME / TEXTBOOK_SHEET_NAME 수정
 *  5. 컬럼명이 다르면 아래 컬럼 설정 부분 수정
 *  6. 배포 > 새 배포 > 웹 앱으로 배포
 *     - 실행 계정: 본인(나)
 *     - 액세스 권한: 모든 사용자 (또는 조직 내)
 *  7. 배포 URL을 앱 설정 패널에 붙여넣기
 * ─────────────────────────────────────────────────────────────────
 */

// ── 필수 설정 ──────────────────────────────────────────────────
// 구글 시트 URL에서 /d/ 뒤의 긴 문자열이 ID입니다.
// 예: https://docs.google.com/spreadsheets/d/[여기가 ID]/edit
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

// 탭(시트) 이름 — 실제 이름과 다르면 수정하세요
const STUDENT_SHEET_NAME  = '학생정보';
const TEXTBOOK_SHEET_NAME = '교재배부';

// ── 컬럼명 설정 ────────────────────────────────────────────────
// 실제 구글 시트의 헤더(1행) 컬럼명과 맞춰주세요
const STUDENT_COLS = {
  ID:      '학번',
  NAME:    '이름',
  CLASS:   '반',
  탐구1:   '탐구1',
  탐구2:   '탐구2',
  탐구1_1: '탐구1-1',
  탐구2_1: '탐구2-1',
};

const TEXTBOOK_COLS = {
  DATE:    '배부날짜',
  CODE:    '교재코드',
  NAME:    '교재명',
  TEACHER: '강사',
  SUBJECT: '과목',
  CLASS:   '반',
  PRICE:   '가격',
};

// ── 메인 핸들러 ────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'ping') {
      return jsonResponse({ pong: true, timestamp: new Date().toISOString() });
    }

    if (action === 'getStudent') {
      const studentId = e.parameter.studentId;
      if (!studentId) return jsonResponse({ success: false, error: '학번이 없습니다.' });
      return jsonResponse(getStudentInfo(studentId));
    }

    if (action === 'getTextbooks') {
      const classes   = JSON.parse(e.parameter.classes || '[]');
      const studentId = e.parameter.studentId;
      return jsonResponse(getTextbooks(classes, studentId));
    }

    return jsonResponse({ success: false, error: '알 수 없는 action: ' + action });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── 학생 정보 조회 ─────────────────────────────────────────────
function getStudentInfo(studentId) {
  const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet   = ss.getSheetByName(STUDENT_SHEET_NAME);

  if (!sheet) {
    return { success: false, error: `'${STUDENT_SHEET_NAME}' 시트를 찾을 수 없습니다.` };
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const idIdx   = headers.indexOf(STUDENT_COLS.ID);

  if (idIdx === -1) {
    return { success: false, error: `'${STUDENT_COLS.ID}' 컬럼을 찾을 수 없습니다. 설정을 확인하세요.` };
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[idIdx]).trim() === String(studentId).trim()) {
      const student = {};
      headers.forEach((header, idx) => {
        student[header] = row[idx];
      });
      return { success: true, student };
    }
  }

  return { success: false, error: `학번 '${studentId}'에 해당하는 학생을 찾을 수 없습니다.` };
}

// ── 교재 배부 내역 조회 ────────────────────────────────────────
function getTextbooks(classes, studentId) {
  const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet   = ss.getSheetByName(TEXTBOOK_SHEET_NAME);

  if (!sheet) {
    return { success: false, error: `'${TEXTBOOK_SHEET_NAME}' 시트를 찾을 수 없습니다.` };
  }

  const data      = sheet.getDataRange().getValues();
  const headers   = data[0].map(h => String(h).trim());
  const classIdx  = headers.indexOf(TEXTBOOK_COLS.CLASS);

  if (classIdx === -1) {
    return { success: false, error: `'${TEXTBOOK_COLS.CLASS}' 컬럼을 찾을 수 없습니다.` };
  }

  const normalizedClasses = classes.map(c => String(c).trim().toLowerCase());

  const results = [];
  for (let i = 1; i < data.length; i++) {
    const row      = data[i];
    const rowClass = String(row[classIdx]).trim().toLowerCase();

    // 빈 행 스킵
    if (!rowClass) continue;

    if (normalizedClasses.includes(rowClass)) {
      const record = {};
      headers.forEach((header, idx) => {
        // 날짜 직렬 처리: Date 객체는 문자열로 변환
        const val = row[idx];
        if (val instanceof Date) {
          record[header] = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else {
          record[header] = val;
        }
      });
      results.push(record);
    }
  }

  // 날짜 기준 정렬 (최신 배부 순)
  const dateKey = TEXTBOOK_COLS.DATE;
  results.sort((a, b) => {
    const da = new Date(a[dateKey]);
    const db = new Date(b[dateKey]);
    return db - da;
  });

  return { success: true, textbooks: results, count: results.length };
}

// ── 유틸 ───────────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
