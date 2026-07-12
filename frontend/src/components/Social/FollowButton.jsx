import React, { useState } from 'react';
import { followActor, unfollowActor } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function FollowButton({ targetId, targetUsername, initialFollowing = false, onToast }) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  if (!user) return null;
  if (user.id === targetId || user.username === targetUsername) return null;

  async function toggle() {
    setLoading(true);
    try {
      if (following) {
        await unfollowActor(targetId);
        setFollowing(false);
        onToast && onToast(`Unfollowed @${targetUsername}`);
      } else {
        await followActor(targetId);
        setFollowing(true);
        onToast && onToast(`Following @${targetUsername}`);
      }
    } catch {}
    setLoading(false);
  }

  return (
    <button
      className={`btn btn-sm ${following ? 'btn-ghost' : 'btn-primary'}`}
      onClick={toggle}
      disabled={loading}
      style={{ opacity: following ? 0.7 : 1 }}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
