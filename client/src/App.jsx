import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import * as faceapi from '@vladmandic/face-api';
import * as XLSX from 'xlsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Award,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Camera,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  CloudSun,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  FileClock,
  Info,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  RefreshCw,
  ShieldCheck,
  Search,
  Smartphone,
  Settings,
  Store,
  Sun,
  Moon,
  Trash2,
  UserMinus,
  UserPlus,
  UserCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';

const configuredApiUrl = import.meta.env.VITE_API_URL;
const apiUrl = configuredApiUrl || (import.meta.env.PROD ? '/api' : `http://${window.location.hostname}:5000/api`);

function getVietnamDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isAttendanceForToday(record) {
  const attendanceDate = record?.attendance_date;
  const dateKey = attendanceDate instanceof Date
    ? getVietnamDateString(attendanceDate)
    : String(attendanceDate || '').slice(0, 10);
  return dateKey === getVietnamDateString();
}

function formatShiftName(shift) {
  const standardNames = {
    MORNING: 'Ca Sáng',
    AFTERNOON: 'Ca Chiều',
    EVENING: 'Ca Tối',
    FLEXIBLE: 'Không theo ca',
  };
  return standardNames[shift?.code || shift?.id || shift?.name] || shift?.name || 'Ca làm việc';
}

if (import.meta.env.PROD && !configuredApiUrl) {
  console.warn('VITE_API_URL không được cung cấp, sử dụng relative path /api cho production.');
}

function timeToSeconds(value) {
  const [hours = 0, minutes = 0, seconds = 0] = String(value || '').split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function getVietnamSeconds(date) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return timeToSeconds(time);
}

function getAttendanceRecords(attendanceRecord) {
  if (Array.isArray(attendanceRecord?.records)) return attendanceRecord.records;
  return attendanceRecord?.shift_code || attendanceRecord?.check_in ? [attendanceRecord] : [];
}

function normalizeShiftSettings(value) {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(value?.allShifts)
      ? value.allShifts
      : Array.isArray(value?.shifts)
        ? value.shifts
        : [];
  const allShifts = rows.map((shift) => {
    const activeValue = shift.isActive ?? shift.is_active;
    return {
      ...shift,
      code: shift.code || shift.id,
      start: shift.start || shift.start_time,
      end: shift.end || shift.end_time,
      isActive: activeValue === true
        || activeValue === 1
        || activeValue === '1'
        || String(activeValue).toLowerCase() === 'true',
    };
  });
  return {
    allShifts,
    shifts: allShifts.filter((shift) => shift.isActive),
  };
}

function mergeConfiguredShiftTimes(attendanceShiftData, configuredShiftRows) {
  const configuredShifts = normalizeShiftSettings(configuredShiftRows).allShifts;
  const configuredByCode = new Map(configuredShifts.map((shift) => [shift.code, shift]));
  const attendanceShifts = attendanceShiftData?.allShifts || attendanceShiftData?.shifts || [];
  const allShifts = attendanceShifts.map((shift) => {
    const configuredShift = configuredByCode.get(shift.code || shift.id);
    if (!configuredShift) return shift;
    return {
      ...shift,
      name: configuredShift.name || shift.name,
      start: configuredShift.start,
      end: configuredShift.end,
      isActive: configuredShift.isActive,
    };
  });

  return {
    ...attendanceShiftData,
    allShifts,
    shifts: allShifts.filter((shift) => shift.isActive),
  };
}

function mergeAttendanceRecords(currentRecord, nextRecord) {
  const existing = getAttendanceRecords(currentRecord);
  const previous = existing.find((record) => record.shift_code === nextRecord.shift_code);
  const updated = { ...previous, ...nextRecord };
  const records = [
    ...existing.filter((record) => record.shift_code !== nextRecord.shift_code),
    updated,
  ];
  return { ...(currentRecord || {}), ...updated, records };
}

function useAttendanceWindow(shiftSettings, attendanceRecord) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const allShifts = [...(shiftSettings?.allShifts || shiftSettings?.shifts || [])]
    .filter((shift) => shift.isActive !== false)
    .sort((left, right) => timeToSeconds(left.start) - timeToSeconds(right.start));
  const records = getAttendanceRecords(attendanceRecord);
  const now = getVietnamSeconds(currentTime);
  const getRecord = (shift) => records.find((record) => record.shift_code === shift.code) || null;
  const allCompleted = allShifts.length > 0 && allShifts.every((shift) => {
    const record = getRecord(shift);
    return Boolean(record?.check_in && record?.check_out);
  });

  let state = allCompleted ? 'ALL_COMPLETED' : 'NO_SHIFTS';
  let actionShift = null;
  let action = null;
  let selectedRecord = null;
  for (let index = 0; index < allShifts.length && !allCompleted; index += 1) {
    const shift = allShifts[index];
    const start = timeToSeconds(shift.start);
    const end = timeToSeconds(shift.end);
    const nextStart = allShifts[index + 1] ? timeToSeconds(allShifts[index + 1].start) : 24 * 60 * 60;
    const checkoutOpens = Math.max(start, end - 5 * 60);
    const record = getRecord(shift);

    if (record?.check_in && record?.check_out) continue;
    if (record?.check_in) {
      if (now >= nextStart) {
        state = 'CHECKOUT_EXPIRED';
        actionShift = shift;
        selectedRecord = record;
      } else if (now >= checkoutOpens) {
        state = 'CHECK_OUT';
        actionShift = shift;
        selectedRecord = record;
        action = 'CHECK_OUT';
      } else {
        state = 'WAIT_CHECKOUT';
        actionShift = shift;
        selectedRecord = record;
      }
      break;
    }

    if (now < start) {
      state = 'UPCOMING';
      actionShift = shift;
      break;
    }
    if (now <= start + 2 * 60 * 60) {
      state = 'CHECK_IN';
      actionShift = shift;
      action = 'CHECK_IN';
      break;
    }
    if (now < nextStart) {
      state = 'CHECKIN_EXPIRED';
      actionShift = shift;
      break;
    }
  }

  const statusLabel = state === 'ALL_COMPLETED'
    ? 'Đã hoàn tất hôm nay'
    : state === 'CHECKIN_EXPIRED' || state === 'CHECKOUT_EXPIRED'
      ? `Đã hết thời gian ${state === 'CHECKIN_EXPIRED' ? 'check-in' : 'check-out'}`
    : selectedRecord?.status === 'PENDING'
      ? 'Chờ duyệt'
      : state === 'CHECK_IN'
        ? `Đang mở ${formatShiftName(actionShift)}`
        : state === 'CHECK_OUT' || state === 'WAIT_CHECKOUT'
          ? 'Chờ check-out'
          : state === 'NO_SHIFTS'
            ? 'Chưa có ca làm việc'
              : `Chưa đến giờ ${formatShiftName(actionShift)}`;
  return {
    activeShift: state === 'CHECK_IN' ? actionShift : null,
    actionShift,
    action,
    canAttend: action !== null,
    state,
    statusLabel,
    allCompleted,
    records,
    selectedRecord,
    currentTime,
  };
}

function WorkShiftSchedule({ shiftSettings, attendanceWindow, attendancePage = false }) {
  const shifts = (shiftSettings?.allShifts || shiftSettings?.shifts || [])
    .filter((shift) => shift.isActive !== false);
  const recordsByShift = new Map((attendanceWindow.records || []).map((record) => [record.shift_code, record]));

  return (
    <div className={`work-shift-schedule${attendancePage ? ' attendance-shift-schedule' : ''}`}>
      <h4>Ca làm việc hôm nay</h4>
      <div className="work-shift-list">
        {shifts.length ? shifts.map((shift) => {
          const record = recordsByShift.get(shift.code);
          const shiftIcon = shift.code === 'MORNING' ? '☀️' : shift.code === 'AFTERNOON' ? '🌤️' : '🌙';
          const badgeClass = shift.code === 'MORNING' ? 'morning' : shift.code === 'AFTERNOON' ? 'afternoon' : 'evening';
          const status = record?.check_in && record?.check_out
            ? { label: 'Đã hoàn thành', className: 'completed', completed: true }
            : record?.check_in
              ? { label: 'Chờ duyệt', className: 'pending' }
              : attendanceWindow.actionShift?.code === shift.code
                ? { label: 'Đang chọn', className: 'selected' }
                : null;

          return (
            <div className="work-shift-row" key={shift.code}>
              {attendancePage ? (
                <span className={`attendance-shift-name ${badgeClass}`}>{shiftIcon} {formatShiftName(shift)}</span>
              ) : (
                <strong>{formatShiftName(shift)}</strong>
              )}
              <div className="work-shift-details">
                {attendancePage && status?.completed ? (
                  <small className={status.className}>✓ Đã hoàn thành</small>
                ) : (
                  <>
                    <span>{formatDisplayTime(shift.start)} – {formatDisplayTime(shift.end)}</span>
                    {status && <small className={status.className}>{status.label}</small>}
                  </>
                )}
              </div>
            </div>
          );
        }) : (
          <p>{shiftSettings ? 'Chưa có ca làm việc được bật.' : 'Đang tải ca làm việc...'}</p>
        )}
      </div>
    </div>
  );
}

function ShiftAttendanceControl({ attendanceWindow, onAttend, showShiftName = true, dailyAttendance = false }) {
  const shiftName = formatShiftName(attendanceWindow.actionShift);
  if (attendanceWindow.state === 'ALL_COMPLETED') {
    return <div className="completed-badge">✓ Chấm công hôm nay đã hoàn tất</div>;
  }
  if (attendanceWindow.state === 'CHECK_IN') {
    return (
      <button className="checkout-button face-action" onClick={onAttend}>
        <Camera size={17} /> QUÉT KHUÔN MẶT CHECK-IN{showShiftName ? ` - ${shiftName}` : ''} <ArrowRight size={15} />
      </button>
    );
  }
  if (attendanceWindow.state === 'CHECK_OUT') {
    return (
      <button className="checkout-button face-action is-checkout" onClick={onAttend}>
        <Camera size={17} /> QUÉT KHUÔN MẶT CHECK-OUT{showShiftName ? ` - ${shiftName}` : ''} <ArrowRight size={15} />
      </button>
    );
  }
  if (attendanceWindow.state === 'WAIT_CHECKOUT') {
    const checkoutOpens = Math.max(
      timeToSeconds(attendanceWindow.actionShift.start),
      timeToSeconds(attendanceWindow.actionShift.end) - 5 * 60,
    );
    const opensAt = `${String(Math.floor(checkoutOpens / 3600)).padStart(2, '0')}:${String(Math.floor((checkoutOpens % 3600) / 60)).padStart(2, '0')}`;
    if (dailyAttendance) {
      return (
        <button type="button" className="checkout-button attendance-checkout-locked" disabled>
          <LockKeyhole size={16} />
          <span>Check-out trước 5 phút trước khi hết ca (Mở lúc {opensAt})</span>
        </button>
      );
    }
    return (
      <div className="shift-action-message">
        <strong>Chờ duyệt</strong>
        <span>Check-out trước 5 phút trước khi hết ca (Mở lúc {opensAt})</span>
      </div>
    );
  }
  if (attendanceWindow.state === 'CHECKIN_EXPIRED') {
    return <div className="shift-action-message">Đã hết thời gian check-in của {shiftName}</div>;
  }
  if (attendanceWindow.state === 'CHECKOUT_EXPIRED') {
    return <div className="shift-action-message">Đã hết thời gian check-out của {shiftName}</div>;
  }
  if (attendanceWindow.state === 'UPCOMING') {
    return <div className="shift-action-message">Chưa đến giờ làm việc của ca tiếp theo ({shiftName} mở lúc {formatDisplayTime(attendanceWindow.actionShift.start)})</div>;
  }
  return <div className="shift-action-message">Chưa có ca làm việc được bật.</div>;
}

function isSecureCameraContext() {
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

const adminNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Chấm công', icon: CalendarCheck },
  { label: 'Khuôn mặt', icon: Camera },
  { label: 'Lịch sử', icon: FileClock },
  { label: 'Quản lý sinh viên', icon: UsersRound },
  { label: 'Quản lý ca làm', icon: Clock3 },
  { label: 'Hồ sơ', icon: UserRound },
];
const userNavItems = [
  { label: 'Chấm công', icon: CalendarCheck },
  { label: 'Khuôn mặt', icon: Camera },
  { label: 'Lịch sử cá nhân', icon: FileClock },
  { label: 'Hồ sơ', icon: UserRound },
];

// Dashboard data sẽ được fetch từ API /admin/dashboard-stats.
const PHOTO_MAX_BYTES = 15 * 1024;

const IMPORT_SHIFTS = {
  Sáng: { code: 'MORNING', start: '07:30:00', end: '12:00:00' },
  Chiều: { code: 'AFTERNOON', start: '13:30:00', end: '17:30:00' },
  Tối: { code: 'EVENING', start: '18:00:00', end: '20:00:00' },
};

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function parseExcelDate(value) {
  const str = String(value || '').trim();
  const match = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!match) return null;
  const year = match[3] || String(new Date().getFullYear());
  const num1 = parseInt(match[1], 10);
  const num2 = parseInt(match[2], 10);

  let day;
  let month;
  if (num1 > 12) {
    // num1 là ngày (vd: 14/09, 17/08, 24/09)
    day = num1;
    month = num2;
  } else if (num2 > 12) {
    // num2 là ngày (vd: 09/14, 09/17, 09/24)
    day = num2;
    month = num1;
  } else {
    // Cả 2 đều <= 12 (vd: 07/09, 10/09, 11/09, 12/09 hoặc 09/10, 09/11, 09/12)
    // Ưu tiên tháng 9 (đợt công tác tháng 9)
    if (num2 === 9) {
      day = num1;
      month = 9;
    } else if (num1 === 9) {
      day = num2;
      month = 9;
    } else {
      // Mặc định định dạng Việt Nam DD/MM
      day = num1;
      month = num2;
    }
  }

  // Toàn bộ dữ liệu đợt này là tháng 9 (chuẩn hóa các cột ghi nhầm tháng 8 về tháng 9)
  if (month === 8) {
    month = 9;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseAttendanceWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: false });
  const datePattern = /^\d{1,2}\/\d{1,2}(?:\/\d{4})?$/;
  const dateRowIndex = rows.findIndex((row) => row.some((cell) => datePattern.test(String(cell).trim())));
  if (dateRowIndex < 0) throw new Error('Không tìm thấy dòng tiêu đề ngày tháng trong file Excel.');
  const headerRows = rows.slice(Math.max(0, dateRowIndex - 3), dateRowIndex + 2);
  const findColumn = (patterns, fallback) => {
    for (const row of headerRows) {
      const index = row.findIndex((cell) => patterns.some((pattern) => pattern.test(String(cell))));
      if (index >= 0) return index;
    }
    return fallback;
  };
  const nameColumn = findColumn([/họ\s*&?\s*tên/i, /họ và tên/i], 1);
  const mssvColumn = findColumn([/mssv/i, /mã\s*sinh\s*viên/i, /mã\s*sv/i], 2);
  const emailColumn = findColumn([/e[\s-]?mail/i, /địa chỉ thư điện tử/i], -1);
  const phoneColumn = findColumn([/sđt/i, /điện thoại/i, /phone/i], 4);
  const totalColumn = findColumn([/^\s*total\s*$/i, /tổng\s*(?:ngày\s*)?công/i, /work\s*days/i], -1);
  const totalHoursColumn = findColumn([/tổng\s*giờ/i, /số\s*giờ/i], -1);

  const dates = [];
  let currentDate = null;
  rows[dateRowIndex].forEach((cell, column) => {
    const parsed = parseExcelDate(cell);
    if (parsed) currentDate = parsed;
    dates[column] = currentDate;
  });
  const shifts = rows[dateRowIndex + 1] || [];
  const members = new Map();
  const records = [];
  for (let rowIndex = dateRowIndex + 2; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const combined = row.map((cell) => String(cell).trim()).join(' ');
    if (!combined || /BẢNG TỔNG HỢP NGÀY CÔNG/i.test(combined)) break;
    const userName = cleanName(row[nameColumn]);
    if (!userName || /^stt$/i.test(userName) || /^tổng$/i.test(userName)) continue;
    const userMSSV = String(row[mssvColumn] || '').trim();
    const email = emailColumn >= 0 ? String(row[emailColumn] || '').trim().toLowerCase() : '';
    
    const summary = {
      userName,
      userMSSV,
      email,
      phone: cleanName(row[phoneColumn]),
      totalWorkDays: totalColumn >= 0 && String(row[totalColumn] || '').trim()
        ? Number(String(row[totalColumn]).replace(',', '.'))
        : null,
      totalHours: totalHoursColumn >= 0 ? (Number(String(row[totalHoursColumn] || '0').replace(',', '.')) || 0) : 0,
      shifts: 0
    };

    for (let column = 0; column < row.length; column += 1) {
      const shiftName = String(shifts[column] || '').trim();
      const shift = IMPORT_SHIFTS[shiftName];
      if (!dates[column] || !shift || !/^x$/i.test(String(row[column]).trim())) continue;
      summary.shifts += 1;
      records.push({ userName, userMSSV, email, date: dates[column], shiftCode: shift.code, totalHours: (new Date(`1970-01-01T${shift.end}`) - new Date(`1970-01-01T${shift.start}`)) / 3600000 });
    }
    if (summary.totalWorkDays === null || !Number.isFinite(summary.totalWorkDays)) {
      summary.totalWorkDays = summary.shifts;
    }
    members.set(`${userMSSV}|${userName.toLowerCase()}`, summary);
  }
  return { members: [...members.values()], records: records.map((record) => ({ ...record, totalWorkDays: members.get(`${record.userMSSV}|${record.userName.toLowerCase()}`)?.totalWorkDays || 0 })) };
}

async function compressWebcamFrame(video) {
  const canvas = document.createElement('canvas');
  const maxWidth = 320;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

async function replaceFaceEmbedding(user, embeddings) {
  const token = localStorage.getItem('attendance_token');
  const response = await fetch(`${apiUrl}/face/register/replace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ embedding: embeddings[0], embeddings }),
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.message || 'Không thể đăng ký lại khuôn mặt.');
  }
  const updatedUser = { ...user, faceRegistered: true };
  Object.assign(user, updatedUser);
  localStorage.setItem('attendance_user', JSON.stringify(updatedUser));
  return body;
}

async function requestFaceRegistration(embeddings, image) {
  const token = localStorage.getItem('attendance_token');
  const response = await fetch(`${apiUrl}/face/register/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ embedding: embeddings[0], embeddings, image }),
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.message || 'Không thể gửi yêu cầu đăng ký lại khuôn mặt.');
  }
  return body;
}

async function submitAttendance(user, action, embeddings, imageData, shiftCode) {
  if (action === 'CHECK_IN' && !user.faceRegistered && user.role === 'ADMIN') {
    await replaceFaceEmbedding(user, embeddings);
  }

  const token = localStorage.getItem('attendance_token');
  const request = () => fetch(`${apiUrl}/attendance/${action === 'CHECK_OUT' ? 'check-out' : 'check-in'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      embedding: embeddings[0],
      embeddings,
      imageData,
      image: imageData,
      check_in_image: imageData,
      shift: shiftCode,
    }),
  });

  let response = await request();
  let body = await response.json();
  if (!response.ok || !body.success) {
    throw Object.assign(new Error(body.message || 'Không thể ghi nhận chấm công.'), { code: body.errorCode });
  }
  return body;
}

function formatDisplayTime(timeStr) {
  if (!timeStr) return '--:--';
  const str = String(timeStr);
  if (str.length >= 16 && (str.includes('T') || str.includes(' '))) {
    return str.slice(11, 16);
  }
  return str.slice(0, 5);
}
function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('attendance_user');
      return stored && stored !== 'undefined' ? JSON.parse(stored) : null;
    } catch (err) {
      console.error('Lỗi phân tích dữ liệu user từ localStorage:', err);
      localStorage.removeItem('attendance_user');
      localStorage.removeItem('attendance_token');
      return null;
    }
  });
  const [page, setPage] = useState(() => user?.role === 'USER' ? 'Chấm công' : 'Dashboard');
  const [showLogin, setShowLogin] = useState(!user);
  const [showForgot, setShowForgot] = useState(false);

  function logout() {
    localStorage.removeItem('attendance_token');
    localStorage.removeItem('attendance_user');
    setUser(null);
    setShowLogin(true);
    setPage('Dashboard');
  }

  if (!user || showLogin) {
    return (
      <LoginScreen
        onLogin={(loggedInUser) => {
          setUser(loggedInUser);
          setShowLogin(false);
          setPage(loggedInUser.role === 'ADMIN' ? 'Dashboard' : 'Chấm công');
        }}
      />
    );
  }

  return (
    <DashboardShell
      user={user}
      page={page}
      onNavigate={setPage}
      onLogout={logout}
      onUserUpdated={(updatedUser) => {
        setUser(updatedUser);
        localStorage.setItem('attendance_user', JSON.stringify(updatedUser));
      }}
    />
  );
}

function LoginScreen({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [modalType, setModalType] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username, password: form.password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.message || 'Đăng nhập thất bại.');
      localStorage.setItem('attendance_token', body.data.token);
      localStorage.setItem('attendance_user', JSON.stringify(body.data.user));
      onLogin(body.data.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <motion.section className="login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="login-form-panel">
          <div className="form-heading"><h2>ĐĂNG NHẬP HỆ THỐNG</h2></div>
          <form onSubmit={submit}>
            <input
              className="login-input"
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              placeholder="Tên đăng nhập"
              aria-label="Tên đăng nhập"
              required
            />
            <div className="password-field">
              <input
                className="login-input"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="Mật khẩu"
                aria-label="Mật khẩu"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && <div className="form-error">{error}</div>}
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? 'ĐANG XỬ LÝ...' : 'ĐĂNG NHẬP'}
            </button>
          </form>

          <div className="auth-links flex justify-between items-center mt-4 text-sm">
            <button type="button" onClick={() => setModalType('FORGOT_PASSWORD')} className="text-red-600 hover:underline">
              Quên mật khẩu?
            </button>
            <button type="button" onClick={() => setModalType('REGISTER')} className="text-teal-700 hover:underline font-medium">
              Tạo tài khoản mới
            </button>
          </div>
        </div>
      </motion.section>

      <AnimatePresence>
        {modalType === 'REGISTER' && (
          <RegisterModal
            onClose={() => setModalType(null)}
            onSuccess={(registeredUser) => {
              setModalType(null);
              onLogin(registeredUser);
            }}
          />
        )}
        {modalType === 'FORGOT_PASSWORD' && (
          <ForgotPasswordModal
            onClose={() => setModalType(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function DashboardShell({ user, page, onNavigate, onLogout, onUserUpdated }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const navItems = user.role === 'USER' ? userNavItems : adminNavItems;
  function scrollToTop() {
    setMobileMenu(false);
    const mainContainer = document.querySelector('.dashboard-main');
    if (mainContainer) {
      mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function goToHome() {
    onNavigate(user.role === 'USER' ? 'Chấm công' : 'Dashboard');
    scrollToTop();
  }
  return (
    <div className="dashboard-app">
      {mobileMenu && <button className="sidebar-backdrop" aria-label="Đóng menu" onClick={() => setMobileMenu(false)} />}
      <aside className={mobileMenu ? 'sidebar sidebar-open' : 'sidebar'}>
        <div className="sidebar-brand" role="button" tabIndex="0" aria-label="Về trang chủ" onClick={goToHome} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); goToHome(); } }}><span className="brand-square">A</span><div><strong>ATTENDLY</strong><small>Attendance system</small></div><button className="close-menu" aria-label="Đóng menu" onClick={(event) => { event.stopPropagation(); setMobileMenu(false); }}><X size={18} /></button></div>
        <span className="sidebar-caption">WORKSPACE</span>
        <nav>{navItems.map(({ label, icon: Icon }) => <button key={label} className={page === label ? 'sidebar-link active' : 'sidebar-link'} onClick={() => { onNavigate(label); setMobileMenu(false); }}><Icon size={18} />{label}</button>)}</nav>
        <div className="sidebar-bottom"><div className="account-card"><div className="user-avatar">{user.fullName?.charAt(0) || 'U'}</div><div><strong>{user.fullName || user.username}</strong><small>{user.role === 'ADMIN' ? 'Quản trị viên' : 'Người dùng'}</small></div></div><button className="sidebar-link logout-link" onClick={onLogout}><LogOut size={18} />Đăng xuất</button></div>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-header"><button className="mobile-menu-button" aria-label="Mở menu" onClick={() => setMobileMenu(true)}><Menu size={22} /></button><div className="header-title-link" role="button" tabIndex="0" aria-label="Về trang chủ" onClick={goToHome} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); goToHome(); } }}><h1>{page}</h1></div><div className="header-user"><NotificationCenter /><ProfileMenu user={user} onNavigate={onNavigate} onLogout={onLogout} /></div></header>
        <AnimatePresence mode="wait"><motion.div key={page} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}><PageContent page={page} user={user} onUserUpdated={onUserUpdated} /></motion.div></AnimatePresence>
      </main>
    </div>
  );
}

function ProfileMenu({ user, onNavigate, onLogout }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const initials = (user.fullName || user.username || 'U').charAt(0).toUpperCase();

  useEffect(() => {
    function closeOnOutside(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, []);

  function navigateTo(target) {
    setOpen(false);
    onNavigate(target);
  }

  return <div className="profile-menu-wrap" ref={menuRef}>
    <button className={`profile-trigger ${open ? 'open' : ''}`} type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
      <span className="profile-name">{user.fullName || user.username}</span>
      <span className="user-avatar">{initials}</span>
      <ChevronDown className="profile-chevron" size={17} />
    </button>
    <div className={`profile-dropdown ${open ? 'visible' : ''}`} role="menu">
      <button type="button" onClick={() => navigateTo('Hồ sơ')}><UserRound size={16} />Thông tin cá nhân</button>
      <button type="button" onClick={() => navigateTo('Hồ sơ')}><LockKeyhole size={16} />Đổi mật khẩu</button>
      <button className="profile-logout" type="button" onClick={onLogout}><LogOut size={16} />Đăng xuất</button>
    </div>
  </div>;
}

function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationRef = useRef(null);
  async function loadNotifications() {
    const token = localStorage.getItem('attendance_token');
    const response = await fetch(`${apiUrl}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const body = await response.json().catch(() => ({}));
    setNotifications(body.data || []);
    setUnreadCount(body.unreadCount || 0);
  }
  useEffect(() => {
    loadNotifications().catch(() => {});
    const timer = window.setInterval(() => loadNotifications().catch(() => {}), 30000);
    function closeOnOutside(event) {
      if (!notificationRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('mousedown', closeOnOutside);
    };
  }, []);
  async function markRead(id) {
    const token = localStorage.getItem('attendance_token');
    await fetch(`${apiUrl}/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, is_read: 1 } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
  }
  async function markAllRead() {
    const token = localStorage.getItem('attendance_token');
    await fetch(`${apiUrl}/notifications/read-all`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
    setNotifications((items) => items.map((item) => ({ ...item, is_read: 1 })));
    setUnreadCount(0);
  }
  return <div className="notification-center" ref={notificationRef}><button className="notification-trigger" aria-label="Thông báo" onClick={() => setOpen((value) => !value)}><Bell size={19} />{unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>{open && <><button className="notification-backdrop" aria-label="Đóng thông báo" onClick={() => setOpen(false)} /><div className="notification-popover"><div className="notification-heading"><strong>Thông báo</strong><button onClick={markAllRead}><CheckCheck size={14} /> Đánh dấu tất cả đã đọc</button></div><div className="notification-list">{notifications.length ? notifications.map((item) => <button key={item.id} className={`notification-item ${item.is_read ? 'read' : 'unread'}`} onClick={() => !item.is_read && markRead(item.id)}><span className={`notification-type ${item.type.toLowerCase()}`}>●</span><span><strong>{item.title}</strong><small>{item.message}</small><em>{formatNotificationTime(item.created_at)}</em></span></button>) : <div className="notification-empty">Chưa có thông báo.</div>}</div></div></>}</div>;
}

function formatNotificationTime(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function PageContent({ page, user, onUserUpdated }) {
  if (page === 'Khuôn mặt') return <FaceRegistrationPage user={user} onUserUpdated={onUserUpdated} />;
  if (user.role === 'USER') {
    if (page === 'Lịch sử cá nhân') return <AttendanceHistory user={user} />;
    if (page === 'Hồ sơ') return <UserProfile user={user} onUserUpdated={onUserUpdated} />;
    return <UserPortal user={user} />;
  }
  if (page === 'Quản lý sinh viên') return <StudentManagement />;
  if (page === 'Quản lý ca làm') return <ShiftManagement />;
  if (page === 'Chấm công') return <AdminAttendanceWorkArea user={user} />;
  if (page === 'Lịch sử') return <AttendanceHistory user={user} />;
  if (page === 'Hồ sơ') return <UserProfile user={user} onUserUpdated={onUserUpdated} />;
  if (page !== 'Dashboard') return <section className="placeholder-page"><div className="placeholder-icon"><FileClock size={28} /></div><span className="section-label">AUTHORIZED AREA</span><h2>{page}</h2><p>Chức năng này đã được bảo vệ bằng JWT và vai trò <strong>{user.role}</strong>. Nội dung nghiệp vụ sẽ được triển khai ở phase tiếp theo.</p></section>;
  return <AdminDashboard user={user} />;
}

function AdminAttendanceWorkArea({ user }) {
  const [shiftData, setShiftData] = useState(null);
  const [today, setToday] = useState(null);
  const attendanceWindow = useAttendanceWindow(shiftData, today);
  const [faceModal, setFaceModal] = useState(false);
  const [error, setError] = useState('');
  const checkedIn = attendanceWindow.action === 'CHECK_OUT';
  const canAttend = attendanceWindow.canAttend;

  async function loadAttendance() {
    const token = localStorage.getItem('attendance_token');
    const headers = { Authorization: `Bearer ${token}` };
    const [shiftResponse, todayResponse, historyResponse] = await Promise.all([
      fetch(`${apiUrl}/shifts`, { cache: 'no-store', headers }),
      fetch(`${apiUrl}/attendance/today`, { headers }),
      fetch(`${apiUrl}/attendance/my`, { headers }),
    ]);
    const [shiftBody, todayBody, historyBody] = await Promise.all([shiftResponse.json(), todayResponse.json(), historyResponse.json()]);
    if (!shiftResponse.ok || !todayResponse.ok || !historyResponse.ok) throw new Error('Không thể tải dữ liệu chấm công.');
    if (!shiftBody.success || !Array.isArray(shiftBody.data)) throw new Error(shiftBody.message || 'Không thể tải cấu hình ca làm việc.');
    const current = todayBody.data || null;
    const historyToday = (historyBody.data || []).filter(isAttendanceForToday);
    const recordsByShift = new Map();
    for (const record of [...historyToday, ...getAttendanceRecords(current)]) {
      recordsByShift.set(record.shift_code, {
        ...recordsByShift.get(record.shift_code),
        ...record,
      });
    }
    setShiftData(normalizeShiftSettings(shiftBody.data));
    const records = [...recordsByShift.values()];
    setToday(records.length ? { ...records[0], ...current, records } : current);
  }

  useEffect(() => {
    loadAttendance().catch((requestError) => setError(requestError.message));
    const shiftRefresh = window.setInterval(() => {
      const token = localStorage.getItem('attendance_token');
      fetch(`${apiUrl}/shifts`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
        .then(async (response) => {
          if (!response.ok) throw new Error('Không thể cập nhật trạng thái ca.');
          const body = await response.json();
          if (!body.success || !Array.isArray(body.data)) throw new Error(body.message || 'Cấu hình ca làm việc không hợp lệ.');
          setShiftData(normalizeShiftSettings(body.data));
        })
        .catch((requestError) => setError(requestError.message));
    }, 8000);
    return () => window.clearInterval(shiftRefresh);
  }, []);

  useEffect(() => {
    if (!canAttend) setFaceModal(false);
  }, [canAttend]);

  async function handleFaceSuccess(embeddings, imageData) {
    const action = checkedIn ? 'CHECK_OUT' : 'CHECK_IN';
    const body = await submitAttendance(
      user,
      action,
      embeddings,
      imageData,
      attendanceWindow.actionShift?.code,
    );

    const isLate = Boolean(body.data?.is_late || body.data?.punctuality_status === 'LATE');
    setFaceModal(false);
    setToday((current) => mergeAttendanceRecords(current, {
      ...body.data,
      attendance_date: getVietnamDateString(),
      status: 'PENDING',
      is_late: isLate,
    }));
  }

  const statusLabel = attendanceWindow.statusLabel;
  const statusRecord = attendanceWindow.selectedRecord || today;
  const enabledShifts = (shiftData?.allShifts || shiftData?.shifts || [])
    .filter((shift) => shift.isActive !== false);
  const displayedShift = attendanceWindow.actionShift
    || (attendanceWindow.allCompleted ? enabledShifts[enabledShifts.length - 1] : null);
  const shiftStatus = attendanceWindow.allCompleted
    ? 'Hoàn tất'
    : ['CHECK_IN', 'CHECK_OUT', 'WAIT_CHECKOUT'].includes(attendanceWindow.state)
      ? 'Đang diễn ra'
      : attendanceWindow.state === 'UPCOMING'
        ? 'Sắp diễn ra'
        : 'Đã kết thúc';
  const showNoShiftState = enabledShifts.length === 0 || attendanceWindow.state === 'UPCOMING';

  return <section className="attendance-work-area">
    <div className="attendance-work-heading">
      <h2>Chấm công hàng ngày</h2>
      <span className="live-dot">LIVE</span>
    </div>

    {error && <div className="form-error">{error}</div>}

    <div className="attendance-work-grid">
      <div className="content-panel shift-status-card">
        <div className="panel-heading">
          <div><h3>Trạng thái chấm công</h3><p>Ca làm việc được cấu hình trong ngày.</p></div>
          <UserCheck className="attendance-card-icon" size={21} />
        </div>
        <div className="attendance-status-card">
          <WorkShiftSchedule shiftSettings={shiftData} attendanceWindow={attendanceWindow} attendancePage />
          <div className="attendance-current-status"><span>Trạng thái</span><strong>{statusLabel}</strong></div>
          <div className="attendance-time-row">
            <div>
              <small>Check-in</small>
              <strong>{statusRecord?.check_in ? formatDisplayTime(statusRecord.check_in) : '--:--'}</strong>
              <span className="attendance-photo-note">
                {statusRecord?.check_in_photo_available ? 'Ảnh check-in đã lưu' : 'Chưa có ảnh check-in'}
              </span>
            </div>
            <div>
              <small>Check-out</small>
              <strong>{statusRecord?.check_out ? formatDisplayTime(statusRecord.check_out) : '--:--'}</strong>
              <span className="attendance-photo-note">
                {statusRecord?.check_out_photo_available ? 'Ảnh check-out đã lưu' : 'Chưa có ảnh check-out'}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="content-panel face-action-card">
        <div className="panel-heading"><div><h3>Chấm công theo ca</h3><p>Trạng thái và hành động cập nhật theo giờ thực tế.</p></div><Clock3 className="attendance-card-icon" size={21} /></div>
        {shiftData === null ? (
          <div className="attendance-no-shifts">
            <Info size={30} />
            <strong>Đang tải cấu hình ca làm việc...</strong>
          </div>
        ) : showNoShiftState ? (
          <div className="attendance-no-shifts">
            <Settings className="attendance-no-shifts-settings" size={18} />
            <Info size={30} />
            <strong>
              {enabledShifts.length === 0
                ? 'Chưa có ca làm việc được bật.'
                : `Chưa đến giờ làm việc của ca tiếp theo (${formatShiftName(attendanceWindow.actionShift)} mở lúc ${formatDisplayTime(attendanceWindow.actionShift?.start)}).`}
            </strong>
          </div>
        ) : (
          <div className="attendance-action-content">
            {displayedShift && (
              <div className="attendance-action-shift">
                <div>
                  <h4>{formatShiftName(displayedShift)}</h4>
                  <span className="attendance-action-status">{shiftStatus}</span>
                </div>
                <strong>{formatDisplayTime(displayedShift.start)} – {formatDisplayTime(displayedShift.end)}</strong>
              </div>
            )}
            <ShiftAttendanceControl attendanceWindow={attendanceWindow} onAttend={() => setFaceModal(true)} showShiftName={false} dailyAttendance />
          </div>
        )}
      </div>
    </div>
    {faceModal && <FaceModal checkedIn={checkedIn} faceRegistered={Boolean(user.faceRegistered)} onClose={() => setFaceModal(false)} onSuccess={handleFaceSuccess} onReplaceFace={(embeddings) => replaceFaceEmbedding(user, embeddings)} />}
  </section>;
}

function UserProfile({ user, onUserUpdated }) {
  const [profile, setProfile] = useState({ fullName: user.fullName || '', studentCode: user.studentCode || '', phone: user.phone || '', address: user.address || '', hometownProvinceCode: user.hometownProvinceCode || '', hometownProvinceName: user.hometownProvinceName || '' });
  const [provinces, setProvinces] = useState([]);
  const [message, setMessage] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    fetch('https://provinces.open-api.vn/api/v2/p/')
      .then((response) => {
        if (!response.ok) throw new Error('Không thể tải danh sách tỉnh/thành.');
        return response.json();
      })
      .then((data) => setProvinces(Array.isArray(data) ? data : []))
      .catch(() => setProvinces([]));
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);
    try {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/auth/profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(profile) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể cập nhật hồ sơ.');
      const updatedUser = { ...user, fullName: body.data.full_name, studentCode: body.data.student_code, phone: body.data.phone, address: body.data.address, hometownProvinceCode: body.data.hometown_province_code, hometownProvinceName: body.data.hometown_province_name };
      onUserUpdated(updatedUser);
      setMessage(body.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    if (password.newPassword !== password.confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setChangingPassword(true);
    try {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/auth/password`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ currentPassword: password.currentPassword, newPassword: password.newPassword }) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể đổi mật khẩu.');
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage(body.message);
    } catch (requestError) {
      setPasswordError(requestError.message);
    } finally {
      setChangingPassword(false);
    }
  }

  return <section className="profile-page"><div className="profile-page-heading"><span className="section-label">MY PROFILE</span><h2>Hồ sơ cá nhân</h2><p>Cập nhật thông tin liên hệ hoặc đổi mật khẩu khi cần.</p></div><div className="profile-grid">
    <form className="content-panel profile-form" onSubmit={saveProfile}><div className="panel-heading"><div><h3>Thông tin cá nhân</h3><p>Thông tin này chỉ thuộc tài khoản của bạn.</p></div></div><label>Họ và tên<input value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} required /></label><label>Tên đăng nhập<input value={user.username} disabled /></label><label>MSSV<input value={profile.studentCode} onChange={(event) => setProfile({ ...profile, studentCode: event.target.value })} placeholder="Nhập mã số sinh viên" /></label><label>Số điện thoại<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="Ví dụ: 0912345678" /></label><label>Địa chỉ hiện tại<input value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} placeholder="Số nhà, đường, phường/xã..." /></label><label>Quê quán / Tỉnh, thành<select value={profile.hometownProvinceCode} onChange={(event) => { const selected = provinces.find((province) => String(province.code) === event.target.value); setProfile({ ...profile, hometownProvinceCode: event.target.value, hometownProvinceName: selected?.name || '' }); }}><option value="">Chọn tỉnh/thành</option>{provinces.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}</select></label>{error && <div className="form-error">{error}</div>}{message && <div className="form-success">{message}</div>}<button className="primary-button" type="submit" disabled={saving}>{saving ? 'ĐANG LƯU...' : 'LƯU THÔNG TIN'}</button></form>
    <form className="content-panel profile-form" onSubmit={changePassword}><div className="panel-heading"><div><h3>Đổi mật khẩu</h3><p>{user.role === 'ADMIN' ? 'Admin đang đăng nhập có thể đặt mật khẩu mới mà không cần nhập mật khẩu cũ.' : 'Nếu chưa đổi lần đầu, dùng mật khẩu khởi tạo hiện tại.'}</p></div><LockKeyhole size={20} /></div>{user.role !== 'ADMIN' && <label>Mật khẩu hiện tại<input type="password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} required /></label>}<label>Mật khẩu mới<input type="password" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} minLength={6} required /></label><label>Xác nhận mật khẩu mới<input type="password" value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} minLength={6} required /></label>{passwordError && <div className="form-error">{passwordError}</div>}{passwordMessage && <div className="form-success">{passwordMessage}</div>}<button className="secondary-button profile-password-button" type="submit" disabled={changingPassword}>{changingPassword ? 'ĐANG CẬP NHẬT...' : 'ĐỔI MẬT KHẨU'}</button></form>
  </div></section>;
}

function FaceRegistrationPage({ user, onUserUpdated }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [myRequest, setMyRequest] = useState(null);
  const [loading, setLoading] = useState(user.role === 'ADMIN');
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const token = localStorage.getItem('attendance_token');
  const headers = { Authorization: `Bearer ${token}` };

  async function loadFaceData() {
    setError('');
    if (user.role === 'ADMIN') {
      const response = await fetch(`${apiUrl}/admin/face-requests?status=PENDING`, { cache: 'no-store', headers });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể tải yêu cầu đăng ký lại khuôn mặt.');
      setRequests(body.data || []);
      setLoading(false);
      return;
    }
    const response = await fetch(`${apiUrl}/face/register/my-request`, { cache: 'no-store', headers });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || 'Không thể tải trạng thái yêu cầu khuôn mặt.');
    setMyRequest(body.data || null);
  }

  useEffect(() => {
    loadFaceData().catch((requestError) => {
      setError(requestError.message || 'Không thể tải dữ liệu khuôn mặt.');
      setLoading(false);
    });
  }, [user.role]);

  async function registerFace(embeddings, image) {
    setError('');
    setMessage('');
    if (user.role === 'ADMIN') {
      const result = await replaceFaceEmbedding(user, embeddings);
      onUserUpdated({ ...user, faceRegistered: true });
      setMessage(result.message);
      return;
    }
    const result = await requestFaceRegistration(embeddings, image);
    setMessage(result.message);
    await loadFaceData();
  }

  async function reviewRequest(requestId, decision) {
    setProcessingId(requestId);
    setError('');
    setMessage('');
    try {
      let reason;
      if (decision === 'reject') {
        reason = window.prompt('Lý do từ chối (không bắt buộc):');
        if (reason === null) return;
      }
      const response = await fetch(`${apiUrl}/admin/face-requests/${requestId}/${decision}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        ...(decision === 'reject' ? { body: JSON.stringify({ reason }) } : {}),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể xử lý yêu cầu.');
      setMessage(body.message);
      await loadFaceData();
    } catch (requestError) {
      setError(requestError.message || 'Không thể xử lý yêu cầu.');
    } finally {
      setProcessingId(null);
    }
  }

  const requestIsPending = myRequest?.status === 'PENDING';

  return <section className="profile-page">
    <div className="profile-page-heading">
      <span className="section-label">FACE ID</span>
      <h2>Đăng ký khuôn mặt</h2>
      <p>{user.role === 'ADMIN' ? 'Cập nhật khuôn mặt tài khoản Admin và duyệt yêu cầu của thành viên.' : 'Gửi khuôn mặt mới để Admin kiểm tra và duyệt trước khi sử dụng chấm công.'}</p>
    </div>
    {error && <div className="form-error">{error}</div>}
    {message && <div className="form-success">{message}</div>}
    <div className="content-panel profile-form">
      <div className="panel-heading">
        <div>
          <h3>Khuôn mặt của {user.role === 'ADMIN' ? 'Admin' : 'bạn'}</h3>
          <p>{user.faceRegistered ? 'Tài khoản đã có dữ liệu khuôn mặt.' : 'Tài khoản chưa có dữ liệu khuôn mặt hợp lệ.'}</p>
        </div>
        <Camera size={20} />
      </div>
      {user.role === 'USER' && myRequest && (
        <div className={requestIsPending ? 'approval-note' : myRequest.status === 'REJECTED' ? 'form-error' : 'form-success'}>
          Yêu cầu gần nhất: {requestIsPending ? 'Đang chờ Admin duyệt.' : myRequest.status === 'APPROVED' ? 'Đã được duyệt.' : 'Bị từ chối.'}
          {myRequest.rejection_reason ? ` Lý do: ${myRequest.rejection_reason}` : ''}
        </div>
      )}
      {user.role === 'ADMIN' || !requestIsPending ? (
        <button className="secondary-button" type="button" onClick={() => setModalOpen(true)}>
          {user.faceRegistered ? 'ĐĂNG KÝ LẠI KHUÔN MẶT' : 'ĐĂNG KÝ KHUÔN MẶT'}
        </button>
      ) : (
        <button className="secondary-button" type="button" disabled>
          ĐANG CHỜ ADMIN DUYỆT
        </button>
      )}
    </div>

    {user.role === 'ADMIN' && (
      <div className="content-panel profile-form" style={{ marginTop: 16 }}>
        <div className="panel-heading">
          <div><h3>Yêu cầu từ thành viên</h3><p>Kiểm tra ảnh và duyệt trước khi thay dữ liệu khuôn mặt hiện có.</p></div>
          <span className="live-dot">{requests.length} CHỜ DUYỆT</span>
        </div>
        {loading ? <div className="history-empty">Đang tải yêu cầu...</div> : requests.length ? (
          <div className="imported-record-list">
            {requests.map((item) => (
              <div className="imported-record face-request-item" key={item.id}>
                <span>{item.full_name}<small>{item.student_code || 'Chưa có MSSV'} · {new Date(item.created_at).toLocaleString('vi-VN')}</small></span>
                {item.new_face_image && <img src={item.new_face_image} alt={`Ảnh đăng ký mới của ${item.full_name}`} />}
                <div className="modal-actions">
                  <button className="secondary-button" type="button" disabled={processingId === item.id} onClick={() => reviewRequest(item.id, 'reject')}>Từ chối</button>
                  <button className="primary-button" type="button" disabled={processingId === item.id} onClick={() => reviewRequest(item.id, 'approve')}>{processingId === item.id ? 'ĐANG XỬ LÝ...' : 'Duyệt'}</button>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="history-empty">Hiện không có yêu cầu nào chờ duyệt.</div>}
      </div>
    )}
    {modalOpen && (
      <FaceModal
        checkedIn={false}
        faceRegistered={Boolean(user.faceRegistered)}
        registrationOnly
        onClose={() => setModalOpen(false)}
        onSuccess={registerFace}
      />
    )}
  </section>;
}

function getLastSevenDays(endDate = getVietnamDateString()) {
  const [year, month, day] = endDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return Array.from({ length: 7 }, (_, index) => {
    const itemDate = new Date(date);
    itemDate.setUTCDate(date.getUTCDate() - (6 - index));
    const key = `${itemDate.getUTCFullYear()}-${String(itemDate.getUTCMonth() + 1).padStart(2, '0')}-${String(itemDate.getUTCDate()).padStart(2, '0')}`;
    const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'UTC' }).format(itemDate);
    return { date: key, label: weekday.replace('.', ''), present: 0, absent: 0 };
  });
}

function DashboardBarChart({ data }) {
  const maximum = Math.max(1, ...data.map((day) => day.present + day.absent));
  return (
    <div className="dashboard-bar-chart" role="img" aria-label="Biểu đồ chấm công 7 ngày gần nhất">
      <div className="dashboard-chart-grid">
        {[0, 1, 2, 3].map((line) => <span key={line} />)}
      </div>
      <div className="dashboard-chart-columns">
        {data.map((day) => (
          <div className="dashboard-chart-day" key={day.date}>
            <div className="dashboard-chart-bars">
              <span className="present" title={`Đi làm: ${day.present}`} style={{ height: `${Math.max(day.present ? 5 : 0, (day.present / maximum) * 100)}%` }} />
              <span className="absent" title={`Nghỉ: ${day.absent}`} style={{ height: `${Math.max(day.absent ? 5 : 0, (day.absent / maximum) * 100)}%` }} />
            </div>
            <small>{day.label}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-chart-legend">
        <span><i className="present" />Đi làm</span>
        <span><i className="absent" />Nghỉ</span>
      </div>
    </div>
  );
}

function DashboardAttendanceDonut({ present, total }) {
  const safeTotal = Math.max(0, total);
  const percent = safeTotal ? Math.min(100, Math.round((present / safeTotal) * 100)) : 0;
  return (
    <div className="dashboard-donut-wrap">
      <div className="dashboard-donut" style={{ '--attendance-percent': `${percent}%` }}>
        <div><strong>{percent}%</strong><span>{present}/{safeTotal} ngày</span></div>
      </div>
      <div className="dashboard-donut-legend">
        <span><i className="present" />Đi làm <strong>{percent}%</strong></span>
        <span><i className="absent" />Nghỉ <strong>{100 - percent}%</strong></span>
      </div>
    </div>
  );
}

function DashboardStatCard({ icon: Icon, tone, title, value, detail, badge }) {
  return (
    <article className="dashboard-stat-card">
      <div className={`dashboard-stat-icon ${tone}`}><Icon size={20} /></div>
      <div className="dashboard-stat-content">
        <div className="dashboard-stat-title">{title}{badge && <span>{badge}</span>}</div>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function DashboardShiftsCard({ shifts, attendanceWindow, onAttend, isAdmin = false }) {
  const nowSeconds = getVietnamSeconds(new Date());
  const activeShift = shifts.find((shift) => shift.isActive
    && nowSeconds >= timeToSeconds(shift.start)
    && nowSeconds <= timeToSeconds(shift.end));
  const iconForShift = (code) => code === 'MORNING' ? Sun : code === 'AFTERNOON' ? CloudSun : Moon;
  const actionState = attendanceWindow?.state;
  const checkInOpen = actionState === 'CHECK_IN';
  const checkOutOpen = actionState === 'CHECK_OUT';
  const waitingForCheckout = actionState === 'WAIT_CHECKOUT';
  let checkOutOpens = null;
  if (waitingForCheckout && attendanceWindow.actionShift) {
    checkOutOpens = Math.max(
      timeToSeconds(attendanceWindow.actionShift.start),
      timeToSeconds(attendanceWindow.actionShift.end) - 5 * 60,
    );
  }
  const checkoutOpensLabel = checkOutOpens === null
    ? ''
    : `${String(Math.floor(checkOutOpens / 3600)).padStart(2, '0')}:${String(Math.floor((checkOutOpens % 3600) / 60)).padStart(2, '0')}`;

  return (
    <section className="dashboard-content-card dashboard-shifts-card">
      <div className="dashboard-content-heading"><span className="dashboard-section-icon"><Store size={18} /></span><h2>Các ca làm việc hôm nay</h2></div>
      <div className="dashboard-shift-list">
        {shifts.map((shift) => {
          const ShiftIcon = iconForShift(shift.code);
          const isOpen = Boolean(shift.isActive
            && nowSeconds >= timeToSeconds(shift.start)
            && nowSeconds <= timeToSeconds(shift.end));
          return (
            <div className="dashboard-shift-item" key={shift.code}>
              <span className={`dashboard-shift-icon ${shift.code.toLowerCase()}`}><ShiftIcon size={19} /></span>
              <div className="dashboard-shift-info">
                <strong>{formatShiftName(shift)}</strong>
                <small>{formatDisplayTime(shift.start)} – {formatDisplayTime(shift.end)}</small>
              </div>
              <span className={`dashboard-shift-badge ${isOpen ? 'open' : ''}`}>{isOpen ? 'Đang mở' : 'Chưa mở'} <i /></span>
            </div>
          );
        })}
        {!shifts.length && <div className="dashboard-empty-shifts">Chưa có ca làm việc được cấu hình.</div>}
      </div>
      {isAdmin ? (
        <div className="dashboard-admin-note"><ShieldCheck size={17} /><span>Tài khoản Quản trị viên (Admin) không áp dụng điểm danh bắt buộc.</span></div>
      ) : (
        <div className="dashboard-attendance-action">
          {attendanceWindow?.state === 'ALL_COMPLETED' ? (
            <div className="dashboard-action-feedback complete"><Check size={17} />Đã hoàn thành chấm công hôm nay.</div>
          ) : checkInOpen ? (
            <button type="button" className="dashboard-action-button check-in" onClick={onAttend}><Camera size={17} />Check-in ngay</button>
          ) : checkOutOpen ? (
            <button type="button" className="dashboard-action-button check-out" onClick={onAttend}><Camera size={17} />Check-out ngay</button>
          ) : waitingForCheckout ? (
            <button type="button" className="dashboard-action-button locked" disabled><LockKeyhole size={16} />Check-out trước 5 phút trước khi hết ca (Mở lúc {checkoutOpensLabel})</button>
          ) : (
            <div className="dashboard-action-feedback"><Info size={17} />{attendanceWindow?.statusLabel || 'Chưa đến giờ làm việc của ca tiếp theo.'}</div>
          )}
        </div>
      )}
    </section>
  );
}

function UserPortal({ user }) {
  const [clockTime, setClockTime] = useState(() => new Date());
  const [faceModal, setFaceModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [totalWorkDays, setTotalWorkDays] = useState(Number(user.totalWorkDays) || 0);
  const [today, setToday] = useState(null);
  const [shift, setShift] = useState(null);
  const attendanceWindow = useAttendanceWindow(shift, today);
  const checkedIn = attendanceWindow.action === 'CHECK_OUT';
  const canAttend = attendanceWindow.canAttend;
  const [checkInFeedback, setCheckInFeedback] = useState(null);

  useEffect(() => {
    const interval = window.setInterval(() => setClockTime(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWorkSummary = async () => {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/attendance/my/summary`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể tải tổng ngày công.');
      if (!cancelled) setTotalWorkDays(Number(body.data?.totalWorkDays) || 0);
    };
    loadWorkSummary().catch((error) => console.error('Không thể tải tổng ngày công:', error));
    const interval = window.setInterval(() => {
      loadWorkSummary().catch((error) => console.error('Không thể cập nhật tổng ngày công:', error));
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('attendance_token');
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${apiUrl}/attendance/today`, { headers }).then((response) => response.json()),
      fetch(`${apiUrl}/attendance/shifts/today`, { cache: 'no-store', headers }).then((response) => response.json()),
      fetch(`${apiUrl}/shifts`, { cache: 'no-store' }).then((response) => response.json()),
    ]).then(([todayBody, shiftBody, configuredShiftBody]) => {
      if (!configuredShiftBody.success || !Array.isArray(configuredShiftBody.data)) {
        throw new Error(configuredShiftBody.message || 'Dữ liệu ca làm việc đã cấu hình không hợp lệ.');
      }
      setToday(todayBody.data || null);
      setShift(mergeConfiguredShiftTimes(shiftBody.data, configuredShiftBody.data));
    }).catch((error) => console.error('Không thể tải lịch ca làm việc:', error));
    const shiftRefresh = window.setInterval(() => {
      const currentToken = localStorage.getItem('attendance_token');
      const currentHeaders = { Authorization: `Bearer ${currentToken}` };
      Promise.all([
        fetch(`${apiUrl}/attendance/shifts/today`, { cache: 'no-store', headers: currentHeaders }),
        fetch(`${apiUrl}/attendance/today`, { cache: 'no-store', headers: currentHeaders }),
        fetch(`${apiUrl}/shifts`, { cache: 'no-store' }),
      ])
        .then(async ([shiftResponse, todayResponse, configuredShiftResponse]) => {
          if (!shiftResponse.ok || !todayResponse.ok || !configuredShiftResponse.ok) {
            throw new Error('Không thể cập nhật trạng thái chấm công.');
          }
          const [shiftBody, todayBody, configuredShiftBody] = await Promise.all([
            shiftResponse.json(),
            todayResponse.json(),
            configuredShiftResponse.json(),
          ]);
          if (!configuredShiftBody.success || !Array.isArray(configuredShiftBody.data)) {
            throw new Error(configuredShiftBody.message || 'Dữ liệu ca làm việc đã cấu hình không hợp lệ.');
          }
          setShift(mergeConfiguredShiftTimes(shiftBody.data, configuredShiftBody.data));
          setToday(todayBody.data || null);
        })
        .catch((requestError) => console.error('Không thể cập nhật trạng thái ca:', requestError));
    }, 8000);
    return () => window.clearInterval(shiftRefresh);
  }, []);

  useEffect(() => {
    if (!canAttend) setFaceModal(false);
  }, [canAttend]);

  async function openAttendanceHistory() {
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/attendance/my`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      if (!response.ok || !body.success || !Array.isArray(body.data)) {
        throw new Error(body.message || 'Không thể tải lịch sử chấm công.');
      }
      setHistoryRecords(body.data);
    } catch (error) {
      setHistoryError(error.message || 'Không thể tải lịch sử chấm công.');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleFaceSuccess(embeddings, imageData) {
    const action = checkedIn ? 'CHECK_OUT' : 'CHECK_IN';
    const body = await submitAttendance(
      user,
      action,
      embeddings,
      imageData,
      attendanceWindow.actionShift?.code,
    );

    const isLate = Boolean(body.data?.is_late || body.data?.punctuality_status === 'LATE');
    setFaceModal(false);
    setCheckInFeedback({
      isLate,
      message: body.message || (action === 'CHECK_IN'
        ? 'Check-in thành công, đang chờ quản trị viên phê duyệt.'
        : 'Check-out thành công, đang chờ quản trị viên phê duyệt.'),
    });
    setToday((current) => mergeAttendanceRecords(current, {
      ...body.data,
      ...(action === 'CHECK_OUT' ? { check_in: current?.check_in } : {}),
      attendance_date: getVietnamDateString(),
      status: 'PENDING',
      is_late: isLate,
    }));
  }

  const shifts = shift?.allShifts || shift?.shifts || [];
  const nowSeconds = getVietnamSeconds(clockTime);
  const currentShift = shifts.find((item) => item.isActive
    && nowSeconds >= timeToSeconds(item.start)
    && nowSeconds <= timeToSeconds(item.end));
  const greetingPart = nowSeconds < 12 * 60 * 60 ? 'sáng' : nowSeconds < 18 * 60 * 60 ? 'chiều' : 'tối';
  const greetingIcon = greetingPart === 'sáng' ? '☀️' : greetingPart === 'chiều' ? '🌤️' : '🌙';
  const currentClockParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(clockTime);
  const currentClock = Object.fromEntries(currentClockParts.map(({ type, value }) => [type, value]));
  const checkInAllowed = attendanceWindow.state === 'CHECK_IN';
  const checkOutAllowed = attendanceWindow.state === 'CHECK_OUT';
  const checkoutOpensAt = attendanceWindow.actionShift
    ? Math.max(
      timeToSeconds(attendanceWindow.actionShift.start),
      timeToSeconds(attendanceWindow.actionShift.end) - 5 * 60,
    )
    : null;
  const checkoutOpensLabel = checkoutOpensAt === null
    ? null
    : `${String(Math.floor(checkoutOpensAt / 3600)).padStart(2, '0')}:${String(Math.floor((checkoutOpensAt % 3600) / 60)).padStart(2, '0')}`;
  const shiftActionIcon = (code) => code === 'MORNING' ? Sun : code === 'AFTERNOON' ? CloudSun : Moon;
  const activeShiftState = Boolean(currentShift);
  return <div className="user-portal user-attendance-dashboard role-dashboard">
    {checkInFeedback && (
      <div className={`checkin-feedback-banner ${checkInFeedback.isLate ? 'late' : 'success'}`}>
        <span className="feedback-icon">{checkInFeedback.isLate ? '⚠️' : '✓'}</span>
        <p>{checkInFeedback.message}</p>
        <button className="feedback-close" onClick={() => setCheckInFeedback(null)} aria-label="Đóng thông báo">✕</button>
      </div>
    )}

    <section className="user-attendance-layout">
      <div className="user-attendance-main">
        <section className="user-attendance-hero">
          <div className="user-attendance-greeting">
            <span className="user-attendance-greeting-title">{greetingIcon} Chào buổi {greetingPart}!</span>
            <div className="user-attendance-clock" aria-label={`Giờ hiện tại ${currentClock.hour}:${currentClock.minute}:${currentClock.second} ${currentClock.dayPeriod}`}>
              <span>{currentClock.hour}:{currentClock.minute}</span>
              <span className="user-attendance-clock-seconds">:{currentClock.second}</span>
              <span className="user-attendance-clock-period">{currentClock.dayPeriod}</span>
            </div>
            <span className={`user-attendance-live-state ${activeShiftState ? 'in-shift' : ''}`}>
              <i />{activeShiftState ? 'Đang trong ca làm việc' : 'Ngoài ca làm việc'}
            </span>
          </div>
          <div className="user-current-shift-card">
            <span className="user-current-shift-label">Ca hiện tại</span>
            {currentShift ? (
              <>
                {React.createElement(shiftActionIcon(currentShift.code), { size: 22 })}
                <strong>{formatShiftName(currentShift)}</strong>
                <span>{formatDisplayTime(currentShift.start)} – {formatDisplayTime(currentShift.end)}</span>
                <small>Đang mở</small>
              </>
            ) : (
              <>
                <Clock3 size={22} />
                <strong>{attendanceWindow.actionShift ? formatShiftName(attendanceWindow.actionShift) : 'Chưa có ca hiện tại'}</strong>
                <span>{attendanceWindow.actionShift ? `Mở lúc ${formatDisplayTime(attendanceWindow.actionShift.start)}` : 'Không có ca đang diễn ra'}</span>
                {attendanceWindow.actionShift && <small className="upcoming">Sắp mở</small>}
              </>
            )}
          </div>
        </section>

        <section className="user-attendance-actions">
          <article className="user-action-card check-in-card">
            <span className="user-action-icon"><Clock3 size={22} /></span>
            <h3>Check-in</h3>
            <p>Bắt đầu ca làm việc</p>
            <button type="button" disabled={!checkInAllowed} onClick={() => setFaceModal(true)}>
              Check-in ngay
            </button>
          </article>
          <article className={`user-action-card check-out-card ${checkOutAllowed ? 'available' : ''}`}>
            <span className="user-action-icon"><Clock3 size={22} /></span>
            <h3>Check-out</h3>
            <p>Kết thúc ca làm việc</p>
            <button type="button" disabled={!checkOutAllowed} onClick={() => setFaceModal(true)}>
              {checkOutAllowed
                ? 'Check-out ngay'
                : attendanceWindow.state === 'WAIT_CHECKOUT' && checkoutOpensLabel
                  ? `Check-out trước 5 phút trước khi hết ca (Mở lúc ${checkoutOpensLabel})`
                  : 'Chỉ có thể check-out khi ca đang mở'}
            </button>
          </article>
        </section>

        <aside className="user-attendance-reminder">
          <Info size={20} />
          <div>
            <strong>Vui lòng check-in đúng ca để đảm bảo dữ liệu chính xác!</strong>
            <p>Hệ thống chỉ cho phép điểm danh khi ca làm việc đang được mở bởi admin.</p>
          </div>
        </aside>
      </div>

      <aside className="user-attendance-sidebar">
        <section className="user-shift-info-card">
          <h3>Thông tin ca làm việc</h3>
          <div className="user-shift-info-list">
            {shifts.map((item) => {
              const ShiftIcon = shiftActionIcon(item.code);
              const isOpen = item.isActive
                && nowSeconds >= timeToSeconds(item.start)
                && nowSeconds <= timeToSeconds(item.end);
              return (
                <div className={`user-shift-info-item ${isOpen ? 'open' : ''}`} key={item.code}>
                  <span className={`user-shift-info-icon ${item.code.toLowerCase()}`}><ShiftIcon size={18} /></span>
                  <div>
                    <strong>{formatShiftName(item)}</strong>
                    <small>{formatDisplayTime(item.start)} – {formatDisplayTime(item.end)}</small>
                  </div>
                  <span className={`user-shift-status ${isOpen ? 'open' : ''}`}>{isOpen ? 'Đang mở' : 'Chưa mở'}</span>
                </div>
              );
            })}
            {!shifts.length && <div className="history-empty">Chưa có ca làm việc được cấu hình.</div>}
          </div>
        </section>

        <section className="user-work-days-card">
          <div className="user-work-days-copy">
            <span className="user-work-days-label">Tổng công tích lũy</span>
            <div className="user-work-days-value">
              <strong>{Number.isInteger(totalWorkDays) ? totalWorkDays : Number(totalWorkDays.toFixed(2))}</strong>
              <span>công</span>
            </div>
            <small>công đã được xác nhận</small>
          </div>
          <div className="user-work-days-actions">
            <span className="user-work-days-icon"><Award size={21} /></span>
            <button type="button" onClick={openAttendanceHistory}>Xem lịch sử <ArrowRight size={13} /></button>
          </div>
        </section>

        <section className="user-attendance-notes">
          <h3><UsersRound size={17} /> Lưu ý</h3>
          <ul>
            <li>Chỉ có thể điểm danh khi ca làm việc đang mở.</li>
            <li>Cần đủ Check-in và Check-out được duyệt để tính công.</li>
            <li>Tổng công được đồng bộ từ dữ liệu Admin đã chốt/import.</li>
          </ul>
        </section>
      </aside>
    </section>
    <AnimatePresence>
      {showHistoryModal && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistoryModal(false)}>
          <motion.section
            className="user-work-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-work-history-title"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div><span className="user-work-days-icon"><Award size={20} /></span><div><h2 id="user-work-history-title">Lịch sử chấm công</h2><p>{user.fullName || user.username} · {totalWorkDays} công đã xác nhận</p></div></div>
              <button type="button" aria-label="Đóng lịch sử" onClick={() => setShowHistoryModal(false)}><X size={19} /></button>
            </header>
            <div className="user-work-history-content">
              {historyLoading ? <div className="user-work-history-state">Đang tải lịch sử chấm công...</div>
                : historyError ? <div className="form-error">{historyError}</div>
                  : historyRecords.length ? (
                    <div className="user-work-history-list">
                      {historyRecords.map((record) => {
                        const completed = record.source === 'Excel Import'
                          || (record.status === 'APPROVED' && Boolean(record.check_in) && Boolean(record.check_out));
                        const date = record.attendance_date
                          ? new Date(`${String(record.attendance_date).slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN')
                          : '—';
                        const checkInTime = record.check_in ? new Date(record.check_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
                        const checkOutTime = record.check_out ? new Date(record.check_out).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
                        return (
                          <article className="user-work-history-item" key={`${record.source || 'attendance'}-${record.id}-${record.check_in || ''}`}>
                            <div className={`user-work-history-status ${completed ? 'approved' : record.status === 'REJECTED' ? 'rejected' : 'pending'}`}>
                              {completed ? <Check size={15} /> : record.status === 'REJECTED' ? <X size={15} /> : <Clock3 size={15} />}
                            </div>
                            <div className="user-work-history-main">
                              <strong>{formatShiftName({ name: record.shift_name || record.shift_code })}</strong>
                              <span>{date} · Check-in {checkInTime} · Check-out {checkOutTime}</span>
                            </div>
                            <span className={`user-work-history-badge ${completed ? 'approved' : record.status === 'REJECTED' ? 'rejected' : 'pending'}`}>
                              {completed ? 'Đã xác nhận' : record.status === 'REJECTED' ? 'Bị từ chối' : 'Chờ duyệt'}
                            </span>
                          </article>
                        );
                      })}
                    </div>
                  ) : <div className="user-work-history-state">Chưa có lịch sử chấm công.</div>}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
    {faceModal && <FaceModal checkedIn={checkedIn} faceRegistered={Boolean(user.faceRegistered)} onClose={() => setFaceModal(false)} onSuccess={handleFaceSuccess} onReplaceFace={(embeddings, image) => requestFaceRegistration(embeddings, image)} recoveryRequiresApproval onRecoverySubmitted={(result) => setCheckInFeedback({ isLate: false, message: result.message })} />}
  </div>;
}

function AttendanceHistory({ user }) {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  useEffect(() => {
    const endpoint = user.role === 'ADMIN' ? '/admin/attendance' : '/attendance/my';
    let cancelled = false;
    async function loadRecords() {
      const token = localStorage.getItem('attendance_token');
      try {
        const response = await fetch(`${apiUrl}${endpoint}`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.message || 'Không thể tải lịch sử.');
        if (!cancelled) {
          setRecords(body.data || []);
          setError('');
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      }
    }
    void loadRecords();
    const refreshInterval = user.role === 'USER'
      ? window.setInterval(() => { void loadRecords(); }, 8000)
      : null;
    return () => {
      cancelled = true;
      if (refreshInterval !== null) window.clearInterval(refreshInterval);
    };
  }, [user.role]);

  async function openPhoto(record, type) {
    const token = localStorage.getItem('attendance_token');
    const endpoint = user.role === 'ADMIN'
      ? record.source === 'Camera Request'
        ? `${apiUrl}/admin/attendance-requests/${encodeURIComponent(`legacy:${type === 'check-out' ? 'CHECK_OUT' : 'CHECK_IN'}:${record.id}`)}/image`
        : `${apiUrl}/admin/attendance/${record.id}/image/${type}`
      : `${apiUrl}/attendance/${record.id}/image/${type}?source=${encodeURIComponent(record.source || 'Camera Request')}`;
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const result = await response.json();
    setPreview({ url: result.data, label: `${record.full_name || user.fullName || user.username} · ${type === 'check-in' ? 'Check-in' : 'Check-out'}` });
  }

  async function deleteAttendance(record) {
    setDeletingId(record.id);
    setError('');
    try {
      const token = localStorage.getItem('attendance_token');
      const deleteEndpoint = record.source === 'Excel Import'
        ? `${apiUrl}/admin/imported-attendance/records/${record.id}`
        : record.source === 'Camera Request'
          ? `${apiUrl}/admin/attendance-logs/${record.id}`
          : `${apiUrl}/admin/attendance/${record.id}`;
      const response = await fetch(deleteEndpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: deleteReason }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể xóa bản ghi.');
      setRecords((current) => current.filter((item) => (
        item.id !== record.id || item.source !== record.source
      )));
      setDeleteTarget(null);
      setDeleteReason('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  }

  return <section className="history-page"><div className="history-heading"><div><span className="section-label">{user.role === 'ADMIN' ? 'ADMIN ATTENDANCE' : 'MY ATTENDANCE'}</span><h2>Lịch sử chấm công</h2><p>{user.role === 'ADMIN' ? 'Quản trị viên có thể xem lịch sử, ảnh và xóa bản ghi của tất cả thành viên.' : 'Bạn chỉ có thể xem lịch sử chấm công của chính mình, gồm dữ liệu camera và Excel.'}</p></div></div>{error && <div className="form-error">{error}</div>}<div className="history-table-wrap"><table className="history-table"><thead><tr><th>Nhân viên</th><th>Nguồn</th><th>Ngày / Ca</th><th>Check-in</th><th>Check-out</th><th>Trạng thái</th><th>Ảnh đối soát</th>{user.role === 'ADMIN' && <th>Thao tác</th>}</tr></thead><tbody>{records.length ? records.map((record) => <tr key={`${record.source || 'attendance'}-${record.id}-${record.check_in_event_id || ''}`}><td><strong>{record.full_name || user.fullName || user.username}</strong>{record.username && <small>{record.username}</small>}</td><td>{record.source === 'Excel Import' ? 'Excel' : 'Camera'}</td><td>{new Date(record.attendance_date).toLocaleDateString('vi-VN')}<small>{formatShiftName({ name: record.shift_name })}</small></td><td><strong>{record.check_in_captured_at || record.check_in ? new Date(record.check_in_captured_at || record.check_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—:—'}</strong><small>{record.check_in_event_status || (record.check_in ? record.status : '—')}</small></td><td><strong>{record.check_out_captured_at || record.check_out ? new Date(record.check_out_captured_at || record.check_out).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—:—'}</strong><small>{record.check_out_event_status || (record.check_out ? record.status : '—')}</small></td><td><span className={`status-badge ${(record.punctuality_status || 'pending').toLowerCase()}`}>{record.punctuality_status === 'LATE' ? 'Đi làm trễ' : record.status === 'APPROVED' ? 'Đã duyệt' : record.status === 'REJECTED' ? 'Từ chối' : 'Chờ duyệt'}</span></td>  <td className="history-photos"><button disabled={record.check_in_photo_available === 0 || record.check_in_photo_expired} onClick={() => openPhoto(record, 'check-in')}>In {record.check_in_photo_expired ? '· Hết hạn' : ''}</button><button disabled={record.check_out_photo_available === 0 || record.check_out_photo_expired} onClick={() => openPhoto(record, 'check-out')}>Out {record.check_out_photo_expired ? '· Hết hạn' : ''}</button></td>{user.role === 'ADMIN' && <td><button className="delete-attendance-button" disabled={deletingId === record.id} onClick={() => { setDeleteTarget(record); setDeleteReason(''); }}>{deletingId === record.id ? 'ĐANG XÓA...' : 'XÓA'}</button></td>}</tr>) : <tr><td colSpan={user.role === 'ADMIN' ? 8 : 7} className="history-empty">Chưa có lịch sử chấm công.</td></tr>}</tbody></table></div>{preview && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setPreview(null)}><div className="photo-preview-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setPreview(null)}><X size={18} /></button><span className="section-label">{preview.label}</span><img src={preview.url} alt={preview.label} onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/400x300?text=Không+thể+tải+ảnh'; }} /></div></motion.div>}{deleteTarget && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="delete-modal"><button className="modal-close" onClick={() => setDeleteTarget(null)}><X size={18} /></button><h3>Bạn có chắc chắn muốn xóa bản ghi chấm công này?</h3><p>{deleteTarget.full_name} · {formatShiftName({ name: deleteTarget.shift_name })}</p><textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Lý do xóa (Không bắt buộc)" maxLength={500} /><div className="delete-modal-actions"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>Hủy</button><button className="delete-attendance-button" onClick={() => deleteAttendance(deleteTarget)}>Xác nhận xóa</button></div></div></motion.div>}</section>;
}

function AdminDashboard({ user }) {
  const [faceModal, setFaceModal] = useState(false);
  const [latestAttendance, setLatestAttendance] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [todayShift, setTodayShift] = useState(null);
  const attendanceWindow = useAttendanceWindow(todayShift, latestAttendance);
  const checkedIn = attendanceWindow.action === 'CHECK_OUT';
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showAllModal, setShowAllModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [approvalConfirm, setApprovalConfirm] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [chartRange, setChartRange] = useState('7days');
  const [selectedDate, setSelectedDate] = useState(getVietnamDateString);
  const dashboardNow = new Date();
  const dashboardNowSeconds = getVietnamSeconds(dashboardNow);
  const dashboardShifts = todayShift?.allShifts || todayShift?.shifts || [];
  const currentShift = dashboardShifts.find((shift) => shift.isActive
    && dashboardNowSeconds >= timeToSeconds(shift.start)
    && dashboardNowSeconds <= timeToSeconds(shift.end));
  const activeShiftCount = dashboardShifts.filter((shift) => shift.isActive).length;
  const greetingPart = dashboardNowSeconds < 12 * 60 * 60 ? 'sáng' : dashboardNowSeconds < 18 * 60 * 60 ? 'chiều' : 'tối';
  const dashboardDateLabel = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(dashboardNow);
  const weeklyData = getLastSevenDays().map((day) => {
    const trend = dashboardStats?.trend?.find((item) => item.date === day.date);
    const present = Number(trend?.onTime || 0) + Number(trend?.late || 0);
    return {
      ...day,
      present,
      absent: Math.max(0, Number(dashboardStats?.totalStudents || 0) - present),
    };
  });
  const weeklyPresent = weeklyData.reduce((sum, day) => sum + day.present, 0);
  const weeklyTotal = Number(dashboardStats?.totalStudents || 0) * 7;

  async function loadApprovals() {
    const token = localStorage.getItem('attendance_token');
    try {
      const response = await fetch(`${apiUrl}/admin/attendance-requests?filter=all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Không thể tải danh sách yêu cầu duyệt.');
      const body = await response.json();
      if (!body.success || !Array.isArray(body.data)) throw new Error(body.message || 'Dữ liệu yêu cầu duyệt không hợp lệ.');
      setApprovals(body.data);
    } catch (err) {
      console.error('Lỗi tải danh sách duyệt:', err);
    }
  }

  async function loadActiveShifts() {
    const token = localStorage.getItem('attendance_token');
    const response = await fetch(`${apiUrl}/attendance/shifts/today`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Không thể tải trạng thái ca làm.');
    const body = await response.json();
    if (!body.success || !body.data) throw new Error(body.message || 'Dữ liệu ca làm không hợp lệ.');
    setTodayShift(body.data);
  }

  async function loadDashboardStats(range = chartRange, date = selectedDate) {
    const token = localStorage.getItem('attendance_token');
    try {
      const response = await fetch(`${apiUrl}/admin/dashboard-stats?range=${range}&date=${date}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (body.success) setDashboardStats(body.data);
    } catch (err) {
      console.error('Lỗi tải dashboard stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }

  function handleChartRangeChange(newRange) {
    setChartRange(newRange);
    setStatsLoading(true);
    loadDashboardStats(newRange, selectedDate);
  }

  function handleChartDateSelect(dateStr) {
    setSelectedDate(dateStr);
    setStatsLoading(true);
    loadDashboardStats(chartRange, dateStr);
  }

  useEffect(() => {
    const approvalPoll = user.role === 'ADMIN'
      ? window.setInterval(() => { void loadApprovals(); }, 8000)
      : null;
    const shiftPoll = user.role === 'ADMIN'
      ? window.setInterval(() => { loadActiveShifts().catch((err) => console.error('Lỗi tải trạng thái ca:', err)); }, 8000)
      : null;
    const token = localStorage.getItem('attendance_token');
    fetch(`${apiUrl}/attendance/today`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Không thể tải trạng thái chấm công.');
        return response.json();
      })
      .then((body) => {
        setLatestAttendance(body.data);
      })
      .catch((err) => console.error('Không thể tải trạng thái chấm công:', err));
    loadActiveShifts().catch((err) => console.error('Lỗi tải trạng thái ca:', err));
    if (user.role === 'ADMIN') {
      fetch(`${apiUrl}/admin/attendance-requests?filter=all`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => response.json())
        .then((approvalBody) => {
        setApprovals(approvalBody.data || []);
        })
        .catch((err) => console.error('Lỗi tải danh sách duyệt:', err));
      loadDashboardStats();
    }
    return () => {
      if (approvalPoll !== null) window.clearInterval(approvalPoll);
      if (shiftPoll !== null) window.clearInterval(shiftPoll);
    };
  }, []);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  function getAttendanceId(record) {
    return record?.event_id || record?.id || record?._id;
  }

  async function reviewApproval(requestKey, status, reason = '') {
    const attendanceId = requestKey?.request_key || requestKey?.event_id || requestKey?.id || requestKey?._id || requestKey;
    if (!attendanceId) {
      console.warn('Missing attendance ID');
      setActionNotice({ title: 'Không thể xử lý', message: 'Không tìm thấy ID bản ghi chấm công.' });
      return false;
    }
    setProcessingId(attendanceId);
    try {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/admin/attendance-requests/${attendanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, reason }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể cập nhật yêu cầu.');
      setApprovals((current) => current.filter((item) => getAttendanceId(item) !== attendanceId && item.request_key !== attendanceId));
      setActionNotice({
        title: status === 'APPROVED' ? 'Đã duyệt thành công' : 'Đã từ chối thành công',
        message: body.message || (status === 'APPROVED' ? 'Yêu cầu chấm công đã được duyệt.' : 'Yêu cầu chấm công đã bị từ chối.'),
      });
      return true;
    } catch (err) {
      setActionNotice({ title: 'Không thể cập nhật', message: err.message || 'Lỗi mạng khi xử lý duyệt công.' });
      return false;
    } finally {
      setProcessingId(null);
    }
  }

  function requestApproval(event) {
    setApprovalConfirm({ type: 'single', event });
  }

  async function handleConfirmApproval() {
    if (!approvalConfirm) return;
    if (approvalConfirm.type === 'single') {
      await reviewApproval(approvalConfirm.event, 'APPROVED');
      setApprovalConfirm(null);
      return;
    }
    await handleBulkReview(
      approvalConfirm.status,
      approvalConfirm.filter,
      approvalConfirm.requestKeys,
      true,
    );
  }

  function openRejectModal(event) {
    setRejectTarget(event);
    setRejectReason('');
  }

  async function handleConfirmReject() {
    if (!rejectTarget) return;
    setRejectLoading(true);
    try {
      const succeeded = await reviewApproval(rejectTarget, 'REJECTED', rejectReason.trim());
      if (succeeded) {
        setRejectTarget(null);
        setRejectReason('');
      }
    } finally {
      setRejectLoading(false);
    }
  }

  async function handleBulkReview(status = 'APPROVED', filterType = 'all', requestKeys = null, confirmed = false) {
    const label = filterType === 'late' ? 'yêu cầu đi làm trễ' : filterType === 'ontime' ? 'yêu cầu đúng giờ' : 'tất cả các yêu cầu';
    if (!confirmed) {
      setApprovalConfirm({ type: 'bulk', status, filter: filterType, requestKeys, label });
      return;
    }
    setActionLoading(true);
    try {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/admin/attendance-requests/approve-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filter: filterType, status, requestKeys }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể cập nhật yêu cầu.');
      setApprovalConfirm(null);
      setActionNotice({
        title: status === 'APPROVED' ? 'Đã duyệt thành công' : 'Đã từ chối thành công',
        message: body.message || (status === 'APPROVED' ? 'Các yêu cầu đã được phê duyệt.' : 'Các yêu cầu đã bị từ chối.'),
      });
      await loadApprovals();
    } catch (err) {
      setApprovalConfirm(null);
      setActionNotice({
        title: status === 'APPROVED' ? 'Không thể duyệt' : 'Không thể từ chối',
        message: err.message || 'Có lỗi khi cập nhật yêu cầu.',
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function previewApproval(requestKey) {
    const token = localStorage.getItem('attendance_token');
    const response = await fetch(`${apiUrl}/admin/attendance-requests/${requestKey}/image`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      alert('Không tìm thấy ảnh đối soát hoặc ảnh đã hết hạn lưu trữ.');
      return;
    }
    const result = await response.json();
    setPhotoPreview(result.data);
  }

  async function handleFaceSuccess(embeddings, imageData) {
    const action = checkedIn ? 'CHECK_OUT' : 'CHECK_IN';
    const body = await submitAttendance(
      user,
      action,
      embeddings,
      imageData,
      attendanceWindow.actionShift?.code,
    );
    const isLate = Boolean(body.data?.is_late || body.data?.punctuality_status === 'LATE');
    setFaceModal(false);
    setLatestAttendance((current) => mergeAttendanceRecords(current, {
      ...body.data,
      attendance_date: getVietnamDateString(),
      status: 'PENDING',
      is_late: isLate,
    }));
  }

  return <div className="admin-dashboard role-dashboard">
    <section className="dashboard-welcome">
      <span className="dashboard-welcome-emoji">{greetingPart === 'sáng' ? '☀️' : greetingPart === 'chiều' ? '🌤️' : '🌙'}</span>
      <div><h2>Chào buổi {greetingPart}! 👋</h2><p>Chúc bạn có một ngày làm việc hiệu quả!</p></div>
      <span className="dashboard-welcome-date">{dashboardDateLabel}</span>
    </section>
    <section className="dashboard-stat-grid">
      <DashboardStatCard
        icon={Clock3}
        tone="blue"
        title="Ca hiện tại"
        value={currentShift ? formatShiftName(currentShift) : attendanceWindow.actionShift ? formatShiftName(attendanceWindow.actionShift) : 'Chưa có ca'}
        detail={currentShift ? `${formatDisplayTime(currentShift.start)} – ${formatDisplayTime(currentShift.end)}` : attendanceWindow.actionShift ? `Mở lúc ${formatDisplayTime(attendanceWindow.actionShift.start)}` : 'Không có ca đang diễn ra'}
        badge={currentShift ? 'Đang mở' : null}
      />
      <DashboardStatCard
        icon={CalendarCheck}
        tone="green"
        title="Trạng thái hôm nay"
        value={statsLoading ? 'Đang tải...' : dashboardStats?.todayCheckins ? `${dashboardStats.todayCheckins} đã chấm` : 'Chưa chấm công'}
        detail="Tài khoản Admin không bắt buộc điểm danh"
      />
      <DashboardStatCard
        icon={CalendarDays}
        tone="purple"
        title="Tổng ca trong ngày"
        value={activeShiftCount}
        detail="ca đang hoạt động"
      />
      <DashboardStatCard
        icon={UsersRound}
        tone="teal"
        title="Ngày làm việc"
        value="Hôm nay"
        detail={dashboardDateLabel}
      />
    </section>
    <section className="dashboard-main-grid">
      <DashboardShiftsCard shifts={dashboardShifts} isAdmin />
      <section className="dashboard-content-card dashboard-weekly-chart-card">
        <div className="dashboard-content-heading"><span className="dashboard-section-icon blue"><BarChart3 size={18} /></span><div><h2>Thống kê chấm công</h2><p>7 ngày gần nhất</p></div></div>
        {statsLoading ? <div className="dashboard-chart-loading">Đang tải thống kê...</div> : (
          <DashboardBarChart data={weeklyData} />
        )}
      </section>
      <section className="dashboard-content-card dashboard-weekly-donut-card">
        <div className="dashboard-content-heading"><span className="dashboard-section-icon purple"><CalendarCheck size={18} /></span><h2>Tỷ lệ chấm công tuần</h2></div>
        {statsLoading ? <div className="dashboard-chart-loading">Đang tải thống kê...</div> : (
          <DashboardAttendanceDonut present={weeklyPresent} total={weeklyTotal} />
        )}
      </section>
    </section>
    <section className="dashboard-admin-summary">
      <DashboardStatCard icon={CalendarDays} tone="blue" title="Tổng ngày công" value={statsLoading ? '...' : `${dashboardStats?.totalWorkDays || 0}`} detail={`${dashboardStats?.totalStudents || 0} sinh viên`} />
      <DashboardStatCard icon={Clock3} tone="green" title="Tổng giờ công" value={statsLoading ? '...' : `${Number(dashboardStats?.totalHours || 0).toLocaleString('vi-VN')} giờ`} detail="Dữ liệu toàn hệ thống" />
      <DashboardStatCard icon={UsersRound} tone="purple" title="Chờ phê duyệt" value={approvals.length} detail="Yêu cầu chấm công" />
    </section>
    <section className="approval-panel content-panel">
      <div className="panel-heading">
        <div>
          <h3>{user.role === 'ADMIN' ? 'Yêu cầu cần phê duyệt' : 'Trạng thái duyệt'}</h3>
          <p>{user.role === 'ADMIN' ? 'Các lượt chấm công đang chờ đối soát' : 'Lượt chấm công hôm nay'}</p>
        </div>
        {user.role === 'ADMIN' && (
          <div className="approval-heading-actions">
            {approvals.length > 0 && (
              <button className="view-all-button" onClick={() => setShowAllModal(true)}>
                Xem tất cả ({approvals.length})
                <ExternalLink size={13} />
              </button>
            )}
          </div>
        )}
      </div>
      {user.role === 'ADMIN' ? (
        approvals.length ? (
          <>
            <div className="approval-list">
              {approvals.slice(0, 5).map((item) => (
                <ApprovalRow key={item.request_key || getAttendanceId(item)} event={item} onPreview={() => previewApproval(item.request_key || getAttendanceId(item))} onReview={requestApproval} onReject={openRejectModal} processingId={processingId} />
              ))}
            </div>
            {approvals.length > 5 && (
              <div className="approval-more-hint">
                <span>Còn <strong>{approvals.length - 5}</strong> yêu cầu khác đang chờ phê duyệt. </span>
                <button type="button" onClick={() => setShowAllModal(true)}>
                  Xem tất cả ({approvals.length}) &amp; xử lý hàng loạt →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="approval-empty">Không có yêu cầu đang chờ duyệt.</div>
        )
      ) : (
        <div>
          <div className={`status-badge ${latestAttendance?.punctuality_status === 'LATE' ? 'late' : latestAttendance?.punctuality_status === 'ON_TIME' ? 'on-time' : 'pending'}`}>
            {latestAttendance?.punctuality_status === 'LATE' ? 'Đi làm trễ' : latestAttendance?.punctuality_status === 'ON_TIME' ? 'Đúng giờ' : 'Chưa có lượt chấm công'}
          </div>
          {latestAttendance?.status === 'PENDING' && <div className="approval-note">Chờ Quản trị viên duyệt</div>}
        </div>
      )}
    </section>
    {faceModal && <FaceModal checkedIn={checkedIn} faceRegistered={Boolean(user.faceRegistered)} onClose={() => setFaceModal(false)} onSuccess={handleFaceSuccess} onReplaceFace={(embeddings) => replaceFaceEmbedding(user, embeddings)} />}
    {photoPreview && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setPhotoPreview(null)}><motion.div className="photo-preview-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setPhotoPreview(null)}><X size={18} /></button><img src={photoPreview} alt="Ảnh đối soát khuôn mặt" onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/400x300?text=Không+thể+tải+ảnh'; }} /></motion.div></motion.div>}
    <AnimatePresence>
      {showAllModal && (
        <AllRequestsModal
          requests={approvals}
          onClose={() => setShowAllModal(false)}
          onReview={requestApproval}
          onReject={openRejectModal}
          onBulkReview={handleBulkReview}
          onPreview={previewApproval}
          actionLoading={actionLoading}
          processingId={processingId}
        />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {approvalConfirm && (
        <ApprovalConfirmationModal
          event={approvalConfirm.event}
          bulk={approvalConfirm.type === 'bulk'}
          status={approvalConfirm.status}
          label={approvalConfirm.label}
          loading={actionLoading || processingId !== null}
          onConfirm={handleConfirmApproval}
          onCancel={() => setApprovalConfirm(null)}
        />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {actionNotice && (
        <ActionNoticeModal
          title={actionNotice.title}
          message={actionNotice.message}
          onClose={() => setActionNotice(null)}
        />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {rejectTarget && (
        <RejectConfirmationModal
          event={rejectTarget}
          reason={rejectReason}
          setReason={setRejectReason}
          onConfirm={handleConfirmReject}
          onCancel={() => { setRejectTarget(null); setRejectReason(''); }}
          loading={rejectLoading}
        />
      )}
    </AnimatePresence>
  </div>;
}

function StudentManagement() {
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const token = localStorage.getItem('attendance_token');

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`${apiUrl}/admin/imported-attendance/users?search=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => response.json())
        .then((body) => setMembers(body.data || []))
        .catch(() => setMembers([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (confirm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [confirm]);

  async function selectMember(member) {
    const response = await fetch(`${apiUrl}/admin/imported-attendance/users/${member.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (response.ok && body.success) setSelected(body.data);
  }

  async function resetMemberFace(member) {
    if (!window.confirm(`Xóa dữ liệu khuôn mặt đã lưu của ${member.full_name} để đăng ký lại?`)) return;
    try {
      const response = await fetch(`${apiUrl}/admin/users/${member.id}/face/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể đặt lại khuôn mặt.');
      setMessage(body.message);
      await selectMember(member);
    } catch (requestError) {
      setMessage(requestError.message);
    }
  }

  async function openMemberPhoto(record, type) {
    const prefix = type === 'check-in' ? 'check_in' : 'check_out';
    const availableKey = `${prefix}_photo_available`;
    const expiredKey = `${prefix}_photo_expired`;
    if (record.source !== 'Camera' || record[availableKey] === 0 || record[expiredKey]) return;
    const response = await fetch(`${apiUrl}/admin/attendance/${record.id}/image/${type}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) {
      setMessage('Ảnh đã hết hạn hoặc không tồn tại.');
      return;
    }
    const label = (selected?.user.full_name || '') + ' · ' + (type === 'check-in' ? 'Check-in' : 'Check-out');
    const result = await response.json();
    setPhotoPreview({ url: result.data, label });
  }

  async function executeDelete() {
    const target = confirm;
    if (!target) return;
    const endpoint = target.all
      ? `/admin/imported-attendance/users/${selected.user.id}`
      : target.record.source === 'Camera'
        ? `/admin/attendance/${target.record.id}`
        : `/admin/imported-attendance/records/${target.record.id}`;
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) {
      setMessage(body.message || 'Không thể xóa công.');
      return;
    }
    setMessage(body.message);
    setConfirm(null);
    setReason('');
    await selectMember(selected.user);
  }

  async function executeDeleteUser(targetUser) {
    if (!targetUser?.id) return;
    try {
      const response = await fetch(`${apiUrl}/admin/users/${targetUser.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        setMessage(body.message || 'Không thể xóa thành viên.');
        return;
      }
      setMessage(body.message);
      setConfirm(null);
      setReason('');
      if (selected?.user?.id === targetUser.id) {
        setSelected(null);
      }
      setSelectedIds((current) => current.filter((id) => id !== targetUser.id));
      const refresh = await fetch(`${apiUrl}/admin/imported-attendance/users?search=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } });
      const refreshBody = await refresh.json();
      setMembers(refreshBody.data || []);
    } catch (err) {
      setMessage(err.message || 'Lỗi khi xóa thành viên.');
    }
  }

  async function executeBulkDeleteUsers() {
    if (!selectedIds.length) return;
    try {
      const response = await fetch(`${apiUrl}/admin/bulk-delete-users`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userIds: selectedIds }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        setMessage(body.message || 'Không thể xóa các thành viên đã chọn.');
        return;
      }
      setMessage(body.message);
      setSelectedIds([]);
      setConfirm(null);
      setReason('');
      setSelected(null);
      const refresh = await fetch(`${apiUrl}/admin/imported-attendance/users?search=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } });
      const refreshBody = await refresh.json();
      setMembers(refreshBody.data || []);
    } catch (err) {
      setMessage(err.message || 'Lỗi khi xóa thành viên.');
    }
  }

  const allVisibleSelected = members.length > 0 && members.every((member) => selectedIds.includes(member.id));
  function toggleMember(memberId) {
    setSelectedIds((current) => current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId]);
  }
  function toggleAllVisible() {
    setSelectedIds(allVisibleSelected ? [] : members.map((member) => member.id));
  }
  async function executeBulkDelete() {
    const response = await fetch(`${apiUrl}/admin/imported-attendance/bulk-users`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userIds: selectedIds, reason }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) {
      setMessage(body.message || 'Không thể xóa công đã chọn.');
      return;
    }
    setMessage(body.message);
    setSelectedIds([]);
    setConfirm(null);
    setReason('');
    setSelected(null);
    const refresh = await fetch(`${apiUrl}/admin/imported-attendance/users?search=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } });
    const refreshBody = await refresh.json();
    setMembers(refreshBody.data || []);
  }

  return <div className="student-management-page manage-students-container"><ExcelImportCard /><section className="content-panel attendance-management manage-students-card">
    <div className="panel-heading">
      <div>
        <h3>Quản lý & Tra cứu ngày công</h3>
        <p>Tìm kiếm thành viên, đặt lại khuôn mặt, xóa tài khoản hoặc điều chỉnh dữ liệu import</p>
      </div>
      {selectedIds.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="danger-button" onClick={() => setConfirm({ bulk: true })}>
            <Trash2 size={15} /> Xóa công ({selectedIds.length})
          </button>
          <button className="danger-button" style={{ backgroundColor: '#dc2626', color: '#ffffff' }} onClick={() => setConfirm({ bulkUser: true })}>
            <UserMinus size={15} /> Xóa người ({selectedIds.length})
          </button>
        </div>
      )}
    </div>
    <div className="attendance-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập họ tên nhân viên..." /></div>
    <div className="select-all-row"><label><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /> Chọn tất cả sinh viên đang hiển thị</label><small>{selectedIds.length} đã chọn</small></div>
    <div className="management-layout">
      <div className="member-results">
        {members.map((member) => (
          <div key={member.id} className={`member-result ${selected?.user.id === member.id ? 'active' : ''}`}>
            <input type="checkbox" checked={selectedIds.includes(member.id)} onChange={() => toggleMember(member.id)} aria-label={`Chọn ${member.full_name}`} />
            <button type="button" className="member-result-content" onClick={() => selectMember(member)}>
              <strong>{member.full_name}</strong>
              <small>{member.student_code || 'Chưa có MSSV'} · {Number(member.total_work_days || 0)} công</small>
            </button>
            <button
              type="button"
              className="secondary-button member-face-reset"
              onClick={(event) => {
                event.stopPropagation();
                void resetMemberFace(member);
              }}
              aria-label={`Đăng ký lại khuôn mặt cho ${member.full_name}`}
            >
              Đặt lại mặt
            </button>
            <button
              type="button"
              className="icon-danger delete-member-quick"
              title={`Xóa ${member.full_name} khỏi hệ thống`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirm({ deleteUser: true, member });
              }}
              aria-label={`Xóa ${member.full_name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      {selected && (
        <div className="member-detail">
          <div className="member-detail-heading">
            <div>
              <h4>{selected.user.full_name}</h4>
              <p>{selected.user.student_code || 'Chưa có MSSV'} · Tổng công: <strong>{Number(selected.user.total_work_days || 0)}</strong></p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="secondary-button" onClick={() => resetMemberFace(selected.user)}>
                Đăng ký lại khuôn mặt
              </button>
              <button className="danger-button" onClick={() => setConfirm({ all: true })}>
                <Trash2 size={15} /> Xóa toàn bộ công
              </button>
              <button
                className="danger-button"
                style={{ backgroundColor: '#dc2626', color: '#ffffff' }}
                onClick={() => setConfirm({ deleteUser: true, member: selected.user })}
              >
                <UserMinus size={15} /> Xóa người này
              </button>
            </div>
          </div>
          <div className="user-info-grid">
            <div><span>Tên đăng nhập</span><strong>{selected.user.username || '—'}</strong></div>
            <div><span>Số điện thoại</span><strong>{selected.user.phone || 'Chưa cập nhật'}</strong></div>
            <div><span>Địa chỉ</span><strong>{selected.user.address || 'Chưa cập nhật'}</strong></div>
            <div><span>Quê quán</span><strong>{selected.user.hometown_province_name || 'Chưa cập nhật'}</strong></div>
            <div><span>Khuôn mặt</span><strong>{selected.user.face_registered ? 'Đã đăng ký' : 'Chưa đăng ký'}</strong></div>
            <div><span>Mật khẩu</span><strong>{selected.user.must_change_password ? 'Đang dùng mật khẩu tạm' : 'Đã đổi mật khẩu'}</strong></div>
          </div>
          <div className="imported-record-list">
            {(selected.records || []).map((record) => (
              <div className="imported-record" key={`${record.source}-${record.id}`}>
                <span>{new Date(record.attendance_date).toLocaleDateString('vi-VN')} · {formatShiftName({ name: record.shift_name })}<small className="record-source">{record.source}</small></span>
                <small>{formatDisplayTime(record.check_in) || '--:--'} — {formatDisplayTime(record.check_out) || '--:--'} · {record.status === 'APPROVED' ? 'Đã duyệt' : record.status}</small>
                {record.source === 'Camera' && (
                  <span className="record-photo-actions">
                    <button type="button" disabled={!record.check_in_photo_available || record.check_in_photo_expired} onClick={() => openMemberPhoto(record, 'check-in')}>
                      Ảnh vào{record.check_in_photo_expired ? ' · Hết hạn' : ''}
                    </button>
                    <button type="button" disabled={!record.check_out_photo_available || record.check_out_photo_expired} onClick={() => openMemberPhoto(record, 'check-out')}>
                      Ảnh ra{record.check_out_photo_expired ? ' · Hết hạn' : ''}
                    </button>
                  </span>
                )}
                <button className="icon-danger" onClick={() => setConfirm({ record })} aria-label="Xóa ca"><Trash2 size={15} /></button>
              </div>
            ))}
            {!(selected.records || []).length && <div className="history-empty">Chưa có lịch sử chấm công.</div>}
          </div>
        </div>
      )}
    </div>
    {message && <div className="approval-note" style={{ marginTop: 14, fontSize: 13, fontWeight: 500 }}>{message}</div>}
    {confirm && (
      <div className="strict-delete-overlay">
        <div className="strict-delete-modal">
          <button className="modal-close" onClick={() => { setConfirm(null); setReason(''); }}>
            <X size={18} />
          </button>
          {confirm.deleteUser ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#dc2626' }}>
                <AlertTriangle size={24} />
                <h3 style={{ color: '#dc2626', margin: 0 }}>Xác nhận xóa thành viên</h3>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: '#334155', margin: 0 }}>
                Bạn có chắc chắn muốn xóa thành viên <strong>"{confirm.member?.full_name}"</strong> {confirm.member?.student_code ? `(MSSV: ${confirm.member.student_code})` : confirm.member?.username ? `(@${confirm.member.username})` : ''} vĩnh viễn khỏi hệ thống không?
              </p>
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
                color: '#991b1b',
                lineHeight: 1.5,
              }}>
                ⚠️ <strong>Cảnh báo quan trọng:</strong> Tất cả tài khoản, mật khẩu, dữ liệu chấm công và lịch sử đối soát liên quan của thành viên này sẽ bị xóa vĩnh viễn và không thể khôi phục!
              </div>
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => { setConfirm(null); setReason(''); }}>Hủy bỏ</button>
                <button
                  className="danger-button"
                  style={{ backgroundColor: '#dc2626', color: '#ffffff', fontWeight: 600 }}
                  onClick={() => executeDeleteUser(confirm.member)}
                >
                  Xác nhận xóa vĩnh viễn
                </button>
              </div>
            </>
          ) : confirm.bulkUser ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#dc2626' }}>
                <AlertTriangle size={24} />
                <h3 style={{ color: '#dc2626', margin: 0 }}>Xác nhận xóa {selectedIds.length} thành viên</h3>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: '#334155', margin: 0 }}>
                Bạn có chắc chắn muốn xóa vĩnh viễn <strong>{selectedIds.length} thành viên đã chọn</strong> khỏi hệ thống không?
              </p>
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
                color: '#991b1b',
                lineHeight: 1.5,
              }}>
                ⚠️ <strong>Cảnh báo quan trọng:</strong> Toàn bộ tài khoản và lịch sử chấm công của tất cả thành viên đã chọn sẽ bị xóa vĩnh viễn khỏi hệ thống!
              </div>
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => { setConfirm(null); setReason(''); }}>Hủy bỏ</button>
                <button
                  className="danger-button"
                  style={{ backgroundColor: '#dc2626', color: '#ffffff', fontWeight: 600 }}
                  onClick={executeBulkDeleteUsers}
                >
                  Xác nhận xóa tất cả đã chọn
                </button>
              </div>
            </>
          ) : (
            <>
              <h3>Xác nhận xóa</h3>
              <p>
                Bạn có chắc chắn muốn xóa {confirm.bulk ? `toàn bộ công của ${selectedIds.length} sinh viên` : confirm.all ? 'toàn bộ công của sinh viên này' : 'ca làm việc này'}?
              </p>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Nhập lý do xóa (không bắt buộc)..."
                rows="3"
              ></textarea>
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => { setConfirm(null); setReason(''); }}>Hủy bỏ</button>
                <button className="danger-button" onClick={confirm.bulk ? executeBulkDelete : executeDelete}>Xác nhận xóa</button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    {photoPreview && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setPhotoPreview(null)}><div className="photo-preview-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setPhotoPreview(null)}><X size={18} /></button><span className="section-label">{photoPreview.label}</span><img src={photoPreview.url} alt={photoPreview.label} onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/400x300?text=Không+thể+tải+ảnh'; }} /></div></motion.div>}
  </section></div>;
}

function ExcelImportCard() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  async function readFile(file) {
    if (!file || !/\.(xlsx|xls)$/i.test(file.name)) {
      setMessage('Vui lòng chọn file .xlsx hoặc .xls.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const parsed = parseAttendanceWorkbook(await file.arrayBuffer());
      setPreview(parsed);
    } catch (error) {
      setMessage(error.message || 'Không thể đọc file Excel.');
    } finally {
      setLoading(false);
    }
  }
  async function confirmImport() {
    if (!preview) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/admin/attendance/import-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ members: preview.members, records: preview.records }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể lưu dữ liệu Excel.');
      setMessage(`Đã nhập ${body.imported} lượt chấm công${body.unmatched?.length ? `; không khớp ${body.unmatched.length} dòng` : ''}.${body.noStudentCodeUsers ? ` ${body.noStudentCodeUsers} tài khoản không có MSSV: đăng nhập bằng họ tên với mật khẩu user123 và đổi mật khẩu ở lần đăng nhập đầu tiên.` : ''}`);
      setPreview(null);
    } catch (error) {
      console.error('Chi tiết lỗi import Excel:', error);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }
  return <section className="content-panel excel-import-card">
    <div className="panel-heading"><div><h3>Nhập dữ liệu Excel</h3><p>Import bảng chấm công .xlsx hoặc .xls</p></div><label className="checkout-button excel-upload-button">{loading ? 'Đang xử lý...' : 'Chọn file Excel'}<input type="file" accept=".xlsx,.xls" hidden onChange={(event) => readFile(event.target.files?.[0])} /></label></div>
    {message && <div className="approval-note">{message}</div>}
    {preview && <div className="excel-preview"><strong>Đã đọc {preview.members.length} thành viên · {preview.records.length} lượt chấm công</strong><div className="excel-preview-list">{preview.members.slice(0, 5).map((member) => <div key={`${member.userMSSV}-${member.userName}`}><span>{member.userName}</span><small>{member.totalWorkDays || member.shifts} công · {member.shifts} ca</small></div>)}</div><div className="excel-preview-actions"><button className="checkout-button" onClick={confirmImport} disabled={loading}>Xác nhận lưu vào hệ thống</button><button className="modal-close" onClick={() => setPreview(null)} aria-label="Hủy import"><X size={18} /></button></div></div>}
  </section>;
}

function Metric({ icon: Icon, title, value, note, chart }) { return <motion.div className="metric-card" whileHover={{ y: -3 }}><div className="metric-top"><div className="metric-icon"><Icon size={18} /></div>{chart === 'gauge' && <div className="mini-gauge" />}{chart === 'line' && <svg className="mini-line" viewBox="0 0 70 32"><polyline points="0,25 12,20 22,23 33,10 45,15 56,5 70,8" /></svg>}{chart === 'donut' && <div className="mini-donut" />}{chart === 'user' && <div className="mini-user"><UserRound size={17} /></div>}</div><span>{title}</span><strong>{value}</strong><small>{note}</small></motion.div>; }

function EmptyAttendanceState() { return <div className="empty-attendance"><BarChart3 size={30} /><strong>Chưa có dữ liệu chấm công.</strong><span>Dữ liệu sẽ xuất hiện sau khi bắt đầu chấm công.</span></div>; }

function AttendanceChart({ data, selectedDate, onDateSelect }) {
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !Array.isArray(data) || data.length === 0) return undefined;
    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');
    const selectedIndex = data.findIndex((d) => d.date === selectedDate);

    // --- Gradient factory ---
    function createGradient(baseTop, baseBottom, highlightTop, highlightBottom) {
      return data.map((_, i) => {
        const grad = ctx.createLinearGradient(0, 0, 0, 300);
        if (i === selectedIndex) {
          grad.addColorStop(0, highlightTop);
          grad.addColorStop(1, highlightBottom);
        } else {
          grad.addColorStop(0, baseTop);
          grad.addColorStop(1, baseBottom);
        }
        return grad;
      });
    }

    const onTimeGradients = createGradient('#3B82F6', '#1D4ED8', '#60A5FA', '#2563EB');
    const lateGradients = createGradient('#F59E0B', '#EA580C', '#FBBF24', '#F59E0B');

    const chart = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.map((item) => item.label),
        datasets: [
          {
            label: 'Đúng giờ',
            data: data.map((item) => item.onTime),
            backgroundColor: onTimeGradients,
            hoverBackgroundColor: '#60A5FA',
            borderColor: data.map((_, i) => i === selectedIndex ? '#93C5FD' : 'transparent'),
            borderWidth: data.map((_, i) => i === selectedIndex ? 2 : 0),
            borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: 'bottom',
            maxBarThickness: 28,
            barPercentage: 0.65,
            categoryPercentage: 0.8,
          },
          {
            label: 'Đi trễ',
            data: data.map((item) => item.late),
            backgroundColor: lateGradients,
            hoverBackgroundColor: '#FBBF24',
            borderColor: data.map((_, i) => i === selectedIndex ? '#FCD34D' : 'transparent'),
            borderWidth: data.map((_, i) => i === selectedIndex ? 2 : 0),
            borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: 'bottom',
            maxBarThickness: 28,
            barPercentage: 0.65,
            categoryPercentage: 0.8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: (_event, elements) => {
          if (elements.length > 0 && onDateSelect) {
            const idx = elements[0].index;
            const clickedDate = data[idx]?.date;
            if (clickedDate) onDateSelect(clickedDate);
          }
        },
        onHover: (event, elements) => {
          event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: '#64748B',
              boxWidth: 12,
              boxHeight: 12,
              borderRadius: 3,
              useBorderRadius: true,
              padding: 20,
              font: { family: 'Poppins', size: 11, weight: '500' },
            },
          },
          tooltip: {
            enabled: true,
            backgroundColor: '#0F172A',
            titleColor: '#F1F5F9',
            bodyColor: '#CBD5E1',
            footerColor: '#94A3B8',
            borderColor: '#334155',
            borderWidth: 1,
            cornerRadius: 8,
            padding: { top: 12, bottom: 12, left: 14, right: 14 },
            titleFont: { family: 'Poppins', size: 13, weight: '600' },
            bodyFont: { family: 'Poppins', size: 11, weight: '400' },
            footerFont: { family: 'Poppins', size: 10, weight: '600' },
            titleMarginBottom: 8,
            bodySpacing: 6,
            footerMarginTop: 8,
            displayColors: true,
            boxWidth: 8,
            boxHeight: 8,
            boxPadding: 6,
            usePointStyle: true,
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                if (idx == null || !data[idx]) return '';
                return `📅  ${data[idx].fullLabel}`;
              },
              label: (item) => {
                const icon = item.datasetIndex === 0 ? '🟦' : '🟧';
                return `${icon}  ${item.dataset.label}:  ${item.raw} lượt`;
              },
              footer: (items) => {
                const idx = items[0]?.dataIndex;
                if (idx == null || !data[idx]) return '';
                const d = data[idx];
                return `━━━━━━━━━━━━━━\n📊  Tổng cộng:  ${d.onTime + d.late} lượt`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: (ctx) => {
                const dateStr = data[ctx.index]?.date;
                return dateStr === selectedDate ? '#3B82F6' : '#64748B';
              },
              font: (ctx) => {
                const dateStr = data[ctx.index]?.date;
                return {
                  family: 'Poppins',
                  size: data.length > 15 ? 9 : 12,
                  weight: dateStr === selectedDate ? '700' : '500',
                };
              },
              maxRotation: data.length > 14 ? 45 : 0,
              padding: 6,
            },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            border: { display: false, dash: [4, 4] },
            grid: {
              color: 'rgba(226, 232, 240, 0.6)',
              lineWidth: 0.8,
              borderDash: [4, 4],
            },
            ticks: {
              color: '#94A3B8',
              font: { family: 'Poppins', size: 11, weight: '500' },
              padding: 8,
              precision: 0,
            },
          },
        },
        layout: {
          padding: { top: 4, bottom: 0, left: 0, right: 4 },
        },
      },
    });
    chartInstanceRef.current = chart;
    return () => { chart.destroy(); chartInstanceRef.current = null; };
  }, [data, selectedDate]);

  return <div className="chart-canvas-wrap"><canvas ref={canvasRef} aria-label="Biểu đồ hoạt động chấm công" /></div>;
}

function ApprovalRow({ event, onPreview, onReview, onReject, processingId }) {
  const attendanceId = event?.request_key || event?.event_id || event?.id || event?._id;
  const isLate = Boolean(event.is_late || event.punctuality_status === 'LATE');
  const timeStr = event.captured_at
    ? new Date(event.captured_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  return (
    <div className={`approval-row ${isLate ? 'row-late' : ''}`}>
      {event.check_in_image || event.check_out_image ? (
        <img src={event.check_in_image || event.check_out_image} alt="Minh chứng" className="approval-photo-img" onClick={() => onPreview(attendanceId)} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }} />
      ) : (
        <div className="approval-photo-placeholder" style={{ width: '40px', height: '40px', background: '#eee', color: '#888', borderRadius: '4px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2px', flexShrink: 0 }}>Không có ảnh</div>
      )}
      <div className="approval-row-content">
        <strong>
          {event.full_name}
          {event.student_code && <span className="approval-student-code">({event.student_code})</span>}
        </strong>
        <span>
          {event.event_type === 'CHECK_IN' ? 'Check-in' : 'Check-out'} · {formatShiftName({ name: event.shift_name })} · {timeStr}
        </span>
      </div>
      <div className="approval-badge-wrap">
        {isLate ? (
          <span className="badge-late-warning">
            <AlertTriangle size={13} />
            Đi làm trễ - {timeStr}
          </span>
        ) : (
          <span className="badge-on-time">
            <Check size={13} />
            Đúng giờ - {timeStr}
          </span>
        )}
      </div>
      <div className="approval-actions">
        <button className="approval-action approve" title="Duyệt" disabled={processingId !== null} onClick={(e) => { e.stopPropagation(); onReview(event); }}>{attendanceId && processingId === attendanceId ? '...' : '✓'}</button>
        <button className="approval-action reject" title="Từ chối" disabled={processingId !== null} onClick={(e) => { e.stopPropagation(); if (onReject) onReject(event); else void onReview(event, 'REJECTED'); }}>{attendanceId && processingId === attendanceId ? '...' : '×'}</button>
      </div>
    </div>
  );
}

function AllRequestsModal({ requests, onClose, onReview, onReject, onBulkReview, onPreview, actionLoading, processingId }) {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const counts = {
    all: requests.length,
    late: requests.filter((r) => r.is_late || r.punctuality_status === 'LATE').length,
    ontime: requests.filter((r) => !r.is_late && r.punctuality_status !== 'LATE').length,
  };

  const filteredRequests = requests.filter((item) => {
    const isLate = Boolean(item.is_late || item.punctuality_status === 'LATE');
    if (activeTab === 'late' && !isLate) return false;
    if (activeTab === 'ontime' && isLate) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (item.full_name || '').toLowerCase().includes(q);
      const matchCode = (item.student_code || '').toLowerCase().includes(q);
      const matchUsername = (item.username || '').toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchUsername) return false;
    }
    return true;
  });

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <div className="all-requests-modal" onClick={(e) => e.stopPropagation()}>
        <div className="all-requests-header">
          <div>
            <h3>Toàn bộ yêu cầu chấm công chờ duyệt</h3>
            <p>Quản lý, đối soát ảnh và phê duyệt hàng loạt yêu cầu chấm công của sinh viên</p>
          </div>
          <div className="all-requests-header-actions">
            {filteredRequests.length > 0 && (
              <>
                <button
                  className="btn-approve-all"
                  onClick={() => onBulkReview('APPROVED', activeTab, filteredRequests.map((item) => item.request_key || item.event_id || item.id || item._id))}
                  disabled={actionLoading}
                >
                  <CheckCheck size={16} />
                  Duyệt tất cả ({filteredRequests.length})
                </button>
                <button
                  className="btn-reject-all"
                  onClick={() => onBulkReview('REJECTED', activeTab, filteredRequests.map((item) => item.request_key || item.event_id || item.id || item._id))}
                  disabled={actionLoading}
                >
                  <X size={16} />
                  Từ chối tất cả ({filteredRequests.length})
                </button>
              </>
            )}
            <button className="modal-close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
          </div>
        </div>

        <div className="all-requests-toolbar">
          <div className="approval-filter-tabs">
            <button
              className={`filter-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              Tất cả <span className="tab-count">{counts.all}</span>
            </button>
            <button
              className={`filter-tab-btn late-tab ${activeTab === 'late' ? 'active' : ''}`}
              onClick={() => setActiveTab('late')}
            >
              <AlertTriangle size={13} /> Đi làm trễ <span className="tab-count">{counts.late}</span>
            </button>
            <button
              className={`filter-tab-btn ontime-tab ${activeTab === 'ontime' ? 'active' : ''}`}
              onClick={() => setActiveTab('ontime')}
            >
              <Check size={13} /> Đúng giờ <span className="tab-count">{counts.ontime}</span>
            </button>
          </div>
          <div className="requests-search">
            <Search size={15} />
            <input
              type="text"
              placeholder="Tìm họ tên, MSSV..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} aria-label="Xóa tìm kiếm">✕</button>
            )}
          </div>
        </div>

        <div className="all-requests-table-wrap">
          <table className="all-requests-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }}>STT</th>
                <th>Họ và tên</th>
                <th>MSSV</th>
                <th>Ngày</th>
                <th>Ca làm</th>
                <th>Thời gian sự kiện</th>
                <th>Tình trạng</th>
                <th>Ảnh đối chiếu khuôn mặt</th>
                <th style={{ textAlign: 'center' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length ? (
                filteredRequests.map((item, index) => {
                  const attendanceId = item?.request_key || item?.event_id || item?.id || item?._id;
                  const isLate = Boolean(item.is_late || item.punctuality_status === 'LATE');
                  const checkInTime = item.captured_at
                    ? new Date(item.captured_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                    : '--:--';
                  const reqDate = item.captured_at
                    ? new Date(item.captured_at).toLocaleDateString('vi-VN')
                    : (item.attendance_date ? new Date(item.attendance_date).toLocaleDateString('vi-VN') : '--');
                  return (
                    <tr key={item.request_key || item.event_id} className={isLate ? 'row-late-table' : ''}>
                      <td>{index + 1}</td>
                      <td><strong>{item.full_name}</strong></td>
                      <td><span className="student-code-tag">{item.student_code || '—'}</span></td>
                      <td>{reqDate}</td>
                      <td><span className="shift-pill">{formatShiftName({ name: item.shift_name })}</span></td>
                      <td><strong>{item.event_type === 'CHECK_OUT' ? 'Check-out' : 'Check-in'} · {checkInTime}</strong></td>
                      <td>
                        {isLate ? (
                          <span className="badge-late-warning">
                            <AlertTriangle size={12} />
                            Đi làm trễ{item.late_minutes ? ` (+${item.late_minutes}p)` : ''}
                          </span>
                        ) : (
                          <span className="badge-on-time">
                            <Check size={12} />
                            Đúng giờ
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="table-photo-btn"
                          onClick={() => onPreview(attendanceId)}
                          title="Xem ảnh chụp xác thực khuôn mặt"
                        >
                          📷 Xem ảnh
                        </button>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="table-action-btns">
                          <button
                            className="btn-table-approve"
                            title="Duyệt yêu cầu chấm công"
                            disabled={processingId !== null} onClick={(e) => { e.stopPropagation(); onReview(item); }}
                          >{attendanceId && processingId === attendanceId ? 'Đang duyệt...' : '✓ Duyệt'}</button>
                          <button
                            className="btn-table-reject"
                            title="Từ chối yêu cầu chấm công"
                            disabled={processingId !== null} onClick={(e) => { e.stopPropagation(); onReject(item); }}
                          >{attendanceId && processingId === attendanceId ? 'Đang xử lý...' : '✕ Từ chối'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="all-requests-empty">
                    Không tìm thấy yêu cầu chấm công nào phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

function ApprovalConfirmationModal({ event, bulk, status = 'APPROVED', label, onConfirm, onCancel, loading }) {
  const eventName = event?.event_type === 'CHECK_OUT' ? 'Check-out' : 'Check-in';
  const isRejecting = status === 'REJECTED';
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.stopPropagation()}>
      <motion.section className="approval-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="approval-confirm-title" onClick={(e) => e.stopPropagation()}>
        <div className={`approval-confirm-icon ${isRejecting ? 'reject' : ''}`}>{isRejecting ? <X size={22} /> : <Check size={22} />}</div>
        <h3 id="approval-confirm-title">{isRejecting ? 'Xác nhận từ chối' : 'Xác nhận phê duyệt'}</h3>
        <p>
          {bulk
            ? `Bạn có chắc chắn muốn ${isRejecting ? 'từ chối' : 'phê duyệt'} ${label || 'các yêu cầu đã chọn'}?`
            : `Bạn có chắc chắn muốn ${isRejecting ? 'từ chối' : 'duyệt'} ${eventName} của ${event?.full_name || 'người dùng'}${event?.shift_name ? ` (${event.shift_name})` : ''}?`}
        </p>
        <div className="approval-confirm-actions">
          <button type="button" className="btn-cancel-approval" onClick={onCancel} disabled={loading}>Hủy</button>
          <button type="button" className={`btn-confirm-approval ${isRejecting ? 'reject' : ''}`} onClick={onConfirm} disabled={loading}>
            {loading ? 'Đang xử lý...' : isRejecting ? 'Xác nhận từ chối' : 'Xác nhận duyệt'}
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function ActionNoticeModal({ title, message, onClose }) {
  const isError = title.startsWith('Không');
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.stopPropagation()}>
      <motion.section className="approval-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="action-notice-title" onClick={(e) => e.stopPropagation()}>
        <div className={`approval-confirm-icon ${isError ? 'reject' : ''}`}>{isError ? <AlertTriangle size={22} /> : <Check size={22} />}</div>
        <h3 id="action-notice-title">{title}</h3>
        <p>{message}</p>
        <div className="approval-confirm-actions">
          <button type="button" className="btn-confirm-approval" onClick={onClose}>Đóng</button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function RejectConfirmationModal({ event, reason, setReason, onConfirm, onCancel, loading }) {
  if (!event) return null;
  const isLate = Boolean(event.is_late || event.punctuality_status === 'LATE');
  const timeStr = event.captured_at
    ? new Date(event.captured_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const reqDate = event.captured_at
    ? new Date(event.captured_at).toLocaleDateString('vi-VN')
    : (event.attendance_date ? new Date(event.attendance_date).toLocaleDateString('vi-VN') : '--');

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} style={{ zIndex: 70 }}>
      <div className="reject-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reject-modal-header">
          <div className="reject-icon-badge">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3>Xác nhận từ chối chấm công</h3>
            <p>Bản ghi chấm công sẽ bị từ chối và sinh viên sẽ không được tính công ca này.</p>
          </div>
          <button className="modal-close" onClick={onCancel} aria-label="Đóng"><X size={18} /></button>
        </div>

        <div className="reject-student-summary">
          <div className="summary-item">
            <span className="summary-label">Sinh viên:</span>
            <strong>{event.full_name} {event.student_code && <span className="student-code-tag">{event.student_code}</span>}</strong>
          </div>
          <div className="summary-item">
            <span className="summary-label">Loại chấm công:</span>
            <span>{formatShiftName({ name: event.shift_name })} ({reqDate})</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Giờ Check-in:</span>
            <span>
              <strong>{timeStr}</strong>
              {isLate ? (
                <span className="badge-late-warning" style={{ marginLeft: 8 }}>
                  <AlertTriangle size={11} /> Đi làm trễ{event.late_minutes ? ` (+${event.late_minutes}p)` : ''}
                </span>
              ) : (
                <span className="badge-on-time" style={{ marginLeft: 8 }}>
                  <Check size={11} /> Đúng giờ
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="reject-reason-block">
          <label htmlFor="reject-reason-input">
            <strong>Lý do từ chối</strong>
            <span className="optional-hint">(Không bắt buộc, có thể để trống)</span>
          </label>
          <textarea
            id="reject-reason-input"
            rows={3}
            placeholder="Nhập lý do từ chối (Ví dụ: Chấm công sai ca, không đúng sinh viên, vi phạm quy định...)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="reject-modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={loading}>
            Hủy bỏ
          </button>
          <button type="button" className="btn-confirm-reject" onClick={onConfirm} disabled={loading}>
            {loading ? 'Đang xử lý...' : 'Xác nhận từ chối'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

let faceModelsPromise = null;

function loadFaceModelsOnce() {
  if (!faceModelsPromise) {
    const localUrl = `${apiUrl.replace('/api', '')}/models`;
    const cdnUrl = 'https://justadudewhohacks.github.io/face-api.js/models';
    const loadFrom = (url) => Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(url),
      faceapi.nets.faceLandmark68Net.loadFromUri(url),
      faceapi.nets.faceRecognitionNet.loadFromUri(url),
    ]);

    const initializeBackend = async () => {
      try {
        const initialized = await faceapi.tf.setBackend('webgl');
        if (!initialized) throw new Error('WebGL backend is unavailable.');
      } catch (webglError) {
        console.warn('WebGL không khả dụng, chuyển sang CPU cho nhận diện khuôn mặt.', webglError);
        const initialized = await faceapi.tf.setBackend('cpu');
        if (!initialized) throw new Error('Không thể khởi tạo backend nhận diện khuôn mặt.');
      }
      await faceapi.tf.ready();
    };

    faceModelsPromise = initializeBackend()
      .then(() => loadFrom(localUrl))
      .catch((localError) => {
        console.warn('Không tải được model khuôn mặt từ server, thử tải từ CDN.', localError);
        return loadFrom(cdnUrl);
      })
      .catch((error) => {
        faceModelsPromise = null;
        throw error;
      });
  }
  return faceModelsPromise;
}

function FaceModal({
  checkedIn,
  faceRegistered,
  registrationOnly = false,
  recoveryRequiresApproval = false,
  onClose,
  onSuccess,
  onReplaceFace,
  onRecoverySubmitted,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const lastEmbeddingsRef = useRef(null);
  const lastImageRef = useRef(null);
  const cameraReadyRef = useRef(false);
  const modelsLoadedRef = useRef(false);
  const warmupPromiseRef = useRef(null);
  const [cameraState, setCameraState] = useState('starting');
  const [cameraError, setCameraError] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showFaceRecovery, setShowFaceRecovery] = useState(false);

  async function detectFace(video) {
    const detect = async () => {
      for (const options of [
        { inputSize: 320, scoreThreshold: 0.2 },
        { inputSize: 416, scoreThreshold: 0.15 },
        { inputSize: 224, scoreThreshold: 0.15 },
      ]) {
        const result = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions(options))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (result) return result;
      }
      return null;
    };

    try {
      return await detect();
    } catch (error) {
      if (faceapi.tf.getBackend() !== 'webgl') throw error;
      console.warn('WebGL lỗi khi nhận diện khuôn mặt, chuyển sang CPU và thử lại.', error);
      const initialized = await faceapi.tf.setBackend('cpu');
      if (!initialized) throw new Error('Không thể khởi tạo backend CPU để nhận diện khuôn mặt.');
      await faceapi.tf.ready();
      return detect();
    }
  }

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;

    function warmModelsWhenReady() {
      if (cancelled || !cameraReadyRef.current || !modelsLoadedRef.current || warmupPromiseRef.current) return;
      if (!video?.videoWidth) return;
      warmupPromiseRef.current = detectFace(video)
        .then(() => {
          if (!cancelled) setModelReady(true);
        })
        .catch((error) => {
          console.error('Không thể khởi tạo model nhận diện khuôn mặt.', error);
          if (!cancelled) setModelError('Không thể khởi tạo model khuôn mặt. Hãy kiểm tra trình duyệt và thử lại.');
        });
    }

    function handleVideoReady() {
      warmModelsWhenReady();
    }

    video?.addEventListener('loadeddata', handleVideoReady);
    video?.addEventListener('playing', handleVideoReady);
    video?.addEventListener('resize', handleVideoReady);

    async function startVideo() {
      if (!isSecureCameraContext()) {
        setCameraError('Camera chỉ hoạt động trên HTTPS trong môi trường production. Vui lòng mở ứng dụng bằng đường dẫn HTTPS.');
        setCameraState('error');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('error');
        setCameraError('Trình duyệt không hỗ trợ camera. Hãy dùng Chrome, Edge hoặc Safari trên HTTPS/localhost.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (video) {
          video.srcObject = stream;
          await video.play();
          if (!cancelled) {
            cameraReadyRef.current = true;
            setCameraState('ready');
            warmModelsWhenReady();
          }
        }
      } catch (error) {
        if (cancelled) return;
        setCameraState('error');
        const cameraErrors = {
          NotAllowedError: 'Bạn đã từ chối quyền camera. Hãy cho phép camera trong thanh địa chỉ rồi thử lại.',
          NotFoundError: 'Không tìm thấy camera trên thiết bị này.',
          NotReadableError: 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.',
          OverconstrainedError: 'Camera trên thiết bị không hỗ trợ cấu hình yêu cầu. Hãy thử lại hoặc dùng trình duyệt khác.',
        };
        setCameraError(cameraErrors[error.name] || error.message || 'Không thể mở camera. Hãy kiểm tra quyền truy cập.');
      }
    }

    async function loadModelsOnce() {
      try {
        await loadFaceModelsOnce();
        if (!cancelled) {
          modelsLoadedRef.current = true;
          warmModelsWhenReady();
        }
      } catch (error) {
        console.error('Không thể tải model nhận diện khuôn mặt.', error);
        if (!cancelled) setModelError('Không thể tải model khuôn mặt. Hãy kiểm tra kết nối mạng rồi mở lại camera.');
      }
    }

    startVideo();
    loadModelsOnce();

    return () => {
      cancelled = true;
      video?.removeEventListener('loadeddata', handleVideoReady);
      video?.removeEventListener('playing', handleVideoReady);
      video?.removeEventListener('resize', handleVideoReady);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function confirmAttendance() {
    if (cameraState !== 'ready' || !videoRef.current?.videoWidth || submitting) return;
    setSubmitting(true);
    setCameraError('');
    setShowFaceRecovery(false);
    try {
      const scanStartedAt = performance.now();
      const video = videoRef.current;
      if (!modelReady) throw new Error('Model nhận diện chưa sẵn sàng. Vui lòng đợi một chút rồi thử lại.');
      const embeddings = [];
      for (let frame = 0; frame < 3; frame += 1) {
        if (frame > 0) await new Promise((resolve) => window.setTimeout(resolve, 150));
        const detection = await detectFace(video);
        if (detection) embeddings.push(Array.from(detection.descriptor));
      }
      if (!embeddings.length) {
        throw new Error('Chưa nhận diện được khuôn mặt. Hãy lau camera, tăng ánh sáng, nhìn thẳng và đưa mặt vào giữa khung hình rồi thử lại.');
      }
      const imageData = await compressWebcamFrame(video);
      if (registrationOnly) {
        await onSuccess(embeddings, imageData);
        onClose();
        return;
      }
      lastEmbeddingsRef.current = embeddings;
      lastImageRef.current = imageData;
      console.info(`Face scan completed in ${Math.round(performance.now() - scanStartedAt)}ms.`);
      await onSuccess(embeddings, imageData);
      onClose();
    } catch (error) {
      setCameraError(error.code === 'FACE_MISMATCH'
        ? 'Khuôn mặt chưa khớp với dữ liệu đã lưu. Bạn có thể thử lại hoặc đăng ký lại bằng camera này.'
        : error.message);
      setShowFaceRecovery(['FACE_MISMATCH', 'FACE_NOT_REGISTERED'].includes(error.code) && Boolean(lastEmbeddingsRef.current));
    } finally {
      setSubmitting(false);
    }
  }

  async function recoverFaceAndRetry() {
    const embeddings = lastEmbeddingsRef.current;
    const imageData = lastImageRef.current;
    if (!embeddings || !imageData || !onReplaceFace || submitting) return;
    setSubmitting(true);
    setCameraError('');
    setShowFaceRecovery(false);
    try {
      const result = recoveryRequiresApproval
        ? await onReplaceFace(embeddings, imageData)
        : await onReplaceFace(embeddings);
      if (recoveryRequiresApproval) {
        onRecoverySubmitted?.(result);
      } else {
        await onSuccess(embeddings, imageData);
      }
      onClose();
    } catch (error) {
      setCameraError(error.message || 'Không thể đăng ký lại khuôn mặt.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="face-modal" initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div className="face-modal-header">
          <span className="section-label">FACE AUTHENTICATION</span>
          <button className="modal-close" aria-label="Đóng" onClick={onClose}>✕</button>
        </div>
        <h2>{registrationOnly ? 'Đăng ký lại khuôn mặt' : checkedIn ? 'Xác nhận check-out' : faceRegistered ? 'Xác thực check-in' : 'Đăng ký khuôn mặt'}</h2>
        <div className="camera-stage">
          {cameraState === 'error' ? (
            <div className="camera-message">
              <Camera size={30} />
              <strong>Không mở được camera</strong>
              <span>{cameraError}</span>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="camera-video" autoPlay muted playsInline />
              <div className="scan-frame"><UserRound size={52} /><span /></div>
              <div className="scan-line" />
            </>
          )}
        </div>
        <p>
          {cameraState === 'starting' ? 'Đang khởi động camera...' :
           cameraState === 'ready' ? 'Đưa khuôn mặt vào khung hình, nhìn thẳng và giữ yên khi xác nhận.' :
           'Vui lòng cấp quyền camera và thử lại.'}
        </p>
        {cameraError && cameraState !== 'error' && <div className="camera-error">{cameraError}</div>}
        {modelError && <div className="camera-error">{modelError}</div>}
        <button
          className="checkout-button"
          style={{ backgroundColor: cameraState === 'ready' && !submitting && modelReady ? '#0d9488' : '#9ca3af', opacity: cameraState === 'ready' && !submitting && modelReady ? 1 : 0.7 }}
          disabled={cameraState !== 'ready' || submitting || !modelReady}
          onClick={confirmAttendance}
        >
          {cameraState !== 'ready' ? 'ĐANG MỞ CAMERA...' : submitting ? 'ĐANG XÁC THỰC...' : !modelReady ? 'ĐANG TẢI NHẬN DIỆN...' : registrationOnly ? 'LƯU KHUÔN MẶT MỚI' : checkedIn ? 'XÁC NHẬN CHECK-OUT' : faceRegistered ? 'XÁC NHẬN CHECK-IN' : 'ĐĂNG KÝ VÀ CHECK-IN'}
        </button>
        {showFaceRecovery && (
          <button className="secondary-button" type="button" disabled={submitting} onClick={recoverFaceAndRetry}>
            {submitting ? 'ĐANG CẬP NHẬT...' : 'ĐĂNG KÝ LẠI VÀ THỬ CHẤM CÔNG'}
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

function RegisterModal({ onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    studentCode: '',
    contact: '',
    password: '',
    confirmPassword: '',
  });
  const [otp, setOtp] = useState('');
  const [smsOtp, setSmsOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [timer, setTimer] = useState(300);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    let interval = null;
    if (step === 2 && timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, timer]);

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async function handleSendOtp(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!form.fullName.trim() || !form.username.trim() || !form.contact.trim() || !form.password) {
      setError('Vui lòng nhập đầy đủ các thông tin bắt buộc (*).');
      return;
    }

    if (form.contact.includes('@')) {
      setError('Chức năng gửi OTP qua Email hiện đang được nâng cấp. Vui lòng sử dụng Số điện thoại để nhận mã xác thực hoặc thử lại sau.');
      return;
    }

    if (form.password.length < 6) {
      setError('Mật khẩu phải có độ dài từ 6 ký tự trở lên.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/auth/send-register-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          username: form.username.trim(),
          studentCode: form.studentCode?.trim() || '',
          contact: form.contact.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Không thể gửi mã OTP. Vui lòng thử lại.');
      }
      setSmsOtp(data.data?.otp || '');
      setTimer(data.data?.expiresInSeconds || 300);
      setStep(2);
      setMessage(data.message || 'Mã xác thực đã được gửi thành công qua tin nhắn SMS.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/auth/send-register-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          username: form.username.trim(),
          studentCode: form.studentCode?.trim() || '',
          contact: form.contact.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Không thể gửi lại mã OTP.');
      }
      setSmsOtp(data.data?.otp || '');
      setTimer(300);
      setMessage('Đã gửi lại mã OTP mới qua tin nhắn SMS.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyAndRegister(event) {
    event.preventDefault();
    setError('');
    if (!otp || otp.trim().length < 6) {
      setError('Vui lòng nhập đủ 6 chữ số mã OTP.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/auth/register-with-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          username: form.username.trim(),
          studentCode: form.studentCode?.trim() || '',
          contact: form.contact.trim(),
          password: form.password,
          otp: otp.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Đăng ký thất bại. Vui lòng thử lại.');
      }

      localStorage.setItem('attendance_token', data.data.token);
      localStorage.setItem('attendance_user', JSON.stringify(data.data.user));
      onSuccess(data.data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="auth-modal-card" initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}>
        <div className="auth-modal-header">
          <h3>
            <UserPlus size={20} className="text-teal-700" />
            {step === 1 ? 'Đăng ký tài khoản' : 'Xác thực mã OTP SMS'}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}
        {message && <div className="form-success" style={{ marginBottom: 14 }}>{message}</div>}

        {step === 1 ? (
          <form onSubmit={handleSendOtp}>
            <div className="auth-field-group">
              <label>Họ và tên *</label>
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Ví dụ: Nguyễn Văn A"
                required
              />
            </div>

            <div className="auth-field-row">
              <div className="auth-field-group">
                <label>Tên đăng nhập *</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Nhập username mong muốn..."
                  required
                />
              </div>
              <div className="auth-field-group">
                <label>MSSV <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 400 }}>(Tùy chọn)</span></label>
                <input
                  value={form.studentCode}
                  onChange={(e) => setForm({ ...form, studentCode: e.target.value })}
                  placeholder="Ví dụ: 21110123 (nếu có)"
                />
              </div>
            </div>

            <div className="auth-field-group">
              <label>Số điện thoại nhận mã OTP (Email đang nâng cấp) *</label>
              <input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="Nhập số điện thoại của bạn (ví dụ: 0912345678)..."
                required
              />
            </div>

            <div className="auth-field-row">
              <div className="auth-field-group">
                <label>Mật khẩu *</label>
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Ít nhất 6 ký tự"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="auth-field-group">
                <label>Nhập lại mật khẩu *</label>
                <div className="password-field">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Nhập lại mật khẩu"
                    required
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}>
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <button className="primary-button" type="submit" disabled={loading} style={{ marginTop: 12 }}>
              {loading ? 'ĐANG GỬI MÃ...' : 'TIẾP TỤC & NHẬN MÃ OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyAndRegister}>
            {smsOtp && (
              <div style={{
                background: '#ecfdf5',
                border: '1px solid #6ee7b7',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 14,
                fontSize: 13,
                color: '#065f46',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <Smartphone size={18} className="text-teal-700" style={{ flexShrink: 0 }} />
                <div>
                  <strong>[Tin nhắn SMS đến {form.contact}]:</strong> Mã OTP của bạn là: <strong style={{ letterSpacing: 2, fontSize: 15 }}>{smsOtp}</strong>
                </div>
              </div>
            )}
            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px', lineHeight: 1.5 }}>
              Mã xác thực 6 chữ số đã được gửi qua SMS đến: <strong>{form.contact}</strong>. Vui lòng nhập mã để hoàn tất:
            </p>

            <div className="otp-box-wrap">
              <input
                className="otp-digit-input"
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                autoFocus
                required
              />
              <div className="otp-timer-info">
                <span>Hiệu lực còn: <strong style={{ color: timer > 0 ? '#0d9488' : '#dc2626' }}>{formatTime(timer)}</strong></span>
                <button
                  type="button"
                  className="btn-resend-otp"
                  disabled={loading || timer > 240}
                  onClick={handleResendOtp}
                >
                  Gửi lại mã
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                className="secondary-button"
                style={{ flex: 1, padding: 12 }}
                onClick={() => setStep(1)}
                disabled={loading}
              >
                <ArrowLeft size={16} /> Quay lại
              </button>
              <button
                className="primary-button"
                type="submit"
                style={{ flex: 2, margin: 0 }}
                disabled={loading || !otp || otp.length < 6}
              >
                {loading ? 'ĐANG XÁC THỰC...' : 'XÁC NHẬN ĐĂNG KÝ'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

function ForgotPasswordModal({ onClose }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    username: '',
    contactInfo: '',
  });
  const [maskedContact, setMaskedContact] = useState('');
  const [otp, setOtp] = useState('');
  const [smsOtp, setSmsOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [timer, setTimer] = useState(300);

  useEffect(() => {
    let interval = null;
    if (step === 2 && timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, timer]);

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async function handleSendForgotOtp(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!form.username.trim() || !form.contactInfo.trim()) {
      setError('Vui lòng nhập đầy đủ Tên đăng nhập và Số điện thoại.');
      return;
    }

    if (form.contactInfo.includes('@')) {
      setError('Chức năng gửi OTP qua Email hiện đang được nâng cấp. Vui lòng sử dụng Số điện thoại để nhận mã xác thực hoặc thử lại sau.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          contactInfo: form.contactInfo.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Không thể gửi mã khôi phục.');
      }
      setMaskedContact(data.data?.maskedContact || form.contactInfo);
      setSmsOtp(data.data?.otp || '');
      setTimer(data.data?.expiresInSeconds || 300);
      setStep(2);
      setMessage(data.message || 'Mã xác thực OTP đã được gửi qua tin nhắn SMS.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!otp || otp.trim().length < 6) {
      setError('Vui lòng nhập đủ 6 chữ số mã OTP.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          contact: form.contactInfo.trim(),
          otp: otp.trim(),
          newPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Đặt lại mật khẩu thất bại.');
      }
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="auth-modal-card" initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}>
        <div className="auth-modal-header">
          <h3>
            <KeyRound size={20} className="text-red-600" />
            {step === 1 ? 'Quên mật khẩu' : step === 2 ? 'Đặt lại mật khẩu' : 'Thành công'}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}
        {message && step !== 3 && <div className="form-success" style={{ marginBottom: 14 }}>{message}</div>}

        {step === 1 && (
          <form onSubmit={handleSendForgotOtp}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px', lineHeight: 1.5 }}>
              Vui lòng cung cấp <strong>Tên đăng nhập</strong> và <strong>Số điện thoại</strong> đã đăng ký để nhận mã OTP qua SMS (Chức năng Email đang nâng cấp):
            </p>
            <div className="auth-field-group">
              <label>Tên tài khoản (Username) *</label>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Nhập tên đăng nhập của bạn..."
                autoFocus
                required
              />
            </div>
            <div className="auth-field-group">
              <label>Số điện thoại đã đăng ký (Email đang nâng cấp) *</label>
              <input
                value={form.contactInfo}
                onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
                placeholder="Nhập số điện thoại đã đăng ký..."
                required
              />
            </div>
            <button className="primary-button" type="submit" disabled={loading} style={{ marginTop: 12 }}>
              {loading ? 'ĐANG KIỂM TRA...' : 'GỬI MÃ XÁC THỰC OTP'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleResetPassword}>
            {smsOtp && (
              <div style={{
                background: '#ecfdf5',
                border: '1px solid #6ee7b7',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 14,
                fontSize: 13,
                color: '#065f46',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <Smartphone size={18} className="text-teal-700" style={{ flexShrink: 0 }} />
                <div>
                  <strong>[Tin nhắn SMS đến {maskedContact}]:</strong> Mã OTP của bạn là: <strong style={{ letterSpacing: 2, fontSize: 15 }}>{smsOtp}</strong>
                </div>
              </div>
            )}
            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px', lineHeight: 1.5 }}>
              Mã xác thực đã gửi qua SMS tới <strong>{maskedContact}</strong>. Vui lòng nhập mã OTP và thiết lập mật khẩu mới:
            </p>

            <div className="auth-field-group">
              <label>Mã xác thực OTP (6 số) *</label>
              <input
                className="otp-digit-input"
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                autoFocus
                required
              />
              <div className="otp-timer-info">
                <span>Hiệu lực còn: <strong style={{ color: timer > 0 ? '#dc2626' : '#94a3b8' }}>{formatTime(timer)}</strong></span>
                <button
                  type="button"
                  className="btn-resend-otp"
                  disabled={loading || timer > 240}
                  onClick={handleSendForgotOtp}
                >
                  Gửi lại mã
                </button>
              </div>
            </div>

            <div className="auth-field-group" style={{ marginTop: 14 }}>
              <label>Mật khẩu mới *</label>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="auth-field-group">
              <label>Xác nhận mật khẩu mới *</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                required
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                className="secondary-button"
                style={{ flex: 1, padding: 12 }}
                onClick={() => setStep(1)}
                disabled={loading}
              >
                <ArrowLeft size={16} /> Quay lại
              </button>
              <button
                className="primary-button"
                type="submit"
                style={{ flex: 2, margin: 0 }}
                disabled={loading || !otp || otp.length < 6}
              >
                {loading ? 'ĐANG CẬP NHẬT...' : 'ĐẶT LẠI MẬT KHẨU'}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '20px 10px' }}>
            <div style={{ width: 60, height: 60, background: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Check size={32} />
            </div>
            <h4 style={{ color: '#0f172a', fontSize: 18, margin: '0 0 8px', fontWeight: 700 }}>Đổi mật khẩu thành công!</h4>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 24px', lineHeight: 1.5 }}>
              Mật khẩu của bạn đã được cập nhật an toàn. Bạn có thể tiến hành đăng nhập với mật khẩu mới.
            </p>
            <button className="primary-button" type="button" onClick={onClose}>
              ĐĂNG NHẬP NGAY
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function ShiftManagement() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [updatingShiftId, setUpdatingShiftId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', start_time: '', end_time: '', is_active: true });

  useEffect(() => {
    loadShifts();
  }, []);

  async function loadShifts() {
    setLoading(true);
    try {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/shifts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể tải danh sách ca làm.');
      setShifts(body.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(shift) {
    setEditingId(shift.id);
    setEditForm({
      name: shift.name,
      start_time: String(shift.start_time).slice(0, 5),
      end_time: String(shift.end_time).slice(0, 5),
      is_active: shift.is_active === 1 || shift.is_active === true
    });
    setError('');
    setSuccess('');
  }

  function cancelEdit() {
    setEditingId(null);
    setError('');
  }

  async function saveEdit(id) {
    setError('');
    setSuccess('');
    const startSeconds = editForm.start_time.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    const endSeconds = editForm.end_time.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    if (endSeconds <= startSeconds) {
      setError('Giờ kết thúc phải sau giờ bắt đầu.');
      return;
    }
    setUpdatingShiftId(id);
    try {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/shifts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editForm)
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Lỗi khi cập nhật ca làm.');
      setEditingId(null);
      await loadShifts();
      setSuccess(body.message || 'Cập nhật ca làm việc thành công.');
    } catch (err) {
      setError(err.message || 'Không thể cập nhật ca làm việc.');
    } finally {
      setUpdatingShiftId(null);
    }
  }

  async function toggleShiftAvailability(shift) {
    setError('');
    setSuccess('');
    setUpdatingShiftId(shift.id);
    try {
      const token = localStorage.getItem('attendance_token');
      const currentlyActive = Number(shift.is_active) === 1 || shift.is_active === true;
      const response = await fetch(`${apiUrl}/shifts/${shift.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: shift.name,
          start_time: shift.start_time,
          end_time: shift.end_time,
          is_active: !currentlyActive,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể cập nhật trạng thái ca.');
      await loadShifts();
      setSuccess(body.message || 'Đã cập nhật trạng thái ca làm việc.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUpdatingShiftId(null);
    }
  }

  return (
    <section className="shift-management-page">
      <div className="history-heading">
        <div>
          <span className="section-label">GLOBAL SHIFTS SETTINGS</span>
          <h2>Quản lý cấu hình ca làm việc</h2>
          <p>Admin có thể điều chỉnh giờ bắt đầu, giờ kết thúc và trạng thái mở ca áp dụng cho toàn hệ thống.</p>
        </div>
      </div>
      
      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}
      
      <div className="history-table-wrap" style={{ marginTop: '20px' }}>
        <table className="history-table">
          <thead>
            <tr>
              <th>Mã ca</th>
              <th>Tên ca</th>
              <th>Giờ bắt đầu</th>
              <th>Giờ kết thúc</th>
              <th>Trạng thái ca</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ textAlign: 'center' }}>Đang tải...</td></tr>
            ) : shifts.map(shift => (
              <tr key={shift.id}>
                <td><strong>{shift.id}</strong></td>
                <td>
                  {editingId === shift.id ? (
                    <input 
                      type="text" 
                      value={editForm.name} 
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })} 
                      style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px', width: '100px' }}
                    />
                  ) : formatShiftName(shift)}
                </td>
                <td>
                  {editingId === shift.id ? (
                    <input 
                      type="time" 
                      step="60"
                      value={editForm.start_time} 
                      onChange={e => setEditForm({ ...editForm, start_time: e.target.value })} 
                      aria-label={`Giờ bắt đầu ${shift.name}`}
                      style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                  ) : String(shift.start_time).slice(0, 5)}
                </td>
                <td>
                  {editingId === shift.id ? (
                    <input 
                      type="time" 
                      step="60"
                      value={editForm.end_time} 
                      onChange={e => setEditForm({ ...editForm, end_time: e.target.value })} 
                      aria-label={`Giờ kết thúc ${shift.name}`}
                      style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                  ) : String(shift.end_time).slice(0, 5)}
                </td>
                <td>
                  {editingId === shift.id ? (
                    <input 
                      type="checkbox" 
                      checked={editForm.is_active} 
                      onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} 
                    />
                  ) : (Number(shift.is_active) === 1 || shift.is_active === true ? <span style={{ color: '#16a34a', fontWeight: 'bold' }}>ĐANG MỞ</span> : <span style={{ color: '#dc2626', fontWeight: 'bold' }}>ĐANG TẮT</span>)}
                </td>
                <td>
                  {editingId === shift.id ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="primary-button" disabled={updatingShiftId !== null} style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => saveEdit(shift.id)}>{updatingShiftId === shift.id ? 'ĐANG LƯU...' : 'Lưu'}</button>
                      <button className="secondary-button" disabled={updatingShiftId !== null} style={{ padding: '4px 8px', fontSize: '12px' }} onClick={cancelEdit}>Hủy</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="shift-toggle"
                        disabled={updatingShiftId !== null}
                        onClick={() => toggleShiftAvailability(shift)}
                      >
                        {updatingShiftId === shift.id ? 'ĐANG LƯU...' : Number(shift.is_active) === 1 || shift.is_active === true ? 'Tắt ca' : 'Bật ca'}
                      </button>
                      <button className="secondary-button" disabled={updatingShiftId !== null} style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => startEdit(shift)}>Sửa giờ</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default App;
