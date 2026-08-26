import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { setReadingStatus, clearReadingStatus, getMyReadingStatus } from '../../api/client';

const OPTIONS = [
  { value: 'want-to-read', label: 'Want to read' },
  { value: 'reading',      label: 'Reading' },
  { value: 'finished',     label: 'Finished' },
];

export default function ReadingStatusSelector({ isbn, onToast }) {
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const loggedIn = Boolean(localStorage.getItem('fedbooksem_token'));

  useEffect(() => {
    if (!loggedIn || !isbn) return;
    getMyReadingStatus(isbn)
      .then((r) => setStatus(r.status || null))
      .catch(() => {});
  }, [isbn, loggedIn]);

  if (!loggedIn) {
    return (
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        <Link to="/login" style={{ color: 'var(--gold)' }}>Sign in</Link> to add to your reading list.
      </div>
    );
  }

  async function pick(next) {
    if (saving) return;
    setSaving(true);
    try {
      if (next === status) {
        await clearReadingStatus(isbn);
        setStatus(null);
        onToast && onToast('Removed from reading list');
      } else {
        await setReadingStatus(isbn, next);
        setStatus(next);
        onToast && onToast(`Marked as "${OPTIONS.find((o) => o.value === next)?.label}"`);
      }
    } catch (err) {
      onToast && onToast('Could not update reading list');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
        Reading list
      </div>
      <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
        {OPTIONS.map((o) => {
          const active = status === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={saving}
              onClick={() => pick(o.value)}
              className={active ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              style={{ cursor: saving ? 'progress' : 'pointer' }}
              title={active ? 'Click to remove' : `Mark as "${o.label}"`}
            >
              {active ? '✓ ' : ''}{o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
