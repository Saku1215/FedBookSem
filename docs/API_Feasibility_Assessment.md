# Cross-Platform Book Sentiment Aggregation — API Feasibility Assessment

> **Timeframe:** Mid-2026
> **Purpose:** Ground the Phase 4 ingestion design in a current, verified
> picture of the free-tier options for reader-reception data across
> social platforms — and record the compliance obligations each imposes.
>
> **Status of the code in this project (2026-07-18):** The Phase 4
> ingestion scaffolding in `ml-service/src/fedbook_ml/ingest/` and the
> `scripts/purge_expired_receptions.py` / `scripts/reddit_deletion_sweep.py`
> crons were built to satisfy the retention and deletion rules called out
> below. The `:PlatformReception` graph model stores per-platform
> aggregates only, never raw post text — matching this assessment's core
> compliance recommendation.

---

## TL;DR

The project is achievable entirely on free tiers, but NOT with the most
obvious platform combination. The strongest free-tier stack is
**YouTube Data API v3 + Bluesky (AT Protocol) + Mastodon**, with
**Reddit** as a high-value fourth platform contingent on getting manual
approval under its new November 2025 Responsible Builder Policy. For
Goodreads-style ground truth, use the UCSD Book Graph / goodbooks-10k
public datasets plus the free Hardcover GraphQL API — the official
Goodreads API is permanently closed.

The two biggest risks are Reddit (self-service API registration closed
in November 2025; new access requires manual approval) and any
dependency on scraping (which violates Goodreads/StoryGraph ToS).
Bluesky and Mastodon are genuinely free and open with no approval gate;
YouTube is free but quota-limited (10,000 units/day, and search costs
100 units/call).

Collect data early and cache only derived aggregates. YouTube's ToS
forbids storing most raw public data beyond 30 days, and Reddit/GDPR
concerns favor storing anonymized sentiment scores rather than raw text.
Build the pipeline by September 2026 to leave buffer before the
December deadline.

---

## 1. Reddit Data API — free tier survives, but the door no longer opens by itself

- The free tier is **100 queries per minute (QPM) per OAuth client,
  10 QPM unauthenticated**, averaged over a 10-minute window. Unchanged
  and confirmed on Reddit's own documentation.
- **Critical 2025 change:** In November 2025 Reddit published the
  Responsible Builder Policy, which closed self-service OAuth app
  registration. Admin u/redtaboo announced: *"Starting today,
  self-service access to Reddit's public data API will be closed.
  Anyone looking to build with Reddit data, whether you're a developer,
  researcher, or moderator, will need to request approval before
  gaining access."* New tokens require manual approval via Reddit's
  developer support form; Reddit's stated target is a seven-day
  response. If you hold OAuth credentials created before the November
  2025 cutoff, they still work — guard them, as they are now hard to
  obtain. *(Source: Molehill)*
- **Pricing (commercial only):** ~$0.24 per 1,000 API calls (a rate
  dating to Reddit's June 1, 2023 pricing announcement). The commercial
  tier reportedly requires a minimum spend of around $12,000 per month,
  which includes an allocation of roughly 50 million API calls (per
  citybiz's 2026 pricing analysis) — not per year, as some sources
  loosely state. Either way, non-commercial academic use stays on the
  free tier and pays nothing.
- **Reddit for Researchers (RFR):** A dedicated, privacy-first academic
  program. It provides historical datasets over a 5-year period with a
  six-month delay, updated monthly, with hashed user IDs. Requires an
  accredited-university affiliation, an institutional email, a detailed
  proposal, and proof of ethics review (IRB or equivalent). Access is
  granted for up to 1 year. Reddit's help docs state RFR is *"the only
  official and authorized avenue for performing research using Reddit
  data,"* implying that using the ordinary Data API for research is
  discouraged. Participants are expected to be familiar with SQL and
  Google Suite (the datasets are delivered via BigQuery).
- **PRAW (Python Reddit API Wrapper)** remains the standard client and
  still works with valid OAuth credentials.
- **Data retention / deleted content:** Reddit's policy prohibits
  re-identifying users and requires respecting deletions; the RFR
  dataset itself excludes content deleted within a revolving six-month
  window.
- **Sufficiency for book subreddits:** 100 QPM is more than enough to
  collect comments from r/books, r/suggestmeabook, r/Fantasy and
  similar subreddits. The binding constraints are the 1,000-item
  listing cap, the lack of comment/date-range search, and the approval
  gate — not the rate limit.

---

## 2. YouTube Data API v3 — free, generous quota model, but "search" is expensive

- **Free quota:** Per Google's official Quota Calculator (last updated
  2026-06-24): *"Projects that enable the YouTube Data API have a
  default quota allocation of 100 search.list calls, 100 videos.insert
  calls, and 10,000 units per day combined for all other endpoints."*
  Quota resets at midnight Pacific Time and is per Google Cloud project.
  This is confirmed current as of mid-2026. *(Source: Google)*
- **Operation costs:** `search.list` = 100 units; `videos.list` = 1 unit;
  `commentThreads.list` = 1 unit; `comments.list` = 1 unit. Each
  additional page of results incurs the same cost again. *(Source:
  Google)*
- **Realistic BookTube comment collection:** Because reading comment
  threads costs only 1 unit per page (~100 comments/page), you can pull
  on the order of tens of thousands of comments per day within quota,
  as long as you minimize `search.list` calls (cache video IDs rather
  than re-searching). Per SocialCrawl's 2026 analysis, *"A pipeline
  that runs 10 searches, fetches metadata for the results, then pulls
  comment threads consumes roughly 1,700 units per cycle — leaving room
  for about five or six cycles before the wall hits."*
- **December 2025 change:** Google reduced `videos.insert` (upload) cost
  from ~1,600 to ~100 units. This does not affect data collection but
  signals Google is actively revising quotas. A June 1, 2026 change
  moved `search.list` into its own quota bucket (granular quotas).
- **30-day retention rule:** Under YouTube's Developer Policies,
  non-authorized public data (comments, view counts, statistics) must
  be deleted or refreshed within 30 calendar days: *"API Clients may
  temporarily store limited amounts of Non-Authorized Data...but not
  longer than 30 calendar days...the API Client must either delete or
  refresh the stored data."* This is a **hard compliance requirement**
   — you cannot warehouse raw YouTube comments for the length of the
  dissertation; you must re-fetch or store only permitted derived
  aggregates. *(Source: Google)*

  > **Compliance note for this project:** `scripts/purge_expired_receptions.py`
  > sets `expires_at = ingested + 30 days` on every YouTube-sourced
  > `:PlatformReception` node and nightly deletes anything past its
  > expiry. This is already wired.

- **Quota extensions:** Available only via the Audit and Quota Extension
  Form; there is no self-service purchase, and data-harvesting /
  scraping use cases are frequently rejected.
- **YouTube Researcher Program:** Provides scaled Data API quota for
  academics. Eligibility: *"a student, research-focused staff, or
  faculty member affiliated with an accredited, higher-education
  institution that can grant degrees,"* with intent to publish.
  Availability is country-restricted, and **Sri Lanka is NOT on the
  current eligible-country list** (which includes India, Malaysia,
  Singapore, the UK, US and ~60 others). The default 10,000-unit quota
  is available worldwide, but the enhanced Researcher Program quota is
  not available to a Sri Lanka-based student. Plan around the default
  10,000 units.

---

## 3. Bluesky (AT Protocol) — the best free option

- **Fully free and open, no approval gate, no paid tier.** You create an
  account and call the AT Protocol API. There is no developer portal to
  apply to.
- **Rate limits:** Per-account limit of 5,000 points/hour and 35,000
  points/day (creation actions cost points; reads generally do not),
  plus HTTP limits of ~3,000 requests per 5 minutes per IP. The public
  AppView endpoints (`api.bsky.app`, `public.api.bsky.app`) are
  documented as having *"generous rate-limits"* for reads; the cached
  `public.api.bsky.app` endpoint is recommended for unauthenticated
  public-web use.
- **Search:** `app.bsky.feed.searchPosts` supports keyword and hashtag
  search, plus filters (`from:`, `since:`, `until:`). Good for finding
  #BookSky posts about specific titles.
- **Streaming:** The firehose (`com.atproto.sync.subscribeRepos`) and
  the simpler **Jetstream** (lightweight JSON over WebSocket, with
  Bluesky-hosted public instances) let you stream all posts in real
  time and filter by collection type. Jetstream is ideal for a student
   — it can live-tail all posts for as little as ~850 MB/day, requires
  no authentication, and is now an officially maintained Bluesky
  service with four public instances.
- **User base 2026:** Bluesky's official registered-user count reached
  40.2 million (October 2025), and Bluesky's own transparency reporting
  put it at ~41.4 million by the end of December 2025; third-party
  estimates place MAU at 12-15 million and DAU at ~4 million
  (Skyscraper, January 2026). There is an active #BookSky community.
- **ToS / monetization:** No announced plans to restrict or monetize
  API access. OAuth is now the recommended auth path for new projects
  (App Passwords still work for personal scripts on accounts you own).

---

## 4. Mastodon — free and open, but fragmented and search-limited

- **Free, open, per-instance.** Default rate limit 300 requests per 5
  minutes per user account and per IP, plus a per-IP limit of 7,500
  requests per 5 minutes. Limits are set per instance and can vary or
  be raised by instance admins.
- **Full-text search is heavily limited by design:** Mastodon search
  only covers (a) hashtags and (b) the full text of posts whose authors
  have opted in (a per-user privacy setting added in v4.2.0 that only
  applies to posts written *after* opt-in), and only on instances that
  run Elasticsearch. Full-text search via the API requires
  authentication and is unavailable to unauthenticated users. In
  practice, **hashtag timelines are your reliable collection
  mechanism** (e.g., `#bookstodon`, `#BookMastodon`). *(Source: Simon
  Willison / Mastodon)*
- **Multiple instances:** You must query each instance's API separately
  (e.g., mastodon.social plus book-focused instances). Hashtag-timeline
  and trends endpoints exist per instance.
- **Book communities:** `#bookstodon` is the dominant book hashtag
  across the fediverse; mastodon.social hosts significant book
  activity.
- **Client:** `Mastodon.py` is the standard Python library, with
  built-in rate-limit handling (`wait`/`pace`/`throw` modes). Running
  unauthenticated gives you the full per-IP allowance for public
  endpoints.

---

## 5. Lemmy — free and open, but probably too small to include

- **Free public REST API** (`/api/v3/`), no login required for public
  reads, supporting posts, comments, votes (upvotes/downvotes),
  communities, and full-text search across federated instances.
- **Activity level:** Per Wikipedia (citing the-federation.info and
  fedidb.com), Lemmy had *"455 instances with approximately 48,600
  monthly active users as of 22 December 2025...the largest instances
  being lemmy.world and lemmy.ml, reporting about 14,144 and 1,982
  monthly active users, respectively."* Book-specific communities
  exist but are small.
- **Verdict:** Worth including only as a supplementary / novelty
  platform. Its Reddit-shaped threaded data is trivially easy to
  collect (no auth), but book-community volume is low. Include it only
  to demonstrate breadth or as a fourth / fifth platform; do not rely
  on it for statistically meaningful volume.

---

## 6. Goodreads and ground-truth ratings

- **Goodreads API is permanently closed.** As of December 8, 2020,
  Goodreads stopped issuing new developer keys and retired the tools;
  existing keys unused for 30 days were deactivated. There is no path
  to new access in 2026. Scraping Goodreads violates its ToS (which
  also prohibits storing Goodreads data), so it must be avoided.
- **Best ground-truth alternatives (all legitimate and free):**
  - **UCSD Book Graph (Goodreads datasets, McAuley Lab, UCSD):** Still
    available. ~2.36M books, ~229M user-book interactions, ~15M reviews
    with text, collected late 2017 from public shelves. License:
    *"academic use only. Please do not redistribute them or use for
    commercial purposes"*; cite Wan & McAuley (RecSys'18) and Wan et
    al. (ACL'19). Genre subsets (e.g., Fantasy & Paranormal: 258,585
    books, 55.4M interactions, 3.4M reviews) make it manageable. Ideal
    historical ground truth.
  - **goodbooks-10k:** 10,000 books, ~6M ratings, freely available on
    GitHub, with `books.csv` metadata including Goodreads average
    ratings. Good for a defined 30-50 book test set that maps onto
    known IDs.

    > **In this project:** we are already using goodbooks-10k for the
    > LightFM CF training data. `scripts/download_goodbooks10k.py` +
    > `scripts/train_lightfm.py` + `scripts/map_goodbooks_to_isbn.py`.

  - **Hardcover.app GraphQL API:** Free, in beta (endpoint
    `https://api.hardcover.app/v1/graphql`). Rate limit 60
    requests/minute, 30-second query timeout, max query depth of 3,
    and disabled fuzzy operators (`_ilike`, `_regex`, etc.). Per the
    official docs, *"Queries are limited to your own user data, public
    data, and user data of users you follow."* Public book aggregates
     — `rating` ("Average rating (0-5)"), `ratings_count`,
    `ratings_distribution`, `reviews_count`, `users_read_count` — are
    queryable network-wide for any book, per the Books schema page
    (updated May 27, 2026). Caveats from the docs: *"The API is still
    heavily in flux...We may reset tokens without notice while in
    beta,"* tokens *"automatically expire after 1 year, and reset on
    January 1st,"* it is *"only for offline use at this time"*
    (localhost/backend only), and *"You own your data...you can't use
    the API to access...someone else's [private] data."* This is the
    best live Goodreads-alternative for current ratings. Hardcover is
    a small platform (~16,800 members as of its official October 2024
    report — *"hit 16.8k members"* — and larger but undocumented in
    2026), so its rating counts per book are far lower than
    Goodreads'.
  - **StoryGraph:** No official API. An API has been a top-requested
    feature for 4+ years and remains unbuilt; only unofficial scrapers
    / Apify actors exist. Avoid for compliance.
  - **Open Library:** Has a ratings API (`/works/OLID/ratings.json`)
    and is fully open with permissive licensing; ratings volume is
    much lower than Goodreads but usable as a supplementary cross-check.

---

## 7. Telegram and Discord (supplementary)

- **Telegram:** Both the Bot API (simple HTTPS interface) and the
  MTProto client API (via Telethon, using your own account) are free.
  MTProto lets you read the history of public channels you're not a
  member of via `messages.getHistory`; you need a free `api_id` /
  `api_hash` from `my.telegram.org`. Good for public book channels,
  but channel discovery is manual and respect for channel / Telegram
  rules is required.
- **Discord:** The API is free. To read message text in book servers,
  a bot needs the **Message Content privileged intent**. If your app
  is accessible to fewer than 10,000 users (and under 100 servers), you
  can simply toggle the intent on in the Developer Portal with no
  approval; at/above 10,000 users the intent requires review and
  justification. You need the server owner/admin to invite your bot —
  you cannot read a server you haven't been added to. This makes
  Discord high-effort for cross-server research; include it only if you
  have cooperative server admins.

---

## 8. Feasibility verdict

- **Most practical 3-platform stack:** **YouTube + Bluesky + Mastodon.**
  All three are free, none requires approval (and since Sri Lanka is
  excluded from the YouTube Researcher Program, you rely on the default
  10,000-unit quota — which is sufficient with disciplined search
  usage), and all three have active book communities.
- **Strongly recommended fourth:** **Reddit**, if you can secure
  approval — ideally the Reddit for Researchers program with your
  university's ethics letter, or ordinary Data API approval. Reddit's
  book subreddits are the richest single source of structured book
  discussion, so it materially strengthens the project when available.
- **Platforms to avoid or treat as optional:** Goodreads and StoryGraph
  scraping (ToS violations); Discord (requires server-admin cooperation
  and per-server invites); Lemmy (too small for meaningful volume).
  Telegram is optional depending on whether relevant public book
  channels exist for your titles.
- **Realistic weekly volume on free tiers for a 30-50 book set:**
  - YouTube — tens of thousands of comments/week (constrained mainly
    by the 100-search/day sub-quota, so cache video IDs).
  - Bluesky — effectively unlimited at this scale via Jetstream /
    `searchPosts` (tens of thousands of posts easily).
  - Mastodon — low thousands of posts/week via hashtag timelines.
  - Reddit (if approved) — thousands of comments/week.

  Collectively this is more than adequate for sentiment analysis and
  topic modeling on 30-50 books.

---

## 9. Research ethics and compliance

- **University ethics approval:** Collecting public social media data
  for academic research is commonly covered by university ethics / IRB
  review, but a formal ethics application is strongly advisable — and
  is required for Reddit for Researchers. Securing an ethics letter
  early also unlocks RFR.
- **Anonymization:** Store hashed or removed user identifiers and
  derived sentiment scores rather than raw personal text wherever
  possible. Reddit's Responsible Builder Policy strictly prohibits
  re-identifying / de-anonymizing users and inferring sensitive
  characteristics (health, political affiliation, sexual orientation,
  etc.).

  > **In this project:** `:PlatformReception` nodes store only
  > `(positive, neutral, negative, mentions)` counts and a `platform`
  > label. No user IDs. No raw post text. This design directly matches
  > this compliance requirement.

- **Retention limits:** YouTube — 30 days for raw non-authorized public
  data (hard limit). Reddit — respect deletions and RFR's exclusion of
  deleted content. Hardcover — you may only build on your own and
  public data. For the long term, store only permitted derived
  aggregates (sentiment scores, topic distributions, engagement
  counts).

  > **In this project:** `scripts/purge_expired_receptions.py` runs the
  > YouTube 30-day expiry. `scripts/reddit_deletion_sweep.py` re-checks
  > Reddit post IDs and drops aggregates whose posts have been deleted
  > or removed.

- **GDPR / fediverse:** Mastodon, Bluesky, and Lemmy posts are public
  but still constitute personal data under GDPR. Fediverse cultural
  norms are stricter than the raw legality suggests — many fediverse
  users object to bulk research collection, which is exactly why
  Mastodon made full-text search opt-in. Minimize collection,
  anonymize, disclose your research purpose where feasible, and honor
  opt-outs and the indexable / searchability flags.

---

## 10. Risks and mitigation

- **Reddit approval risk (highest):** Self-service is gone; approval
  may be slow or denied.
  - *Mitigation:* Apply immediately via RFR with an ethics letter;
    design the project so Reddit is a bonus, not a dependency;
    preserve any pre-November-2025 OAuth credentials if you have them.
- **YouTube quota / policy changes:** Google made two quota changes
  (December 2025, June 2026) within the dissertation window.
  - *Mitigation:* Minimize `search.list` calls, cache video IDs,
    request a quota extension early if genuinely needed, and comply
    with the 30-day retention rule by storing only derived aggregates.
- **API monetization / lockdown risk:** Bluesky and Mastodon have no
  announced monetization plans, but any platform can change terms.
  - *Mitigation:* Collect data early (target a complete first pass by
    September 2026), snapshot everything permissible, and cache
    derived aggregates rather than depending on re-fetching raw data
    late in the project.
- **Hardcover beta instability:** Tokens can be reset without notice,
  and the API is *"heavily in flux."*
  - *Mitigation:* Snapshot ground-truth ratings early; keep the UCSD
    Book Graph and goodbooks-10k datasets as a stable, license-clean
    fallback.

---

## Recommendations (timeline)

1. **Immediately (July-August 2026)**
   - Lock the book set (30-50 titles) and map them to stable IDs
     (goodbooks-10k / Open Library OLIDs).
   - Register a Google Cloud project and YouTube API key.
   - Create a Bluesky account and prototype Jetstream + `searchPosts`.
   - Set up `Mastodon.py` against 2-3 book-heavy instances
     (mastodon.social + a bookish instance).
   - Download UCSD Book Graph + goodbooks-10k as your stable
     ground-truth baseline. *(goodbooks-10k already downloaded in this
     project.)*
   - Generate a Hardcover API token.
2. **In parallel:** Submit a university ethics application and use it
   to apply to Reddit for Researchers (and/or ordinary Data API
   approval). Treat Reddit as a high-value add-on with a lead time of
   one to several weeks.
3. **By September 2026:** Complete a full first data-collection pass on
   YouTube + Bluesky + Mastodon. Store derived aggregates (sentiment,
   topics, engagement) plus permissible raw data within retention
   windows.
4. **October-November 2026:** Run sentiment analysis + topic modeling,
   build the unified reader-reception score, and validate it against
   Hardcover / UCSD / Open Library ratings. Build the dashboard. *(The
   Streamlit dashboard for this project is already up on `:8501`.)*
5. **Thresholds that change the plan:**
   - If Reddit approval is denied or delayed past September, ship with
     YouTube + Bluesky + Mastodon (still ≥3 platforms).
   - If YouTube quota proves insufficient, file a quota-extension
     request or narrow the video set and cache aggressively.
   - If Hardcover's beta breaks, fall back to UCSD / goodbooks + Open
     Library for ground truth.

---

## Caveats

- Reddit's commercial-tier figures ($0.24 / 1,000 calls; ~$12,000/month
  for ~50M calls) come from developer reports and Reddit's 2023
  communications, not an official public rate card — but they are
  irrelevant to your free-tier, non-commercial use.
- Bluesky's *"generous"* read rate limits on the AppView are documented
  qualitatively rather than as a precise public number; monitor for
  HTTP 429 responses and implement exponential backoff.
- Mastodon and Lemmy rate limits are per-instance defaults that admins
  can change; the 300-requests / 5-minutes figure is the Mastodon
  default.
- Bluesky user statistics beyond the official registered-user count are
  third-party estimates; Bluesky does not officially publish MAU.
- The YouTube Researcher Program country list can change; re-check
  eligibility at application time in case Sri Lanka is added.
- Hardcover's exact current user / catalog size is not publicly
  documented for 2026 (most recent official figure ~16,800 members,
  October 2024); treat it as a smaller, growing dataset whose per-book
  rating counts are much lower than Goodreads'.
- The UCSD Book Graph reflects a late-2017 snapshot of Goodreads; it is
  excellent as historical ground truth but will not include books
  published after 2017 or reflect current rating averages.

---

## Cross-references in this project

- **Phase 4 collectors** — `ml-service/src/fedbook_ml/ingest/{reddit,youtube,bluesky,mastodon}.py`
- **Reception aggregation** — `ml-service/src/fedbook_ml/reception.py`
- **Nightly ingestion orchestrator** — `ml-service/scripts/ingest_daily.py`
- **YouTube 30-day retention** — `ml-service/scripts/purge_expired_receptions.py`
- **Reddit deletion respect** — `ml-service/scripts/reddit_deletion_sweep.py`
- **Ground-truth CF training data** — `ml-service/data/goodbooks-10k/` (gitignored)
- **8-phase plan (parent doc)** — `docs/Implementation_Plan.md`
- **Session retrospective** — `docs/BUILD_LOG.md`
