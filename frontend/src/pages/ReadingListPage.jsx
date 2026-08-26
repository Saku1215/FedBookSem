import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getReadingList } from '../api/client';
import BookCover from '../components/BookCover';

const STATUS_LABEL = {
  'want-to-read': 'Want to read',
  reading: 'Reading',
  finished: 'Finished',
};

const STATUS_ORDER = ['reading', 'want-to-read', 'finished'];

export default function ReadingListPage() {
  const { username } = useParams();
  const currentUsername = username || readCurrentUsername();
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!currentUsername) return;
    getReadingList(currentUsername).then(setItems).catch(() => setItems([]));
  }, [currentUsername]);

  const grouped = useMemo(() => {
    if (!items) return {};
    const g = { reading: [], 'want-to-read': [], finished: [] };
    for (const it of items) {
      if (g[it.status]) g[it.status].push(it);
    }
    return g;
  }, [items]);

  if (!currentUsername) {
    return (
      <div className="container" style={{ paddingTop: 64, textAlign: 'center' }}>
        <p>Sign in to view your reading list.</p>
      </div>
    );
  }
  if (items === null) {
    return <div className="container" style={{ paddingTop: 64, textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, marginBottom: 24 }}>
        {username ? `${username}'s reading list` : 'My reading list'}
      </h1>

      {items.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 28 }}>📚</div>
          <p>No books on the list yet. Open any book and mark it as Want to read.</p>
        </div>
      )}

      {STATUS_ORDER.map((status) => (
        grouped[status]?.length > 0 && (
          <section key={status} style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, marginBottom: 16 }}>
              {STATUS_LABEL[status]} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>({grouped[status].length})</span>
            </h2>
            <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {grouped[status].map((b) => (
                <Link key={b.isbn} to={`/books/${b.isbn}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <BookCover isbn={b.isbn} title={b.title} coverUrl={b.coverUrl} size="M" />
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 16 }}>{b.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{b.author}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )
      ))}
    </div>
  );
}

function readCurrentUsername() {
  try {
    const token = localStorage.getItem('fedbooksem_token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.username || null;
  } catch { return null; }
}
