import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSimilarBooks } from '../../api/client';
import BookCover from '../BookCover';

// Similar-books panel — semantic recommendations from the ML service.
// Hides itself silently if the service degrades or returns nothing so a
// book without embeddings doesn't leave a dangling empty section.

export default function SimilarBooks({ isbn }) {
  const [state, setState] = useState({ loading: true, items: [], degraded: false });

  useEffect(() => {
    if (!isbn) return;
    let cancelled = false;
    setState({ loading: true, items: [], degraded: false });
    getSimilarBooks(isbn, 8)
      .then((data) => { if (!cancelled) setState({ loading: false, items: data.items || [], degraded: !!data.degraded }); })
      .catch(() => { if (!cancelled) setState({ loading: false, items: [], degraded: true }); });
    return () => { cancelled = true; };
  }, [isbn]);

  if (state.loading) {
    return (
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, marginBottom: 16 }}>Similar books</h2>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Finding similar books…</div>
      </div>
    );
  }
  if (state.degraded || state.items.length === 0) return null;

  return (
    <div style={{ marginTop: 32, marginBottom: 32 }}>
      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, marginBottom: 4 }}>
        Similar books
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Semantically close reads — ranked by MiniLM embedding similarity.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16 }}>
        {state.items.map((b, idx) => (
          <Link key={b.isbn} to={`/books/${b.isbn}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden', transition: 'transform 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <BookCover isbn={b.isbn} title={b.title} coverUrl={b.coverUrl} size="full" idx={idx} />
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2, lineHeight: 1.3 }}>{b.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.author}</div>
                {b.simScore != null && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}
                    title={`Cosine similarity to this book: ${b.simScore.toFixed(3)}`}
                  >
                    match {Math.round(b.simScore * 100)}%
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
