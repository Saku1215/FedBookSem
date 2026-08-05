import React from 'react';

// Compact reception summary — per-platform positive % + Hardcover star chip.
// Renders nothing when there's no reception AND no Hardcover rating so a
// bare book detail page stays clean.

// Reddit removed (2026-08-16). Only these three platforms are surfaced.
const PLATFORMS = {
  youtube:  { label: 'YouTube',  color: '#ff0000',
    tip: 'Public top-level comments on YouTube review videos matching this book title and author. Fetched via the YouTube Data API v3.' },
  bluesky:  { label: 'Bluesky',  color: '#0085ff',
    tip: 'Public posts on Bluesky matching this book title and author. Fetched via Bluesky\'s searchPosts API (AT Protocol).' },
  mastodon: { label: 'Mastodon', color: '#6364ff',
    tip: 'Public posts on Mastodon tagged with #bookstodon, #booksky, #booktok or #bookreview across federated instances (mastodon.social, ohai.social).' },
};

const TIP = {
  header: 'Aggregate reception signal for this book. Each platform is scraped periodically, mentions are sentiment-scored, and only aggregate counts are stored — raw text is never persisted.',
  overall: 'Weighted mean of each platform\'s positive %. Weights: YouTube 40%, Bluesky 30%, Mastodon 30%. Higher weight for YouTube because video reviews are longer-form and higher-signal than short microblog posts. Platforms with no mentions for this book are skipped.',
  overallStars: 'Star rating derived from the sentiment counts across all platforms. Formula per platform: ★ = ((positive + 0.5 × neutral) / total) × 5, then weighted-averaged across platforms (YouTube 40%, Bluesky 30%, Mastodon 30%). This gives a Web-derived star metric you can compare to the Hardcover ★.',
  mentions: 'Total number of public posts / comments scored across all platforms, summed. Each mention is one scraped post or comment.',
  hardcover: 'Live star rating from Hardcover.app — an alternative to Goodreads. Fetched fresh from their GraphQL API every time this page loads (not stored locally). Rating is Hardcover\'s aggregate of every star rating their users have given this ISBN.',
  bar: 'Green = positive, grey = neutral, red = negative. Sentiment is labelled per-mention by a language model (CardiffNLP twitter-roberta), then aggregated into these counts.',
  platformStars: 'Per-platform star rating: ★ = ((positive + 0.5 × neutral) / total) × 5. A 100%-positive platform gives 5 stars, 100%-neutral gives 2.5, 100%-negative gives 0.',
};

function pct(v) {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

// Small hover-hint marker: subtle ⓘ that reveals the browser tooltip on hover.
function InfoDot({ tip, style = {} }) {
  return (
    <span
      title={tip}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%',
        border: '1px solid var(--text-muted)', color: 'var(--text-muted)',
        fontSize: 9, fontWeight: 700, lineHeight: 1, marginLeft: 6,
        cursor: 'help', opacity: 0.7,
        ...style,
      }}
      aria-label="Info"
      role="img"
    >
      i
    </span>
  );
}

export default function ReceptionBadges({ reception, hardcover, platform }) {
  const hasReception = reception && reception.platforms && reception.platforms.length > 0;
  const hasHardcover = hardcover && hardcover.rating != null;
  const hasPlatform = platform && platform.rating != null && platform.count > 0;
  if (!hasReception && !hasHardcover && !hasPlatform) return null;

  return (
    <div className="card" style={{ marginBottom: 32, padding: 20 }}>
      <div style={{
        display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: hasReception ? 16 : 0,
      }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, display: 'inline-flex', alignItems: 'center' }}>
          Reviews from around the web
          <InfoDot tip={TIP.header} />
        </div>

        {hasPlatform && (
          <span title={`Average of ${platform.count.toLocaleString()} FedBook reader rating${platform.count === 1 ? '' : 's'} on this book.`} style={{
            cursor: 'help',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(15,118,110,0.08)',
            border: '1px solid rgba(15,118,110,0.25)',
            color: 'var(--text)', fontSize: 13,
          }}>
            <span style={{ color: 'var(--gold)' }}>★</span>
            <b>{platform.rating.toFixed(1)}</b>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
              /5 FedBook ({platform.count.toLocaleString()})
            </span>
          </span>
        )}

        {hasReception && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <span title={TIP.overall} style={{ cursor: 'help', borderBottom: '1px dotted var(--text-muted)' }}>
              <b style={{ color: 'var(--text)' }}>{pct(reception.overallPositivePct)}</b> positive
            </span>
            <span>·</span>
            <span title={TIP.mentions} style={{ cursor: 'help', borderBottom: '1px dotted var(--text-muted)' }}>
              {reception.totalMentions.toLocaleString()} mentions across YouTube, Bluesky &amp; Mastodon
            </span>
          </div>
        )}

        {hasHardcover && (
          <div style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(245,166,35,0.08)',
            border: '1px solid rgba(245,166,35,0.25)',
            fontSize: 13, cursor: 'help',
          }}
          title={`${TIP.hardcover} — ${hardcover.ratingsCount?.toLocaleString() ?? 0} ratings, ${hardcover.reviewsCount?.toLocaleString() ?? 0} written reviews.`}
          >
            <span style={{ color: '#f5a623' }}>★</span>
            <b>{hardcover.rating.toFixed(1)}</b>
            <span style={{ color: 'var(--text-muted)' }}>
              /5{hardcover.ratingsCount ? ` (${hardcover.ratingsCount.toLocaleString()})` : ''}
            </span>
            <InfoDot tip={TIP.hardcover} style={{ marginLeft: 2 }} />
          </div>
        )}
      </div>

      {hasReception && (
        <div style={{ display: 'grid', gap: 10 }}>
          {reception.platforms.map((p) => {
            const meta = PLATFORMS[p.platform] || { label: p.platform, color: '#888', tip: '' };
            const total = p.positive + p.neutral + p.negative;
            const pos = total ? (p.positive / total) * 100 : 0;
            const neu = total ? (p.neutral  / total) * 100 : 0;
            const neg = total ? (p.negative / total) * 100 : 0;
            const barTip = `${TIP.bar}\n\npositive: ${p.positive}\nneutral: ${p.neutral}\nnegative: ${p.negative}`;
            const rightTip = `${p.positive} positive out of ${total} total mentions (positive + neutral + negative).`;
            return (
              <div key={p.platform} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 12, alignItems: 'center' }}>
                <span
                  title={meta.tip}
                  style={{ color: meta.color, fontWeight: 600, fontSize: 13, cursor: 'help', borderBottom: '1px dotted currentColor' }}
                >
                  {meta.label}
                </span>
                <div title={barTip}
                  style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', cursor: 'help' }}>
                  <div style={{ width: `${pos}%`, background: '#4caf50' }} />
                  <div style={{ width: `${neu}%`, background: '#7d7d7d' }} />
                  <div style={{ width: `${neg}%`, background: '#e64a4a' }} />
                </div>
                <span title={rightTip} style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 160, textAlign: 'right', cursor: 'help', whiteSpace: 'nowrap' }}>
                  {pct(p.positivePct)} · {p.mentions}
                  {p.starRating != null && (
                    <span title={TIP.platformStars} style={{ marginLeft: 8, color: '#4b9dff' }}>
                      ★ <b style={{ color: 'var(--text)' }}>{p.starRating.toFixed(1)}</b>
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
