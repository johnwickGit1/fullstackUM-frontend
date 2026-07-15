import { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = 'https://fullstackum-backend.onrender.com/users'; // Remember to keep your actual URL here
const SESSION_DURATION = 15 * 60; // 15 minutes in seconds

function App() {
  const [currentView, setCurrentView] = useState('login'); 
  const [message, setMessage] = useState({ text: '', isError: false });
  const [users, setUsers] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState(null); 
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION);

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '', userType: 'user' });

  // ⏱️ Session Timer Effect
  useEffect(() => {
    let timerInterval;
    let syncInterval;

    if (loggedInUser) {
      // 1. The 15-Minute Countdown (Fully Active)
      timerInterval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleLogout("Your 15-minute session has naturally expired.");
            return SESSION_DURATION;
          }
          return prev - 1;
        });
      }, 1000);

      syncInterval = setInterval(async () => {
        try {
          const response = await fetch(API_BASE_URL);
          const latestUsers = await response.json();
          setUsers(latestUsers); 

          const me = latestUsers.find(u => u.id === loggedInUser.id);
          if (me && me.currentSessionId !== loggedInUser.currentSessionId) {
            handleLogout("You were logged out. Someone signed into this account from another location, or an Admin terminated your session.");
          }
        } catch (error) {
          // Silently ignore network blips
        }
      }, 5000); 
      
    } else {
      setTimeLeft(SESSION_DURATION); 
    }

    return () => {
      clearInterval(timerInterval);
      // clearInterval(syncInterval); // Uncomment this later too
    };
  }, [loggedInUser]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage({ text: '', isError: false }), 6000);
  };

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
          ? "Admin request submitted! Waiting for approval." 
          : "Account created successfully! Please login.";
        showMessage(msg);
        setCurrentView('login');
        setRegForm({ name: '', email: '', password: '', userType: 'user' });
      } else {
        showMessage("Registration failed.", true);
      }
    } catch (error) {
      showMessage("Server error.", true);
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
        const newSessionId = Date.now().toString() + Math.random().toString(36).substring(7);
        const updatedUser = { ...userData, currentSessionId: newSessionId };

        await fetch(`${API_BASE_URL}/${userData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedUser)
        }).catch(() => {}); // Catch prevents failure if backend isn't updated yet

        setLoggedInUser(updatedUser);
        if (updatedUser.userType === 'admin') loadUsers();
      } else {
        const errorData = await response.json().catch(() => null);
        showMessage(errorData?.message || "Invalid credentials or account pending approval.", true);
      }
    } catch (error) {
      showMessage("Server connection failed. If using Render free tier, please wait 50 seconds and try again.", true);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch(API_BASE_URL);
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error("Background sync failed");
    }
  };

  const handleForceLogout = async (targetUser) => {
    if (!window.confirm(`Are you sure you want to force logout ${targetUser.name}?`)) return;
    try {
      const updatedUser = { ...targetUser, currentSessionId: null };
      const response = await fetch(`${API_BASE_URL}/${targetUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      });
      if (response.ok) {
        showMessage(`Session terminated for ${targetUser.name}.`);
        loadUsers();
      }
    } catch (error) {
      showMessage("Failed to terminate session.", true);
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
        showMessage(`${targetUser.name} has been approved!`);
        loadUsers(); 
      }
    } catch (error) {
      showMessage("Error approving user.", true);
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
      showMessage("Error updating role.", true);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Are you sure? This cannot be undone.`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/${id}`, { method: 'DELETE' });
      if (response.ok) {
        showMessage("Account removed.");
        loadUsers();
      }
    } catch (error) {
      showMessage("Failed to delete user.", true);
    }
  };

  const handleLogout = (customMessage = null) => {
    if (loggedInUser && loggedInUser.currentSessionId) {
       fetch(`${API_BASE_URL}/${loggedInUser.id}`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ ...loggedInUser, currentSessionId: null })
       }).catch(() => {}); 
    }
    setLoggedInUser(null);
    setLoginForm({ email: '', password: '' });
    setCurrentView('login');
    if (customMessage && typeof customMessage === 'string') {
      showMessage(customMessage, true);
    }
  };

  const activeUsers = users.filter(u => u.status !== 'PENDING' && (u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase())));
  const pendingAdmins = users.filter(u => u.status === 'PENDING');
  const totalAdmins = activeUsers.filter(u => u.userType === 'admin').length;

  if (!loggedInUser) {
    return (
      <div className="auth-layout">
        {message.text && <div className={`toast ${message.isError ? 'error' : 'success'}`}>{message.text}</div>}
        <div className="auth-card">
          <div className="auth-header">
            <h2>{currentView === 'login' ? 'System Login' : 'Create Account'}</h2>
            <p>Secure administrative access portal</p>
          </div>
          {currentView === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="input-group">
                <label>Email Address</label>
                <input type="email" required value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} />
              </div>
              <div className="input-group">
                <label>Password</label>
                <input type="password" required value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
              </div>
              <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? 'Authenticating...' : 'Sign In'}</button>
              <p className="auth-switch">New here? <span onClick={() => setCurrentView('register')}>Create an account</span></p>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="input-group">
                <label>Full Name</label>
                <input type="text" required value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} />
              </div>
              <div className="input-group">
                <label>Email Address</label>
                <input type="email" required value={regForm.email} onChange={e => setRegForm({...regForm, email: e.target.value})} />
              </div>
              <div className="input-group">
                <label>Password</label>
                <input type="password" required value={regForm.password} onChange={e => setRegForm({...regForm, password: e.target.value})} />
              </div>
              <div className="input-group">
                <label>Account Type</label>
                <select value={regForm.userType} onChange={e => setRegForm({...regForm, userType: e.target.value})}>
                  <option value="user">Standard User</option>
                  <option value="admin">Administrator (Requires Approval)</option>
                </select>
              </div>
              <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? 'Processing...' : 'Register Account'}</button>
              <p className="auth-switch">Already have an account? <span onClick={() => setCurrentView('login')}>Sign in</span></p>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {message.text && <div className={`toast ${message.isError ? 'error' : 'success'}`}>{message.text}</div>}
      
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-placeholder"></div>
          <h3>System<strong>UI</strong></h3>
        </div>
        
        <div className="sidebar-menu">
          <div className="menu-item active">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>
            Dashboard
          </div>
          
          {loggedInUser.userType === 'admin' && pendingAdmins.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-section-header">
                <span>Pending Approvals</span>
                <span className="badge-count">{pendingAdmins.length}</span>
              </div>
              <div className="pending-scroll-area">
                {pendingAdmins.map(user => (
                  <div key={user.id} className="sidebar-pending-card">
                    <div className="pending-details">
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                    </div>
                    <div className="pending-actions-row">
                      <button className="btn-sidebar-approve" onClick={() => handleApprove(user)}>Approve</button>
                      <button className="btn-sidebar-reject" onClick={() => handleDelete(user.id)}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="session-timer-box">
            <div className="timer-label">Session ends in</div>
            <div className="timer-value">{formatTime(timeLeft)}</div>
          </div>

          <div className="user-profile-sm">
            <div className="avatar">{loggedInUser.name.charAt(0)}</div>
            <div className="user-details">
              <span className="name">{loggedInUser.name}</span>
              <span className="role">{loggedInUser.userType}</span>
            </div>
          </div>
          
          {loggedInUser.userType === 'admin' && (
            <button className="btn-logout" onClick={() => handleLogout()}>Log Out Manually</button>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="content-header">
          <div>
            <h1>Overview</h1>
            <p className="text-muted" style={{marginTop: '4px'}}>Manage system users and active sessions.</p>
          </div>
          {loggedInUser.userType === 'admin' && (
            <button className="btn-primary" onClick={loadUsers} style={{marginTop: '0'}}>Refresh Data</button>
          )}
        </header>

        {loggedInUser.userType === 'admin' ? (
          <div className="admin-view">
            
            <div className="stats-grid">
              <div className="stat-card">
                <h4>Total Active Users</h4>
                <h2>{activeUsers.length}</h2>
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

            <div className="table-container">
              <div className="table-toolbar">
                <h3>Active Directory</h3>
                <input type="text" className="search-input" placeholder="Search active users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="table-scroll-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Status</th>
                      <th>Role</th>
                      <th className="text-right">Admin Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeUsers.map(user => (
                      <tr key={user.id}>
                        <td>
                          <div className="table-user-cell">
                            <div className="avatar-small">{user.name.charAt(0)}</div>
                            <div className="user-info-stack">
                              <span className="fw-600">{user.name}</span>
                              <span className="text-muted" style={{fontSize: '12px'}}>{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {user.currentSessionId ? (
                             <span className="status-badge online">● Online</span>
                          ) : (
                             <span className="status-badge offline">○ Offline</span>
                          )}
                        </td>
                        <td>
                          <select className={`role-select ${user.userType === 'admin' ? 'role-admin' : 'role-user'}`} value={user.userType} onChange={(e) => handleRoleChange(user, e.target.value)} disabled={user.id === loggedInUser.id}>
                            <option value="user">Standard</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="text-right actions-cell">
                          <button 
                            className="btn-text warning" 
                            onClick={() => handleForceLogout(user)}
                            disabled={!user.currentSessionId || user.id === loggedInUser.id}
                            title={!user.currentSessionId ? "User is offline" : "Kick this user"}
                          >
                            Force Logout
                          </button>
                          
                          <button 
                            className="btn-text danger" 
                            onClick={() => handleDelete(user.id)}
                            disabled={user.id === loggedInUser.id}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="user-view">
             <div className="profile-card">
                <div className="profile-header">
                  <div className="avatar-large">{loggedInUser.name.charAt(0)}</div>
                  <div>
                    <h2>{loggedInUser.name}</h2>
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
                    <p style={{ color: 'var(--success)', fontWeight: 'bold' }}>Active & Verified</p>
                  </div>
                  <div className="info-group" style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)'}}>
                    <label>Session Information</label>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                      Your session is secure and will automatically log out in <strong>{formatTime(timeLeft)}</strong>. 
                      Manual logout capabilities are restricted to administrators. Logging in from another device will automatically terminate this session.
                    </p>
                  </div>
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;