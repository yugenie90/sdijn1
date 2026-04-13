/**
 * config.js — 학원 업무 시스템 설정
 * 구글 시트의 컬럼명이 다를 경우 아래 값들을 수정해주세요.
 */

const CONFIG = {

  SHEETS: {
    STUDENT:      '학생정보',
    TEXTBOOK:     '교재배부',
    CLASS_CHANGE: '수강변경내역',
  },

  STUDENT_COLS: {
    ID:          '학번',
    STUDENT_ID:  '학생ID',
    NAME:        '학생명',
    BUILDING: '관',
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
  },

  TEXTBOOK_COLS: {
    DATE_START: '배부시작일',
    DATE_END:   '배부종료일',
    DATE:       '날짜',
    CODE:       '교재코드',
    NAME:       '교재명',
    TEACHER:    '강사',
    SUBJECT:    '과목',
    CLASS:      '반',
    PRICE:      '가격',
  },

  CLASS_CHANGE_COLS: {
    APPLY_DATE:   '변경 적용일(교무확인)',
    FROM_SUBJECT: '기존 과목(교무확인)',
    TO_SUBJECT:   '변경 과목(교무확인)',
    REFLECTED:    '시간표 반영 여부(시트반영)',
  },

  // 시대인재 콘텐츠 강사명 (이 값과 일치하면 별도 목록으로 분리)
  SDAI_TEACHER: '시대인재',

  LABELS: {
    '반':      '수강반',
    '탐구1':   '탐구1반',
    '탐구2':   '탐구2반',
    '탐구1-1': '탐구1-1반',
    '탐구2-1': '탐구2-1반',
  },
};
