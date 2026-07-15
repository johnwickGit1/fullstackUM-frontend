import { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = 'https://fullstackum-backend.onrender.com/users';
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
    if (loggedInUser) {
      timerInterval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleLogout();
            showMessage("Session expired due to inactivity. Please log in again.", true);
            return SESSION_DURATION;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeLeft(SESSION_DURATION); 
    }
    return () => clearInterval(timerInterval);
  }, [loggedInUser]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage({ text: '', isError: false }), 5000);
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
        setLoggedInUser(userData);
        if (userData.userType === 'admin') loadUsers();
      } else {
        const errorData = await response.json().catch(() => null);
        showMessage(errorData?.message || "Invalid credentials or account pending approval.", true);
      }
    } catch (error) {
      showMessage("Server connection failed.", true);
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
      showMessage("Failed to sync users.", true);
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

  const handleLogout = () => {
    setLoggedInUser(null);
    setLoginForm({ email: '', password: '' });
    setCurrentView('login');
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
              <button type="submit" disabled={isLoading}>{isLoading ? 'Authenticating...' : 'Sign In'}</button>
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
              <button type="submit" disabled={isLoading}>{isLoading ? 'Processing...' : 'Register Account'}</button>
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
          <div className="menu-item active">Dashboard</div>
          
          {/* PENDING APPROVALS IN SIDEBAR */}
          {loggedInUser.userType === 'admin' && pendingAdmins.length > 0 && (
            <div className="sidebar-pending">
              <h4 className="sidebar-heading">Pending Approvals ({pendingAdmins.length})</h4>
              <div className="pending-list">
                {pendingAdmins.map(user => (
                  <div key={user.id} className="pending-card">
                    <div className="pending-info">
                      <span className="pending-name" title={user.name}>{user.name}</span>
                      <span className="pending-email" title={user.email}>{user.email}</span>
                    </div>
                    <div className="pending-actions">
                      <button className="btn-approve" onClick={() => handleApprove(user)} title="Approve">✓</button>
                      <button className="btn-reject" onClick={() => handleDelete(user.id)} title="Reject">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          {/* SESSION TIMER */}
          <div className="session-timer">
            <span>Session ends in: <strong>{formatTime(timeLeft)}</strong></span>
          </div>

          <div className="user-badge">
            <div className="avatar">{loggedInUser.name.charAt(0)}</div>
            <div className="user-info">
              <span className="user-name">{loggedInUser.name}</span>
              <span className="user-role">{loggedInUser.userType}</span>
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="content-header">
          <h1>Overview</h1>
          {loggedInUser.userType === 'admin' && (
            <button className="btn-primary" onClick={loadUsers}>Refresh Data</button>
          )}
        </header>

        {loggedInUser.userType === 'admin' ? (
          <div className="admin-view">
            
            {/* STATS GRID */}
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

            {/* MAIN DATA TABLE */}
            <div className="table-container">
              <div className="table-toolbar">
                <h3>Active Directory</h3>
                <input type="text" className="search-input" placeholder="Search active users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="table-scroll-wrapper">
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
                          <select className={`role-select ${user.userType === 'admin' ? 'role-admin' : 'role-user'}`} value={user.userType} onChange={(e) => handleRoleChange(user, e.target.value)}>
                            <option value="user">Standard</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="text-right">
                          <button className="btn-icon danger" onClick={() => handleDelete(user.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* USER VIEW */
          <div className="user-view">
             <div className="stat-card">
               <h2>Welcome back, {loggedInUser.name}!</h2>
               <p className="text-muted" style={{ marginTop: '10px' }}>Your standard user account is currently active.</p>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App; 