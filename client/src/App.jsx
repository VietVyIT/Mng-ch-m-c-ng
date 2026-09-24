import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import * as faceapi from '@vladmandic/face-api';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Camera,
  CalendarCheck,
  CheckCheck,
  ChevronDown,
  Clock3,
  Eye,
  EyeOff,
  FileClock,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const adminNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Chấm công', icon: CalendarCheck },
  { label: 'Lịch sử', icon: FileClock },
  { label: 'Hồ sơ', icon: UserRound },
];
const userNavItems = [
  { label: 'Chấm công', icon: CalendarCheck },
  { label: 'Lịch sử cá nhân', icon: FileClock },
  { label: 'Hồ sơ', icon: UserRound },
];

// Dữ liệu thật sẽ được nạp từ API dashboard. Null nghĩa là chưa có dữ liệu.
const attendanceData = null;
const PHOTO_MAX_BYTES = 30 * 1024;

async function compressWebcamFrame(video) {
  const canvas = document.createElement('canvas');
  const maxWidth = 480;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  let quality = 0.42;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
    if (bytes <= PHOTO_MAX_BYTES) return dataUrl;
    if (bytes > PHOTO_MAX_BYTES) {
      quality = Math.max(0.15, quality - 0.05);
    }
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  const finalBytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
  if (finalBytes > PHOTO_MAX_BYTES) throw new Error('Không thể nén ảnh xuống dưới 30KB. Vui lòng thử lại.');
  return dataUrl;
}

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('attendance_user') || 'null'));
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
        onForgot={() => setShowForgot(true)}
      />
    );
  }

  return (
    <>
      <DashboardShell user={user} page={page} onNavigate={setPage} onLogout={logout} onUserUpdated={(updatedUser) => { setUser(updatedUser); localStorage.setItem('attendance_user', JSON.stringify(updatedUser)); }} />
      <AnimatePresence>
        {showForgot && <ForgotPassword onClose={() => setShowForgot(false)} />}
      </AnimatePresence>
    </>
  );
}

function LoginScreen({ onLogin, onForgot }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      const body = await response.json();
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
            <input className="login-input" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Tài khoản đăng nhập" aria-label="Tài khoản đăng nhập" required />
            <div className="password-field"><input className="login-input" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Mật khẩu" aria-label="Mật khẩu" required /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {error && <div className="form-error">{error}</div>}
            <button className="primary-button" type="submit" disabled={loading}>{loading ? 'ĐANG XỬ LÝ...' : 'ĐĂNG NHẬP'}</button>
          </form>
          <button className="forgot-link" type="button" onClick={onForgot}>Quên mật khẩu?</button>
        </div>
      </motion.section>
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
        <header className="dashboard-header"><button className="mobile-menu-button" onClick={() => setMobileMenu(true)}><Menu size={22} /></button><div><span className="section-label">THỨ NĂM, 24 THÁNG 9, 2026</span><h1>{page}</h1></div><div className="header-user"><NotificationCenter /><ProfileMenu user={user} onNavigate={onNavigate} onLogout={onLogout} /></div></header>
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
    const body = await response.json();
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
  if (page === 'Lịch sử') return <AttendanceHistory user={user} />;
  if (page === 'Hồ sơ') return <UserProfile user={user} onUserUpdated={onUserUpdated} />;
  if (page !== 'Dashboard') return <section className="placeholder-page"><div className="placeholder-icon"><FileClock size={28} /></div><span className="section-label">AUTHORIZED AREA</span><h2>{page}</h2><p>Chức năng này đã được bảo vệ bằng JWT và vai trò <strong>{user.role}</strong>. Nội dung nghiệp vụ sẽ được triển khai ở phase tiếp theo.</p></section>;
  return <AdminDashboard user={user} />;
}

function UserProfile({ user, onUserUpdated }) {
  const [profile, setProfile] = useState({ fullName: user.fullName || '', phone: user.phone || '', address: user.address || '', hometownProvinceCode: user.hometownProvinceCode || '', hometownProvinceName: user.hometownProvinceName || '' });
  const [provinces, setProvinces] = useState([]);
  const [message, setMessage] = useState('');
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
      const updatedUser = { ...user, fullName: body.data.full_name, phone: body.data.phone, address: body.data.address, hometownProvinceCode: body.data.hometown_province_code, hometownProvinceName: body.data.hometown_province_name };
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
    <form className="content-panel profile-form" onSubmit={saveProfile}><div className="panel-heading"><div><h3>Thông tin cá nhân</h3><p>Thông tin này chỉ thuộc tài khoản của bạn.</p></div></div><label>Họ và tên<input value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} required /></label><label>Tên đăng nhập<input value={user.username} disabled /></label><label>Số điện thoại<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="Ví dụ: 0912345678" /></label><label>Địa chỉ hiện tại<input value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} placeholder="Số nhà, đường, phường/xã..." /></label><label>Quê quán / Tỉnh, thành<select value={profile.hometownProvinceCode} onChange={(event) => { const selected = provinces.find((province) => String(province.code) === event.target.value); setProfile({ ...profile, hometownProvinceCode: event.target.value, hometownProvinceName: selected?.name || '' }); }}><option value="">Chọn tỉnh/thành</option>{provinces.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}</select></label>{error && <div className="form-error">{error}</div>}{message && <div className="form-success">{message}</div>}<button className="primary-button" type="submit" disabled={saving}>{saving ? 'ĐANG LƯU...' : 'LƯU THÔNG TIN'}</button></form>
    <form className="content-panel profile-form" onSubmit={changePassword}><div className="panel-heading"><div><h3>Đổi mật khẩu</h3><p>Mật khẩu mới cần có ít nhất 6 ký tự.</p></div><LockKeyhole size={20} /></div><label>Mật khẩu hiện tại<input type="password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} required /></label><label>Mật khẩu mới<input type="password" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} minLength={6} required /></label><label>Xác nhận mật khẩu mới<input type="password" value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} minLength={6} required /></label>{passwordError && <div className="form-error">{passwordError}</div>}{passwordMessage && <div className="form-success">{passwordMessage}</div>}<button className="secondary-button profile-password-button" type="submit" disabled={changingPassword}>{changingPassword ? 'ĐANG CẬP NHẬT...' : 'ĐỔI MẬT KHẨU'}</button></form>
  </div></section>;
}

function UserPortal({ user }) {
  const [faceModal, setFaceModal] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [today, setToday] = useState(null);
  const [shift, setShift] = useState(null);
  const [records, setRecords] = useState([]);
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
    const refresh = await fetch(`${apiUrl}/attendance/today`, { headers });
    const refreshed = await refresh.json();
    setToday(refreshed.data || null);
    setCheckedIn(!checkedIn);
    setFaceModal(false);
  }
  const approvedRecords = records.filter((record) => record.status === 'APPROVED');
  const workedDays = approvedRecords.length;
  const accumulatedHours = approvedRecords.reduce((total, record) => total + Number(record.total_hours || 0), 0);
  const todayStatus = today?.status === 'PENDING'
    ? 'Chờ duyệt'
    : today?.check_out
      ? 'Đã check-out'
      : today?.check_in
        ? 'Đã check-in'
        : 'Chưa check-in';
  return <div className="user-portal">
    <section className="dashboard-intro"><div><span className="section-label">PERSONAL ATTENDANCE</span><h2>Xin chào, {user.fullName || user.username}</h2><p>Theo dõi chấm công và trạng thái cá nhân của bạn.</p></div></section>
    <span className="overview-label">TỔNG QUAN CÁ NHÂN</span>
    <section className="metric-grid"><Metric icon={CalendarCheck} title="Tổng ngày công tháng này" value={workedDays || '—'} note="Chỉ tính công đã duyệt" chart="gauge" /><Metric icon={Clock3} title="Số giờ tích lũy" value={accumulatedHours ? `${accumulatedHours.toFixed(2)}h` : '—'} note="Từ các ca đã hoàn thành" chart="line" /><Metric icon={BarChart3} title="Trạng thái hôm nay" value={todayStatus} note={today?.punctuality_status === 'LATE' ? 'Đi làm trễ' : 'Theo lượt chấm hôm nay'} /><Metric icon={UserRound} title="Quyền tài khoản" value="USER" note="Dữ liệu cá nhân" /></section>
    <section className="dashboard-panels user-portal-panels"><div className="content-panel status-panel"><div className="panel-heading"><div><h3>Trạng thái hôm nay</h3><p>{shift?.current?.name || 'Ca làm việc của bạn'}</p></div><span className="live-dot">LIVE</span></div><div className="today-status"><div className="shift-time"><span>{shift?.current?.name?.toUpperCase() || 'CA LÀM VIỆC'}</span><strong>{shift?.current ? `${shift.current.start.slice(0, 5)} — ${shift.current.end.slice(0, 5)}` : 'Chưa có ca'}</strong></div><div className="status-line"><span>Check-in</span><strong>{today?.check_in || '—:—'}</strong></div><div className="status-line"><span>Check-out</span><strong>{today?.check_out || '—:—'}</strong></div><button className="checkout-button face-action" disabled={!checkedIn && !(shift?.shifts?.length)} onClick={() => setFaceModal(true)}><Camera size={16} /> {checkedIn ? 'QUÉT KHUÔN MẶT CHECK-OUT' : 'QUÉT KHUÔN MẶT CHECK-IN'} <ArrowRight size={15} /></button></div></div><div className="content-panel"><div className="panel-heading"><div><h3>Lịch sử cá nhân</h3><p>Các lượt chấm công gần đây</p></div></div><div className="user-recent-history">{records.slice(0, 5).map((record) => <div className="status-line" key={record.id}><span>{new Date(record.attendance_date).toLocaleDateString('vi-VN')}</span><strong>{record.check_in ? new Date(record.check_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—:—'} · {record.status === 'APPROVED' ? 'Đã duyệt' : record.status === 'REJECTED' ? 'Bị từ chối' : 'Chờ duyệt'}</strong></div>)}{!records.length && <div className="history-empty">Chưa có lịch sử chấm công.</div>}</div></div></section>
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
    setPreview({ url: URL.createObjectURL(await response.blob()), label: `${record.full_name || user.fullName || user.username} · ${type === 'check-in' ? 'Check-in' : 'Check-out'}` });
  }

  async function deleteAttendance(record) {
    setDeletingId(record.id);
    setError('');
    try {
      const token = localStorage.getItem('attendance_token');
      const response = await fetch(`${apiUrl}/admin/attendance/${record.id}`, {
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

  return <section className="history-page"><div className="history-heading"><div><span className="section-label">{user.role === 'ADMIN' ? 'ADMIN ATTENDANCE' : 'MY ATTENDANCE'}</span><h2>Lịch sử chấm công</h2><p>{user.role === 'ADMIN' ? 'Quản trị viên có thể xem lịch sử, ảnh và xóa bản ghi của tất cả thành viên.' : 'Bạn chỉ có thể xem lịch sử và ảnh chấm công của chính mình.'}</p></div></div>{error && <div className="form-error">{error}</div>}<div className="history-table-wrap"><table className="history-table"><thead><tr><th>Nhân viên</th><th>Ngày / Ca</th><th>Check-in</th><th>Check-out</th><th>Trạng thái</th><th>Ảnh đối soát</th>{user.role === 'ADMIN' && <th>Thao tác</th>}</tr></thead><tbody>{records.length ? records.map((record) => <tr key={`${record.id}-${record.check_in_event_id || ''}`}><td><strong>{record.full_name || user.fullName || user.username}</strong>{record.username && <small>{record.username}</small>}</td><td>{new Date(record.attendance_date).toLocaleDateString('vi-VN')}<small>{record.shift_name || '—'}</small></td><td><strong>{record.check_in_captured_at || record.check_in ? new Date(record.check_in_captured_at || record.check_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—:—'}</strong><small>{record.check_in_event_status || (record.check_in ? record.status : '—')}</small></td><td><strong>{record.check_out_captured_at || record.check_out ? new Date(record.check_out_captured_at || record.check_out).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—:—'}</strong><small>{record.check_out_event_status || (record.check_out ? record.status : '—')}</small></td><td><span className={`status-badge ${(record.punctuality_status || 'pending').toLowerCase()}`}>{record.punctuality_status === 'LATE' ? 'Đi làm trễ' : record.status === 'APPROVED' ? 'Đã duyệt' : record.status === 'REJECTED' ? 'Từ chối' : 'Chờ duyệt'}</span></td><td className="history-photos"><button disabled={record.check_in_photo_available === 0 || record.check_in_photo_expired} onClick={() => openPhoto(record, 'check-in')}>In {record.check_in_photo_expired ? '· Hết hạn' : ''}</button>{user.role === 'ADMIN' && <button disabled={record.check_out_photo_available === 0 || record.check_out_photo_expired} onClick={() => openPhoto(record, 'check-out')}>Out {record.check_out_photo_expired ? '· Hết hạn' : ''}</button>}</td>{user.role === 'ADMIN' && <td><button className="delete-attendance-button" disabled={deletingId === record.id} onClick={() => { setDeleteTarget(record); setDeleteReason(''); }}>{deletingId === record.id ? 'ĐANG XÓA...' : 'XÓA'}</button></td>}</tr>) : <tr><td colSpan={user.role === 'ADMIN' ? 7 : 6} className="history-empty">Chưa có lịch sử chấm công.</td></tr>}</tbody></table></div>{preview && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}><div className="photo-preview-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}><X size={18} /></button><span className="section-label">{preview.label}</span><img src={preview.url} alt={preview.label} /></div></motion.div>}{deleteTarget && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="delete-modal"><button className="modal-close" onClick={() => setDeleteTarget(null)}><X size={18} /></button><h3>Bạn có chắc chắn muốn xóa bản ghi chấm công này?</h3><p>{deleteTarget.full_name} · {deleteTarget.shift_name || 'Ca làm việc'}</p><textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Lý do xóa (Không bắt buộc)" maxLength={500} /><div className="delete-modal-actions"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>Hủy</button><button className="delete-attendance-button" onClick={() => deleteAttendance(deleteTarget)}>Xác nhận xóa</button></div></div></motion.div>}</section>;
}

function AdminDashboard({ user }) {
  const [faceModal, setFaceModal] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [latestAttendance, setLatestAttendance] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [eveningEnabled, setEveningEnabled] = useState(true);
  const [todayShift, setTodayShift] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const hasAttendanceData = Array.isArray(attendanceData) && attendanceData.length > 0;
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
        fetch(`${apiUrl}/admin/approvals`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()),
        fetch(`${apiUrl}/admin/shifts/${new Date().toISOString().slice(0, 10)}`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()),
      ]).then(([approvalBody, shiftBody]) => {
        setApprovals(approvalBody.data || []);
        setEveningEnabled(shiftBody.data?.eveningEnabled !== false);
      }).catch(() => {});
    }
  }, []);
  async function reviewApproval(eventId, status) {
    const token = localStorage.getItem('attendance_token');
    const reason = status === 'REJECTED'
      ? window.prompt('Lý do từ chối (có thể để trống):', '') || ''
      : '';
    const response = await fetch(`${apiUrl}/admin/approvals/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reason }),
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || 'Không thể cập nhật yêu cầu.');
    setApprovals((current) => current.filter((item) => item.event_id !== eventId));
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
    const response = await fetch(`${apiUrl}/admin/approvals/${eventId}/image`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const blob = await response.blob();
    setPhotoPreview(URL.createObjectURL(blob));
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
    <section className="dashboard-intro"><div><span className="section-label">THỨ NĂM, 24 THÁNG 9, 2026</span><h2>Xin chào, {user.role === 'ADMIN' ? 'Quản trị viên' : (user.fullName || user.username)}</h2><p>Tóm tắt hoạt động chấm công và yêu cầu trong ngày hôm nay.</p></div><div className="world-map" aria-label="World map illustration"><span /><span /><span /><span /><span /><span /><span /><span /></div></section>
    <span className="overview-label">OVERVIEW</span>
    <section className="metric-grid dark-metrics"><Metric icon={CalendarCheck} title="Tổng ngày công" value={hasAttendanceData ? '—' : '—'} note={hasAttendanceData ? '' : 'Chưa có dữ liệu'} /><Metric icon={Clock3} title="Tổng giờ" value={hasAttendanceData ? '—' : '—'} note={hasAttendanceData ? '' : 'Chưa có dữ liệu'} /><Metric icon={BarChart3} title="Đã chấm hôm nay" value={hasAttendanceData ? '—' : '—'} note={hasAttendanceData ? '' : 'Chưa có dữ liệu'} /><Metric icon={UsersRound} title="Vai trò ADMIN" value="ADMIN" note="Quyền quản trị hệ thống" chart="user" /></section>
    <section className="dashboard-panels admin-panels"><div className="content-panel activity-panel"><div className="panel-heading"><div><h3>Hoạt động chấm công</h3><p>Tổng quan trong 7 ngày gần nhất</p></div><span className="panel-filter">7 ngày⌄</span></div>{hasAttendanceData ? <AttendanceChart data={attendanceData} /> : <EmptyAttendanceState />}</div><div className="content-panel status-panel"><div className="panel-heading"><div><h3>Trạng thái hôm nay</h3><p>Thông tin ca làm việc</p></div><span className="live-dot">LIVE</span></div><div className="today-status"><div className="shift-time"><span>{todayShift?.current?.name?.toUpperCase() || 'CA SÁNG / CA CHIỀU'}</span><strong>{todayShift?.current ? `${todayShift.current.start.slice(0, 5)} — ${todayShift.current.end.slice(0, 5)}` : '07:30 — 12:00'}</strong></div><div className="status-line"><span>Ca khả dụng</span><strong>{todayShift?.shifts?.map((shift) => shift.name).join(' · ') || 'Ca sáng · Ca chiều'}</strong></div><div className="status-line"><span>Check-in</span><strong className="empty-value">{latestAttendance?.check_in || '—:—'}</strong></div><div className="status-line"><span>Check-out</span><strong className="empty-value">{latestAttendance?.check_out || '—:—'}</strong></div><div className="face-preview"><div className="face-radar"><Camera size={24} /><i /></div><span>{checkedIn ? 'Đã check-in, có thể check-out' : 'Camera cần xác thực khuôn mặt'}</span></div><button className="checkout-button face-action" disabled={!checkedIn && !(todayShift?.shifts?.length)} onClick={() => setFaceModal(true)}>{checkedIn ? 'CHECK-OUT' : 'QUÉT KHUÔN MẶT CHECK-IN'} <ArrowRight size={15} /></button></div></div></section>
    <section className="approval-panel content-panel"><div className="panel-heading"><div><h3>{user.role === 'ADMIN' ? 'Yêu cầu cần phê duyệt' : 'Trạng thái duyệt'}</h3><p>{user.role === 'ADMIN' ? 'Các lượt chấm công đang chờ đối soát' : 'Lượt chấm công hôm nay'}</p></div>{user.role === 'ADMIN' && <button className={`shift-toggle ${eveningEnabled ? 'on' : ''}`} onClick={toggleEvening}>Ca tối {eveningEnabled ? 'BẬT' : 'TẮT'}</button>}</div>{user.role === 'ADMIN' ? (approvals.length ? approvals.map((item) => <ApprovalRow key={item.event_id} event={item} onPreview={() => previewApproval(item.event_id)} onReview={reviewApproval} />) : <div className="approval-empty">Không có yêu cầu đang chờ duyệt.</div>) : <div><div className={`status-badge ${latestAttendance?.punctuality_status === 'LATE' ? 'late' : latestAttendance?.punctuality_status === 'ON_TIME' ? 'on-time' : 'pending'}`}>{latestAttendance?.punctuality_status === 'LATE' ? 'Đi làm trễ' : latestAttendance?.punctuality_status === 'ON_TIME' ? 'Đúng giờ' : 'Chưa có lượt chấm công'}</div>{latestAttendance?.status === 'PENDING' && <div className="approval-note">Chờ Quản trị viên duyệt</div>}</div>}</section>
    {faceModal && <FaceModal checkedIn={checkedIn} faceRegistered={Boolean(user.faceRegistered)} onClose={() => setFaceModal(false)} onSuccess={handleFaceSuccess} />}
    {photoPreview && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => { URL.revokeObjectURL(photoPreview); setPhotoPreview(null); }}><motion.div className="photo-preview-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => { URL.revokeObjectURL(photoPreview); setPhotoPreview(null); }}><X size={18} /></button><img src={photoPreview} alt="Ảnh đối soát khuôn mặt" /></motion.div></motion.div>}
  </div>;
}

function Metric({ icon: Icon, title, value, note, chart }) { return <motion.div className="metric-card" whileHover={{ y: -3 }}><div className="metric-top"><div className="metric-icon"><Icon size={18} /></div>{chart === 'gauge' && <div className="mini-gauge" />}{chart === 'line' && <svg className="mini-line" viewBox="0 0 70 32"><polyline points="0,25 12,20 22,23 33,10 45,15 56,5 70,8" /></svg>}{chart === 'donut' && <div className="mini-donut" />}{chart === 'user' && <div className="mini-user"><UserRound size={17} /></div>}</div><span>{title}</span><strong>{value}</strong><small>{note}</small></motion.div>; }

function EmptyAttendanceState() { return <div className="empty-attendance"><BarChart3 size={30} /><strong>Chưa có dữ liệu chấm công.</strong><span>Dữ liệu sẽ xuất hiện sau khi bắt đầu chấm công.</span></div>; }

function AttendanceChart({ data }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!Array.isArray(data) || data.length === 0) return undefined;
    const chart = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.map((item) => item.label),
        datasets: [
          { label: 'On Time', data: data.map((item) => item.onTime), backgroundColor: '#2563eb', borderRadius: 3 },
          { label: 'Late', data: data.map((item) => item.late), backgroundColor: '#f97316', borderRadius: 3 },
          { label: 'Early', data: data.map((item) => item.early), backgroundColor: '#2dd4bf', borderRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'bottom', labels: { color: '#64748b', boxWidth: 8, font: { family: 'Poppins', size: 10 } } } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { color: '#94a3b8', font: { family: 'Poppins', size: 9 } } }, y: { stacked: true, beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { color: '#94a3b8', font: { family: 'Poppins', size: 9 } } } },
      },
    });
    return () => chart.destroy();
  }, []);
  return <div className="chart-canvas-wrap"><canvas ref={canvasRef} aria-label="Biểu đồ chấm công 7 ngày" /></div>;
}

function ApprovalRow({ event, onPreview, onReview }) { return <div className="approval-row"><button className="approval-photo" onClick={onPreview} aria-label="Xem ảnh đối soát">Ảnh</button><div><strong>{event.full_name}</strong><span>{event.event_type === 'CHECK_IN' ? 'Check-in' : 'Check-out'} · {event.shift_name || 'Chưa gán ca'} · {new Date(event.captured_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span></div><b>Awaiting</b><button className="approval-action approve" onClick={() => onReview(event.event_id, 'APPROVED')}>✓</button><button className="approval-action reject" onClick={() => onReview(event.event_id, 'REJECTED')}>×</button></div>; }

function FaceModal({ checkedIn, faceRegistered, onClose, onSuccess }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraState, setCameraState] = useState('starting');
  const [cameraError, setCameraError] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('error');
        setCameraError('Trình duyệt không hỗ trợ camera. Hãy dùng Chrome, Edge hoặc Safari trên HTTPS/localhost.');
        return;
      }
      try {
        const modelUrl = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
          faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
          faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl),
        ]);
        if (cancelled) return;
        setModelReady(true);
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
          : error.message || 'Không thể mở camera. Hãy kiểm tra camera không bị ứng dụng khác sử dụng.');
      }
    }
    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function confirmAttendance() {
    if (cameraState !== 'ready' || !modelReady || !videoRef.current?.videoWidth || submitting) return;
    setSubmitting(true);
    setCameraError('');
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!detection) throw new Error('Không phát hiện khuôn mặt. Hãy nhìn thẳng vào camera.');
      await onSuccess(Array.from(detection.descriptor), await compressWebcamFrame(videoRef.current));
      onClose();
    } catch (error) {
      setCameraError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><motion.div className="face-modal" initial={{ scale: .94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><div className="face-modal-header"><span className="section-label">FACE AUTHENTICATION</span><button className="modal-close" aria-label="Đóng" onClick={onClose}>✕</button></div><h2>{checkedIn ? 'Xác nhận check-out' : faceRegistered ? 'Xác thực check-in' : 'Đăng ký khuôn mặt'}</h2><div className="camera-stage">{cameraState === 'error' ? <div className="camera-message"><Camera size={30} /><strong>Không mở được camera</strong><span>{cameraError}</span></div> : <><video ref={videoRef} className="camera-video" autoPlay muted playsInline /><div className="scan-frame"><UserRound size={52} /><span /></div><div className="scan-line" /></>}</div><p>{cameraState === 'starting' ? 'Đang tải nhận diện khuôn mặt và yêu cầu quyền camera...' : cameraState === 'ready' ? 'Đưa khuôn mặt vào khung hình, sau đó xác nhận.' : 'Vui lòng cấp quyền camera và thử lại.'}</p>{cameraError && cameraState !== 'error' && <div className="camera-error">{cameraError}</div>}<button className="checkout-button" disabled={cameraState !== 'ready' || !modelReady || submitting} onClick={confirmAttendance}>{submitting ? 'ĐANG XÁC THỰC...' : checkedIn ? 'XÁC NHẬN CHECK-OUT' : faceRegistered ? 'XÁC NHẬN CHECK-IN' : 'ĐĂNG KÝ VÀ CHECK-IN'}</button></motion.div></motion.div>;
}

function ForgotPassword({ onClose }) { return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="forgot-modal" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}><button className="modal-close" onClick={onClose}><X size={18} /></button><LockKeyhole size={25} /><h2>Quên mật khẩu?</h2><p>Nhập email hoặc MSSV để nhận hướng dẫn khôi phục trong tương lai.</p><input placeholder="Email hoặc MSSV" /><button className="primary-button" onClick={onClose}>GỬI YÊU CẦU</button></motion.div></motion.div>; }

export default App;
