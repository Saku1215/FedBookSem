import React, { useState } from 'react';
import AnnotationPanel from '../Annotations/AnnotationPanel';

export default function BookReader({ book }) {
  const [selection, setSelection] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const bookSource = `${window.location.origin.replace('3000', '3001')}/books/${book.isbn}`;

  const paragraphs = (book.passage || '').split(/\n+/).filter(Boolean);

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().length < 3) return;
    const exact = sel.toString();
    const passage = book.passage || '';
    const idx = passage.indexOf(exact);
    setSelection({
      exact,
      prefix: idx > 10 ? passage.slice(idx - 10, idx) : passage.slice(0, idx),
      suffix: passage.slice(idx + exact.length, idx + exact.length + 10),
      start: idx,
      end: idx + exact.length,
    });
    setPanelOpen(true);
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--gold)' }}>
          Select any text below to create an annotation
        </div>
        <div className="reader-content" onMouseUp={handleMouseUp} style={{ cursor: 'text' }}>
          {paragraphs.map((para, i) => (
            <p key={i} style={{ marginBottom: 12, lineHeight: 1.8 }}>{para}</p>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setPanelOpen(true)}>
          📝 View Annotations
        </button>
      </div>

      {panelOpen && (
        <AnnotationPanel
          bookSource={bookSource}
          selection={selection}
          onClose={() => { setPanelOpen(false); setSelection(null); }}
        />
      )}
    </div>
  );
}
