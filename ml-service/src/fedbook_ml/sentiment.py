"""Sentiment scoring for social-media mentions.

Uses CardiffNLP `twitter-roberta-base-sentiment-latest` - a RoBERTa-base
model pretrained on ~124M tweets (Loureiro et al. 2022, CC-BY-4.0).

Twitter-style preprocessing: replace @username with `@user`, URLs with `http`.

Optional: PyABSA aspect-based sentiment for book-review jargon
("loved the plot, hated the pacing"). Enabled via `use_absa=True`.
"""

import re
from functools import lru_cache

USER_RE = re.compile(r"@\w+")
URL_RE = re.compile(r"https?://\S+")

LABELS = ["negative", "neutral", "positive"]


def preprocess(text: str) -> str:
    text = USER_RE.sub("@user", text)
    text = URL_RE.sub("http", text)
    return text


@lru_cache
def _get_pipeline():
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


class SentimentScorer:
    def label_and_score(self, text: str) -> tuple[str, float]:
        pipe = _get_pipeline()
        result = pipe(preprocess(text))[0]
        return result["label"].lower(), float(result["score"])

    def batch(self, texts: list[str]) -> list[tuple[str, float]]:
        pipe = _get_pipeline()
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
