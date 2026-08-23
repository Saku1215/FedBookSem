import React from 'react';

// Scope pivot (2026-08-16): annotations removed. This component is now a
// pure reader. AnnotationPanel still exists on disk if it's needed again.
export default function BookReader({ book }) {
  const paragraphs = (book.passage || '').split(/\n+/).filter(Boolean);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="reader-content">
        {paragraphs.map((para, i) => (
          <p key={i} style={{ marginBottom: 12, lineHeight: 1.8 }}>{para}</p>
        ))}
      </div>
    </div>
  );
}
