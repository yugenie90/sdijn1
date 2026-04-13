/**
 * settlement.js
 * 퇴원생 교재 정산 기능 로직
 */

// ── 상태 ───────────────────────────────────────────────────────
let currentStudent   = null;
let allTextbooks     = [];     // 전체 교재 배부 내역
let showFlaggedOnly  = false;

// ── 초기화 ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // 날짜
  const now = new Date();
  document.getElementById('currentDate').textContent =
    now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  document.getElementById('printDate').textContent =
    '출력일: ' + now.toLocaleString('ko-KR');

  // 저장된 URL 불러오기
  const saved = localStorage.getItem('academyScriptUrl');
  if (saved) {
    document.getElementById('scriptUrl').value = saved;
    updateConnStatus('idle');
  }
});

// ── 설정 패널 토글 ─────────────────────────────────────────────
function toggleSettings() {
  const body = document.getElementById('settingsBody');
  const toggle = document.getElementById('settingsToggle');
  const isOpen = body.classList.toggle('open');
  toggle.classList.toggle('open', isOpen);
}

function saveScriptUrl() {
  const url = document.getElementById('scriptUrl').value.trim();
  if (url) localStorage.setItem('academyScriptUrl', url);
  updateConnStatus('idle');
}

function updateConnStatus(state, msg) {
  const dot  = document.getElementById('connDot');
  const text = document.getElementById('connText');
  dot.className = 'conn-dot';
  if (state === 'connected') {
    dot.classList.add('connected');
    text.textContent = msg || '연결 성공';
  } else if (state === 'error') {
    dot.classList.add('error');
    text.textContent = msg || '연결 실패';
  } else {
    text.textContent = msg || 'URL이 저장되어 있습니다. 연결 테스트를 눌러 확인하세요.';
  }
}

async function testConnection() {
  const url = getScriptUrl();
  if (!url) return showToast('Apps Script URL을 먼저 입력해주세요.');
  updateConnStatus('idle', '연결 중...');
  try {
    const res = await callScript({ action: 'ping' });
    if (res && res.pong) {
      updateConnStatus('connected', '구글 시트 연결 성공 ✓');
    } else {
      updateConnStatus('connected', '응답 수신 완료 (시트 연결됨)');
    }
  } catch (e) {
    updateConnStatus('error', '연결 실패: ' + e.message);
  }
}

// ── API 호출 ───────────────────────────────────────────────────
function getScriptUrl() {
  return (document.getElementById('scriptUrl').value || localStorage.getItem('academyScriptUrl') || '').trim();
}

async function callScript(params) {
  const url = getScriptUrl();
  if (!url) throw new Error('Apps Script URL이 설정되지 않았습니다.');
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${url}?${query}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 학생 조회 ──────────────────────────────────────────────────
async function searchStudent() {
  const studentId = document.getElementById('studentIdInput').value.trim();
  if (!studentId) return showToast('학번을 입력해주세요.');

  const btn = document.getElementById('searchBtn');
  btn.disabled = true;
  btn.textContent = '조회 중...';

  try {
    // 1. 학생 정보 조회
    const studentRes = await callScript({ action: 'getStudent', studentId });

    if (!studentRes.success) {
      showToast(studentRes.error || '학생을 찾을 수 없습니다.');
      return;
    }

    currentStudent = studentRes.student;
    renderStudentCard(currentStudent);

    // 2. 교재 내역 조회
    // 학생의 반/탐구반 목록 추출
    const cols = CONFIG.STUDENT_COLS;
    const classes = [
      currentStudent[cols.CLASS],
      currentStudent[cols.탐구1],
      currentStudent[cols.탐구2],
      currentStudent[cols.탐구1_1],
      currentStudent[cols.탐구2_1],
    ].filter(v => v && String(v).trim() !== '' && String(v).trim() !== '-');

    setTableLoading();
    const textbookRes = await callScript({
      action: 'getTextbooks',
      classes: JSON.stringify(classes),
      studentId,
    });

    if (!textbookRes.success) {
      showToast(textbookRes.error || '교재 내역을 불러오지 못했습니다.');
      renderTableEmpty('교재 배부 내역이 없습니다.');
      return;
    }

    allTextbooks = textbookRes.textbooks || [];
    renderTextbookTable(allTextbooks);
    renderSummary();
    showResultSections();

  } catch (e) {
    showToast('오류: ' + e.message + '\n\nApps Script URL을 확인해주세요.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg> 조회`;
  }
}

// ── 학생 카드 렌더링 ───────────────────────────────────────────
function renderStudentCard(student) {
  const cols   = CONFIG.STUDENT_COLS;
  const labels = CONFIG.LABELS;
  const card   = document.getElementById('studentCard');
  const grid   = document.getElementById('studentInfoGrid');
  const nameEl = document.getElementById('studentName');

  nameEl.textContent = student[cols.NAME] || '이름 없음';

  const fields = [
    { label: '학번',     value: student[cols.ID] },
    { label: labels['반']      || '수강반',   value: student[cols.CLASS] },
    { label: labels['탐구1']   || '탐구1반',  value: student[cols.탐구1] },
    { label: labels['탐구2']   || '탐구2반',  value: student[cols.탐구2] },
    { label: labels['탐구1-1'] || '탐구1-1반', value: student[cols.탐구1_1] },
    { label: labels['탐구2-1'] || '탐구2-1반', value: student[cols.탐구2_1] },
  ];

  grid.innerHTML = fields.map(f => `
    <div class="info-item">
      <div class="info-label">${f.label}</div>
      <div class="info-value ${!f.value || f.value === '-' ? 'empty' : ''}">
        ${f.value || '-'}
      </div>
    </div>
  `).join('');

  card.classList.add('visible');
}

// ── 교재 테이블 렌더링 ─────────────────────────────────────────
function setTableLoading() {
  document.getElementById('textbookTableBody').innerHTML = `
    <tr><td colspan="9">
      <div class="table-placeholder">
        <div class="spinner"></div>
        <p>교재 내역을 불러오는 중...</p>
      </div>
    </td></tr>`;
}

function renderTableEmpty(msg) {
  document.getElementById('textbookTableBody').innerHTML = `
    <tr><td colspan="9">
      <div class="table-placeholder">
        <div class="placeholder-icon">📭</div>
        <p>${msg}</p>
      </div>
    </td></tr>`;
}

function renderTextbookTable(books) {
  const cols = CONFIG.TEXTBOOK_COLS;
  const tbody = document.getElementById('textbookTableBody');
  document.getElementById('textbookCount').textContent = books.length;

  if (!books.length) {
    renderTableEmpty('해당 학생의 교재 배부 내역이 없습니다.');
    return;
  }

  const display = showFlaggedOnly ? books.filter((_, i) => getFlagState(i)) : books;

  tbody.innerHTML = display.map((book, idx) => {
    const realIdx = showFlaggedOnly
      ? books.indexOf(book)
      : idx;
    const flagged  = getFlagState(realIdx);
    const note     = getNoteValue(realIdx);
    const price    = Number(book[cols.PRICE]) || 0;
    const date     = book[cols.DATE] ? formatDate(book[cols.DATE]) : '-';

    return `
    <tr class="${flagged ? 'flagged' : ''}" id="row-${realIdx}">
      <td style="text-align:center;">
        <input type="checkbox" class="flag-checkbox"
          ${flagged ? 'checked' : ''}
          onchange="toggleFlag(${realIdx}, this.checked)">
      </td>
      <td class="date-cell">${date}</td>
      <td class="code-cell">${book[cols.CODE] || '-'}</td>
      <td><strong>${book[cols.NAME] || '-'}</strong></td>
      <td>${book[cols.SUBJECT] || '-'}</td>
      <td>${book[cols.CLASS] || '-'}</td>
      <td>${book[cols.TEACHER] || '-'}</td>
      <td class="price-cell" style="text-align:right;">${price.toLocaleString()}원</td>
      <td>
        <input type="text" class="note-input"
          placeholder="비고 입력..."
          value="${note}"
          onchange="setNote(${realIdx}, this.value)">
      </td>
    </tr>`;
  }).join('');
}

// ── 이상 플래그 상태 관리 ──────────────────────────────────────
const flagStates = {};
const noteValues = {};

function getFlagState(idx) { return !!flagStates[idx]; }
function getNoteValue(idx) { return noteValues[idx] || ''; }

function toggleFlag(idx, checked) {
  flagStates[idx] = checked;
  const row = document.getElementById(`row-${idx}`);
  if (row) row.classList.toggle('flagged', checked);
  renderSummary();
}

function setNote(idx, value) {
  noteValues[idx] = value;
}

// ── 이상 내역만 보기 토글 ──────────────────────────────────────
function toggleFlaggedOnly() {
  showFlaggedOnly = !showFlaggedOnly;
  const btn = document.getElementById('flagFilterBtn');
  btn.textContent = showFlaggedOnly ? '전체 보기' : '이상 내역만 보기';
  btn.style.background = showFlaggedOnly ? 'var(--red-light)' : '';
  btn.style.borderColor = showFlaggedOnly ? 'var(--red)' : '';
  btn.style.color       = showFlaggedOnly ? 'var(--red)' : '';
  renderTextbookTable(allTextbooks);
}

// ── 정산 요약 렌더링 ───────────────────────────────────────────
function renderSummary() {
  const cols = CONFIG.TEXTBOOK_COLS;
  const totalCount  = allTextbooks.length;
  const flagCount   = Object.values(flagStates).filter(Boolean).length;

  let totalAmount = 0, flagAmount = 0;
  allTextbooks.forEach((book, idx) => {
    const price = Number(book[cols.PRICE]) || 0;
    totalAmount += price;
    if (flagStates[idx]) flagAmount += price;
  });
  const normalAmount = totalAmount - flagAmount;

  document.getElementById('sumTotalCount').textContent  = totalCount + '권';
  document.getElementById('sumFlagCount').textContent   = flagCount + '건';
  document.getElementById('sumNormalAmount').textContent = formatMoney(normalAmount);
  document.getElementById('sumFlagAmount').textContent  = formatMoney(flagAmount);
  document.getElementById('sumTotalAmount').textContent = formatMoney(totalAmount);

  calcFinal();
}

function calcFinal() {
  const refund  = Number(document.getElementById('refundAmount').value) || 0;
  const deduct  = Number(document.getElementById('deductAmount').value) || 0;
  const final   = Math.max(0, refund - deduct);
  document.getElementById('finalAmount').textContent = formatMoney(final);
}

// ── 화면 표시/숨김 ─────────────────────────────────────────────
function showResultSections() {
  document.getElementById('textbookSection').classList.add('visible');
  document.getElementById('summarySection').classList.add('visible');
  document.getElementById('actionBar').classList.add('visible');
}

// ── 초기화 ─────────────────────────────────────────────────────
function resetAll() {
  if (!confirm('모든 데이터를 초기화하시겠습니까?')) return;

  currentStudent  = null;
  allTextbooks    = [];
  showFlaggedOnly = false;

  Object.keys(flagStates).forEach(k => delete flagStates[k]);
  Object.keys(noteValues).forEach(k => delete noteValues[k]);

  document.getElementById('studentIdInput').value  = '';
  document.getElementById('refundAmount').value    = '';
  document.getElementById('deductAmount').value    = '';
  document.getElementById('settlementMemo').value  = '';
  document.getElementById('finalAmount').textContent = '₩0';

  document.getElementById('studentCard').classList.remove('visible');
  document.getElementById('textbookSection').classList.remove('visible');
  document.getElementById('summarySection').classList.remove('visible');
  document.getElementById('actionBar').classList.remove('visible');

  renderTableEmpty('학번을 입력하고 조회하면 교재 내역이 표시됩니다');
  document.getElementById('textbookCount').textContent = '0';

  showToast('초기화되었습니다.');
}

// ── 유틸 ───────────────────────────────────────────────────────
function formatMoney(v) {
  return '₩' + Number(v).toLocaleString('ko-KR');
}

function formatDate(v) {
  if (!v) return '-';
  // Google Sheets serial date (number) → JS Date
  if (typeof v === 'number') {
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  // String date
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}
