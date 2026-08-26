import React, { useState, useEffect } from 'react';

const PALETTE = ['#2d1f4e', '#1a3a2e', '#3a1a1a', '#1a2a3a', '#2e2a1a', '#1e3020'];

// size: 'S' (32×48) | 'M' (80×120) | 'L' (120×180) | 'full' (responsive grid card)
export default function BookCover({ isbn, title, coverUrl, size = 'M', idx = 0, style = {} }) {
  const svgSrc = isbn ? `/api/covers/${isbn}` : null;
  const [src, setSrc] = useState(() => coverUrl || svgSrc);
  const [err, setErr] = useState(false);

  // BookPage stays mounted across route changes (same /books/:isbn pattern),
  // so reset state whenever the caller hands us a different book.
  useEffect(() => {
    setSrc(coverUrl || svgSrc);
    setErr(false);
  }, [coverUrl, svgSrc]);

  const dims = { S: [32, 48], M: [80, 120], L: [120, 180] };

  if (!isbn) return null;

  function handleError() {
    if (src !== svgSrc) {
      setSrc(svgSrc);
    } else {
      setErr(true);
    }
  }

  const borderRadius = size === 'L' ? 8 : size === 'S' ? 3 : 6;

  if (err) {
    if (size === 'full') {
      return (
        <div style={{ width: '100%', paddingBottom: '140%', position: 'relative', borderRadius: '6px 6px 0 0', overflow: 'hidden', ...style }}>
          <div style={{ position: 'absolute', inset: 0, background: PALETTE[idx % PALETTE.length], display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center' }}>
            <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 13, color: 'var(--gold)', lineHeight: 1.4 }}>{title}</span>
          </div>
        </div>
      );
    }
    const [w, h] = dims[size] || dims.M;
    return (
      <div style={{ width: w, height: h, background: PALETTE[idx % PALETTE.length], borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, textAlign: 'center', ...style }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 10, color: 'var(--gold)', lineHeight: 1.3 }}>{title}</span>
      </div>
    );
  }

  if (size === 'full') {
    return (
      <div style={{ width: '100%', paddingBottom: '140%', position: 'relative', borderRadius: '6px 6px 0 0', overflow: 'hidden', ...style }}>
        <img
          src={src}
          alt={title}
          onError={handleError}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  const [w, h] = dims[size] || dims.M;
  return (
    <img
      src={src}
      alt={title}
      onError={handleError}
      style={{ width: w, height: h, objectFit: 'cover', borderRadius, flexShrink: 0, boxShadow: size === 'L' ? '0 8px 24px rgba(0,0,0,0.4)' : 'none', ...style }}
    />
  );
}
