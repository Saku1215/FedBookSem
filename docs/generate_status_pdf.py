"""Generate the FedBook-Sem development-only status PDF.

Excludes report writing and evaluation phases (per user request).
Development scope only: existing platform + all coding work for Phases 1-6 + Phase 8 dashboard.

Usage:
    py -3.14 docs/generate_status_pdf.py
"""

from datetime import date
from pathlib import Path

from fpdf import FPDF


# ---------- Numbers ----------

# Effort estimates (hours), midpoints of ranges, DEVELOPMENT ONLY
# (no evaluation code, no thesis writing, no defence prep)

DONE = [
    ("Backend: Express app, 10 routes, JWT + bcrypt", 80),
    ("Neo4j driver + schema + graph query helpers", 40),
    ("ActivityPub federation (actors, WebFinger, inbox, HTTP sigs, delivery)", 60),
    ("W3C Web Annotations (selectors, threading, per-book queries)", 20),
    ("Book-cover SVG generator + avatar uploads (multer)", 10),
    ("React frontend: 6 pages, book grid, feed, annotations, JWT client", 90),
    ("Docker Compose infra + seed data + ER/function diagrams + API docs", 30),
    ("Integration testing / debugging / handover", 20),
    ("ml-service scaffolding this session (config, neo4j client, OL client, resolver, tests, fixture)", 15),
    ("docker-compose.yml: pinned Neo4j 5.15, added ml-service block", 2),
    ("backend/src/graph/schema.js: openLibraryWorkId index", 1),
]

REMAINING = [
    (
        "Phase 1 finish",
        [
            ("Verify Docker build + first-run pytest inside container", 4),
            ("Apply Neo4j schema (npm run schema) + verify FBS regression-free", 3),
            ("Load Kaggle 7k books.csv (after user download)", 3),
            ("Entity resolver >=90% accuracy tuning + fixture expansion if needed", 8),
            ("Windows/Docker path + TLS + bind-mount debugging", 6),
        ],
    ),
    (
        "Phase 2 - Semantic engine",
        [
            ("sentence-transformers module + tests", 10),
            ("Neo4j vector index creation + verification", 4),
            ("build_embeddings.py: embed ~6810 books, write vectors back", 10),
            ("Vector search wrapper (db.index.vector.queryNodes) + tests", 8),
            ("FastAPI app: /health, /recommend/similar (isbn + text seeds)", 16),
            ("Container lifespan, dependency injection, uvicorn CMD", 6),
            ("Node backend proxy /api/feed/recommendations/ml", 8),
            ("Frontend: getMLRecommendations() + FeedPage swap + fallback logic", 12),
            ("End-to-end integration testing (Python <-> Node <-> React)", 6),
        ],
    ),
    (
        "Phase 3 - ML Models",
        [
            ("Download + unpack goodbooks-10k", 2),
            ("LightFM data prep + item feature engineering", 14),
            ("LightFM WARP training loop + hyperparameter tuning (multiple runs)", 24),
            ("Goodbooks-book_id -> :Book ISBN join script", 8),
            ("FastAPI /recommend/cf endpoint", 6),
            ("BGE cross-encoder integration + batching + model download handling", 12),
            ("API extension for ?reRank=cross-encoder + latency budget testing", 10),
            ("Regression tests + golden fixtures", 8),
            ("Optional: fine-tune all-MiniLM on genre pairs (stretch)", 26),
        ],
    ),
    (
        "Phase 4 - Cross-platform ingestion + sentiment",
        [
            ("Reddit PRAW client + OAuth + rate limit handling + subreddit allowlist", 22),
            ("YouTube Data API v3 + quota management + 30-day expiry stamping", 24),
            ("Bluesky AT Protocol client + search", 16),
            ("Mastodon REST client + instance allowlist", 14),
            ("Base Collector protocol + entity-resolver wiring", 8),
            ("CardiffNLP twitter-roberta sentiment (with Twitter preprocessing)", 12),
            ("PyABSA aspect-based sentiment setup", 14),
            (":PlatformReception graph model + schema constraint", 4),
            ("Daily ingest worker + cron scheduling", 8),
            ("YouTube 30-day purge cron", 4),
            ("Reddit deletion sweep (periodic re-poll)", 6),
            ("Per-collector tests with mocked fixtures", 16),
            ("Ethics approval paperwork + API key onboarding", 12),
        ],
    ),
    (
        "Phase 5 - Novel contribution (sentiment-aware + learned fusion)",
        [
            ("reception.py: per-platform positive share, weighted score, entropy diversity", 14),
            ("rerank.py: linear alpha/beta/gamma blend + validation", 6),
            ("ml/ltr.py: feature builder (6-feature vector) + LightGBM LambdaRank", 22),
            ("Training script for LTR (consumes held-out data)", 10),
            ("API ?reRank=linear|learned with per-candidate feature echo", 8),
            ("Ablation logging (JSONL per request)", 4),
            ("Frontend ReceptionBadges.jsx component + per-platform colour dots", 10),
            ("Debug feature-breakdown toggle in dev builds", 4),
            ("Regression + fixture-driven ordering tests", 8),
            ("Iteration cycles as offline results come in (5-10 rounds)", 14),
        ],
    ),
    (
        "Phase 6 - Neo4j GDS variant (optional but distinctive)",
        [
            ("Install GDS plugin in compose + security config + restart", 4),
            ("graph_search.py: gds.knn + gds.pageRank wrappers", 16),
            ("API /recommend/graph?strategy=knn|ppr", 8),
            ("Node backend proxy + frontend hook (optional)", 6),
            ("Comparison tests: native vector vs gds.knn agree", 8),
        ],
    ),
    (
        "Phase 8 (dashboard only, thesis writing excluded)",
        [
            ("Streamlit app scaffold + docker-compose entry (:8501)", 8),
            ("Recommender demo page (search, results, badges, feature contributions)", 16),
            ("Model registry page (loaded artefacts, sizes, metadata)", 8),
            ("Screenshots for supervisor/defence demo", 4),
            ("Reproducibility guide (docker-only workflow)", 4),
        ],
    ),
    (
        "Cross-cutting development work",
        [
            ("Supervisor iteration cycles + rework", 20),
            ("Docker networking / Windows path / cache debugging", 14),
            ("Multi-layer integration bugs (Py <-> Node <-> React <-> Neo4j)", 16),
            ("API key onboarding lag (Reddit + YouTube approvals)", 8),
            ("README + docs updates as scope evolves", 8),
            ("Deployment / hosting decisions (HF Spaces? local?)", 4),
        ],
    ),
]


def sum_hours(rows):
    return sum(h for _, h in rows)


def sum_phase(phase):
    return sum_hours(phase[1])


TOTAL_DONE = sum_hours(DONE)
TOTAL_REMAINING = sum(sum_phase(p) for p in REMAINING)
GRAND_TOTAL = TOTAL_DONE + TOTAL_REMAINING
PCT_DONE = TOTAL_DONE / GRAND_TOTAL * 100
PCT_REMAINING = TOTAL_REMAINING / GRAND_TOTAL * 100


# ---------- PDF layout ----------

class StatusPDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(120, 120, 120)
        self.cell(0, 6, "FedBook-Sem  |  Development Status  |  R26-IT-107", align="R")
        self.ln(10)
        self.set_text_color(0, 0, 0)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(140, 140, 140)
        self.cell(0, 6, f"Page {self.page_no()}", align="C")
        self.set_text_color(0, 0, 0)

    def title_bar(self, text, size=14, colour=(30, 30, 30)):
        self.set_font("Helvetica", "B", size)
        self.set_text_color(*colour)
        self.cell(0, 9, text, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(2)

    def para(self, text, size=10):
        self.set_font("Helvetica", "", size)
        self.multi_cell(0, 5.5, text)
        self.ln(1)

    def progress_bar(self, pct_done, width=170, height=12):
        x = self.get_x()
        y = self.get_y()
        # Track
        self.set_fill_color(230, 230, 230)
        self.rect(x, y, width, height, style="F")
        # Filled portion (green)
        self.set_fill_color(52, 168, 83)
        self.rect(x, y, width * pct_done / 100, height, style="F")
        # Border
        self.set_draw_color(150, 150, 150)
        self.rect(x, y, width, height)
        # Label centered
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(0, 0, 0)
        self.set_xy(x, y + 3)
        self.cell(width, 6, f"{pct_done:.1f}% done   /   {100 - pct_done:.1f}% remaining", align="C")
        self.set_xy(x, y + height + 2)

    def key_row(self, label, value, bold_value=False):
        self.set_font("Helvetica", "", 10)
        self.cell(90, 6, label)
        self.set_font("Helvetica", "B" if bold_value else "", 10)
        self.cell(0, 6, value, new_x="LMARGIN", new_y="NEXT")

    def table_header(self, cols, widths):
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(50, 60, 80)
        self.set_text_color(255, 255, 255)
        for c, w in zip(cols, widths):
            self.cell(w, 7, c, border=1, align="C", fill=True)
        self.ln()
        self.set_text_color(0, 0, 0)

    def table_row(self, cols, widths, aligns=None, fill=False):
        self.set_font("Helvetica", "", 9)
        if fill:
            self.set_fill_color(245, 247, 250)
        if aligns is None:
            aligns = ["L"] * len(cols)

        # Determine row height based on wrapped text
        line_h = 5
        # Use multi_cell for the first (widest) column, single line for others
        y_start = self.get_y()
        x_start = self.get_x()

        # Simple approach: single-line rows
        for c, w, a in zip(cols, widths, aligns):
            self.cell(w, 6, str(c), border=1, align=a, fill=fill)
        self.ln()

    def wrapped_table_row(self, cols, widths, aligns, fill=False):
        """Row where the first column may wrap over multiple lines."""
        if fill:
            self.set_fill_color(245, 247, 250)
        self.set_font("Helvetica", "", 9)

        # Estimate lines the first column needs
        text = str(cols[0])
        max_chars_per_line = max(20, int(widths[0] / 1.7))
        est_lines = max(1, (len(text) + max_chars_per_line - 1) // max_chars_per_line)
        row_h = max(6, 4.6 * est_lines)

        x_start = self.get_x()
        y_start = self.get_y()

        # Fill background across the row
        if fill:
            self.rect(x_start, y_start, sum(widths), row_h, style="F")

        # First column: multi_cell
        self.multi_cell(widths[0], row_h / est_lines, text, border=1, align=aligns[0])
        # Move to next column position
        self.set_xy(x_start + widths[0], y_start)
        # Remaining columns: single-line cells with row_h height
        for c, w, a in zip(cols[1:], widths[1:], aligns[1:]):
            self.cell(w, row_h, str(c), border=1, align=a)
        self.ln(row_h - (row_h - 6))
        self.set_y(y_start + row_h)


# ---------- Build PDF ----------

pdf = StatusPDF(orientation="P", unit="mm", format="A4")
pdf.set_auto_page_break(auto=True, margin=15)
pdf.set_margins(20, 18, 20)
pdf.add_page()

# COVER
pdf.set_font("Helvetica", "B", 22)
pdf.set_text_color(30, 41, 82)
pdf.ln(8)
pdf.cell(0, 12, "FedBook-Sem", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("Helvetica", "B", 14)
pdf.cell(0, 8, "Development Status Report", new_x="LMARGIN", new_y="NEXT")
pdf.set_text_color(0, 0, 0)
pdf.ln(2)

pdf.set_font("Helvetica", "", 11)
pdf.set_text_color(90, 90, 90)
pdf.cell(0, 6, "Federated Social Bookstore + ML Book Recommender", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, "Scope: development work only  -  excludes evaluation and thesis writing", new_x="LMARGIN", new_y="NEXT")
pdf.set_text_color(0, 0, 0)
pdf.ln(6)

pdf.set_font("Helvetica", "", 10)
pdf.key_row("Project:", "R26-IT-107  /  IT22922670  (SLIIT B.Sc. FYP)")
pdf.key_row("Developer:", "Sanjaya  <sanjaya.w@jinasena.com.lk>")
pdf.key_row("Report date:", date.today().isoformat())
pdf.key_row("Effort unit:", "person-hours (midpoint estimates)")
pdf.ln(6)

# Overall progress
pdf.title_bar("Overall progress", size=14, colour=(30, 41, 82))
pdf.progress_bar(PCT_DONE)
pdf.ln(4)
pdf.set_font("Helvetica", "", 10)
pdf.cell(0, 6, f"Total scope estimated: {GRAND_TOTAL} h", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, f"Delivered so far:      {TOTAL_DONE} h   ({PCT_DONE:.1f}%)", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, f"Remaining to build:    {TOTAL_REMAINING} h   ({PCT_REMAINING:.1f}%)", new_x="LMARGIN", new_y="NEXT")
pdf.ln(6)

pdf.set_font("Helvetica", "I", 9)
pdf.set_text_color(120, 120, 120)
pdf.multi_cell(
    0, 5,
    "Estimates are midpoints of realistic development ranges (not best-case). "
    "They include debugging, integration pain, and reasonable iteration cycles, but exclude: "
    "supervisor meetings beyond the ~20h allocated, dataset licence surprises, and long "
    "waits for external approvals (ethics, API keys)."
)
pdf.set_text_color(0, 0, 0)

# --------- SUMMARY TABLE ---------
pdf.add_page()
pdf.title_bar("Effort summary by component", size=14, colour=(30, 41, 82))

summary_rows = [
    ("Existing federated bookstore (delivered)", TOTAL_DONE, 0, 100.0),
]
for phase in REMAINING:
    name, tasks = phase
    hrs = sum_hours(tasks)
    summary_rows.append((name, 0, hrs, 0.0))

# The already-done ml-service scaffold sits at the top; separate out?
# We already counted it in TOTAL_DONE. Show a Phase 1 progress note in the row.

pdf.table_header(
    ["Component", "Done (h)", "Remaining (h)", "% done"],
    [90, 25, 32, 25],
)
for label, done, remaining, pct in summary_rows:
    total = done + remaining
    pct_calc = (done / total * 100) if total else 0
    fill = summary_rows.index((label, done, remaining, pct)) % 2 == 1
    pdf.wrapped_table_row(
        [label, str(done), str(remaining), f"{pct_calc:.0f}%"],
        [90, 25, 32, 25],
        ["L", "R", "R", "R"],
        fill=fill,
    )

# Totals row
pdf.set_font("Helvetica", "B", 9)
pdf.set_fill_color(50, 60, 80)
pdf.set_text_color(255, 255, 255)
pdf.cell(90, 7, "TOTAL", border=1, fill=True)
pdf.cell(25, 7, str(TOTAL_DONE), border=1, align="R", fill=True)
pdf.cell(32, 7, str(TOTAL_REMAINING), border=1, align="R", fill=True)
pdf.cell(25, 7, f"{PCT_DONE:.0f}%", border=1, align="R", fill=True)
pdf.ln()
pdf.set_text_color(0, 0, 0)
pdf.ln(4)

# --------- WHAT'S DONE ---------
pdf.title_bar("What has been delivered", size=13, colour=(52, 168, 83))
pdf.para(
    "The federated social bookstore platform is complete and running. In addition, the "
    "Python ml-service package skeleton (config, Neo4j client, Open Library client, "
    "entity resolver, tests, fixture, Dockerfile) has been scaffolded in the current "
    "session but is not yet verified end-to-end in a container."
)
pdf.ln(1)

pdf.table_header(["Delivered work", "Hours"], [140, 32])
for i, (label, hours) in enumerate(DONE):
    pdf.wrapped_table_row(
        [label, str(hours)],
        [140, 32],
        ["L", "R"],
        fill=i % 2 == 1,
    )
pdf.set_font("Helvetica", "B", 9)
pdf.set_fill_color(52, 168, 83)
pdf.set_text_color(255, 255, 255)
pdf.cell(140, 7, "Subtotal delivered", border=1, fill=True)
pdf.cell(32, 7, str(TOTAL_DONE), border=1, align="R", fill=True)
pdf.ln()
pdf.set_text_color(0, 0, 0)

# --------- WHAT'S REMAINING (per phase) ---------
for phase_name, tasks in REMAINING:
    pdf.add_page()
    pdf.title_bar(f"Remaining: {phase_name}", size=13, colour=(200, 60, 40))
    phase_total = sum_hours(tasks)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 6, f"Phase subtotal: {phase_total} h  ({phase_total / TOTAL_REMAINING * 100:.1f}% of remaining scope)", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)

    pdf.table_header(["Task", "Hours"], [140, 32])
    for i, (label, hours) in enumerate(tasks):
        pdf.wrapped_table_row(
            [label, str(hours)],
            [140, 32],
            ["L", "R"],
            fill=i % 2 == 1,
        )
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(200, 60, 40)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(140, 7, "Phase subtotal", border=1, fill=True)
    pdf.cell(32, 7, str(phase_total), border=1, align="R", fill=True)
    pdf.ln()
    pdf.set_text_color(0, 0, 0)

# --------- FINAL SUMMARY PAGE ---------
pdf.add_page()
pdf.title_bar("Bottom line", size=14, colour=(30, 41, 82))

pdf.set_font("Helvetica", "", 11)
pdf.multi_cell(
    0, 6,
    f"Total development scope for this project (existing platform + ML additions, "
    f"development work only) is estimated at {GRAND_TOTAL} hours.\n\n"
    f"Of that, {TOTAL_DONE} hours ({PCT_DONE:.1f}%) has been delivered so far. "
    f"{TOTAL_REMAINING} hours ({PCT_REMAINING:.1f}%) of development work remains.\n\n"
    f"At 40 h/week that is {TOTAL_REMAINING / 40:.1f} weeks of full-time work still to do "
    f"on development alone -- before counting evaluation code, human study, thesis "
    f"chapters, or defence preparation, which are explicitly OUT OF SCOPE of this report."
)
pdf.ln(2)

pdf.title_bar("Not included in these numbers", size=12, colour=(140, 140, 140))
pdf.set_font("Helvetica", "", 10)
pdf.multi_cell(
    0, 5.5,
    "- Offline evaluation code (P@k, R@k, NDCG@k, MAP@k, novelty, diversity, coverage)\n"
    "- 7-strategy sweep runner and ablation notebook\n"
    "- Human face-validity study (recruit ~15-20 respondents, forms, Kendall tau)\n"
    "- Thesis chapters (literature review, methods, results, discussion, ethics)\n"
    "- Defence slide deck + rehearsal\n"
    "- Reference formatting and appendices\n\n"
    "If included, these would add roughly 240-300 hours (~30% more) on top of the "
    "figures in this report."
)
pdf.ln(3)

pdf.title_bar("Development-only risks that can push cost higher", size=12, colour=(200, 60, 40))
pdf.set_font("Helvetica", "", 10)
pdf.multi_cell(
    0, 5.5,
    "- Reddit / YouTube API-key approval delays (days-to-weeks of calendar loss)\n"
    "- Novel-contribution rework if the learned fusion loses to baselines in early tests\n"
    "  (may need to pivot the Phase 5 approach)\n"
    "- Windows / Docker / TLS / bind-mount debugging (already observed one TLS timeout)\n"
    "- Model training tuning cycles (LightFM and LightGBM often need 5-10 iterations)\n"
    "- UCSD Book Graph licence handling for offline use\n"
    "- Multi-layer integration bugs across Python <-> Node <-> React <-> Neo4j\n\n"
    "Recommended contingency: +15% on the remaining figure "
    f"(~{int(TOTAL_REMAINING * 0.15)} h) to protect against the above."
)

out = Path(__file__).parent / "FedBookSem_Development_Status.pdf"
pdf.output(str(out))
print(f"Wrote {out}  ({out.stat().st_size / 1024:.1f} KB)")
