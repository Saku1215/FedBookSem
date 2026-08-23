import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, registerUser } from '../api/client';
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
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const isRegister = mode === 'register';

  function switchMode(next) {
    setMode(next);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (!username.trim() || !password) {
      setError('Enter both your username and password.');
      return;
    }
    if (isRegister && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const data = isRegister
        ? await registerUser({
            username: username.trim().toLowerCase(),
            password,
            displayName: displayName.trim() || undefined,
          })
        : await loginUser(username.trim().toLowerCase(), password);
      login({ ...data.actor, token: data.token });
      navigate('/');
    } catch (err) {
      const msg = err?.response?.data?.error
        || (isRegister ? 'Could not create account.' : 'Invalid username or password.');
      setError(msg);
      setSubmitting(false);
    }
  }

  function fillDemo(u) {
    setMode('login');
    setUsername(u.username);
    setPassword(u.password);
    setError('');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Left panel — brand */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 48, background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, height: 400, background: 'radial-gradient(circle, rgba(212,175,55,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          {BOOK_COVERS.map((isbn) => <BookSpine key={isbn} isbn={isbn} />)}
        </div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 36, marginBottom: 8 }}>
          Fed<span style={{ color: 'var(--gold)' }}>Book</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 280, lineHeight: 1.6, marginBottom: 24 }}>
          A social bookstore for Sri Lankan literary discourse
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['Books', 'Reviews', 'Reading list', 'ML picks'].map((f) => (
            <span key={f} className="badge badge-gold">{f}</span>
          ))}
        </div>
      </div>

      {/* Right panel — login / register form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 48, maxWidth: 480 }}>
        {/* Mode toggle */}
        <div style={{
          display: 'inline-flex', alignSelf: 'flex-start',
          border: '1px solid var(--border)', borderRadius: 999,
          padding: 3, marginBottom: 20, background: 'var(--surface)',
        }}>
          {[{ id: 'login', label: 'Sign in' }, { id: 'register', label: 'Create account' }].map((t) => {
            const active = mode === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchMode(t.id)}
                style={{
                  padding: '6px 16px', borderRadius: 999, border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
                  background: active ? 'var(--gold)' : 'transparent',
                  color: active ? '#1a1a1a' : 'var(--text-muted)',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, marginBottom: 6 }}>
          {isRegister ? 'Create your account' : 'Sign in'}
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 28 }}>
          {isRegister
            ? 'Pick a username and password — you can add reviews and build a reading list after this.'
            : 'Welcome back — enter your credentials to continue.'}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }} htmlFor="username">
            Username {isRegister && <span style={{ fontSize: 11 }}>· 3–30 chars, letters/digits/underscore</span>}
          </label>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>@</span>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={isRegister ? 'choose a username' : 'your username'}
              autoComplete={isRegister ? 'username' : 'username'}
              autoCapitalize="none"
              autoFocus
              style={{ paddingLeft: 28, width: '100%', height: 42 }}
            />
          </div>

          {isRegister && (
            <>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }} htmlFor="displayName">
                Display name <span style={{ fontSize: 11 }}>· optional</span>
              </label>
              <div style={{ marginBottom: 16 }}>
                <input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="how others see your name"
                  style={{ width: '100%', height: 42 }}
                />
              </div>
            </>
          )}

          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }} htmlFor="password">
            Password {isRegister && <span style={{ fontSize: 11 }}>· at least 6 characters</span>}
          </label>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? 'pick a password' : 'your password'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              style={{ paddingRight: 64, width: '100%', height: 42 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 12, padding: '4px 8px',
              }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && (
            <p style={{ color: '#ef4444', fontSize: 13, marginTop: 4, marginBottom: 10 }} role="alert">
              {error}
            </p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
            style={{ width: '100%', height: 44, marginTop: 12, cursor: submitting ? 'progress' : 'pointer' }}
          >
            {submitting
              ? (isRegister ? 'Creating…' : 'Signing in…')
              : (isRegister ? 'Create account' : 'Sign in')}
          </button>
        </form>

        {!isRegister && (
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              Demo accounts — click any to autofill the form.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DEMO_USERS.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => fillDemo(u)}
                  className="btn btn-ghost btn-sm"
                  title={`Fill username=${u.username} and password=${u.password}`}
                  style={{ fontSize: 12 }}
                >
                  @{u.username} <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontFamily: 'monospace' }}>{u.password}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
