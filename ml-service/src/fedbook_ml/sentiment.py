"""Sentiment scoring for social-media mentions.

Primary path: CardiffNLP `twitter-roberta-base-sentiment-latest` - a
RoBERTa-base model pretrained on ~124M tweets (Loureiro et al. 2022,
CC-BY-4.0).

Fallback path: when the pretrained model can't be loaded (offline mode,
network failure, disk full during download), a lightweight lexicon
scorer takes over so ingestion still produces real per-platform mention
counts. The lexicon scorer is deliberately conservative — it labels
neutral by default and requires strong signal to move a text into
positive/negative — so downstream reception scores skew neutral when
the ML model isn't available.

Twitter-style preprocessing: replace @username with `@user`, URLs with `http`.
"""

import logging
import re
from functools import lru_cache

log = logging.getLogger("fedbook_ml.sentiment")

USER_RE = re.compile(r"@\w+")
URL_RE = re.compile(r"https?://\S+")

LABELS = ["negative", "neutral", "positive"]

# Lightweight lexicon used only when the transformer model can't load.
# Small, book-review-flavoured, and case-insensitive.
_POS_WORDS = {
    "amazing", "brilliant", "loved", "love", "great", "excellent", "beautiful",
    "wonderful", "masterpiece", "fantastic", "gorgeous", "recommend", "gripping",
    "compelling", "powerful", "moving", "favorite", "favourite", "best",
    "enjoyed", "enjoy", "perfect", "stunning",
}
_NEG_WORDS = {
    "boring", "awful", "terrible", "hated", "hate", "worst", "waste",
    "disappointing", "disappointed", "bad", "bland", "dull", "shallow",
    "pretentious", "annoying", "confusing", "slow", "dnf",
}


def preprocess(text: str) -> str:
    text = USER_RE.sub("@user", text)
    text = URL_RE.sub("http", text)
    return text


@lru_cache
def _get_pipeline():
    """Load the CardiffNLP pipeline. Returns None if it can't be loaded -
    callers must handle that (SentimentScorer falls back to the lexicon)."""
    try:
        from transformers import (
            AutoModelForSequenceClassification,
            AutoTokenizer,
            pipeline,
        )
        name = "cardiffnlp/twitter-roberta-base-sentiment-latest"
        tokeniser = AutoTokenizer.from_pretrained(name)
        model = AutoModelForSequenceClassification.from_pretrained(name)
        return pipeline(
            "sentiment-analysis",
            model=model,
            tokenizer=tokeniser,
            return_all_scores=False,
            truncation=True,
            max_length=512,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "CardiffNLP sentiment model unavailable (%s) - falling back to "
            "lexicon scorer. Reception scores will skew neutral until the "
            "model can be downloaded.", exc,
        )
        return None


def _lexicon_score(text: str) -> tuple[str, float]:
    """Very simple keyword-based sentiment for fallback use only."""
    tokens = set(re.findall(r"[a-z]+", text.lower()))
    pos = len(tokens & _POS_WORDS)
    neg = len(tokens & _NEG_WORDS)
    if pos > neg:
        return "positive", 0.55 + min(0.4, 0.1 * pos)
    if neg > pos:
        return "negative", 0.55 + min(0.4, 0.1 * neg)
    return "neutral", 0.6


class SentimentScorer:
    def label_and_score(self, text: str) -> tuple[str, float]:
        pipe = _get_pipeline()
        if pipe is None:
            return _lexicon_score(text)
        result = pipe(preprocess(text))[0]
        return result["label"].lower(), float(result["score"])

    def batch(self, texts: list[str]) -> list[tuple[str, float]]:
        pipe = _get_pipeline()
        if pipe is None:
            return [_lexicon_score(t) for t in texts]
        prepped = [preprocess(t) for t in texts]
        return [(r["label"].lower(), float(r["score"])) for r in pipe(prepped, batch_size=16)]

    @staticmethod
    def aggregate(labels: list[str]) -> dict[str, int]:
        counts = {"positive": 0, "neutral": 0, "negative": 0}
        for l in labels:
            key = l.lower()
            if key in counts:
                counts[key] += 1
        return counts
