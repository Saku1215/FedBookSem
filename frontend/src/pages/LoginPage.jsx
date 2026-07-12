import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../api/client';
import { useAuth } from '../context/AuthContext';

const DEMO_USERS = [
  { username: 'alice', password: 'alice123', displayName: 'Alice Perera', bio: 'Lover of Sinhala fiction' },
  { username: 'bob', password: 'bob123', displayName: 'Bob Silva', bio: 'Academic reader & critic' },
  { username: 'carol', password: 'carol123', displayName: 'Carol Fernando', bio: 'Educator & avid annotator' },
];

const BOOK_COVERS = [
  '9789556682045', '9789556682052', '9789555232310',
  '9789553100012', '9789555360180', '9789550019015',
];

function BookSpine({ isbn }) {
  const [err, setErr] = useState(false);
  if (err) return <div style={{ width: 48, height: 72, background: 'rgba(212,175,55,0.2)', borderRadius: 4 }} />;
  return (
    <img
      src={`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`}
      alt=""
      onError={() => setErr(true)}
      style={{ width: 48, height: 72, objectFit: 'cover', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
    />
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await loginUser(username.trim(), password);
      login({ ...data.actor, token: data.token });
      navigate('/feed');
    } catch {
      setError('Invalid username or password.');
    }
  }

  async function quickLogin(u) {
    setUsername(u.username);
    setPassword(u.password);
    try {
      const data = await loginUser(u.username, u.password);
      login({ ...data.actor, token: data.token });
      navigate('/feed');
    } catch {
      setError('Could not sign in. Is the backend running?');
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Left panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 48, background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, height: 400, background: 'radial-gradient(circle, rgba(212,175,55,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          {BOOK_COVERS.map((isbn) => <BookSpine key={isbn} isbn={isbn} />)}
        </div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 36, marginBottom: 8 }}>
          Fed<span style={{ color: 'var(--gold)' }}>Book</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 280, lineHeight: 1.6, marginBottom: 24 }}>
          The federated social bookstore for Sri Lankan literary discourse
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['ActivityPub', 'W3C Annotations', 'Neo4j Graph', 'Open Web'].map((f) => (
            <span key={f} className="badge badge-gold">{f}</span>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 48, maxWidth: 480 }}>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, marginBottom: 8 }}>Sign in</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>Choose a demo reader to explore</p>

        <div style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
          {DEMO_USERS.map((u) => (
            <button
              key={u.username}
              className="card"
              style={{ textAlign: 'left', cursor: 'pointer', background: username === u.username ? 'rgba(212,175,55,0.1)' : undefined, border: username === u.username ? '1px solid var(--gold)' : undefined }}
              onClick={() => quickLogin(u)}
            >
              <div style={{ fontWeight: 600 }}>{u.displayName}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>@{u.username} · <span style={{ fontFamily: 'monospace' }}>{u.password}</span></div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>or sign in manually</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              style={{ paddingLeft: 28, width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              style={{ width: '100%' }}
            />
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>Sign In</button>
        </form>
      </div>
    </div>
  );
}
