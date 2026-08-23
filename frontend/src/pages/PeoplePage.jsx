import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUsers, getSuggestedUsers } from '../api/client';
import { useAuth } from '../context/AuthContext';
import FollowButton from '../components/Social/FollowButton';
import Toast from '../components/Layout/Toast';

const PALETTE = ['#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#0e7490'];
const PAGE = 20;

// People page: two modes.
//  - default (no search term): a small "Suggested for you" list ranked by
//    follower count. Keeps the page from listing hundreds of readers.
//  - search mode (typed query): server-side filter, up to PAGE results.
export default function PeoplePage() {
  const { user } = useAuth();
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [suggested, setSuggested] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const reqSeq = useRef(0);

  // Debounce the search box to keep API traffic modest
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Suggested (once)
  useEffect(() => {
    getSuggestedUsers(8).then((d) => setSuggested(d.users || [])).catch(() => {});
  }, []);

  // Search results (fires on debounced query)
  const runSearch = useCallback(async (q) => {
    if (!q) { setResults([]); return; }
    const mySeq = ++reqSeq.current;
    setLoading(true);
    try {
      const data = await getUsers({ q, limit: PAGE });
      if (mySeq === reqSeq.current) setResults(data.users || []);
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { runSearch(debounced); }, [debounced, runSearch]);

  const searching = debounced.length > 0;

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, marginBottom: 4 }}>People</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
          Find readers by name or username.
        </p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people by name or @username…"
          style={{ maxWidth: 360, width: '100%' }}
        />
      </div>

      {searching ? (
        <>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, marginBottom: 12 }}>
            Search results {results.length > 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>({results.length})</span>}
          </h2>
          {loading && results.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: 28 }}>🔍</div>
              <p>No readers match “{debounced}”.</p>
            </div>
          )}
          <UserGrid users={results} me={user} onToast={setToast} />
        </>
      ) : (
        <>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, marginBottom: 12 }}>
            Suggested for you
          </h2>
          {suggested.length === 0 ? (
            <div className="empty-state"><div style={{ fontSize: 28 }}>👥</div><p>No suggestions yet.</p></div>
          ) : (
            <UserGrid users={suggested} me={user} onToast={setToast} showFollowerCount />
          )}
        </>
      )}
    </div>
  );
}

function UserGrid({ users, me, onToast, showFollowerCount = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
      {users.map((u, idx) => (
        <div key={u.id} className="card" style={{ position: 'relative' }}>
          {me && me.id === u.id && (
            <span className="badge badge-gold" style={{ position: 'absolute', top: 12, right: 12 }}>You</span>
          )}
          <Link to={`/users/${u.username}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Avatar user={u} idx={idx} />
              <div>
                <div style={{ fontWeight: 600 }}>{u.displayName || u.username}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{u.username}</div>
              </div>
            </div>
          </Link>
          {u.bio && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 }}>
              {u.bio}
            </div>
          )}
          {showFollowerCount && typeof u.followerCount === 'number' && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              {u.followerCount} follower{u.followerCount === 1 ? '' : 's'}
            </div>
          )}
          <FollowButton targetId={u.id} targetUsername={u.username} onToast={onToast} />
        </div>
      ))}
    </div>
  );
}

function Avatar({ user, idx }) {
  if (user.avatarUrl) {
    return (
      <img src={user.avatarUrl} alt={user.displayName}
        style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: 48, height: 48, borderRadius: '50%',
      background: PALETTE[idx % PALETTE.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {(user.displayName || user.username || '?')[0].toUpperCase()}
    </div>
  );
}
