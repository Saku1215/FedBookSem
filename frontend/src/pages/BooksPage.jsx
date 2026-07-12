import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getBooks } from '../api/client';
import BookCover from '../components/BookCover';

export default function BooksPage() {
  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => { getBooks().then(setBooks).catch(() => {}); }, []);

  const filtered = books.filter((b) =>
    b.title?.toLowerCase().includes(search.toLowerCase()) ||
    b.author?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, marginBottom: 4 }}>Library</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Browse the federated book collection</p>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or author..." style={{ maxWidth: 360 }} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div style={{ fontSize: 32 }}>🔍</div><p>No books match your search.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 20 }}>
          {filtered.map((book, idx) => (
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
                    <span className="badge badge-indigo">AP</span>
                    {book.year && <span className="badge">{book.year}</span>}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
