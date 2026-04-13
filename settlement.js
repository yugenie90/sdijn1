/**
 * settlement.js v3
 * 퇴원생 교재 정산 — 관+반 매칭, 탐구반 분리, 배부여부 체크, 과목별 합계
 */

// ── 상태 ───────────────────────────────────────────────────────
let currentStudent = null;
let regularBooks   = [];
let sdaiBooks      = [];
let previousBooks  = [];   // 수강변경 전 교재

const receiveStates = { regular: {}, sdai: {}, prev: {} };
const noteValues    = { regular: {}, sdai: {}, prev: {} };

// ── 초기화 ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  document.getElementById('currentDate').textContent =
    now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  document.getElementById('printDate').textContent =
    '출력일: ' + now.toLocaleString('ko-KR');

  const saved = localStorage.getItem('academyScriptUrl');
  if (saved) document.getElementById('scriptUrl').value = saved;
});

// ── 설정 패널 ──────────────────────────────────────────────────
function toggleSettings() {
  const body   = document.getElementById('settingsBody');
  const toggle = document.getElementById('settingsToggle');
  const isOpen = body.classList.toggle('open');
  toggle.classList.toggle('open', isOpen);
}

function saveScriptUrl() {
  const url = document.getElementById('scriptUrl').value.trim();
  if (url) localStorage.setItem('academyScriptUrl', url);
}

function updateConnStatus(state, msg) {
  const dot  = document.getElementById('connDot');
  const text = document.getElementById('connText');
  dot.className = 'conn-dot';
  if (state === 'connected') dot.classList.add('connected');
  else if (state === 'error') dot.classList.add('error');
  text.textContent = msg || '';
}

async function testConnection() {
  const url = getScriptUrl();
  if (!url) return showToast('Apps Script URL을 먼저 입력해주세요.');
  updateConnStatus('idle', '연결 중...');
  try {
    const res = await callScript({ action: 'ping' });
    updateConnStatus(res && res.pong ? 'connected' : 'connected', '구글 시트 연결 성공 ✓');
  } catch (e) {
    updateConnStatus('error', '연결 실패: ' + e.message);
  }
}

// ── API ────────────────────────────────────────────────────────
function getScriptUrl() {
  return (document.getElementById('scriptUrl').value || localStorage.getItem('academyScriptUrl') || '').trim();
}

async function callScript(params) {
  const url = getScriptUrl();
  if (!url) throw new Error('Apps Script URL이 설정되지 않았습니다.');
  const res = await fetch(`${url}?${new URLSearchParams(params)}`);
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

    // 2. 수강변경내역 조회
    const changeRes = await callScript({ action: 'getClassChanges', studentId });
    const classChanges = changeRes.changes || [];
    renderClassChanges(classChanges);

    // 3. 교재 내역 조회
    const cols = CONFIG.STUDENT_COLS;

    // 수강반 (관+반 매칭)
    const mainClasses = [currentStudent[cols.CLASS]]
      .filter(v => v && String(v).trim() !== '' && String(v).trim() !== '-');

    // 탐구반 (반 이름만 매칭)
    const tanguClasses = [
      currentStudent[cols.탐구1],
      currentStudent[cols.탐구2],
      currentStudent[cols.탐구1_1],
      currentStudent[cols.탐구2_1],
    ].filter(v => v && String(v).trim() !== '' && String(v).trim() !== '-');

    const building   = currentStudent[cols.BUILDING]    || '';
    const enrollDate = currentStudent[cols.ENROLL_DATE] || '';
    const leaveDate  = currentStudent[cols.LEAVE_DATE]  || '';

    setTableLoading('textbookTableBody', 10);
    setTableLoading('sdaiTableBody', 9);

    const tbRes = await callScript({
      action:       'getTextbooks',
      mainClasses:  JSON.stringify(mainClasses),
      tanguClasses: JSON.stringify(tanguClasses),
      building,
      enrollDate,
      leaveDate,
    });

    if (!tbRes.success) {
      showToast(tbRes.error || '교재 내역을 불러오지 못했습니다.');
      renderTableEmpty('textbookTableBody', 10, '교재 배부 내역이 없습니다.');
      renderTableEmpty('sdaiTableBody', 9, '시대인재 콘텐츠 내역이 없습니다.');
      return;
    }

    regularBooks = tbRes.textbooks || [];
    sdaiBooks    = tbRes.sdai      || [];

    resetReceiveStates();

    renderTextbookTable('textbookTableBody', regularBooks, 'regular', 10, false);
    renderTextbookTable('sdaiTableBody',     sdaiBooks,    'sdai',    9,  true);

    document.getElementById('textbookCount').textContent = regularBooks.length;
    document.getElementById('sdaiCount').textContent     = sdaiBooks.length;

    // 4. 수강변경 전 교재 조회
    if (classChanges.length > 0) {
      setTableLoading('prevTableBody', 11);
      const prevRes = await callScript({
        action:    'getPreviousTextbooks',
        studentId,
        enrollDate,
        building,
      });
      previousBooks = prevRes.previous || [];
      previousBooks.forEach((_, i) => { receiveStates.prev[i] = true; });
      renderPreviousTable(previousBooks);
      document.getElementById('prevCount').textContent = previousBooks.length;
    } else {
      previousBooks = [];
      renderTableEmpty('prevTableBody', 11, '수강변경 내역이 없습니다.');
    }

    renderSummary();
    showResultSections();

  } catch (e) {
    showToast('오류: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg> 조회`;
  }
}

// ── 배부여부 초기화 (전부 true) ────────────────────────────────
function resetReceiveStates() {
  receiveStates.regular = {};
  receiveStates.sdai    = {};
  receiveStates.prev    = {};
  noteValues.regular    = {};
  noteValues.sdai       = {};
  noteValues.prev       = {};
  regularBooks.forEach((_, i)  => { receiveStates.regular[i] = true;  });
  sdaiBooks.forEach((_, i)     => { receiveStates.sdai[i]    = true;  });
  previousBooks.forEach((_, i) => { receiveStates.prev[i]    = false; }); // 기본 미체크
}

// ── 학생 카드 ──────────────────────────────────────────────────
function renderStudentCard(student) {
  const cols   = CONFIG.STUDENT_COLS;
  const labels = CONFIG.LABELS;

  document.getElementById('studentName').textContent = student[cols.NAME] || '이름 없음';

  const statusBadge = document.getElementById('statusBadge');
  const status = String(student[cols.STATUS] || '').trim();
  if (status) {
    const isActive = ['재원', 'Y', 'TRUE', '1'].includes(status);
    statusBadge.innerHTML = `<span class="card-status ${isActive ? 'active' : 'coming'}">${status}</span>`;
  }

  const fields = [
    { label: '학번',         value: student[cols.ID] },
    { label: '학생ID',       value: student[cols.STUDENT_ID] },
    { label: '좌석번호',     value: student[cols.SEAT] },
    { label: '관',           value: student[cols.BUILDING] },
    { label: labels['반'] || '수강반',       value: student[cols.CLASS] },
    { label: labels['탐구1'] || '탐구1반',   value: student[cols.탐구1] },
    { label: labels['탐구2'] || '탐구2반',   value: student[cols.탐구2] },
    { label: labels['탐구1-1'] || '탐구1-1반', value: student[cols.탐구1_1] },
    { label: labels['탐구2-1'] || '탐구2-1반', value: student[cols.탐구2_1] },
    { label: '입학일',       value: student[cols.ENROLL_DATE] },
    { label: '퇴원일',       value: student[cols.LEAVE_DATE]  },
    { label: '학부모연락처', value: student[cols.PARENT_TEL]  },
    { label: '학생연락처',   value: student[cols.STUDENT_TEL] },
  ];

  document.getElementById('studentInfoGrid').innerHTML = fields.map(f => `
    <div class="info-item">
      <div class="info-label">${f.label}</div>
      <div class="info-value ${!f.value || f.value === '-' ? 'empty' : ''}">${f.value || '-'}</div>
    </div>
  `).join('');

  document.getElementById('studentCard').classList.add('visible');
}

// ── 수강변경내역 ───────────────────────────────────────────────
function renderClassChanges(changes) {
  const section = document.getElementById('classChangeSection');
  const tbody   = document.getElementById('classChangeTableBody');
  const cc      = CONFIG.CLASS_CHANGE_COLS;

  // 빈 행 제거 (모든 값이 비어있는 행 제외)
  const validChanges = (changes || []).filter(c =>
    (c[cc.APPLY_DATE] && String(c[cc.APPLY_DATE]).trim() !== '') ||
    (c[cc.FROM_SUBJECT] && String(c[cc.FROM_SUBJECT]).trim() !== '') ||
    (c[cc.TO_SUBJECT] && String(c[cc.TO_SUBJECT]).trim() !== '')
  );

  if (!validChanges.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  tbody.innerHTML = validChanges.map(c => {
    const reflected = String(c[cc.REFLECTED] || '').trim();
    const isOk = ['Y', '반영', 'O', 'TRUE'].includes(reflected);
    return `
    <tr>
      <td class="date-cell">${c[cc.APPLY_DATE]   || '-'}</td>
      <td>${c[cc.FROM_SUBJECT] || '-'}</td>
      <td><strong>${c[cc.TO_SUBJECT] || '-'}</strong></td>
      <td>
        <span class="card-status ${isOk ? 'active' : 'coming'}">
          ${reflected || '-'}
        </span>
      </td>
    </tr>`;
  }).join('');
}

// ── 수강변경 전 교재 테이블 ────────────────────────────────────
function renderPreviousTable(books) {
  const tbody = document.getElementById('prevTableBody');
  const tc    = CONFIG.TEXTBOOK_COLS;

  if (!books.length) {
    renderTableEmpty('prevTableBody', 11, '수강변경 전 교재 배부 내역이 없습니다');
    return;
  }

  tbody.innerHTML = books.map((book, idx) => {
    const checked = receiveStates.prev[idx] !== false;
    const note    = noteValues.prev[idx] || '';
    const price   = Number(book[tc.PRICE]) || 0;
    const isSdai  = book['_isSdai'];

    return `
    <tr id="prev-row-${idx}" class="${checked ? '' : 'row-unchecked'}${isSdai ? ' sdai-row' : ''}">
      <td style="text-align:center;">
        <input type="checkbox" class="flag-checkbox"
          ${checked ? 'checked' : ''}
          onchange="toggleReceive('prev', ${idx}, this.checked)">
      </td>
      <td class="date-cell">${book[tc.DATE_START] || '-'}</td>
      <td class="date-cell">${book[tc.DATE_END]   || '-'}</td>
      <td class="code-cell">${book[tc.CODE]        || '-'}</td>
      <td class="cell-name"><strong>${book[tc.NAME] || '-'}</strong>${isSdai ? ' <span style="font-size:0.7rem;color:var(--amber-dark);">[시대인재]</span>' : ''}</td>
      <td>${book[tc.SUBJECT] || '-'}</td>
      <td>${book[tc.CLASS]   || '-'}</td>
      <td>${book[tc.TEACHER] || '-'}</td>
      <td style="font-size:0.75rem;color:var(--text-muted);">${book['_changeLabel'] || '-'}</td>
      <td class="price-cell" style="text-align:right;">${price.toLocaleString()}원</td>
      <td class="cell-note">
        <input type="text" class="note-input" placeholder="비고..."
          value="${note}"
          onchange="noteValues['prev'][${idx}] = this.value">
      </td>
    </tr>`;
  }).join('');
}
function setTableLoading(tbodyId, colspan) {
  document.getElementById(tbodyId).innerHTML = `
    <tr><td colspan="${colspan}">
      <div class="table-placeholder"><div class="spinner"></div><p>불러오는 중...</p></div>
    </td></tr>`;
}

function renderTableEmpty(tbodyId, colspan, msg) {
  document.getElementById(tbodyId).innerHTML = `
    <tr><td colspan="${colspan}">
      <div class="table-placeholder"><div class="placeholder-icon">📭</div><p>${msg}</p></div>
    </td></tr>`;
}

function renderTextbookTable(tbodyId, books, group, colspan, isSdai) {
  const tbody = document.getElementById(tbodyId);
  const tc    = CONFIG.TEXTBOOK_COLS;

  if (!books.length) {
    renderTableEmpty(tbodyId, colspan, isSdai ? '시대인재 콘텐츠 내역이 없습니다' : '교재 배부 내역이 없습니다');
    return;
  }

  tbody.innerHTML = books.map((book, idx) => {
    const checked = receiveStates[group][idx] !== false;
    const note    = noteValues[group][idx] || '';
    const price   = Number(book[tc.PRICE]) || 0;

    return `
    <tr id="${group}-row-${idx}" class="${checked ? '' : 'row-unchecked'}">
      <td style="text-align:center;">
        <input type="checkbox" class="flag-checkbox"
          ${checked ? 'checked' : ''}
          onchange="toggleReceive('${group}', ${idx}, this.checked)">
      </td>
      <td class="date-cell">${book[tc.DATE_START] || '-'}</td>
      <td class="date-cell">${book[tc.DATE_END]   || '-'}</td>
      <td class="code-cell">${book[tc.CODE]        || '-'}</td>
      <td class="cell-name"><strong>${book[tc.NAME]    || '-'}</strong></td>
      <td>${book[tc.SUBJECT] || '-'}</td>
      <td>${book[tc.CLASS]   || '-'}</td>
      ${!isSdai ? `<td>${book[tc.TEACHER] || '-'}</td>` : ''}
      <td class="price-cell" style="text-align:right;">${price.toLocaleString()}원</td>
      <td class="cell-note">
        <input type="text" class="note-input" placeholder="비고..."
          value="${note}"
          onchange="noteValues['${group}'][${idx}] = this.value">
      </td>
    </tr>`;
  }).join('');
}

// ── 배부여부 토글 ──────────────────────────────────────────────
function toggleReceive(group, idx, checked) {
  receiveStates[group][idx] = checked;
  const row = document.getElementById(`${group}-row-${idx}`);
  if (row) row.classList.toggle('row-unchecked', !checked);
  renderSummary();
}

// ── 정산 요약 ──────────────────────────────────────────────────
// 수강반 과목으로 묶을 과목명 목록
const MAIN_SUBJECTS = ['국어', '영어', '수학', '논술'];

function renderSummary() {
  const tc = CONFIG.TEXTBOOK_COLS;
  const subjectMap = {};
  let mainSubjectTotal = 0; // 국어/영어/수학/논술 합계
  let totalAmount = 0;
  let sdaiAmount  = 0;
  let totalCount  = 0;

  function addToMap(subject, price, suffix) {
    const isMain = MAIN_SUBJECTS.some(s => subject.includes(s));
    if (isMain) {
      mainSubjectTotal += price;
    } else {
      const key = suffix ? `${subject} ${suffix}` : subject;
      subjectMap[key] = (subjectMap[key] || 0) + price;
    }
    totalAmount += price;
    totalCount++;
  }

  regularBooks.forEach((book, idx) => {
    if (!receiveStates.regular[idx]) return;
    addToMap(String(book[tc.SUBJECT] || '기타').trim(), Number(book[tc.PRICE]) || 0, null);
  });

  previousBooks.forEach((book, idx) => {
    if (!receiveStates.prev[idx]) return;
    addToMap(String(book[tc.SUBJECT] || '기타').trim(), Number(book[tc.PRICE]) || 0, '(변경 전)');
  });

  sdaiBooks.forEach((book, idx) => {
    if (!receiveStates.sdai[idx]) return;
    const price = Number(book[tc.PRICE]) || 0;
    // 시대인재는 별도 합계에만 포함, 과목별에는 표시 안 함
    sdaiAmount  += price;
    totalAmount += price;
    totalCount++;
  });

  // 수강반 합계 행 맨 위에 추가
  const orderedEntries = [];
  if (mainSubjectTotal > 0) {
    orderedEntries.push(['국어 / 영어 / 수학 / 논술', mainSubjectTotal]);
  }
  Object.entries(subjectMap).sort((a, b) => b[1] - a[1]).forEach(e => orderedEntries.push(e));

  document.getElementById('subjectSummary').innerHTML =
    orderedEntries.length
      ? orderedEntries.map(([subject, amount]) => `
          <div class="summary-row">
            <span class="summary-label">${subject}</span>
            <span class="summary-value">${formatMoney(amount)}</span>
          </div>`).join('')
      : '<div class="summary-row"><span class="summary-label" style="color:#aaa;">내역 없음</span></div>';

  document.getElementById('sumTotalAmount').textContent = formatMoney(totalAmount);
  document.getElementById('sumSdaiAmount').textContent  = formatMoney(sdaiAmount);
  document.getElementById('sumTotalCount').textContent  = totalCount + '권';

  calcFinal();
}

function calcFinal() {
  const refund = Number(document.getElementById('refundAmount').value)  || 0;
  const deduct = Number(document.getElementById('deductAmount').value) || 0;
  document.getElementById('finalAmount').textContent = formatMoney(Math.max(0, refund - deduct));
}

// ── 화면 표시 ──────────────────────────────────────────────────
function showResultSections() {
  ['textbookSection', 'prevSection', 'sdaiSection', 'summarySection', 'actionBar'].forEach(id => {
    document.getElementById(id).classList.add('visible');
  });
}

// ── 초기화 ─────────────────────────────────────────────────────
function resetAll() {
  if (!confirm('모든 데이터를 초기화하시겠습니까?')) return;

  currentStudent = null;
  regularBooks   = [];
  sdaiBooks      = [];
  previousBooks  = [];
  ['regular', 'sdai', 'prev'].forEach(g => {
    receiveStates[g] = {};
    noteValues[g]    = {};
  });

  ['studentIdInput', 'refundAmount', 'deductAmount', 'settlementMemo'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('finalAmount').textContent = '₩0';
  document.getElementById('classChangeSection').style.display = 'none';

  ['textbookSection', 'prevSection', 'sdaiSection', 'summarySection', 'actionBar'].forEach(id => {
    document.getElementById(id).classList.remove('visible');
  });
  document.getElementById('studentCard').classList.remove('visible');
  document.getElementById('textbookCount').textContent = '0';
  document.getElementById('sdaiCount').textContent     = '0';
  document.getElementById('prevCount').textContent     = '0';

  renderTableEmpty('textbookTableBody', 10, '학번을 입력하고 조회하면 교재 내역이 표시됩니다');
  renderTableEmpty('sdaiTableBody',     9,  '시대인재 콘텐츠 내역이 없습니다');
  renderTableEmpty('prevTableBody',     11, '수강변경 전 교재 내역이 없습니다');

  showToast('초기화되었습니다.');
}

// ── 유틸 ───────────────────────────────────────────────────────
function formatMoney(v) {
  return '₩' + Number(v).toLocaleString('ko-KR');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}
