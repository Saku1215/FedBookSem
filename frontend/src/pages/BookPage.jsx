import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getBook, getBookReviews } from '../api/client';
import ReviewCard from '../components/ReviewFeed/ReviewCard';
import NewReviewForm from '../components/ReviewFeed/NewReviewForm';
import BookReader from '../components/BookReader/BookReader';
import ReadingStatusSelector from '../components/ReadingStatus/ReadingStatusSelector';
import ReceptionBadges from '../components/ReceptionBadges/ReceptionBadges';
import SimilarBooks from '../components/SimilarBooks/SimilarBooks';
import Toast from '../components/Layout/Toast';
import BookCover from '../components/BookCover';

export default function BookPage() {
  const { isbn } = useParams();
  const [book, setBook] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    getBook(isbn).then(setBook).catch(() => {});
  }, [isbn]);

  const loadReviews = useCallback(() => {
    getBookReviews(isbn).then(setReviews).catch(() => {});
  }, [isbn]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  if (!book) return <div className="container" style={{ paddingTop: 64, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}

      <div className="card flex gap-lg" style={{ marginBottom: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <BookCover isbn={isbn} title={book.title} coverUrl={book.coverUrl} size="L" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, marginBottom: 6 }}>{book.title}</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>{book.author}</p>
          <div className="flex gap-sm flex-wrap" style={{ marginBottom: 8 }}>
            {book.isbn && <span className="badge badge-indigo">ISBN {book.isbn}</span>}
            {book.year && <span className="badge">{book.year}</span>}
          </div>
          <ReadingStatusSelector isbn={isbn} onToast={setToast} />
        </div>
      </div>

      <ReceptionBadges reception={book.reception} hardcover={book.hardcover} />

      {book.passage && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, marginBottom: 16 }}>Sample Passage</h2>
          <BookReader book={book} />
        </div>
      )}

      <div>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, marginBottom: 16 }}>
          Community reviews <span style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>({reviews.length})</span>
        </h2>
        <NewReviewForm isbn={isbn} onSubmitted={loadReviews} />
        {reviews.length === 0
          ? <div className="empty-state"><div style={{ fontSize: 28 }}>✍️</div><p>No reviews yet. Write the first one!</p></div>
          : reviews.map((r) => <ReviewCard key={r.id} review={r} onToast={setToast} />)
        }
      </div>

      <SimilarBooks isbn={isbn} />
    </div>
  );
}
