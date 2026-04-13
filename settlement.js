/**
 * settlement.js v2
 * 퇴원생 교재 정산 — 배부여부 체크, 과목별 합계, 시대인재 분리
 */

// ── 상태 ───────────────────────────────────────────────────────
let currentStudent = null;
let regularBooks   = [];   // 일반 교재
let sdaiBooks      = [];   // 시대인재 콘텐츠

// 배부여부 체크 상태 (기본 true)
const receiveStates = { regular: {}, sdai: {} };
const noteValues    = { regular: {}, sdai: {} };

// ── 초기화 ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  document.getElementById('currentDate').textContent =
    now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  document.getElementById('printDate').textContent =
    '출력일: ' + now.toLocaleString('ko-KR');

  const saved = localStorage.getItem('academyScriptUrl');
  if (saved) {
    document.getElementById('scriptUrl').value = saved;
  }
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
  if (state === 'connected') { dot.classList.add('connected'); }
  else if (state === 'error') { dot.classList.add('error'); }
  text.textContent = msg || '';
}

async function testConnection() {
  const url = getScriptUrl();
  if (!url) return showToast('Apps Script URL을 먼저 입력해주세요.');
  updateConnStatus('idle', '연결 중...');
  try {
    const res = await callScript({ action: 'ping' });
    if (res && res.pong) updateConnStatus('connected', '구글 시트 연결 성공 ✓');
    else updateConnStatus('connected', '응답 수신 완료');
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
    // 1. 학생 정보
    const studentRes = await callScript({ action: 'getStudent', studentId });
    if (!studentRes.success) return showToast(studentRes.error || '학생을 찾을 수 없습니다.');

    currentStudent = studentRes.student;
    renderStudentCard(currentStudent);

    // 2. 수강변경내역
    const changeRes = await callScript({ action: 'getClassChanges', studentId });
    renderClassChanges(changeRes.changes || []);

    // 3. 교재 내역
    const cols = CONFIG.STUDENT_COLS;

    // 수강반 (관+반 매칭 필요)
    const mainClasses = [currentStudent[cols.CLASS]]
      .filter(v => v && String(v).trim() !== '' && String(v).trim() !== '-');

    // 탐구반 (반 이름만 매칭)
    const tanguClasses = [
      currentStudent[cols.탐구1],
      currentStudent[cols.탐구2],
      currentStudent[cols.탐구1_1],
      currentStudent[cols.탐구2_1],
    ].filter(v => v && String(v).trim() !== '' && String(v).trim() !== '-');
    
    const building = currentStudent[cols.BUILDING] || '';
    
    const tbRes = await callScript({
      action:       'getTextbooks',
      mainClasses:  JSON.stringify(mainClasses),   // ← 분리
      tanguClasses: JSON.stringify(tanguClasses),  // ← 분리
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

    // 배부여부 초기값 세팅 (전부 true)
    resetReceiveStates();

    renderTextbookTable('textbookTableBody', regularBooks, 'regular', 10);
    renderTextbookTable('sdaiTableBody',     sdaiBooks,    'sdai',    9, true);

    document.getElementById('textbookCount').textContent = regularBooks.length;
    document.getElementById('sdaiCount').textContent     = sdaiBooks.length;

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

// ── 배부여부 초기화 ────────────────────────────────────────────
function resetReceiveStates() {
  receiveStates.regular = {};
  receiveStates.sdai    = {};
  noteValues.regular    = {};
  noteValues.sdai       = {};
  regularBooks.forEach((_, i) => { receiveStates.regular[i] = true; });
  sdaiBooks.forEach((_, i)    => { receiveStates.sdai[i]    = true; });
}

// ── 학생 카드 ──────────────────────────────────────────────────
function renderStudentCard(student) {
  const cols   = CONFIG.STUDENT_COLS;
  const labels = CONFIG.LABELS;

  document.getElementById('studentName').textContent = student[cols.NAME] || '이름 없음';

  // 재원여부 뱃지
  const statusBadge = document.getElementById('statusBadge');
  const status = String(student[cols.STATUS] || '').trim();
  if (status) {
    const isActive = status === '재원' || status === 'Y' || status === 'TRUE' || status === '1';
    statusBadge.innerHTML = `<span class="card-status ${isActive ? 'active' : 'coming'}">${status}</span>`;
  }

  const fields = [
    { label: '학번',       value: student[cols.ID] },
    { label: '학생ID',     value: student[cols.STUDENT_ID] },
    { label: '좌석번호',   value: student[cols.SEAT] },
    { label: labels['반'] || '수강반',     value: student[cols.CLASS] },
    { label: labels['탐구1'] || '탐구1반', value: student[cols.탐구1] },
    { label: labels['탐구2'] || '탐구2반', value: student[cols.탐구2] },
    { label: labels['탐구1-1'] || '탐구1-1반', value: student[cols.탐구1_1] },
    { label: labels['탐구2-1'] || '탐구2-1반', value: student[cols.탐구2_1] },
    { label: '입학일',     value: student[cols.ENROLL_DATE] },
    { label: '퇴원일',     value: student[cols.LEAVE_DATE]  },
    { label: '학부모연락처', value: student[cols.PARENT_TEL] },
    { label: '학생연락처', value: student[cols.STUDENT_TEL] },
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

  if (!changes || changes.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  tbody.innerHTML = changes.map(c => `
    <tr>
      <td class="date-cell">${c[cc.APPLY_DATE] || '-'}</td>
      <td>${c[cc.FROM_SUBJECT] || '-'}</td>
      <td><strong>${c[cc.TO_SUBJECT] || '-'}</strong></td>
      <td>
        <span class="card-status ${c[cc.REFLECTED] === 'Y' || c[cc.REFLECTED] === '반영' ? 'active' : 'coming'}">
          ${c[cc.REFLECTED] || '-'}
        </span>
      </td>
    </tr>
  `).join('');
}

// ── 교재 테이블 렌더링 ─────────────────────────────────────────
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

function renderTextbookTable(tbodyId, books, group, colspan, isSdai = false) {
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
      <td class="code-cell">${book[tc.CODE]    || '-'}</td>
      <td><strong>${book[tc.NAME]    || '-'}</strong></td>
      <td>${book[tc.SUBJECT] || '-'}</td>
      <td>${book[tc.CLASS]   || '-'}</td>
      ${!isSdai ? `<td>${book[tc.TEACHER] || '-'}</td>` : ''}
      <td class="price-cell" style="text-align:right;">${price.toLocaleString()}원</td>
      <td>
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
function renderSummary() {
  const tc = CONFIG.TEXTBOOK_COLS;

  // 과목별 합계 계산 (regular + sdai 통합, 체크된 것만)
  const subjectMap = {};
  let totalAmount = 0;
  let sdaiAmount  = 0;
  let totalCount  = 0;

  regularBooks.forEach((book, idx) => {
    if (!receiveStates.regular[idx]) return;
    const price   = Number(book[tc.PRICE]) || 0;
    const subject = String(book[tc.SUBJECT] || '기타').trim();
    subjectMap[subject] = (subjectMap[subject] || 0) + price;
    totalAmount += price;
    totalCount++;
  });

  sdaiBooks.forEach((book, idx) => {
    if (!receiveStates.sdai[idx]) return;
    const price   = Number(book[tc.PRICE]) || 0;
    const subject = String(book[tc.SUBJECT] || '기타').trim();
    const key     = subject + ' (시대인재)';
    subjectMap[key] = (subjectMap[key] || 0) + price;
    sdaiAmount  += price;
    totalAmount += price;
    totalCount++;
  });

  // 과목별 합계 렌더
  const subjectHtml = Object.entries(subjectMap)
    .sort((a, b) => b[1] - a[1])
    .map(([subject, amount]) => `
      <div class="summary-row">
        <span class="summary-label">${subject}</span>
        <span class="summary-value">${formatMoney(amount)}</span>
      </div>
    `).join('');

  document.getElementById('subjectSummary').innerHTML =
    subjectHtml || '<div class="summary-row"><span class="summary-label" style="color:#aaa;">내역 없음</span></div>';

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
  document.getElementById('textbookSection').classList.add('visible');
  document.getElementById('sdaiSection').classList.add('visible');
  document.getElementById('summarySection').classList.add('visible');
  document.getElementById('actionBar').classList.add('visible');
}

// ── 초기화 ─────────────────────────────────────────────────────
function resetAll() {
  if (!confirm('모든 데이터를 초기화하시겠습니까?')) return;

  currentStudent = null;
  regularBooks   = [];
  sdaiBooks      = [];
  Object.keys(receiveStates.regular).forEach(k => delete receiveStates.regular[k]);
  Object.keys(receiveStates.sdai).forEach(k    => delete receiveStates.sdai[k]);
  Object.keys(noteValues.regular).forEach(k    => delete noteValues.regular[k]);
  Object.keys(noteValues.sdai).forEach(k       => delete noteValues.sdai[k]);

  document.getElementById('studentIdInput').value = '';
  document.getElementById('refundAmount').value   = '';
  document.getElementById('deductAmount').value   = '';
  document.getElementById('settlementMemo').value = '';
  document.getElementById('finalAmount').textContent = '₩0';

  document.getElementById('studentCard').classList.remove('visible');
  document.getElementById('textbookSection').classList.remove('visible');
  document.getElementById('sdaiSection').classList.remove('visible');
  document.getElementById('summarySection').classList.remove('visible');
  document.getElementById('actionBar').classList.remove('visible');
  document.getElementById('classChangeSection').style.display = 'none';

  document.getElementById('textbookCount').textContent = '0';
  document.getElementById('sdaiCount').textContent     = '0';

  renderTableEmpty('textbookTableBody', 10, '학번을 입력하고 조회하면 교재 내역이 표시됩니다');
  renderTableEmpty('sdaiTableBody',     9,  '시대인재 콘텐츠 내역이 없습니다');

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
