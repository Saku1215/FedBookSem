import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getUserProfile, updateProfile, uploadAvatar } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ReviewCard from '../components/ReviewFeed/ReviewCard';
import FollowButton from '../components/Social/FollowButton';
import Toast from '../components/Layout/Toast';

function Avatar({ user, size = 96 }) {
  const [src, setSrc] = useState(user.avatarUrl);
  if (src) {
    return <img src={src} alt={user.displayName} onError={() => setSrc(null)} style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%' }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#fff' }}>
      {user.displayName?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase()}
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams();
  const { user: me, login } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ displayName: '', bio: '' });
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const fileRef = useRef();

  const isOwn = me?.username === username;

  const load = useCallback(() => {
    getUserProfile(username).then(setProfile).catch(() => {});
  }, [username]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (profile) setEditData({ displayName: profile.displayName, bio: profile.bio || '' });
  }, [profile]);

  async function handleSave() {
    await updateProfile(username, editData);
    if (isOwn) {
      login({ ...me, displayName: editData.displayName, bio: editData.bio });
    }
    setEditing(false);
    load();
    setToast('Profile updated');
  }

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { avatarUrl } = await uploadAvatar(username, file);
    if (isOwn) login({ ...me, avatarUrl: `${avatarUrl}?t=${Date.now()}` });
    setUploading(false);
    load();
    setToast('Avatar updated');
  }

  if (!profile) return <div className="container" style={{ paddingTop: 64, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}

      <div className="card" style={{ marginBottom: 32 }}>
        <div className="flex gap-lg" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ border: '3px solid var(--gold)', borderRadius: '50%', padding: 2 }}>
              <Avatar user={profile} size={96} />
              {uploading && (
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>Uploading...</div>
              )}
            </div>
            {isOwn && (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, padding: 0, borderRadius: '50%', fontSize: 14 }}
                  onClick={() => fileRef.current?.click()}
                >✏️</button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
              </>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 200 }}>
            {editing ? (
              <div>
                <input value={editData.displayName} onChange={(e) => setEditData({ ...editData, displayName: e.target.value })} style={{ marginBottom: 8, width: '100%' }} />
                <textarea value={editData.bio} onChange={(e) => setEditData({ ...editData, bio: e.target.value })} rows={3} style={{ width: '100%', marginBottom: 8 }} />
                <div className="flex gap-sm">
                  <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, marginBottom: 4 }}>{profile.displayName}</h1>
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>@{profile.username}</div>
                {profile.bio && <p style={{ marginBottom: 12, lineHeight: 1.6 }}>{profile.bio}</p>}
                <div className="flex gap-sm flex-wrap" style={{ marginBottom: 12 }}>
                  <span><strong>{profile.followers}</strong> <span className="text-muted">followers</span></span>
                  <span><strong>{profile.following}</strong> <span className="text-muted">following</span></span>
                  <span><strong>{profile.reviewCount}</strong> <span className="text-muted">reviews</span></span>
                </div>
                <div className="flex gap-sm">
                  {isOwn
                    ? <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit Profile</button>
                    : <FollowButton targetId={profile.id} targetUsername={profile.username} onToast={setToast} />
                  }
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, marginBottom: 16 }}>Reviews</h2>
      {(!profile.reviews || profile.reviews.length === 0)
        ? <div className="empty-state"><div style={{ fontSize: 28 }}>✍️</div><p>No reviews yet.</p></div>
        : profile.reviews.map((r) => <ReviewCard key={r.id} review={r} onToast={setToast} />)
      }
    </div>
  );
}
