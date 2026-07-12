import React, { useState } from 'react';
import { createReview } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function NewReviewForm({ isbn, onSubmitted }) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    await createReview({ isbn, content, rating });
    setContent('');
    setRating(0);
    setSubmitting(false);
    onSubmitted && onSubmitted();
  }

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--gold)', marginBottom: 24 }}>
      <div className="flex items-center gap-sm" style={{ marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>Write a review</span>
        <span className="badge badge-gold" style={{ marginLeft: 'auto' }}>Federated via ActivityPub</span>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-sm" style={{ marginBottom: 10 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="stars"
              style={{ fontSize: 24, cursor: 'pointer', transform: (hoverRating || rating) >= i ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.1s', opacity: (hoverRating || rating) >= i ? 1 : 0.3 }}
              onMouseEnter={() => setHoverRating(i)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(i)}
            >★</span>
          ))}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share your thoughts on this book..."
          rows={3}
          style={{ width: '100%', marginBottom: 10 }}
        />
        <button className="btn btn-primary" type="submit" disabled={submitting || !content.trim()}>
          {submitting ? 'Publishing...' : 'Publish Review'}
        </button>
      </form>
    </div>
  );
}
