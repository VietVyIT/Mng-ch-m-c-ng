import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import * as faceapi from '@vladmandic/face-api';
import * as XLSX from 'xlsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Camera,
  CalendarCheck,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  FileClock,
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
  Trash2,
  UserMinus,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';

const configuredApiUrl = import.meta.env.VITE_API_URL;
const apiUrl = configuredApiUrl || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

if (import.meta.env.PROD && !configuredApiUrl) {
  console.warn('VITE_API_URL không được cung cấp, sử dụng relative path /api cho production.');
}

function useRealtimeShift(eveningEnabled) {
  const [currentShift, setCurrentShift] = useState(null);

  useEffect(() => {
    function updateShift() {
      const now = new Date();
      const totalMinutes = now.getHours() * 60 + now.getMinutes();
      
      if (totalMinutes >= 360 && totalMinutes <= 720) {
        setCurrentShift({ code: 'MORNING', name: 'CA SÁNG', start: '07:30:00', end: '12:00:00' });
      } else if (totalMinutes > 720 && totalMinutes <= 1050) {
        setCurrentShift({ code: 'AFTERNOON', name: 'CA CHIỀU', start: '13:30:00', end: '17:30:00' });
      } else if (totalMinutes > 1050 && totalMinutes <= 1320 && eveningEnabled !== false) {
        setCurrentShift({ code: 'EVENING', name: 'CA TỐI', start: '18:00:00', end: '20:00:00' });
      } else {
        setCurrentShift(null);
      }
    }
    
    updateShift();
    const interval = setInterval(updateShift, 30000);
    return () => clearInterval(interval);
  }, [eveningEnabled]);

  return currentShift;
}

function isSecureCameraContext() {
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

const adminNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Chấm công', icon: CalendarCheck },
  { label: 'Lịch sử', icon: FileClock },
  { label: 'Quản lý sinh viên', icon: UsersRound },
  { label: 'Hồ sơ', icon: UserRound },
];
const userNavItems = [
  { label: 'Chấm công', icon: CalendarCheck },
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
  const phoneColumn = findColumn([/sđt/i, /điện thoại/i, /phone/i], 4);
  const totalColumn = findColumn([/^total$/i, /tổng/i], rows[dateRowIndex].length - 1);
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
    const summary = { userName, userMSSV, phone: cleanName(row[phoneColumn]), totalWorkDays: Number(String(row[totalColumn]).replace(',', '.')) || 0, shifts: 0 };
    for (let column = 0; column < row.length; column += 1) {
      const shiftName = String(shifts[column] || '').trim();
      const shift = IMPORT_SHIFTS[shiftName];
      if (!dates[column] || !shift || !/^x$/i.test(String(row[column]).trim())) continue;
      summary.shifts += 1;
      records.push({ userName, userMSSV, date: dates[column], shiftCode: shift.code, totalHours: (new Date(`1970-01-01T${shift.end}`) - new Date(`1970-01-01T${shift.start}`)) / 3600000 });
    }
    if (summary.shifts || summary.totalWorkDays) members.set(`${userMSSV}|${userName.toLowerCase()}`, summary);
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

  let quality = 0.35;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
    if (bytes <= PHOTO_MAX_BYTES) return dataUrl;
    if (bytes > PHOTO_MAX_BYTES) {
      quality = Math.max(0.08, quality - 0.05);
    }
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  const finalBytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
  if (finalBytes > PHOTO_MAX_BYTES) throw new Error('Không thể nén ảnh xuống dưới 15KB. Vui lòng thử lại.');
  return dataUrl;
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
          setPage(loggedInUser.role === 'ADMIN' ? 'Dashboard' : loggedInUser.mustChangePassword ? 'Hồ sơ' : 'Chấm công');
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
        <div className="sidebar-brand" role="button" tabIndex="0" aria-label="Cuộn lên đầu trang" onClick={scrollToTop} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') scrollToTop(); }}><span className="brand-square">A</span><div><strong>ATTENDLY</strong><small>Attendance system</small></div><button className="close-menu" onClick={(event) => { event.stopPropagation(); setMobileMenu(false); }}><X size={18} /></button></div>
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
  if (user.role === 'USER') {
    if (page === 'Lịch sử cá nhân') return <AttendanceHistory user={user} />;
    if (page === 'Hồ sơ') return <UserProfile user={user} onUserUpdated={onUserUpdated} />;
    return <UserPortal user={user} />;
  }
  if (page === 'Quản lý sinh viên') return <StudentManagement />;
  if (page === 'Chấm công') return <AdminAttendanceWorkArea user={user} />;
  if (page === 'Lịch sử') return <AttendanceHistory user={user} />;
  if (page === 'Hồ sơ') return <UserProfile user={user} onUserUpdated={onUserUpdated} />;
  if (page !== 'Dashboard') return <section className="placeholder-page"><div className="placeholder-icon"><FileClock size={28} /></div><span className="section-label">AUTHORIZED AREA</span><h2>{page}</h2><p>Chức năng này đã được bảo vệ bằng JWT và vai trò <strong>{user.role}</strong>. Nội dung nghiệp vụ sẽ được triển khai ở phase tiếp theo.</p></section>;
  return <AdminDashboard user={user} />;
}

function AdminAttendanceWorkArea({ user }) {
  const [shiftData, setShiftData] = useState(null);
  const realtimeShift = useRealtimeShift(shiftData?.eveningEnabled);
  const [today, setToday] = useState(null);
  const [faceModal, setFaceModal] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [error, setError] = useState('');
  const [checkInFeedback, setCheckInFeedback] = useState(null);

  async function loadAttendance() {
    const token = localStorage.getItem('attendance_token');
    const headers = { Authorization: `Bearer ${token}` };
    const [shiftResponse, todayResponse, historyResponse] = await Promise.all([
      fetch(`${apiUrl}/attendance/shifts/today`, { headers }),
      fetch(`${apiUrl}/attendance/today`, { headers }),
      fetch(`${apiUrl}/attendance/my`, { headers }),
    ]);
    const [shiftBody, todayBody, historyBody] = await Promise.all([shiftResponse.json(), todayResponse.json(), historyResponse.json()]);
    if (!shiftResponse.ok || !todayResponse.ok || !historyResponse.ok) throw new Error('Không thể tải dữ liệu chấm công.');
    const current = todayBody.data || null;
    const historyToday = (historyBody.data || []).find((record) => new Date(record.attendance_date).toDateString() === new Date().toDateString());
    setShiftData(shiftBody.data || null);
    setToday({ ...historyToday, ...current });
    setCheckedIn(Boolean(current?.check_in && !current?.check_out));
  }

  useEffect(() => {
    loadAttendance().catch((requestError) => setError(requestError.message));
  }, []);

  async function handleFaceSuccess(embedding, imageData) {
    const token = localStorage.getItem('attendance_token');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    if (!checkedIn && !user.faceRegistered) {
      const registerResponse = await fetch(`${apiUrl}/face/register`, { method: 'POST', headers, body: JSON.stringify({ embedding }) });
      const registerBody = await registerResponse.json();
      if (!registerResponse.ok || !registerBody.success) throw new Error(registerBody.message || 'Không thể đăng ký khuôn mặt.');
      user.faceRegistered = true;
      localStorage.setItem('attendance_user', JSON.stringify({ ...user, faceRegistered: true }));
    }
    const endpoint = checkedIn ? 'check-out' : 'check-in';
    const response = await fetch(`${apiUrl}/attendance/${endpoint}`, { method: 'POST', headers, body: JSON.stringify({ embedding, imageData }) });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || 'Không thể ghi nhận chấm công.');

    const isLate = Boolean(body.data?.is_late || body.data?.punctuality_status === 'LATE');
    setCheckInFeedback({
      isLate,
      message: body.message || (isLate ? 'Bạn đã check-in trễ. Yêu cầu chấm công đã được gửi tới Quản trị viên để xét duyệt.' : 'Check-in thành công, đang chờ quản trị viên duyệt.'),
    });

    await loadAttendance();
    setFaceModal(false);
  }

  const formatDate = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  const currentShiftCode = shiftData?.current?.code;
  const completed = Boolean(today?.check_in && today?.check_out);
  const statusLabel = completed ? 'Đã duyệt' : today?.status === 'PENDING' ? 'Chờ Admin duyệt' : today?.check_in ? 'Đã check-in' : 'Chưa chấm';

  return <section className="attendance-work-area">
    <div className="attendance-work-heading">
      <div>
        <span className="section-label">ATTENDANCE WORK AREA</span>
        <h2>Chấm công hàng ngày</h2>
        <p>{formatDate}</p>
      </div>
      <span className="live-dot">LIVE</span>
    </div>

    {error && <div className="form-error">{error}</div>}

    {checkInFeedback && (
      <div className={`checkin-feedback-banner ${checkInFeedback.isLate ? 'late' : 'success'}`}>
        <span className="feedback-icon">{checkInFeedback.isLate ? '⚠️' : '✓'}</span>
        <p>{checkInFeedback.message}</p>
        <button className="feedback-close" onClick={() => setCheckInFeedback(null)} aria-label="Đóng thông báo">✕</button>
      </div>
    )}

    <div className="attendance-work-grid">
      <div className="content-panel shift-status-card">
        <div className="panel-heading"><div><h3>Ca làm việc & trạng thái</h3><p>Ca tối chỉ hiển thị khi Admin bật.</p></div></div>
        <div className="shift-list">{(shiftData?.shifts || []).map((shift) => <div key={shift.code} className={`shift-option ${shift.code === realtimeShift?.code ? 'active' : ''}`}><div><strong>{shift.name}</strong><small>{shift.start.slice(0, 5)} — {shift.end.slice(0, 5)}</small></div>{shift.code === realtimeShift?.code && <span>ĐANG DIỄN RA</span>}</div>)}</div>
        <div className="attendance-status-card">
          <div><span>Trạng thái</span><strong>{statusLabel}</strong></div>
          <div className="attendance-time-row">
            <div><small>Check-in</small><strong>{today?.check_in ? new Date(today.check_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong></div>
            <div><small>Check-out</small><strong>{today?.check_out ? new Date(today.check_out).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong></div>
          </div>
          <div className="attendance-photo-hints">
            <span>{today?.check_in_photo_available ? 'Ảnh check-in đã lưu' : 'Chưa có ảnh check-in'}</span>
            <span>{today?.check_out_photo_available ? 'Ảnh check-out đã lưu' : 'Chưa có ảnh check-out'}</span>
          </div>
        </div>
      </div>
      <div className="content-panel face-action-card">
        <div className="panel-heading"><div><h3>Face ID Action</h3><p>Chụp ảnh nén để xác thực chấm công.</p></div><Camera size={20} /></div>
        <div className="face-scan-preview"><div className="face-radar"><Camera size={30} /><i /></div><span>Đưa khuôn mặt vào giữa khung hình</span></div>
        {completed ? <div className="completed-badge">✓ Ca làm việc đã hoàn thành</div> : 
<button className="checkout-button face-action" disabled={!realtimeShift} onClick={() => {
  if (checkedIn && realtimeShift?.end) {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const [endHours, endMinutes] = realtimeShift.end.split(':').map(Number);
    const currentTime = currentHours * 60 + currentMinutes;
    const endTime = endHours * 60 + endMinutes;
    if (currentTime < endTime) {
      alert(`Chưa đến giờ kết thúc ca làm việc (${realtimeShift.end.slice(0, 5)}). Bạn không thể check-out trước giờ!`);
      return;
    }
  }
  setFaceModal(true);
}}>
<Camera size={17} />{checkedIn ? 'QUÉT KHUÔN MẶT CHECK-OUT' : 'QUÉT KHUÔN MẶT CHECK-IN'}<ArrowRight size={15} />
</button>}
        <small className="face-action-note">Ảnh được nén phía trình duyệt trước khi gửi và bản ghi sẽ chờ Admin duyệt.</small>
      </div>
    </div>
    {faceModal && <FaceModal checkedIn={checkedIn} faceRegistered={Boolean(user.faceRegistered)} onClose={() => setFaceModal(false)} onSuccess={handleFaceSuccess} />}
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
    <form className="content-panel profile-form" onSubmit={changePassword}><div className="panel-heading"><div><h3>Đổi mật khẩu</h3><p>Mật khẩu mới cần có ít nhất 6 ký tự.</p></div><LockKeyhole size={20} /></div><label>Mật khẩu hiện tại<input type="password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} required /></label><label>Mật khẩu mới<input type="password" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} minLength={6} required /></label><label>Xác nhận mật khẩu mới<input type="password" value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} minLength={6} required /></label>{passwordError && <div className="form-error">{passwordError}</div>}{passwordMessage && <div className="form-success">{passwordMessage}</div>}<button className="secondary-button profile-password-button" type="submit" disabled={changingPassword}>{changingPassword ? 'ĐANG CẬP NHẬT...' : 'ĐỔI MẬT KHẨU'}</button></form>
  </div></section>;
}

function UserPortal({ user }) {
  const [faceModal, setFaceModal] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [today, setToday] = useState(null);
  const [shift, setShift] = useState(null);
  const realtimeShift = useRealtimeShift(shift?.eveningEnabled);
  const [records, setRecords] = useState([]);
  const [checkInFeedback, setCheckInFeedback] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('attendance_token');
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${apiUrl}/attendance/today`, { headers }).then((response) => response.json()),
      fetch(`${apiUrl}/attendance/shifts/today`, { headers }).then((response) => response.json()),
      fetch(`${apiUrl}/attendance/my`, { headers }).then((response) => response.json()),
    ]).then(([todayBody, shiftBody, historyBody]) => {
      setToday(todayBody.data || null);
      setCheckedIn(Boolean(todayBody.data?.check_in && !todayBody.data?.check_out));
      setShift(shiftBody.data || null);
      setRecords(historyBody.data || []);
    }).catch(() => {});
  }, []);

  async function handleFaceSuccess(embedding, imageData) {
    const token = localStorage.getItem('attendance_token');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    if (!checkedIn && !user.faceRegistered) {
      const registration = await fetch(`${apiUrl}/face/register`, { method: 'POST', headers, body: JSON.stringify({ embedding }) });
      const registrationBody = await registration.json();
      if (!registration.ok || !registrationBody.success) throw new Error(registrationBody.message || 'Không thể đăng ký khuôn mặt.');
      const updatedUser = { ...user, faceRegistered: true };
      localStorage.setItem('attendance_user', JSON.stringify(updatedUser));
      user.faceRegistered = true;
    }
    const endpoint = checkedIn ? 'check-out' : 'check-in';
    const response = await fetch(`${apiUrl}/attendance/${endpoint}`, { method: 'POST', headers, body: JSON.stringify({ embedding, imageData }) });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || 'Không thể ghi nhận chấm công.');

    const isLate = Boolean(body.data?.is_late || body.data?.punctuality_status === 'LATE');
    setCheckInFeedback({
      isLate,
      message: body.message || (isLate ? 'Bạn đã check-in trễ. Yêu cầu chấm công đã được gửi tới Quản trị viên để xét duyệt.' : 'Check-in thành công, đang chờ quản trị viên duyệt.'),
    });

    const refresh = await fetch(`${apiUrl}/attendance/today`, { headers });
    const refreshed = await refresh.json();
    setToday(refreshed.data || null);
    setCheckedIn(!checkedIn);
    setFaceModal(false);
  }

  const approvedRecords = records.filter((record) => record.status === 'APPROVED');
  const workedDays = Number(records[0]?.total_work_days || user.totalWorkDays || 0) || new Set(approvedRecords.map((record) => String(record.attendance_date).slice(0, 10))).size;
  const accumulatedHours = approvedRecords.reduce((total, record) => total + Number(record.total_hours || 0), 0);
  const todayStatus = today?.status === 'PENDING'
    ? 'Chờ duyệt'
    : today?.check_out
      ? 'Đã check-out'
      : today?.check_in
        ? 'Đã check-in'
        : 'Chưa check-in';

  return <div className="user-portal">
    <section className="dashboard-intro">
      <div>
        <span className="section-label">PERSONAL ATTENDANCE</span>
        <h2>Xin chào, {user.fullName || user.username}</h2>
        <p>Theo dõi chấm công và trạng thái cá nhân của bạn.</p>
      </div>
    </section>

    {checkInFeedback && (
      <div className={`checkin-feedback-banner ${checkInFeedback.isLate ? 'late' : 'success'}`}>
        <span className="feedback-icon">{checkInFeedback.isLate ? '⚠️' : '✓'}</span>
        <p>{checkInFeedback.message}</p>
        <button className="feedback-close" onClick={() => setCheckInFeedback(null)} aria-label="Đóng thông báo">✕</button>
      </div>
    )}

    <span className="overview-label">TỔNG QUAN CÁ NHÂN</span>
    <section className="metric-grid"><Metric icon={CalendarCheck} title="Tổng ngày công tháng này" value={workedDays || '—'} note="Chỉ tính công đã duyệt" chart="gauge" /><Metric icon={Clock3} title="Số giờ tích lũy" value={accumulatedHours ? `${accumulatedHours.toFixed(2)}h` : '—'} note="Từ các ca đã hoàn thành" chart="line" /><Metric icon={BarChart3} title="Trạng thái hôm nay" value={todayStatus} note={today?.punctuality_status === 'LATE' ? 'Đi làm trễ' : 'Theo lượt chấm hôm nay'} /><Metric icon={UserRound} title="Quyền tài khoản" value="USER" note="Dữ liệu cá nhân" /></section>
    <section className="dashboard-panels user-portal-panels"><div className="content-panel status-panel"><div className="panel-heading"><div><h3>Trạng thái hôm nay</h3><p>{realtimeShift?.name || 'Ca làm việc của bạn'}</p></div><span className="live-dot">LIVE</span></div><div className="today-status"><div className="shift-time"><span>{realtimeShift?.name?.toUpperCase() || 'CA LÀM VIỆC'}</span><strong>{realtimeShift ? `${realtimeShift.start.slice(0, 5)} — ${realtimeShift.end.slice(0, 5)}` : 'Chưa có ca'}</strong></div><div className="status-line"><span>Check-in</span><strong>{today?.check_in || '—:—'}</strong></div><div className="status-line"><span>Check-out</span><strong>{today?.check_out || '—:—'}</strong></div>
<button className="checkout-button face-action" disabled={!checkedIn && !realtimeShift} onClick={() => {
  if (checkedIn && realtimeShift?.end) {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const [endHours, endMinutes] = realtimeShift.end.split(':').map(Number);
    const currentTime = currentHours * 60 + currentMinutes;
    const endTime = endHours * 60 + endMinutes;
    if (currentTime < endTime) {
      alert(`Chưa đến giờ kết thúc ca làm việc (${realtimeShift.end.slice(0, 5)}). Bạn không thể check-out trước giờ!`);
      return;
    }
  }
  setFaceModal(true);
}}>
<Camera size={16} /> {checkedIn ? 'QUÉT KHUÔN MẶT CHECK-OUT' : 'QUÉT KHUÔN MẶT CHECK-IN'} <ArrowRight size={15} />
</button>
</div></div><div className="content-panel"><div className="panel-heading"><div><h3>Lịch sử cá nhân</h3><p>Các lượt chấm công gần đây</p></div></div><div className="user-recent-history">{records.slice(0, 5).map((record) => <div className="status-line" key={record.id}><span>{new Date(record.attendance_date).toLocaleDateString('vi-VN')}</span><strong>{record.check_in ? new Date(record.check_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—:—'} · {record.status === 'APPROVED' ? 'Đã duyệt' : record.status === 'REJECTED' ? 'Bị từ chối' : 'Chờ duyệt'}</strong></div>)}{!records.length && <div className="history-empty">Chưa có lịch sử chấm công.</div>}</div></div></section>
    {faceModal && <FaceModal checkedIn={checkedIn} faceRegistered={Boolean(user.faceRegistered)} onClose={() => setFaceModal(false)} onSuccess={handleFaceSuccess} />}
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
    const token = localStorage.getItem('attendance_token');
    const endpoint = user.role === 'ADMIN' ? '/admin/attendance' : '/attendance/my';
    fetch(`${apiUrl}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.message || 'Không thể tải lịch sử.');
        setRecords(body.data || []);
      })
      .catch((requestError) => setError(requestError.message));
  }, [user.role]);

  async function openPhoto(record, type) {
    const token = localStorage.getItem('attendance_token');
    const endpoint = user.role === 'ADMIN'
      ? `${apiUrl}/admin/attendance/${record.id}/image/${type}`
      : `${apiUrl}/attendance/${record.id}/image/${type}`;
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
        : `${apiUrl}/admin/attendance/${record.id}`;
      const response = await fetch(deleteEndpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: deleteReason }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể xóa bản ghi.');
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setDeleteTarget(null);
      setDeleteReason('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  }

  return <section className="history-page"><div className="history-heading"><div><span className="section-label">{user.role === 'ADMIN' ? 'ADMIN ATTENDANCE' : 'MY ATTENDANCE'}</span><h2>Lịch sử chấm công</h2><p>{user.role === 'ADMIN' ? 'Quản trị viên có thể xem lịch sử, ảnh và xóa bản ghi của tất cả thành viên.' : 'Bạn chỉ có thể xem lịch sử và ảnh chấm công của chính mình.'}</p></div></div>{error && <div className="form-error">{error}</div>}<div className="history-table-wrap"><table className="history-table"><thead><tr><th>Nhân viên</th><th>Ngày / Ca</th><th>Check-in</th><th>Check-out</th><th>Trạng thái</th><th>Ảnh đối soát</th>{user.role === 'ADMIN' && <th>Thao tác</th>}</tr></thead><tbody>{records.length ? records.map((record) => <tr key={`${record.id}-${record.check_in_event_id || ''}`}><td><strong>{record.full_name || user.fullName || user.username}</strong>{record.username && <small>{record.username}</small>}</td><td>{new Date(record.attendance_date).toLocaleDateString('vi-VN')}<small>{record.shift_name || '—'}</small></td><td><strong>{record.check_in_captured_at || record.check_in ? new Date(record.check_in_captured_at || record.check_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—:—'}</strong><small>{record.check_in_event_status || (record.check_in ? record.status : '—')}</small></td><td><strong>{record.check_out_captured_at || record.check_out ? new Date(record.check_out_captured_at || record.check_out).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—:—'}</strong><small>{record.check_out_event_status || (record.check_out ? record.status : '—')}</small></td><td><span className={`status-badge ${(record.punctuality_status || 'pending').toLowerCase()}`}>{record.punctuality_status === 'LATE' ? 'Đi làm trễ' : record.status === 'APPROVED' ? 'Đã duyệt' : record.status === 'REJECTED' ? 'Từ chối' : 'Chờ duyệt'}</span></td>  <td className="history-photos"><button disabled={record.check_in_photo_available === 0 || record.check_in_photo_expired} onClick={() => openPhoto(record, 'check-in')}>In {record.check_in_photo_expired ? '· Hết hạn' : ''}</button><button disabled={record.check_out_photo_available === 0 || record.check_out_photo_expired} onClick={() => openPhoto(record, 'check-out')}>Out {record.check_out_photo_expired ? '· Hết hạn' : ''}</button></td>{user.role === 'ADMIN' && <td><button className="delete-attendance-button" disabled={deletingId === record.id} onClick={() => { setDeleteTarget(record); setDeleteReason(''); }}>{deletingId === record.id ? 'ĐANG XÓA...' : 'XÓA'}</button></td>}</tr>) : <tr><td colSpan={user.role === 'ADMIN' ? 7 : 6} className="history-empty">Chưa có lịch sử chấm công.</td></tr>}</tbody></table></div>{preview && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setPreview(null)}><div className="photo-preview-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setPreview(null)}><X size={18} /></button><span className="section-label">{preview.label}</span><img src={preview.url} alt={preview.label} onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/400x300?text=Không+thể+tải+ảnh'; }} /></div></motion.div>}{deleteTarget && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="delete-modal"><button className="modal-close" onClick={() => setDeleteTarget(null)}><X size={18} /></button><h3>Bạn có chắc chắn muốn xóa bản ghi chấm công này?</h3><p>{deleteTarget.full_name} · {deleteTarget.shift_name || 'Ca làm việc'}</p><textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Lý do xóa (Không bắt buộc)" maxLength={500} /><div className="delete-modal-actions"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>Hủy</button><button className="delete-attendance-button" onClick={() => deleteAttendance(deleteTarget)}>Xác nhận xóa</button></div></div></motion.div>}</section>;
}

function AdminDashboard({ user }) {
  const [faceModal, setFaceModal] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [latestAttendance, setLatestAttendance] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [eveningEnabled, setEveningEnabled] = useState(true);
  const realtimeShift = useRealtimeShift(eveningEnabled);
  const [todayShift, setTodayShift] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showAllModal, setShowAllModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [chartRange, setChartRange] = useState('7days');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const hasAttendanceData = dashboardStats?.trend?.some((d) => d.onTime > 0 || d.late > 0);
  const currentDateStr = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());

  async function loadApprovals() {
    const token = localStorage.getItem('attendance_token');
    try {
      const response = await fetch(`${apiUrl}/admin/attendance-requests?filter=all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      if (body.success && Array.isArray(body.data)) {
        setApprovals(body.data);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách duyệt:', err);
    }
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
    const token = localStorage.getItem('attendance_token');
    fetch(`${apiUrl}/attendance/today`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Không thể tải trạng thái chấm công.');
        return response.json();
      })
      .then((body) => {
        setLatestAttendance(body.data);
        setCheckedIn(Boolean(body.data?.check_in && !body.data?.check_out));
      })
      .catch(() => setCheckedIn(false));
    fetch(`${apiUrl}/attendance/shifts/today`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((body) => setTodayShift(body.data))
      .catch(() => setTodayShift(null));
    if (user.role === 'ADMIN') {
      Promise.all([
        fetch(`${apiUrl}/admin/attendance-requests?filter=all`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()),
        fetch(`${apiUrl}/admin/shifts/${new Date().toISOString().slice(0, 10)}`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()),
      ]).then(([approvalBody, shiftBody]) => {
        setApprovals(approvalBody.data || []);
        setEveningEnabled(shiftBody.data?.eveningEnabled !== false);
      }).catch(() => {});
      loadDashboardStats();
    }
  }, []);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  async function reviewApproval(eventId, status, reason = '') {
    const token = localStorage.getItem('attendance_token');
    const response = await fetch(`${apiUrl}/admin/attendance-requests/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reason }),
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || 'Không thể cập nhật yêu cầu.');
    setApprovals((current) => current.filter((item) => item.event_id !== eventId));
  }

  function openRejectModal(event) {
    setRejectTarget(event);
    setRejectReason('');
  }

  async function handleConfirmReject() {
    if (!rejectTarget) return;
    setRejectLoading(true);
    try {
      await reviewApproval(rejectTarget.event_id, 'REJECTED', rejectReason.trim());
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      alert(err.message || 'Lỗi khi từ chối yêu cầu.');
    } finally {
      setRejectLoading(false);
    }
  }

  async function handleApproveAll(filterType = 'all') {
    const label = filterType === 'late' ? 'yêu cầu đi làm trễ' : filterType === 'ontime' ? 'yêu cầu đúng giờ' : 'tất cả các yêu cầu';
    if (!window.confirm(`Bạn có chắc chắn muốn phê duyệt ${label} đang chờ?`)) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/admin/attendance-requests/approve-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filter: filterType }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Không thể duyệt yêu cầu.');
      alert(body.message || 'Đã duyệt thành công.');
      await loadApprovals();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function toggleEvening() {
    const next = !eveningEnabled;
    const token = localStorage.getItem('attendance_token');
    const response = await fetch(`${apiUrl}/admin/shifts/${new Date().toISOString().slice(0, 10)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eveningEnabled: next }),
    });
    if (!response.ok) throw new Error('Không thể cập nhật ca tối.');
    setEveningEnabled(next);
  }

  async function previewApproval(eventId) {
    const token = localStorage.getItem('attendance_token');
    const response = await fetch(`${apiUrl}/admin/attendance-requests/${eventId}/image`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      alert('Không tìm thấy ảnh đối soát hoặc ảnh đã hết hạn lưu trữ.');
      return;
    }
    const result = await response.json();
    setPhotoPreview(result.data);
  }

  async function handleFaceSuccess(embedding, imageData) {
    const token = localStorage.getItem('attendance_token');
    if (!checkedIn && !user.faceRegistered) {
      const registerResponse = await fetch(`${apiUrl}/face/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ embedding }),
      });
      const registerBody = await registerResponse.json();
      if (!registerResponse.ok || !registerBody.success) throw new Error(registerBody.message || 'Không thể đăng ký khuôn mặt.');
      const updatedUser = { ...user, faceRegistered: true };
      localStorage.setItem('attendance_user', JSON.stringify(updatedUser));
      user.faceRegistered = true;
    }
    const endpoint = checkedIn ? 'check-out' : 'check-in';
    const response = await fetch(`${apiUrl}/attendance/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ embedding, imageData }),
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || 'Không thể ghi nhận chấm công.');
    setCheckedIn(!checkedIn);
    const refresh = await fetch(`${apiUrl}/attendance/today`, { headers: { Authorization: `Bearer ${token}` } });
    const refreshedBody = await refresh.json();
    setLatestAttendance(refreshedBody.data);
  }

  return <div className="admin-dashboard">
    <section className="dashboard-intro"><div><span className="section-label">{currentDateStr}</span><h2>Xin chào, {user.role === 'ADMIN' ? 'Quản trị viên' : (user.fullName || user.username)}</h2><p>Tóm tắt hoạt động chấm công và yêu cầu trong ngày hôm nay.</p></div><div className="world-map" aria-label="World map illustration"><span /><span /><span /><span /><span /><span /><span /><span /></div></section>
    <span className="overview-label">OVERVIEW</span>
    <section className="metric-grid dark-metrics">
      <Metric icon={CalendarCheck} title="Tổng ngày công" value={statsLoading ? '...' : dashboardStats ? `${dashboardStats.totalWorkDays} công` : '0 công'} note={dashboardStats ? `${dashboardStats.totalStudents} sinh viên` : 'Đang tải...'} chart="gauge" />
      <Metric icon={Clock3} title="Tổng giờ" value={statsLoading ? '...' : dashboardStats ? `${dashboardStats.totalHours.toLocaleString('vi-VN')} giờ` : '0 giờ'} note="1 công = 8 giờ" chart="line" />
      <Metric icon={BarChart3} title={selectedDate === new Date().toISOString().slice(0, 10) ? 'Đã chấm hôm nay' : `Chấm công ${new Date(selectedDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`} value={statsLoading ? '...' : dashboardStats ? `${dashboardStats.todayCheckins}/${dashboardStats.totalStudents}` : '0/0'} note={dashboardStats && dashboardStats.totalStudents > 0 ? `${Math.round((dashboardStats.todayCheckins / dashboardStats.totalStudents) * 100)}% sinh viên` : 'Chưa có sinh viên'} chart="donut" />
      <Metric icon={UsersRound} title="Chờ duyệt" value={statsLoading ? '...' : dashboardStats ? `${dashboardStats.pendingCount}` : '0'} note="Yêu cầu đang chờ xử lý" chart="user" />
    </section>
    <section className="dashboard-panels admin-panels">
      <div className="content-panel activity-panel">
        <div className="panel-heading">
          <h3>Hoạt động chấm công</h3>
          <select className="panel-range-select" value={chartRange} onChange={(e) => handleChartRangeChange(e.target.value)}>
            <option value="7days">7 ngày gần nhất</option>
            <option value="all">Toàn bộ kỳ chấm công</option>
          </select>
        </div>
        {hasAttendanceData
          ? <AttendanceChart data={dashboardStats.trend} selectedDate={selectedDate} onDateSelect={handleChartDateSelect} />
          : <EmptyAttendanceState />}
      </div>
      <div className="content-panel status-panel">
          <div className="panel-heading">
            <div>
              <h3>Trạng thái hôm nay</h3>
              <p>Thông định ca làm việc</p>
            </div>
            <span className="live-dot">LIVE</span>
          </div>
          <div className="today-status">
            <div className="shift-time">
              <span>{realtimeShift?.name?.toUpperCase() || 'CA SÁNG / CA CHIỀU'}</span>
              <strong>{realtimeShift ? `${realtimeShift.start.slice(0, 5)} — ${realtimeShift.end.slice(0, 5)}` : '07:30 — 12:00'}</strong>
            </div>
            <div className="status-line">
              <span>Ca khả dụng</span>
              <strong>{todayShift?.shifts?.map((shift) => shift.name).join(' · ') || 'Ca sáng · Ca chiều'}</strong>
            </div>
            <div className="status-line">
              <span>Check-in</span>
              <strong className="empty-value">{latestAttendance?.check_in || '—:—'}</strong>
            </div>
            <div className="status-line">
              <span>Check-out</span>
              <strong className="empty-value">{latestAttendance?.check_out || '—:—'}</strong>
            </div>
            <div className="face-preview">
              <div className="face-radar"><Camera size={24} /><i /></div>
              <span>{checkedIn ? 'Đã check-in, có thể check-out' : 'Camera cần xác thực khuôn mặt'}</span>
            </div>
            <button
              className="checkout-button face-action"
              disabled={!checkedIn && !realtimeShift}
              onClick={() => {
                if (checkedIn && realtimeShift?.end) {
                  const now = new Date();
                  const currentHours = now.getHours();
                  const currentMinutes = now.getMinutes();
                  const [endHours, endMinutes] = realtimeShift.end.split(':').map(Number);
                  
                  const currentTime = currentHours * 60 + currentMinutes;
                  const endTime = endHours * 60 + endMinutes;
                  
                  if (currentTime < endTime) {
                    alert(`Chưa đến giờ kết thúc ca làm việc (${realtimeShift.end.slice(0, 5)}). Bạn không thể check-out trước giờ!`);
                    return;
                  }
                }
                setFaceModal(true);
              }}
            >
              {checkedIn ? 'CHECK-OUT' : 'QUÉT KHUÔN MẶT CHECK-IN'} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>
    <section className="approval-panel content-panel">
      <div className="panel-heading">
        <div>
          <h3>{user.role === 'ADMIN' ? 'Yêu cầu cần phê duyệt' : 'Trạng thái duyệt'}</h3>
          <p>{user.role === 'ADMIN' ? 'Các lượt chấm công đang chờ đối soát' : 'Lượt chấm công hôm nay'}</p>
        </div>
        {user.role === 'ADMIN' && (
          <div className="approval-heading-actions">
            <button className={`shift-toggle ${eveningEnabled ? 'on' : ''}`} onClick={toggleEvening}>Ca tối {eveningEnabled ? 'BẬT' : 'TẮT'}</button>
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
                <ApprovalRow key={item.event_id} event={item} onPreview={() => previewApproval(item.event_id)} onReview={reviewApproval} onReject={openRejectModal} />
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
    {faceModal && <FaceModal checkedIn={checkedIn} faceRegistered={Boolean(user.faceRegistered)} onClose={() => setFaceModal(false)} onSuccess={handleFaceSuccess} />}
    {photoPreview && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setPhotoPreview(null)}><motion.div className="photo-preview-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setPhotoPreview(null)}><X size={18} /></button><img src={photoPreview} alt="Ảnh đối soát khuôn mặt" onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/400x300?text=Không+thể+tải+ảnh'; }} /></motion.div></motion.div>}
    <AnimatePresence>
      {showAllModal && (
        <AllRequestsModal
          requests={approvals}
          onClose={() => setShowAllModal(false)}
          onReview={reviewApproval}
          onReject={openRejectModal}
          onApproveAll={handleApproveAll}
          onPreview={previewApproval}
          actionLoading={actionLoading}
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
        <p>Tìm kiếm thành viên, xóa tài khoản hoặc điều chỉnh dữ liệu import</p>
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
                <span>{new Date(record.attendance_date).toLocaleDateString('vi-VN')} · {record.shift_name}<small className="record-source">{record.source}</small></span>
                <small>{record.check_in?.slice(11, 16) || '--:--'} — {record.check_out?.slice(11, 16) || '--:--'} · {record.status === 'APPROVED' ? 'Đã duyệt' : record.status}</small>
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
      setMessage(`Đã nhập ${body.imported} lượt chấm công${body.unmatched?.length ? `; không khớp ${body.unmatched.length} dòng` : ''}.`);
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

function ApprovalRow({ event, onPreview, onReview, onReject }) {
  const isLate = Boolean(event.is_late || event.punctuality_status === 'LATE');
  const timeStr = event.captured_at
    ? new Date(event.captured_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  return (
    <div className={`approval-row ${isLate ? 'row-late' : ''}`}>
      <button className="approval-photo" onClick={onPreview} aria-label="Xem ảnh đối soát">Ảnh</button>
      <div className="approval-row-content">
        <strong>
          {event.full_name}
          {event.student_code && <span className="approval-student-code">({event.student_code})</span>}
        </strong>
        <span>
          {event.event_type === 'CHECK_IN' ? 'Check-in' : 'Check-out'} · {event.shift_name || 'Chưa gán ca'} · {timeStr}
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
        <button className="approval-action approve" title="Duyệt" onClick={() => onReview(event.event_id, 'APPROVED')}>✓</button>
        <button className="approval-action reject" title="Từ chối" onClick={() => onReject ? onReject(event) : onReview(event.event_id, 'REJECTED')}>×</button>
      </div>
    </div>
  );
}

function AllRequestsModal({ requests, onClose, onReview, onReject, onApproveAll, onPreview, actionLoading }) {
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
              <button
                className="btn-approve-all"
                onClick={() => onApproveAll(activeTab)}
                disabled={actionLoading}
              >
                <CheckCheck size={16} />
                Duyệt tất cả ({filteredRequests.length})
              </button>
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
                <th>Giờ Check-in</th>
                <th>Tình trạng</th>
                <th>Ảnh đối chiếu khuôn mặt</th>
                <th style={{ textAlign: 'center' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length ? (
                filteredRequests.map((item, index) => {
                  const isLate = Boolean(item.is_late || item.punctuality_status === 'LATE');
                  const checkInTime = item.captured_at
                    ? new Date(item.captured_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                    : '--:--';
                  const reqDate = item.captured_at
                    ? new Date(item.captured_at).toLocaleDateString('vi-VN')
                    : (item.attendance_date ? new Date(item.attendance_date).toLocaleDateString('vi-VN') : '--');
                  return (
                    <tr key={item.event_id} className={isLate ? 'row-late-table' : ''}>
                      <td>{index + 1}</td>
                      <td><strong>{item.full_name}</strong></td>
                      <td><span className="student-code-tag">{item.student_code || '—'}</span></td>
                      <td>{reqDate}</td>
                      <td><span className="shift-pill">{item.shift_name || 'Ca làm'}</span></td>
                      <td><strong>{checkInTime}</strong></td>
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
                          onClick={() => onPreview(item.event_id)}
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
                            onClick={() => onReview(item.event_id, 'APPROVED')}
                          >
                            ✓ Duyệt
                          </button>
                          <button
                            className="btn-table-reject"
                            title="Từ chối yêu cầu chấm công"
                            onClick={() => onReject(item)}
                          >
                            ✕ Từ chối
                          </button>
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
            <span className="summary-label">Ca làm việc:</span>
            <span>{event.shift_name || 'Ca làm'} ({reqDate})</span>
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

function FaceModal({ checkedIn, faceRegistered, onClose, onSuccess }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraState, setCameraState] = useState('starting');
  const [cameraError, setCameraError] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

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
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraState('ready');
      } catch (error) {
        setCameraState('error');
        setCameraError(error.name === 'NotAllowedError'
          ? 'Bạn đã từ chối quyền camera. Hãy cho phép camera trong thanh địa chỉ rồi thử lại.'
          : error.message || 'Không thể mở camera. Hãy kiểm tra quyền truy cập.');
      }
    }

    async function loadModels() {
      const LOCAL_URL = apiUrl.replace('/api', '') + '/models';
      const CDN_FALLBACK_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(LOCAL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(LOCAL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(LOCAL_URL),
        ]);
        if (!cancelled) setModelReady(true);
      } catch (localErr) {
        console.warn("Model local bị lỗi, đang chuyển sang tải từ CDN dự phòng...", localErr);
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(CDN_FALLBACK_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(CDN_FALLBACK_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(CDN_FALLBACK_URL),
          ]);
          if (!cancelled) setModelReady(true);
        } catch (cdnErr) {
          console.error("Không thể nạp model AI:", cdnErr);
          if (!cancelled) setModelError("Không thể nạp model AI. Vui lòng kiểm tra mạng!");
        }
      }
    }

    startVideo();
    loadModels();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function confirmAttendance() {
    if (cameraState !== 'ready' || !videoRef.current?.videoWidth || submitting) return;
    setSubmitting(true);
    setCameraError('');
    try {
      let descriptor = [];
      if (modelReady) {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.35 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (detection) {
          descriptor = Array.from(detection.descriptor);
        }
      }
      await onSuccess(descriptor, await compressWebcamFrame(videoRef.current));
      onClose();
    } catch (error) {
      setCameraError(error.message);
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
        <h2>{checkedIn ? 'Xác nhận check-out' : faceRegistered ? 'Xác thực check-in' : 'Đăng ký khuôn mặt'}</h2>
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
           cameraState === 'ready' ? 'Đưa khuôn mặt vào khung hình, sau đó xác nhận trực tiếp.' : 
           'Vui lòng cấp quyền camera và thử lại.'}
        </p>
        {cameraError && cameraState !== 'error' && <div className="camera-error">{cameraError}</div>}
        <button
          className="checkout-button"
          style={{ backgroundColor: cameraState === 'ready' && !submitting ? '#0d9488' : '#9ca3af', opacity: cameraState === 'ready' && !submitting ? 1 : 0.7 }}
          disabled={cameraState !== 'ready' || submitting}
          onClick={confirmAttendance}
        >
          {cameraState === 'ready' ? (submitting ? 'ĐANG XÁC THỰC...' : checkedIn ? 'XÁC NHẬN CHECK-OUT' : faceRegistered ? 'XÁC NHẬN CHECK-IN' : 'ĐĂNG KÝ VÀ CHECK-IN') : 'ĐANG MỞ CAMERA...'}
        </button>
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

export default App;

