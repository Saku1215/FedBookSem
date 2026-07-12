import React, { useState, useEffect, useCallback } from 'react';
import { createAnnotation, getAnnotations, getAnnotationThread, deleteAnnotation } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const MOTIVATIONS = ['commenting', 'highlighting', 'tagging', 'questioning', 'describing'];

export default function AnnotationPanel({ bookSource, selection, onClose }) {
  const { user } = useAuth();
  const [annotations, setAnnotations] = useState([]);
  const [motivation, setMotivation] = useState('commenting');
  const [bodyValue, setBodyValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [thread, setThread] = useState([]);
  const [threadReply, setThreadReply] = useState('');

  const load = useCallback(async () => {
    const data = await getAnnotations(bookSource);
    setAnnotations(data);
  }, [bookSource]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user || !selection) return;
    setSubmitting(true);
    await createAnnotation({
      bookSource,
      exactText: selection.exact,
      prefix: selection.prefix,
      suffix: selection.suffix,
      startOffset: selection.start,
      endOffset: selection.end,
      motivation,
      bodyValue,
    });
    setBodyValue('');
    setSubmitting(false);
    await load();
  }

  async function handleThread(id) {
    if (threadId === id) { setThreadId(null); setThread([]); return; }
    const data = await getAnnotationThread(id);
    setThread(data);
    setThreadId(id);
  }

  async function handleDelete(id) {
    await deleteAnnotation(id);
    await load();
  }

  return (
    <div className="annotation-panel">
      <div className="flex items-center gap-sm" style={{ marginBottom: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Annotations</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
      </div>

      {selection && user && (
        <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <div style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid var(--gold)', borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 13, fontStyle: 'italic', color: 'var(--gold)' }}>
            "{selection.exact}"
          </div>
          <select value={motivation} onChange={(e) => setMotivation(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
            {MOTIVATIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <textarea
            value={bodyValue}
            onChange={(e) => setBodyValue(e.target.value)}
            placeholder="Add your annotation..."
            rows={3}
            style={{ width: '100%', marginBottom: 8 }}
          />
          <button className="btn btn-primary btn-sm" type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Annotation'}
          </button>
        </form>
      )}

      {annotations.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 28 }}>📝</div>
          <p>No annotations yet. Select text to annotate.</p>
        </div>
      )}

      {annotations.map((an) => (
        <div key={an.id} className="card" style={{ marginBottom: 10, padding: '10px 12px' }}>
          <div className="flex items-center gap-sm" style={{ marginBottom: 6 }}>
            <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
              {an.author?.displayName?.[0]?.toUpperCase() || '?'}
            </div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{an.author?.displayName}</span>
            <span className="badge badge-indigo btn-sm">{an.motivation}</span>
            {user && user.username === an.author?.username && (
              <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto', padding: '2px 8px' }} onClick={() => handleDelete(an.id)}>✕</button>
            )}
          </div>
          {an.exactText && (
            <div style={{ fontSize: 12, color: 'var(--gold)', fontStyle: 'italic', marginBottom: 4 }}>
              "{an.exactText.slice(0, 60)}{an.exactText.length > 60 ? '...' : ''}"
            </div>
          )}
          <p style={{ fontSize: 13, margin: '4px 0' }}>{an.bodyValue}</p>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, marginTop: 4 }} onClick={() => handleThread(an.id)}>
            💬 Thread {threadId === an.id ? '▲' : '▼'}
          </button>

          {threadId === an.id && (
            <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
              {thread.map((t) => (
                <div key={t.id} style={{ marginBottom: 6, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{t.author?.displayName}:</span> {t.content}
                </div>
              ))}
              {user && (
                <div className="flex gap-sm" style={{ marginTop: 6 }}>
                  <input
                    value={threadReply}
                    onChange={(e) => setThreadReply(e.target.value)}
                    placeholder="Reply to thread..."
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={async () => {
                    if (!threadReply.trim()) return;
                    await createAnnotation({ bookSource, exactText: an.exactText || '', motivation: 'replying', bodyValue: threadReply });
                    setThreadReply('');
                    const data = await getAnnotationThread(an.id);
                    setThread(data);
                  }}>Reply</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
