import { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE_URL = 'https://fullstackum-backend.onrender.com/users';
const SESSION_DURATION = 15 * 60; // 15 minutes, in seconds
const SESSION_POLL_MS = 20000; // how often a signed-in user checks its session is still current

/* ================= ICONS =================
   Small inline SVGs so the app has zero icon-library dependency. */
const Icon = ({ children, size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {children}
  </svg>
);
const IconCheck = (p) => <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>;
const IconX = (p) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>;
const IconAlert = (p) => <Icon {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></Icon>;
const IconRefresh = (p) => <Icon {...p}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></Icon>;
const IconSearch = (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>;
const IconLogout = (p) => <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Icon>;
const IconTrash = (p) => <Icon {...p}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></Icon>;
const IconUsers = (p) => <Icon {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Icon>;
const IconShield = (p) => <Icon {...p}><path d="M12 2 4 5v6c0 5 3.4 8.9 8 11 4.6-2.1 8-6 8-11V5l-8-3Z" /></Icon>;
const IconPower = (p) => <Icon {...p}><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><path d="M12 2v10" /></Icon>;

function App() {
  const [currentView, setCurrentView] = useState('login');
  const [message, setMessage] = useState({ text: '', isError: false });
  const [users, setUsers] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION);
  const [sessionToken, setSessionToken] = useState(null);
  const warnedRef = useRef(false);

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '', userType: 'user' });

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage({ text: '', isError: false }), 5000);
  };

  // ---- 15-minute session timer -------------------------------------
  // Resets on login and on any user activity; auto-logs-out at zero.
  useEffect(() => {
    if (!loggedInUser) return;
    setTimeLeft(SESSION_DURATION);
    warnedRef.current = false;

    const tick = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(tick);
  }, [loggedInUser?.id]);

  useEffect(() => {
    if (!loggedInUser) return;
    let lastReset = Date.now();
    const resetTimer = () => {
      const now = Date.now();
      if (now - lastReset > 5000) { // throttle so every mouse tick doesn't trigger a re-render
        lastReset = now;
        setTimeLeft(SESSION_DURATION);
        warnedRef.current = false;
      }
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(evt => window.addEventListener(evt, resetTimer));
    return () => events.forEach(evt => window.removeEventListener(evt, resetTimer));
  }, [loggedInUser?.id]);

  useEffect(() => {
    if (!loggedInUser) return;
    if (timeLeft === 0) {
      showMessage('Session expired after 15 minutes of inactivity. Please sign in again.', true);
      handleLogout();
    } else if (timeLeft === 60 && !warnedRef.current) {
      warnedRef.current = true;
      showMessage('Heads up — your session ends in 1 minute.', true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // ---- Session validity polling (standard users only) ---------------
  // Every login stamps a fresh currentSessionId onto the user record
  // (see loginUser in the backend). If an admin force-logs-out this user,
  // or the account signs in elsewhere, currentSessionId changes server-side
  // and no longer matches the token this tab captured at login — so we
  // sign out locally the next time we notice.
  useEffect(() => {
    if (!loggedInUser || loggedInUser.userType === 'admin') return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/${loggedInUser.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.currentSessionId !== sessionToken) {
          showMessage('Your session ended — signed out by an administrator or from another device.', true);
          handleLogout();
        }
      } catch (error) {
        // Silent on transient network errors — don't spam the toast every 20s.
      }
    }, SESSION_POLL_MS);
    return () => clearInterval(poll);
  }, [loggedInUser?.id, loggedInUser?.userType, sessionToken]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  const timerState = timeLeft <= 60 ? 'critical' : timeLeft <= 300 ? 'warning' : 'normal';

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm)
      });
      if (response.ok) {
        const msg = regForm.userType === 'admin'
          ? 'Admin request submitted! Waiting for approval.'
          : 'Account created successfully! Please login.';
        showMessage(msg);
        setCurrentView('login');
        setRegForm({ name: '', email: '', password: '', userType: 'user' });
      } else {
        showMessage('Registration failed.', true);
      }
    } catch (error) {
      showMessage('Server error.', true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });

      if (response.ok) {
        const userData = await response.json();
        setLoggedInUser(userData);
        setSessionToken(userData.currentSessionId ?? null);
        if (userData.userType === 'admin') loadUsers();
      } else {
        const errorData = await response.json().catch(() => null);
        showMessage(errorData?.message || 'Invalid credentials or account pending approval.', true);
      }
    } catch (error) {
      showMessage('Server connection failed.', true);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(API_BASE_URL);
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      showMessage('Failed to sync users.', true);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleApprove = async (targetUser) => {
    const updatedUser = { ...targetUser, status: 'APPROVED' };
    try {
      const response = await fetch(`${API_BASE_URL}/${targetUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      });
      if (response.ok) {
        showMessage(`${targetUser.name} has been approved as an Admin!`);
        loadUsers();
      }
    } catch (error) {
      showMessage('Error approving user.', true);
    }
  };

  const handleRoleChange = async (targetUser, newRole) => {
    const updatedUser = { ...targetUser, userType: newRole };
    try {
      const response = await fetch(`${API_BASE_URL}/${targetUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      });
      if (response.ok) loadUsers();
    } catch (error) {
      showMessage('Error updating role.', true);
    }
  };

  const performDelete = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/${id}`, { method: 'DELETE' });
      if (response.ok) {
        showMessage('Account removed.');
        loadUsers();
      }
    } catch (error) {
      showMessage('Failed to delete user.', true);
    } finally {
      setConfirmDialog(null);
    }
  };

  const requestDelete = (user) => {
    setConfirmDialog({
      title: 'Remove account',
      message: `This permanently removes ${user.name}'s account and cannot be undone.`,
      confirmLabel: 'Remove account',
      onConfirm: () => performDelete(user.id)
    });
  };

  const requestReject = (user) => {
    setConfirmDialog({
      title: 'Reject admin request',
      message: `${user.name} will not be granted admin access. Their pending request will be removed.`,
      confirmLabel: 'Reject request',
      onConfirm: () => performDelete(user.id)
    });
  };

  const performForceLogout = async (user) => {
    try {
      const response = await fetch(`${API_BASE_URL}/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, currentSessionId: null })
      });
      if (response.ok) {
        showMessage(`${user.name} has been signed out.`);
      }
    } catch (error) {
      showMessage('Error forcing logout.', true);
    } finally {
      setConfirmDialog(null);
    }
  };

  const requestForceLogout = (user) => {
    setConfirmDialog({
      title: 'Force logout',
      message: `${user.name} will be immediately signed out of their active session.`,
      confirmLabel: 'Force logout',
      onConfirm: () => performForceLogout(user)
    });
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setSessionToken(null);
    setLoginForm({ email: '', password: '' });
    setCurrentView('login');
  };

  // Data splitting: active vs. pending, with search applied only to active users
  const allActiveUsers = users.filter(u => u.status !== 'PENDING');
  const activeUsers = allActiveUsers.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const pendingAdmins = users.filter(u => u.status === 'PENDING');
  const totalAdmins = allActiveUsers.filter(u => u.userType === 'admin').length;

  // ================= RENDER LOGGED OUT =================
  if (!loggedInUser) {
    return (
      <div className="auth-layout">
        {message.text && (
          <div className={`toast ${message.isError ? 'error' : 'success'}`} role="status" aria-live="polite">
            {message.isError ? <IconX size={16} /> : <IconCheck size={16} />}
            {message.text}
          </div>
        )}
        <div className="auth-brand">
          <div className="logo-placeholder" />
          <span>System<strong>UI</strong></span>
        </div>
        <div className="auth-card">
          <div className="auth-header">
            <span className="eyebrow">{currentView === 'login' ? 'System Access' : 'New Account'}</span>
            <h2>{currentView === 'login' ? 'Sign in to continue' : 'Create your account'}</h2>
            <p>{currentView === 'login' ? 'Enter your credentials to reach the dashboard.' : 'Standard accounts activate instantly.'}</p>
          </div>
          {currentView === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="input-group">
                <label htmlFor="login-email">Email Address</label>
                <input id="login-email" type="email" autoComplete="email" required
                  value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} />
              </div>
              <div className="input-group">
                <label htmlFor="login-password">Password</label>
                <input id="login-password" type="password" autoComplete="current-password" required
                  value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />
              </div>
              <button type="submit" disabled={isLoading}>{isLoading ? 'Authenticating…' : 'Sign In'}</button>
              <p className="auth-switch">New here? <span onClick={() => setCurrentView('register')}>Create an account</span></p>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="input-group">
                <label htmlFor="reg-name">Full Name</label>
                <input id="reg-name" type="text" autoComplete="name" required
                  value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })} />
              </div>
              <div className="input-group">
                <label htmlFor="reg-email">Email Address</label>
                <input id="reg-email" type="email" autoComplete="email" required
                  value={regForm.email} onChange={e => setRegForm({ ...regForm, email: e.target.value })} />
              </div>
              <div className="input-group">
                <label htmlFor="reg-password">Password</label>
                <input id="reg-password" type="password" autoComplete="new-password" required
                  value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })} />
              </div>
              <div className="input-group">
                <label htmlFor="reg-type">Account Type</label>
                <select id="reg-type" value={regForm.userType} onChange={e => setRegForm({ ...regForm, userType: e.target.value })}>
                  <option value="user">Standard User</option>
                  <option value="admin">Administrator (Requires Approval)</option>
                </select>
              </div>
              <button type="submit" disabled={isLoading}>{isLoading ? 'Processing…' : 'Register Account'}</button>
              <p className="auth-switch">Already have an account? <span onClick={() => setCurrentView('login')}>Sign in</span></p>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ================= RENDER LOGGED IN =================
  return (
    <div className="dashboard-layout">
      {message.text && (
        <div className={`toast ${message.isError ? 'error' : 'success'}`} role="status" aria-live="polite">
          {message.isError ? <IconX size={16} /> : <IconCheck size={16} />}
          {message.text}
        </div>
      )}

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-placeholder" />
          <h3>System<strong>UI</strong></h3>
        </div>
        <div className="sidebar-menu">
          <div className="menu-item active">
            {loggedInUser.userType === 'admin' ? <IconUsers size={16} /> : <IconShield size={16} />}
            {loggedInUser.userType === 'admin' ? 'Dashboard' : 'My Profile'}
          </div>
        </div>
        <div className="sidebar-footer">
          <div className={`session-timer ${timerState}`} title="Time remaining before automatic sign-out">
            <span className="eyebrow">Session</span>
            <span className="session-timer__value">{formatTime(timeLeft)}</span>
          </div>
          <div className="user-badge">
            <div className="avatar">{loggedInUser.name.charAt(0)}</div>
            <div className="user-info">
              <span className="user-name">{loggedInUser.name}</span>
              <span className="user-role">{loggedInUser.userType}</span>
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout}><IconLogout size={15} /> Logout</button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="content-header">
          <div>
            <span className="eyebrow">{loggedInUser.userType === 'admin' ? 'Admin Console' : 'Account'}</span>
            <h1>{loggedInUser.userType === 'admin' ? 'Overview' : 'My Profile'}</h1>
          </div>
          {loggedInUser.userType === 'admin' && (
            <button className="btn-primary" onClick={loadUsers} disabled={isSyncing}>
              <IconRefresh size={15} /> {isSyncing ? 'Syncing…' : 'Refresh Data'}
            </button>
          )}
        </header>

        {loggedInUser.userType === 'admin' ? (
          <div className="admin-view">

            {/* PENDING APPROVALS QUEUE */}
            {pendingAdmins.length > 0 && (
              <div className="pending-alert">
                <div className="pending-alert__stripe" />
                <div className="pending-alert__header">
                  <h3><IconAlert size={18} /> Action required — pending admin approvals ({pendingAdmins.length})</h3>
                </div>
                <table className="data-table">
                  <tbody>
                    {pendingAdmins.map(user => (
                      <tr key={user.id} className="pending-row">
                        <td><span className="fw-600">{user.name}</span><br /><span className="text-muted">{user.email}</span></td>
                        <td><span className="tag tag-pending">Pending Admin</span></td>
                        <td className="text-right">
                          <div className="row-actions">
                            <button className="btn-success-solid" onClick={() => handleApprove(user)}>
                              <IconCheck size={14} /> Approve
                            </button>
                            <button className="btn-icon danger" onClick={() => requestReject(user)}>
                              <IconX size={14} /> Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* STATS GRID */}
            <div className="stats-grid">
              <div className="stat-card">
                <h4>Total Active Users</h4>
                <h2>{allActiveUsers.length}</h2>
              </div>
              <div className="stat-card">
                <h4>Active Admins</h4>
                <h2>{totalAdmins}</h2>
              </div>
              <div className="stat-card">
                <h4>Pending Requests</h4>
                <h2>{pendingAdmins.length}</h2>
              </div>
            </div>

            {/* ACTIVE DIRECTORY TABLE */}
            <div className="table-container">
              <div className="table-toolbar">
                <h3>Active Directory</h3>
                <div className="search-field">
                  <IconSearch size={15} />
                  <input type="text" className="search-input" placeholder="Search active users…"
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
              </div>

              {isSyncing ? (
                <table className="data-table">
                  <tbody>
                    {[0, 1, 2].map(i => (
                      <tr className="skeleton-row" key={i}>
                        <td><div className="skeleton-bar" style={{ width: '60%' }} /></td>
                        <td><div className="skeleton-bar" style={{ width: '70%' }} /></td>
                        <td><div className="skeleton-bar" style={{ width: '40%' }} /></td>
                        <td><div className="skeleton-bar" style={{ width: '30%', marginLeft: 'auto' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : activeUsers.length === 0 ? (
                <div className="table-empty">
                  <IconUsers size={30} />
                  {allActiveUsers.length === 0 ? (
                    <>
                      <p className="eyebrow">No users yet</p>
                      <p>Active accounts will appear here once someone registers.</p>
                    </>
                  ) : (
                    <>
                      <p className="eyebrow">No matches</p>
                      <p>Nothing found for "{searchTerm}". Try a different name or email.</p>
                    </>
                  )}
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>User</th><th>Email Address</th><th>Role</th><th className="text-right">Actions</th></tr>
                  </thead>
                  <tbody>
                    {activeUsers.map(user => (
                      <tr key={user.id}>
                        <td>
                          <div className="table-user-cell">
                            <div className="avatar-small">{user.name.charAt(0)}</div>
                            <span className="fw-600">{user.name}</span>
                          </div>
                        </td>
                        <td className="text-muted">{user.email}</td>
                        <td>
                          <select className={`role-select ${user.userType === 'admin' ? 'role-admin' : 'role-user'}`}
                            value={user.userType} onChange={(e) => handleRoleChange(user, e.target.value)}>
                            <option value="user">Standard</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="text-right">
                          <div className="row-actions">
                            {user.userType === 'user' && (
                              <button className="btn-icon warn" onClick={() => requestForceLogout(user)}>
                                <IconPower size={13} /> Force Logout
                              </button>
                            )}
                            <button className="btn-icon danger" onClick={() => requestDelete(user)}>
                              <IconTrash size={13} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          /* STANDARD USER VIEW */
          <div className="user-view">
            <div className="profile-card">
              <div className="profile-header">
                <div className="avatar-large">{loggedInUser.name.charAt(0)}</div>
                <div className="profile-header-info">
                  <h3>{loggedInUser.name}</h3>
                  <span className="badge badge-user">Standard User</span>
                </div>
              </div>
              <div className="profile-body">
                <div className="info-group">
                  <label>Email Address</label>
                  <p>{loggedInUser.email}</p>
                </div>
                <div className="info-group">
                  <label>Account Status</label>
                  <p><span className="status-dot" />Active</p>
                </div>
                <div className="info-group">
                  <label>Access Level</label>
                  <p>Standard — read/write on your own account only</p>
                </div>
                <div className="profile-note">
                  Need administrator access? Register a new account and select
                  "Administrator" as the account type. Requests are reviewed and
                  approved by an existing admin before access is granted.
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* CONFIRM DIALOG */}
      {confirmDialog && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setConfirmDialog(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmDialog.title}</h3>
            <p>{confirmDialog.message}</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button className="btn-danger-solid" onClick={confirmDialog.onConfirm}>{confirmDialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;