import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBooks } from '../api/client';
import BookCover from '../components/BookCover';

const PAGE = 60;

// Same palette as ReceptionBadges — kept local to avoid coupling the two files.
const PLATFORM_DOTS = {
  youtube:  '#ff0000',
  bluesky:  '#0085ff',
  mastodon: '#6364ff',
};

export default function BooksPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [books, setBooks] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const reqSeq = useRef(0);

  // Debounce the search input by 250ms so we don't hammer /api/books on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadFirstPage = useCallback(async (q) => {
    const mySeq = ++reqSeq.current;
    setLoading(true);
    try {
      const data = await getBooks({ q, limit: PAGE, offset: 0 });
      if (mySeq !== reqSeq.current) return; // stale response
      setBooks(data.books);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { loadFirstPage(debounced); }, [debounced, loadFirstPage]);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const data = await getBooks({ q: debounced, limit: PAGE, offset: books.length });
      setBooks((prev) => [...prev, ...data.books]);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, marginBottom: 4 }}>Library</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
          Browse {total.toLocaleString()} books
          {debounced && <> matching “{debounced}”</>}
        </p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or author..."
          style={{ maxWidth: 360, width: '100%' }}
        />
      </div>

      {books.length === 0 && !loading ? (
        <div className="empty-state">
          <div style={{ fontSize: 32 }}>🔍</div>
          <p>No books match your search.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 20 }}>
            {books.map((book, idx) => (
              <Link key={book.isbn} to={`/books/${book.isbn}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{ padding: 0, overflow: 'hidden', transition: 'transform 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <BookCover isbn={book.isbn} title={book.title} coverUrl={book.coverUrl} size="full" idx={idx} />
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, lineHeight: 1.3 }}>{book.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{book.author}</div>
                    <div className="flex gap-sm">
                      {book.year && <span className="badge">{book.year}</span>}
                      {book.source === 'kaggle-7k' && <span className="badge badge-indigo">Kaggle</span>}
                    </div>
                    {book.reception?.platforms?.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}
                        title={`Reviews on ${book.reception.platforms.join(', ')}`}
                      >
                        {book.reception.platforms.map((p) => (
                          <span key={p} style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: PLATFORM_DOTS[p] || '#888',
                            display: 'inline-block',
                          }} />
                        ))}
                        {book.reception.overallPositivePct != null && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                            {Math.round(book.reception.overallPositivePct * 100)}% pos
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 32, marginBottom: 32 }}>
            {hasMore ? (
              <button className="btn btn-ghost" disabled={loading} onClick={loadMore}>
                {loading ? 'Loading…' : `Load more (${(total - books.length).toLocaleString()} remaining)`}
              </button>
            ) : (
              books.length > PAGE && (
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  End of results — {books.length.toLocaleString()} shown
                </span>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
