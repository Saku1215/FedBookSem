import React, { useState, useEffect } from 'react';
import { getUsers } from '../api/client';
import { useAuth } from '../context/AuthContext';
import FollowButton from '../components/Social/FollowButton';
import Toast from '../components/Layout/Toast';
import { Link } from 'react-router-dom';

const PALETTE = ['#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed'];

export default function PeoplePage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [toast, setToast] = useState('');

  useEffect(() => { getUsers().then(setUsers).catch(() => {}); }, []);

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, marginBottom: 4 }}>People</h1>
        <p style={{ color: 'var(--text-muted)' }}>Readers on this federated instance</p>
      </div>

      {users.length === 0 ? (
        <div className="empty-state"><div style={{ fontSize: 32 }}>👥</div><p>No users found.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {users.map((u, idx) => (
            <div key={u.id} className="card" style={{ position: 'relative' }}>
              {user && user.id === u.id && (
                <span className="badge badge-gold" style={{ position: 'absolute', top: 12, right: 12 }}>You</span>
              )}
              <Link to={`/users/${u.username}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: PALETTE[idx % PALETTE.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {u.displayName?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{u.displayName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{u.username}</div>
                  </div>
                </div>
              </Link>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{u.domain}</div>
              <FollowButton targetId={u.id} targetUsername={u.username} onToast={setToast} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
