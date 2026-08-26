import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getBooks } from '../api/client';
import { useAuth } from '../context/AuthContext';
import BookCover from '../components/BookCover';

// Front-door landing page: hero + search + featured grid + three
// value-prop tiles. Public — no auth required to browse.

const FEATURED_COUNT = 12;

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    getBooks({ limit: FEATURED_COUNT }).then((d) => setFeatured(d.books || [])).catch(() => {});
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/books?q=${encodeURIComponent(q)}` : '/books');
  }

  return (
    <div>
      {/* Hero */}
      <section style={{
        padding: '72px 24px 56px',
        background: 'linear-gradient(180deg, var(--surface) 0%, transparent 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 640, height: 640, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(15,118,110,0.08) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div className="container" style={{ position: 'relative', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 56, marginBottom: 12, letterSpacing: '-0.02em' }}>
            Fed<span style={{ color: 'var(--gold)' }}>Book</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 18, marginBottom: 36, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
            Search a catalogue of 6,500+ books. Track what you're reading. See how each title is received on YouTube, Bluesky and Mastodon.
          </p>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, maxWidth: 560, margin: '0 auto', flexWrap: 'wrap' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search books by title or author…"
              autoFocus
              style={{ flex: 1, minWidth: 220, height: 48, fontSize: 15, padding: '0 16px' }}
            />
            <button type="submit" className="btn btn-primary" style={{ height: 48, padding: '0 24px' }}>
              Search
            </button>
          </form>
          {!user && (
            <p style={{ marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
              Browsing as a guest.{' '}
              <Link to="/login" style={{ color: 'var(--gold)' }}>Sign in</Link>
              {' '}to write reviews and build a reading list.
            </p>
          )}
        </div>
      </section>

      {/* Featured */}
      <section className="container" style={{ paddingBottom: 48 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 20, gap: 12 }}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, margin: 0 }}>
            From the catalogue
          </h2>
          <Link to="/books" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--gold)' }}>
            Browse all →
          </Link>
        </div>

        {featured.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading catalogue…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 20 }}>
            {featured.map((book, idx) => (
              <Link key={book.isbn} to={`/books/${book.isbn}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{ padding: 0, overflow: 'hidden', transition: 'transform 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <BookCover isbn={book.isbn} title={book.title} coverUrl={book.coverUrl} size="full" idx={idx} />
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, lineHeight: 1.3 }}>{book.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{book.author}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Value-prop tiles */}
      <section className="container" style={{ paddingBottom: 72 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          <TileCard
            title="Browse the catalogue"
            body="Search 6,500+ real books by title or author. Every card links to a detail page with cover, reviews and reception data."
            to="/books"
            cta="Open Library"
          />
          <TileCard
            title="Track your reading"
            body={user
              ? "Mark books as Want to read, Reading, or Finished — your list appears under Reading in the nav."
              : "Sign in to mark books as Want to read, Reading, or Finished — your list appears under Reading in the nav."}
            to={user ? '/reading' : '/login'}
            cta={user ? 'Open your list' : 'Sign in'}
          />
          <TileCard
            title="Discover through similar reads"
            body="Every book page has semantic recommendations based on sentence-embedding similarity across the whole catalogue."
            to="/books"
            cta="Try it"
          />
        </div>
      </section>
    </div>
  );
}

function TileCard({ title, body, to, cta }) {
  return (
    <Link to={to} className="card" style={{
      textDecoration: 'none', color: 'inherit', display: 'block',
      transition: 'transform 0.2s, border-color 0.2s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, marginBottom: 8 }}>{title}</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>{body}</p>
      <div style={{ color: 'var(--gold)', fontSize: 13 }}>{cta} →</div>
    </Link>
  );
}
