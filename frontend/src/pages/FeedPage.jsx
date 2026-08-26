import React, { useState, useEffect } from 'react';
import { getAllReviews, getFeed, getRecommendations } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ReviewCard from '../components/ReviewFeed/ReviewCard';
import Toast from '../components/Layout/Toast';
import BookCover from '../components/BookCover';
import { Link } from 'react-router-dom';

export default function FeedPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('discover');
  const [allReviews, setAllReviews] = useState([]);
  const [myFeed, setMyFeed] = useState([]);
  const [recs, setRecs] = useState([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    getAllReviews().then(setAllReviews).catch(() => {});
    if (user) {
      getFeed().then(setMyFeed).catch(() => {});
      getRecommendations().then(setRecs).catch(() => {});
    }
  }, [user]);

  const tabs = user
    ? [{ id: 'discover', label: 'Discover' }, { id: 'following', label: 'Following' }, { id: 'foryou', label: 'For You' }]
    : [{ id: 'discover', label: 'Discover' }];

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, marginBottom: 4 }}>Literary Feed</h1>
        <p style={{ color: 'var(--text-muted)' }}>Book reviews from the FedBook community</p>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'discover' && (
        allReviews.length === 0
          ? <div className="empty-state"><div style={{ fontSize: 32 }}>📚</div><p>No reviews yet. Be the first!</p></div>
          : allReviews.map((r) => <ReviewCard key={r.id} review={r} onToast={setToast} />)
      )}

      {tab === 'following' && (
        myFeed.length === 0
          ? <div className="empty-state"><div style={{ fontSize: 32 }}>👥</div><p>Follow people to see their reviews here.</p></div>
          : myFeed.map((r) => <ReviewCard key={r.id} review={r} onToast={setToast} />)
      )}

      {tab === 'foryou' && (
        recs.length === 0
          ? <div className="empty-state"><div style={{ fontSize: 32 }}>✨</div><p>Follow more readers to get personalised recommendations.</p></div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
              {recs.map((b) => (
                <Link key={b.isbn} to={`/books/${b.isbn}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card" style={{ textAlign: 'center', padding: 16 }}>
                    <BookCover isbn={b.isbn} title={b.title} coverUrl={b.coverUrl} size="M" />
                    <div style={{ fontWeight: 600, marginTop: 10, fontSize: 13 }}>{b.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.author}</div>
                  </div>
                </Link>
              ))}
            </div>
          )
      )}
    </div>
  );
}
