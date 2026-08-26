import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function NavAvatar({ user }) {
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.displayName} className="avatar" style={{ width: 32, height: 32 }} />;
  }
  return (
    <div className="avatar" style={{ width: 32, height: 32, fontSize: 14 }}>
      {user.displayName?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase()}
    </div>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        Fed<span style={{ color: 'var(--gold)' }}>Book</span>
      </Link>
      <div className="navbar-links">
        <Link to="/">Home</Link>
        <Link to="/books">Library</Link>
        <Link to="/people">People</Link>
        {user && <Link to="/reading">Reading</Link>}
      </div>
      <div className="flex items-center gap-sm">
        {user ? (
          <>
            <Link to={`/users/${user.username}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
              <NavAvatar user={user} />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>@{user.username}</span>
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Sign out</button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>
        )}
      </div>
    </nav>
  );
}
