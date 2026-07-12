# Reddit for Researchers (RFR) — Application Draft

> **Status:** Draft prepared for submission alongside SLIIT ethics approval
> letter. Do not submit until (a) the ethics application has been approved
> in writing and (b) an accredited-institution email is confirmed for the
> primary investigator.
>
> **Form:** Reddit for Researchers portal, https://redditforresearchers.com
> (see `docs/API_Feasibility_Assessment.md` section 1 for the policy
> context).

---

## Applicant

- **Name:** Sanjaya Weerasinghe
- **Institutional email:** *(to be confirmed with SLIIT — required to be an
  accredited-university address)*
- **Institution:** Sri Lanka Institute of Information Technology (SLIIT)
- **Programme:** B.Sc. Special (Hons) in Information Technology
- **Group:** R26-IT-107
- **Student ID:** IT22922670
- **Supervisor:** *(to be filled)*
- **Ethics reference:** *(to be filled once SLIIT REC approves)*

---

## Research project

**Title.** *FedBook-Sem: Cross-Platform Sentiment Fusion for Federated
Social Book Recommendation.*

**Purpose.** The project extends a federated social bookstore
(`FedBook-Sem`, ActivityPub + Neo4j + W3C Web Annotations) with a machine
learning recommender that fuses semantic content similarity with a
**cross-platform reader-reception score** aggregated from public social
media discussion. The unified reception score treats each platform's
sentiment distribution as a signal about a book's ongoing reception in
online reading communities. The research contribution is the fusion
method itself — no existing work aggregates Reddit + YouTube + Bluesky +
Mastodon reader reception into a single re-ranking feature.

**Research questions.**

1. Does incorporating cross-platform reader reception into a semantic
   book recommender's ranking improve top-k relevance versus semantic
   similarity alone?
2. Does aggregating across four heterogeneous platforms yield a more
   robust signal than any single platform, as measured by rank stability
   under partial-platform-drop ablations?
3. How does a linear α/β/γ blend compare to a learned LightGBM
   LambdaRank fusion when both use the same feature set (semantic
   similarity, cross-platform reception, platform diversity)?

**Book set.** 30-50 books drawn from goodbooks-10k and Open Library
identifiers so results map onto a stable public catalogue. Books span
multiple genres (literary fiction, fantasy, non-fiction, YA) to test
generalisation.

**Timeframe.** Data collection window: 8 weeks (nominal). Analysis and
dissertation write-up complete by 2026-12.

---

## Reddit-specific methodology

**What we collect.** For each book in the study set we search post and
comment titles/bodies mentioning the book's title (with author-name
disambiguation) across public subreddits (r/books, r/suggestmeabook,
r/Fantasy, and up to five other relevant public subreddits per book).

**What we persist.** For each `(book, subreddit)` pair the system stores
**only** the aggregate node `(:Book)-[:RECEPTION_ON]->(:PlatformReception
{platform: 'reddit', positive, neutral, negative, mentions,
external_ids, ingested_at})`, where `positive`/`neutral`/`negative` are
counts produced by a pretrained CardiffNLP twitter-roberta sentiment
classifier over the retrieved posts and comments. **Raw post text is
never written to disk** — text is processed in memory only, scored, then
discarded (`ml-service/src/fedbook_ml/ingest/base.py`).

`external_ids` are the Reddit post IDs used to permit deletion
propagation (see below); no user IDs, no usernames, no karma, no user
identifiers of any kind are stored.

**Rate.** Free-tier compliance: ≤ 100 QPM per OAuth client. Actual load
is far below that: a single book takes ~30 requests per ingestion cycle,
one cycle per week per book. For a 50-book study set: 1,500 requests /
week — well within the free tier.

**Prohibited uses.** We do not, and will not:

- Re-identify or de-anonymise users.
- Infer sensitive characteristics (health, political affiliation,
  religion, sexual orientation, etc.).
- Publish user-attributable data.
- Redistribute Reddit content in any form other than aggregate,
  anonymous counts.

## Compliance with the Reddit Responsible Builder Policy

The following mechanisms are **already implemented in code** on the
`master` branch of the project (verifiable at
https://github.com/SanjayaWeerasinghe/FedBookSem):

| Policy requirement | Implementation |
|---|---|
| Deleted content must be respected | `ml-service/scripts/reddit_deletion_sweep.py` re-checks every stored external ID weekly via PRAW; when a post is `[deleted]`/`[removed]`/author is None, the aggregate is proportionally decremented and the ID dropped from `external_ids`. |
| No raw text storage | `ml-service/src/fedbook_ml/ingest/base.py` docstring; `ReceptionAggregate` schema; Cypher `MERGE` writes only aggregate counts and IDs. |
| No user-identifying data | Aggregates carry only `platform`, `book_isbn`, counts, and post IDs. No user handles, karma, or profile fields are read into the pipeline. |
| Rate-limit compliance | PRAW enforces the OAuth per-client 100 QPM limit; ingest cycles cap requests-per-book at ~30 (`ml-service/scripts/ingest_daily.py`). |
| No re-identification / sensitive inference | Sentiment classifier operates on individual post text at ingest time only; the classifier's output classes are `positive`, `neutral`, `negative` — none of which permit inference of protected attributes. |

## Data safeguards

- **In-memory only** for raw post text; no filesystem or database write
  of raw text at any point.
- **Aggregate storage** in a project-internal Neo4j instance running in
  a docker container on a single-user laptop for the duration of the
  research, plus offline backup snapshots on encrypted storage.
- **No cloud storage** of aggregates during the study.
- **Access control** — Neo4j credentials are strong, unshared, and
  changed on submission of the dissertation.
- **Deletion cadence** — the reddit deletion sweep runs weekly. Any
  content redacted by users during the research window will be reflected
  in aggregates within 7 days of removal.

## Retention

- **During the research window (2026-07 to 2026-12).** Aggregates only,
  in the local Neo4j instance.
- **On submission.** All aggregate data is exported as an anonymous
  CSV (columns: book_isbn, platform, positive, neutral, negative,
  mentions) for archival with the dissertation appendix, then the
  Neo4j instance is wiped.
- **No indefinite retention.** External IDs are not archived — they are
  only useful during the study for the deletion sweep and are dropped
  at export.

## Ethics oversight

- SLIIT Research Ethics Committee review pending; approval reference
  to be inserted here prior to submitting this RFR application.
- Study collects only public social media data at aggregate level; no
  contact with users, no surveys, no direct communication.
- The dissertation will explicitly disclose the data collection scope,
  methodology, and ToS-compliance measures in its methods chapter.

## What we are asking for

Ordinary Data API access under the free tier (100 QPM per OAuth client),
sufficient for the 50-book × 30-request × weekly-cycle load described
above. We are **not** requesting Reddit for Researchers dataset access
via BigQuery unless the ordinary API tier is deemed inappropriate for
research — in which case we would apply through RFR proper.

---

## Fallback if this application is denied or delayed

Per the project's `docs/API_Feasibility_Assessment.md` (section 8), the
recommender ships and evaluates on **YouTube + Bluesky + Mastodon** as
its primary 3-platform stack. Reddit is a high-value fourth platform but
not a load-bearing dependency. If access is not granted by
2026-09-15, we proceed with the three-platform configuration and note
Reddit as future work.

---

## Attachments

- SLIIT Research Ethics Committee approval letter *(pending)*
- Confirmation of student status (enrolment letter or transcript)
- Link to the project's public GitHub repository
- `docs/API_Feasibility_Assessment.md` (this project) documenting the
  compliance analysis
