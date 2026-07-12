import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { likeReview, announceReview, replyToReview, getReplies } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import FollowButton from '../Social/FollowButton';
import BookCover from '../BookCover';

function Stars({ rating }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ opacity: i <= rating ? 1 : 0.25 }}>★</span>
      ))}
    </span>
  );
}

export default function ReviewCard({ review, onToast }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [boosted, setBoosted] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [likeCount, setLikeCount] = useState(review.likeCount || 0);

  const isbn = review.book?.isbn;
  const bookTitle = review.book?.title;
  const author = review.author || {};

  async function handleLike() {
    await likeReview(review.id);
    setLiked(true);
    setLikeCount((c) => c + 1);
    onToast && onToast('Liked!');
  }

  async function handleBoost() {
    await announceReview(review.id);
    setBoosted(true);
    onToast && onToast('Boosted across the fediverse!');
  }

  async function handleShowReplies() {
    if (!showReplies) {
      const data = await getReplies(review.id);
      setReplies(data);
    }
    setShowReplies((v) => !v);
  }

  async function handleReply(e) {
    e.preventDefault();
    if (!replyText.trim()) return;
    await replyToReview(review.id, replyText);
    setReplyText('');
    const data = await getReplies(review.id);
    setReplies(data);
    setShowReplies(true);
  }

  return (
    <div className="review-card">
      <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
        <div className="avatar" style={{ width: 40, height: 40, fontSize: 16, flexShrink: 0 }}>
          {author.avatarUrl
            ? <img src={author.avatarUrl} alt={author.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            : (author.displayName?.[0] || '?').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-sm flex-wrap">
            <Link to={`/users/${author.username}`} style={{ fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
              {author.displayName}
            </Link>
            <span className="text-muted" style={{ fontSize: 12 }}>@{author.username}</span>
            <FollowButton targetId={author.id} targetUsername={author.username} onToast={onToast} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {review.published ? new Date(review.published).toLocaleDateString() : ''}
          </div>
        </div>
        {isbn && (
          <Link to={`/books/${isbn}`}>
            <BookCover isbn={isbn} title={bookTitle} coverUrl={review.book?.coverUrl} size="S" />
          </Link>
        )}
      </div>

      {review.rating > 0 && <Stars rating={review.rating} />}
      <p style={{ margin: '8px 0 12px', lineHeight: 1.6 }}>{review.content}</p>

      {bookTitle && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          on <Link to={`/books/${isbn}`} style={{ color: 'var(--gold)' }}>{bookTitle}</Link>
        </div>
      )}

      <div className="flex items-center gap-sm flex-wrap">
        <button className="btn btn-ghost btn-sm" onClick={handleLike} disabled={liked}>
          {liked ? '♥' : '♡'} {likeCount > 0 ? likeCount : ''}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleBoost} disabled={boosted}>
          {boosted ? '⇄ Boosted' : '⇄ Boost'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleShowReplies}>
          💬 {replies.length > 0 ? replies.length : ''} {showReplies ? 'Hide' : 'Replies'}
        </button>
        <span className="badge badge-gold" style={{ marginLeft: 'auto' }}>Federated</span>
      </div>

      {showReplies && (
        <div style={{ marginTop: 12, paddingLeft: 16, borderLeft: '2px solid var(--border)' }}>
          {replies.map((r) => (
            <div key={r.id} className="flex gap-sm" style={{ marginBottom: 8 }}>
              <div className="avatar" style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
                {r.author?.avatarUrl
                  ? <img src={r.author.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : (r.author?.displayName?.[0] || '?').toUpperCase()}
              </div>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{r.author?.displayName}</span>
                <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>@{r.author?.username}</span>
                <p style={{ margin: '2px 0', fontSize: 13 }}>{r.content}</p>
              </div>
            </div>
          ))}
          {user && (
            <form onSubmit={handleReply} className="flex gap-sm" style={{ marginTop: 8 }}>
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary btn-sm" type="submit">Reply</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
