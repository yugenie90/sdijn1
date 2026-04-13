/**
 * Code.gs — Google Apps Script
 * 학원 업무 관리 시스템 · 구글 시트 연동 미들웨어 (v2)
 */

const STUDENT_SHEET_NAME  = '학생정보';
const TEXTBOOK_SHEET_NAME = '교재배부';
const CLASS_CHANGE_SHEET  = '수강변경내역';

const STUDENT_COLS = {
  ID:          '학번',
  STUDENT_ID:  '학생ID',
  NAME:        '학생명',
  BUILDING:    '관',        // ← 추가
  CLASS:       '반',
  PARENT_TEL:  '학부모연락처',
  STUDENT_TEL: '학생연락처',
  SEAT:        '좌석번호',
  ENROLL_DATE: '입학일',
  LEAVE_DATE:  '퇴원일',
  STATUS:      '재원여부',
  탐구1:   '탐구1',
  탐구2:   '탐구2',
  탐구1_1: '탐구1-1',
  탐구2_1: '탐구2-1',
};

const TEXTBOOK_COLS = {
  BUILDING:   '관',         // ← 추가
  DATE_START: '배부시작일',
  DATE_END:   '배부종료일',
  DATE:       '날짜',
  CODE:       '교재코드',
  NAME:       '교재명',
  TEACHER:    '강사',
  SUBJECT:    '과목',
  CLASS:      '반',
  PRICE:      '가격',
};

const CLASS_CHANGE_COLS = {
  STUDENT_ID:   '학번',
  APPLY_DATE:   '변경 적용일(교무확인)',
  FROM_SUBJECT: '기존 과목(교무확인)',
  TO_SUBJECT:   '변경 과목(교무확인)',
  REFLECTED:    '시간표 반영 여부(시트반영)',
};

const SDAI_TEACHER = '시대인재';

// ── 메인 핸들러 ────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'ping') {
      return jsonResponse({ pong: true });
    }
    if (action === 'getStudent') {
      return jsonResponse(getStudentInfo(e.parameter.studentId));
    }
    if (action === 'getTextbooks') {
      const mainClasses  = JSON.parse(e.parameter.mainClasses  || '[]');
      const tanguClasses = JSON.parse(e.parameter.tanguClasses || '[]');
      const building     = e.parameter.building   || '';
      const enrollDate   = e.parameter.enrollDate || '';
      const leaveDate    = e.parameter.leaveDate  || '';
      return jsonResponse(getTextbooks(mainClasses, tanguClasses, building, enrollDate, leaveDate));
    }
    if (action === 'getClassChanges') {
      return jsonResponse(getClassChanges(e.parameter.studentId));
    }

    return jsonResponse({ success: false, error: '알 수 없는 action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── 학생 정보 조회 ─────────────────────────────────────────────
function getStudentInfo(studentId) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(STUDENT_SHEET_NAME);
  if (!sheet) return { success: false, error: `'${STUDENT_SHEET_NAME}' 시트를 찾을 수 없습니다.` };

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const idIdx   = headers.indexOf(STUDENT_COLS.ID);
  if (idIdx === -1) return { success: false, error: `'${STUDENT_COLS.ID}' 컬럼을 찾을 수 없습니다.` };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(studentId).trim()) {
      const student = {};
      headers.forEach((h, idx) => {
        const val = data[i][idx];
        student[h] = val instanceof Date
          ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd')
          : val;
      });
      return { success: true, student };
    }
  }
  return { success: false, error: `학번 '${studentId}'에 해당하는 학생을 찾을 수 없습니다.` };
}

// ── 교재 배부 내역 조회 (재원기간 필터 + 시대인재 분리) ────────
function getTextbooks(classes, enrollDateStr, leaveDateStr) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TEXTBOOK_SHEET_NAME);
  if (!sheet) return { success: false, error: `'${TEXTBOOK_SHEET_NAME}' 시트를 찾을 수 없습니다.` };

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());

  const classIdx     = headers.indexOf(TEXTBOOK_COLS.CLASS);
  const startDateIdx = headers.indexOf(TEXTBOOK_COLS.DATE_START);
  const endDateIdx   = headers.indexOf(TEXTBOOK_COLS.DATE_END);
  const teacherIdx   = headers.indexOf(TEXTBOOK_COLS.TEACHER);

  if (classIdx === -1) return { success: false, error: `'${TEXTBOOK_COLS.CLASS}' 컬럼을 찾을 수 없습니다.` };

  const normalizedClasses = classes.map(c => String(c).trim().toLowerCase());

  const enrollDate = enrollDateStr ? new Date(enrollDateStr) : null;
  const leaveDate  = leaveDateStr  ? new Date(leaveDateStr)  : new Date('9999-12-31');

  const regular = [];
  const sdai    = [];

  for (let i = 1; i < data.length; i++) {
    const row      = data[i];
    const rowClass = String(row[classIdx]).trim().toLowerCase();
    if (!rowClass) continue;
    if (!normalizedClasses.includes(rowClass)) continue;

    // 재원기간 필터: 배부기간과 재원기간이 겹치는지 확인
    if (enrollDate && startDateIdx !== -1 && endDateIdx !== -1) {
      const rawStart = row[startDateIdx];
      const rawEnd   = row[endDateIdx];
      const bookStart = rawStart instanceof Date ? rawStart : (rawStart ? new Date(rawStart) : null);
      const bookEnd   = rawEnd   instanceof Date ? rawEnd   : (rawEnd   ? new Date(rawEnd)   : null);

      if (bookStart && bookEnd) {
        const overlap = enrollDate <= bookEnd && leaveDate >= bookStart;
        if (!overlap) continue;
      }
    }

    const record = {};
    headers.forEach((h, idx) => {
      const val = row[idx];
      record[h] = val instanceof Date
        ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : val;
    });

    const teacher = String(row[teacherIdx] || '').trim();
    if (teacher === SDAI_TEACHER) {
      sdai.push(record);
    } else {
      regular.push(record);
    }
  }

  const sortKey = TEXTBOOK_COLS.DATE_START;
  const sortFn  = (a, b) => new Date(a[sortKey] || 0) - new Date(b[sortKey] || 0);
  regular.sort(sortFn);
  sdai.sort(sortFn);

  return { success: true, textbooks: regular, sdai, count: regular.length + sdai.length };
}

// ── 수강변경내역 조회 ──────────────────────────────────────────
function getClassChanges(studentId) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CLASS_CHANGE_SHEET);
  if (!sheet) return { success: true, changes: [] };

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const idIdx   = headers.indexOf(CLASS_CHANGE_COLS.STUDENT_ID);
  if (idIdx === -1) return { success: true, changes: [] };

  const changes = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(studentId).trim()) {
      const record = {};
      headers.forEach((h, idx) => {
        const val = data[i][idx];
        record[h] = val instanceof Date
          ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd')
          : val;
      });
      changes.push(record);
    }
  }

  changes.sort((a, b) =>
    new Date(a[CLASS_CHANGE_COLS.APPLY_DATE] || 0) - new Date(b[CLASS_CHANGE_COLS.APPLY_DATE] || 0)
  );

  return { success: true, changes };
}

// ── 유틸 ───────────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
