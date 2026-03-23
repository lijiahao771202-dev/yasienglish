#!/usr/bin/env python3
from __future__ import annotations

import os
import re
from difflib import SequenceMatcher
from importlib.util import find_spec
from statistics import median
import sys
import time
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CHARSIU_REPO = REPO_ROOT / ".cache" / "charsiu"
DEFAULT_ALIGNER = "charsiu/en_w2v2_fc_10ms"
ENGINE_VERSION = os.environ.get("YASI_PRONUNCIATION_ENGINE_VERSION", "charsiu-en_w2v2_fc_10ms").strip() or "charsiu-en_w2v2_fc_10ms"
ALIGNER_MODEL = os.environ.get("YASI_CHARSIU_ALIGNER", DEFAULT_ALIGNER).strip() or DEFAULT_ALIGNER
HF_CACHE_ROOT = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")).expanduser()
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")


class PipelineError(RuntimeError):
    pass


@dataclass
class Runtime:
    torch: Any
    np: Any
    forced_align: Any
    seq2duration: Any
    aligner: Any


@dataclass
class WhisperRuntime:
    model: Any


@dataclass(frozen=True)
class ReferenceDescriptor:
    phone_groups: tuple[tuple[str, ...], ...]
    reference_words: tuple[str, ...]
    phone_ids: tuple[int, ...]
    flat_phones: tuple[str, ...]
    normalized_phone_ids: tuple[int, ...]
    word_phone_ranges: tuple[tuple[int, int], ...]
    stressed_phone_offsets: tuple[tuple[int, ...], ...]


@dataclass(frozen=True)
class ListeningScoringProfile:
    content_weight: float
    rhythm_weight: float
    pronunciation_weight: float
    correct_threshold: float
    weak_threshold: float
    low_content_cap_threshold: float
    low_content_cap: float
    mid_content_cap_threshold: float | None
    mid_content_cap: float | None
    low_rhythm_cap_threshold: float | None
    low_rhythm_cap: float | None
    recall_threshold: float
    precision_threshold: float
    recall_precision_content_cap: float
    recall_precision_total_cap: float
    pronunciation_cap_threshold: float
    pronunciation_cap: float


_RUNTIME_CACHE: Runtime | None = None
_RUNTIME_LOCK = threading.Lock()
_WHISPER_RUNTIME_CACHE: WhisperRuntime | None = None
_WHISPER_RUNTIME_LOCK = threading.Lock()
FUNCTION_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "had", "has", "have",
    "he", "her", "him", "his", "i", "if", "in", "is", "it", "its", "me", "my", "of", "on", "or",
    "our", "she", "that", "the", "their", "them", "there", "they", "this", "to", "us", "was",
    "we", "were", "will", "with", "you", "your",
}
TRANSCRIPT_GATE_ENABLED = os.environ.get("YASI_ENABLE_TRANSCRIPT_GATE", "1").strip().lower() not in {"0", "false", "off"}
TRANSCRIPT_GATE_MODEL = os.environ.get("YASI_FASTER_WHISPER_MODEL", "small.en").strip() or "small.en"
TRANSCRIPT_GATE_DEVICE = os.environ.get("YASI_FASTER_WHISPER_DEVICE", "cpu").strip() or "cpu"
TRANSCRIPT_GATE_COMPUTE_TYPE = os.environ.get(
    "YASI_FASTER_WHISPER_COMPUTE_TYPE",
    "int8" if TRANSCRIPT_GATE_DEVICE == "cpu" else "float16",
).strip() or ("int8" if TRANSCRIPT_GATE_DEVICE == "cpu" else "float16")


def clamp_score(value: float) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(10.0, round(numeric, 1)))


def ensure_nltk_resources() -> None:
    import nltk

    required = {
        "taggers/averaged_perceptron_tagger_eng": "averaged_perceptron_tagger_eng",
        "taggers/averaged_perceptron_tagger": "averaged_perceptron_tagger",
        "corpora/cmudict": "cmudict",
        "tokenizers/punkt": "punkt",
    }
    for resource_path, package_name in required.items():
        try:
            nltk.data.find(resource_path)
        except LookupError:
            nltk.download(package_name, quiet=True)


def get_charsiu_repo() -> Path:
    repo = Path(os.environ.get("YASI_CHARSIU_REPO", DEFAULT_CHARSIU_REPO)).expanduser().resolve()
    if not repo.exists():
        raise PipelineError(f"Set YASI_CHARSIU_REPO before enabling the Charsiu backend. Missing: {repo}")
    src_dir = repo / "src"
    if not src_dir.exists():
        raise PipelineError(f"YASI_CHARSIU_REPO is missing src/: {repo}")
    return repo


def _has_cached_hf_repo(repo_id: str) -> bool:
    repo_dir = HF_CACHE_ROOT / "hub" / f"models--{repo_id.replace('/', '--')}"
    snapshots_dir = repo_dir / "snapshots"
    return snapshots_dir.exists() and any(snapshots_dir.iterdir())


def _resolve_hf_snapshot(repo_id: str) -> Path | None:
    repo_dir = HF_CACHE_ROOT / "hub" / f"models--{repo_id.replace('/', '--')}"
    refs_main = repo_dir / "refs" / "main"
    snapshots_dir = repo_dir / "snapshots"
    if refs_main.exists():
        snapshot_dir = snapshots_dir / refs_main.read_text().strip()
        if snapshot_dir.exists():
            return snapshot_dir
    if snapshots_dir.exists():
        snapshots = sorted(path for path in snapshots_dir.iterdir() if path.is_dir())
        if snapshots:
            return snapshots[-1]
    return None


def _whisper_repo_id() -> str:
    if "/" in TRANSCRIPT_GATE_MODEL:
        return TRANSCRIPT_GATE_MODEL
    return f"Systran/faster-whisper-{TRANSCRIPT_GATE_MODEL}"


def maybe_enable_offline_mode() -> None:
    whisper_cache_ready = _has_cached_hf_repo(_whisper_repo_id())
    should_force_offline = (not TRANSCRIPT_GATE_ENABLED) or whisper_cache_ready
    if _has_cached_hf_repo("charsiu/en_w2v2_fc_10ms") and _has_cached_hf_repo("charsiu/tokenizer_en_cmu") and should_force_offline:
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
        tokenizer_snapshot = _resolve_hf_snapshot("charsiu/tokenizer_en_cmu")
        aligner_snapshot = _resolve_hf_snapshot("charsiu/en_w2v2_fc_10ms")
        if tokenizer_snapshot is not None:
            os.environ.setdefault("YASI_CHARSIU_TOKENIZER_PATH", str(tokenizer_snapshot))
        if aligner_snapshot is not None:
            os.environ.setdefault("YASI_CHARSIU_ALIGNER", str(aligner_snapshot))


def get_runtime() -> Runtime:
    global _RUNTIME_CACHE
    if _RUNTIME_CACHE is not None:
        return _RUNTIME_CACHE

    with _RUNTIME_LOCK:
        if _RUNTIME_CACHE is not None:
            return _RUNTIME_CACHE

        repo = get_charsiu_repo()
        src_dir = repo / "src"
        if str(src_dir) not in sys.path:
            sys.path.insert(0, str(src_dir))

        maybe_enable_offline_mode()
        ensure_nltk_resources()

        import numpy as np  # noqa: WPS433
        import torch  # noqa: WPS433
        from Charsiu import charsiu_forced_aligner  # type: ignore # noqa: WPS433
        from utils import forced_align, seq2duration  # type: ignore # noqa: WPS433

        aligner = charsiu_forced_aligner(aligner=os.environ.get("YASI_CHARSIU_ALIGNER", ALIGNER_MODEL))
        _RUNTIME_CACHE = Runtime(
            torch=torch,
            np=np,
            forced_align=forced_align,
            seq2duration=seq2duration,
            aligner=aligner,
        )
    return _RUNTIME_CACHE


def healthcheck() -> dict[str, Any]:
    started_at = time.perf_counter()
    runtime = get_runtime()
    elapsed_ms = round((time.perf_counter() - started_at) * 1000)
    return {
        "status": "ready",
        "engine": "charsiu",
        "engine_version": ENGINE_VERSION,
        "details": {
            "aligner": ALIGNER_MODEL,
            "device": runtime.aligner.device,
            "init_ms": elapsed_ms,
            "transcript_gate_enabled": TRANSCRIPT_GATE_ENABLED,
            "transcript_gate_model": TRANSCRIPT_GATE_MODEL,
            "transcript_gate_available": find_spec("faster_whisper") is not None,
        },
    }


def _flatten_phone_groups(phone_groups: list[tuple[str, ...]]) -> list[str]:
    return [phone for group in phone_groups for phone in group]


def _normalized_phone_id(processor: Any, phone: str) -> int:
    return processor.mapping_phone2id(re.sub(r"\d", "", phone))


def _duration_score(duration: float, median_duration: float) -> float:
    baseline = max(median_duration, 0.08)
    ratio = duration / baseline
    if ratio < 0.35:
        return 2.5
    if ratio < 0.55:
        return 4.8
    if ratio > 2.7:
        return 5.6
    penalty = min(abs(1.0 - ratio) * 4.0, 2.4)
    return clamp_score(8.8 - penalty)


def _is_content_word(word: str) -> bool:
    return word.lower() not in FUNCTION_WORDS


def _get_scoring_profile(elo_rating: float | int | None) -> ListeningScoringProfile:
    numeric_elo = 0 if elo_rating is None else float(elo_rating)
    if numeric_elo < 1000:
        return ListeningScoringProfile(
            content_weight=0.58,
            rhythm_weight=0.20,
            pronunciation_weight=0.22,
            correct_threshold=8.0,
            weak_threshold=6.0,
            low_content_cap_threshold=4.5,
            low_content_cap=5.5,
            mid_content_cap_threshold=None,
            mid_content_cap=None,
            low_rhythm_cap_threshold=None,
            low_rhythm_cap=None,
            recall_threshold=0.75,
            precision_threshold=0.72,
            recall_precision_content_cap=6.8,
            recall_precision_total_cap=6.8,
            pronunciation_cap_threshold=4.5,
            pronunciation_cap=5.8,
        )
    if numeric_elo < 1800:
        return ListeningScoringProfile(
            content_weight=0.42,
            rhythm_weight=0.23,
            pronunciation_weight=0.35,
            correct_threshold=8.3,
            weak_threshold=6.3,
            low_content_cap_threshold=4.5,
            low_content_cap=5.5,
            mid_content_cap_threshold=6.0,
            mid_content_cap=7.0,
            low_rhythm_cap_threshold=None,
            low_rhythm_cap=None,
            recall_threshold=0.80,
            precision_threshold=0.78,
            recall_precision_content_cap=6.5,
            recall_precision_total_cap=6.4,
            pronunciation_cap_threshold=5.8,
            pronunciation_cap=6.8,
        )
    return ListeningScoringProfile(
        content_weight=0.30,
        rhythm_weight=0.25,
        pronunciation_weight=0.45,
        correct_threshold=8.6,
        weak_threshold=6.6,
        low_content_cap_threshold=6.0,
        low_content_cap=6.5,
        mid_content_cap_threshold=None,
        mid_content_cap=None,
        low_rhythm_cap_threshold=6.0,
        low_rhythm_cap=7.0,
        recall_threshold=0.86,
        precision_threshold=0.84,
        recall_precision_content_cap=6.2,
        recall_precision_total_cap=6.0,
        pronunciation_cap_threshold=6.6,
        pronunciation_cap=6.2,
    )


def _status_for_score(score: float, profile: ListeningScoringProfile) -> str:
    if score >= profile.correct_threshold:
        return "correct"
    if score >= profile.weak_threshold:
        return "weak"
    return "mispronounced"


def _reference_cache_key(reference_text: str) -> str:
    normalized = re.sub(r"\s+", " ", reference_text.strip().lower())
    return normalized


def _tokenize_transcript_text(text: str) -> list[str]:
    normalized = re.sub(r"[^a-z0-9'\s]", " ", (text or "").lower())
    return [part for part in normalized.split() if part]


def _token_match_ratio(reference_token: str, spoken_token: str) -> float:
    if reference_token == spoken_token:
        return 1.0
    return SequenceMatcher(None, reference_token, spoken_token).ratio()


def _tokens_match(reference_token: str, spoken_token: str, *, is_content_word: bool) -> bool:
    if reference_token == spoken_token:
        return True
    threshold = 0.92 if is_content_word else 0.84
    return _token_match_ratio(reference_token, spoken_token) >= threshold


def _greedy_reference_matches(reference_tokens: list[str], spoken_tokens: list[str]) -> list[int]:
    matches: list[int] = []
    spoken_cursor = 0
    for reference_token in reference_tokens:
        is_content_word = _is_content_word(reference_token)
        matched_index = -1
        for candidate_index in range(spoken_cursor, min(len(spoken_tokens), spoken_cursor + 4)):
            if _tokens_match(reference_token, spoken_tokens[candidate_index], is_content_word=is_content_word):
                matched_index = candidate_index
                break
        matches.append(matched_index)
        if matched_index >= 0:
            spoken_cursor = matched_index + 1
    return matches


def _compute_transcript_match_details(reference_text: str, transcript: str) -> dict[str, float]:
    reference_tokens = _tokenize_transcript_text(reference_text)
    spoken_tokens = _tokenize_transcript_text(transcript)
    if not reference_tokens or not spoken_tokens:
        return {
            "score": 0.0,
            "overall_coverage": 0.0,
            "content_coverage": 0.0,
            "content_recall": 0.0,
            "content_precision": 0.0,
            "contiguous_ratio": 0.0,
            "tail_content_coverage": 0.0,
            "content_substitution_count": 0.0,
        }

    matches = _greedy_reference_matches(reference_tokens, spoken_tokens)
    matched_tokens = [index for index in matches if index >= 0]
    overall_coverage = len(matched_tokens) / len(reference_tokens)

    content_indexes = [index for index, token in enumerate(reference_tokens) if _is_content_word(token)]
    if not content_indexes:
        content_coverage = overall_coverage
        content_recall = overall_coverage
    else:
        matched_content = sum(1 for index in content_indexes if matches[index] >= 0)
        content_coverage = matched_content / len(content_indexes)
        content_recall = content_coverage

    spoken_content_count = sum(1 for token in spoken_tokens if _is_content_word(token))
    matched_content_count = sum(1 for index in content_indexes if matches[index] >= 0)
    if spoken_content_count <= 0:
        content_precision = 0.0
    else:
        content_precision = matched_content_count / spoken_content_count

    longest_contiguous_run = 0
    current_run = 0
    previous_spoken_index = -2
    for spoken_index in matches:
        if spoken_index >= 0 and spoken_index == previous_spoken_index + 1:
            current_run += 1
        elif spoken_index >= 0:
            current_run = 1
        else:
            current_run = 0
        longest_contiguous_run = max(longest_contiguous_run, current_run)
        previous_spoken_index = spoken_index

    order_ratio = SequenceMatcher(None, reference_tokens, spoken_tokens).ratio()
    contiguous_ratio = longest_contiguous_run / max(len(reference_tokens), 1)
    tail_indexes = content_indexes[-3:] if content_indexes else list(range(max(0, len(reference_tokens) - 3), len(reference_tokens)))
    if tail_indexes:
        tail_matched = sum(1 for index in tail_indexes if matches[index] >= 0)
        tail_content_coverage = tail_matched / len(tail_indexes)
    else:
        tail_content_coverage = 0.0

    substitution_count = 0
    spoken_cursor = 0
    for index, reference_token in enumerate(reference_tokens):
        if matches[index] >= 0:
            spoken_cursor = matches[index] + 1
            continue
        if not _is_content_word(reference_token):
            continue
        candidate_indexes = range(spoken_cursor, min(len(spoken_tokens), spoken_cursor + 4))
        has_candidate_substitution = False
        for candidate_index in candidate_indexes:
            candidate_token = spoken_tokens[candidate_index]
            if not _is_content_word(candidate_token):
                continue
            if candidate_token == reference_token:
                continue
            ratio = _token_match_ratio(reference_token, candidate_token)
            if ratio >= 0.45:
                has_candidate_substitution = True
                break
        if has_candidate_substitution:
            substitution_count += 1

    score = (
        (content_recall * 0.40)
        + (content_precision * 0.20)
        + (overall_coverage * 0.30)
        + (order_ratio * 0.15)
        + (contiguous_ratio * 0.10)
        - min(0.18, substitution_count * 0.06)
    )
    return {
        "score": max(0.0, min(1.0, round(score, 3))),
        "overall_coverage": max(0.0, min(1.0, round(overall_coverage, 3))),
        "content_coverage": max(0.0, min(1.0, round(content_coverage, 3))),
        "content_recall": max(0.0, min(1.0, round(content_recall, 3))),
        "content_precision": max(0.0, min(1.0, round(content_precision, 3))),
        "contiguous_ratio": max(0.0, min(1.0, round(contiguous_ratio, 3))),
        "tail_content_coverage": max(0.0, min(1.0, round(tail_content_coverage, 3))),
        "content_substitution_count": float(substitution_count),
    }


def _compute_transcript_match_score(reference_text: str, transcript: str) -> float:
    return _compute_transcript_match_details(reference_text, transcript)["score"]


def get_whisper_runtime() -> WhisperRuntime:
    global _WHISPER_RUNTIME_CACHE
    if _WHISPER_RUNTIME_CACHE is not None:
        return _WHISPER_RUNTIME_CACHE

    with _WHISPER_RUNTIME_LOCK:
        if _WHISPER_RUNTIME_CACHE is not None:
            return _WHISPER_RUNTIME_CACHE

        if not _has_cached_hf_repo(_whisper_repo_id()):
            os.environ["HF_HUB_OFFLINE"] = "0"
            os.environ["TRANSFORMERS_OFFLINE"] = "0"

        try:
            from faster_whisper import WhisperModel  # type: ignore # noqa: WPS433
        except ImportError as exc:  # pragma: no cover - exercised via runtime fallback
            raise PipelineError("Install faster-whisper to enable transcript gating.") from exc

        model = WhisperModel(
            TRANSCRIPT_GATE_MODEL,
            device=TRANSCRIPT_GATE_DEVICE,
            compute_type=TRANSCRIPT_GATE_COMPUTE_TYPE,
        )
        _WHISPER_RUNTIME_CACHE = WhisperRuntime(model=model)
    return _WHISPER_RUNTIME_CACHE


def _transcribe_audio_for_gate(audio_path: Path) -> tuple[str, str | None]:
    if not TRANSCRIPT_GATE_ENABLED:
        return "", "disabled"

    try:
        runtime = get_whisper_runtime()
    except Exception as exc:  # pragma: no cover - depends on local runtime
        return "", str(exc)

    segments, _info = runtime.model.transcribe(
        str(audio_path),
        language="en",
        beam_size=1,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    transcript = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
    return transcript, None


@lru_cache(maxsize=512)
def _build_reference_descriptor(reference_text: str) -> ReferenceDescriptor:
    runtime = get_runtime()
    processor = runtime.aligner.charsiu_processor
    phone_groups, reference_words = processor.get_phones_and_words(reference_text)
    if not reference_words:
        raise PipelineError("Reference text did not produce any alignable words.")

    phone_ids = tuple(processor.get_phone_ids(phone_groups))
    flat_phones = tuple(_flatten_phone_groups(phone_groups))
    normalized_phone_ids = tuple(_normalized_phone_id(processor, phone) for phone in flat_phones)

    word_phone_ranges: list[tuple[int, int]] = []
    stressed_phone_offsets: list[tuple[int, ...]] = []
    phone_cursor = 0
    for group in phone_groups:
        next_cursor = phone_cursor + len(group)
        word_phone_ranges.append((phone_cursor, next_cursor))
        stressed_phone_offsets.append(tuple(
            local_offset
            for local_offset, phone in enumerate(group)
            if any(char.isdigit() for char in phone)
        ))
        phone_cursor = next_cursor

    return ReferenceDescriptor(
        phone_groups=tuple(tuple(group) for group in phone_groups),
        reference_words=tuple(reference_words),
        phone_ids=phone_ids,
        flat_phones=flat_phones,
        normalized_phone_ids=normalized_phone_ids,
        word_phone_ranges=tuple(word_phone_ranges),
        stressed_phone_offsets=tuple(stressed_phone_offsets),
    )


def _combine_word_score(*, confidence_score: float, coverage_score: float, duration_score: float) -> float:
    return clamp_score((confidence_score * 0.7) + (coverage_score * 0.2) + (duration_score * 0.1))


def _combine_total_score(*, accuracy: float, completeness: float, fluency: float, prosody: float) -> float:
    return clamp_score((accuracy * 0.6) + (completeness * 0.15) + (fluency * 0.15) + (prosody * 0.10))


def _word_realization_ratio(duration: float, median_duration: float) -> float:
    threshold = max(median_duration * 0.45, 0.06)
    if threshold <= 0:
        return 0.0
    ratio = max(0.0, min(1.0, duration / threshold))
    return ratio ** 1.35


def _median_duration(word_evidence: list[dict[str, float | bool]]) -> float:
    durations = [float(item["duration"]) for item in word_evidence if float(item["duration"]) > 0]
    if not durations:
        return 0.18
    return float(median(durations))


def _realized_coverage_values(word_evidence: list[dict[str, float | bool]]) -> list[float]:
    median_duration = _median_duration(word_evidence)
    return [
        float(item["coverage"]) * _word_realization_ratio(float(item["duration"]), median_duration)
        for item in word_evidence
    ]


def _combine_content_reproduction(word_evidence: list[dict[str, float | bool]]) -> float:
    if not word_evidence:
        return 0.0

    realized_coverage_values = _realized_coverage_values(word_evidence)

    weighted_coverage_numerator = 0.0
    weighted_coverage_denominator = 0.0
    longest_contiguous_run = 0
    contiguous_hits = 0

    for item, realized_coverage in zip(word_evidence, realized_coverage_values):
        is_content_word = bool(item["is_content_word"])
        word_weight = 1.0 if is_content_word else 0.45
        weighted_coverage_numerator += realized_coverage * word_weight
        weighted_coverage_denominator += word_weight
        if realized_coverage >= 0.58:
            contiguous_hits += 1
            longest_contiguous_run = max(longest_contiguous_run, contiguous_hits)
        else:
            contiguous_hits = 0

    weighted_coverage = weighted_coverage_numerator / max(weighted_coverage_denominator, 0.01)
    contiguous_run_ratio = longest_contiguous_run / max(len(word_evidence), 1)
    return clamp_score((weighted_coverage * 10.0 * 0.76) + (contiguous_run_ratio * 10.0 * 0.24))


def _apply_content_guardrails(
    *,
    content_reproduction: float,
    profile: ListeningScoringProfile,
    transcript_match_score: float | None = None,
    tail_content_coverage: float | None = None,
    content_recall: float | None = None,
    content_precision: float | None = None,
    content_substitution_count: float | None = None,
    mispronounced_ratio: float | None = None,
) -> float:
    adjusted_content = content_reproduction

    if transcript_match_score is not None:
        if transcript_match_score < 0.20:
            adjusted_content = min(adjusted_content, 4.0)
        elif transcript_match_score < 0.35:
            adjusted_content = min(adjusted_content, 4.8)
        elif transcript_match_score < 0.50:
            adjusted_content = min(adjusted_content, 5.5)

    if tail_content_coverage is not None:
        if tail_content_coverage < 0.34:
            adjusted_content = min(adjusted_content, 5.8)

    if content_substitution_count is not None and content_substitution_count >= 2:
        adjusted_content = min(adjusted_content, 7.0)

    if (
        content_recall is not None
        and content_precision is not None
        and (content_recall < profile.recall_threshold or content_precision < profile.precision_threshold)
    ):
        adjusted_content = min(adjusted_content, profile.recall_precision_content_cap)

    return clamp_score(adjusted_content)


def _combine_listening_total_score(
    *,
    content_reproduction: float,
    rhythm_fluency: float,
    pronunciation_clarity: float,
    profile: ListeningScoringProfile,
    transcript_match_score: float | None = None,
    tail_content_coverage: float | None = None,
    content_recall: float | None = None,
    content_precision: float | None = None,
    content_substitution_count: float | None = None,
    mispronounced_ratio: float | None = None,
) -> float:
    adjusted_content = _apply_content_guardrails(
        content_reproduction=content_reproduction,
        profile=profile,
        transcript_match_score=transcript_match_score,
        tail_content_coverage=tail_content_coverage,
        content_recall=content_recall,
        content_precision=content_precision,
        content_substitution_count=content_substitution_count,
        mispronounced_ratio=mispronounced_ratio,
    )
    total = (
        (adjusted_content * profile.content_weight)
        + (rhythm_fluency * profile.rhythm_weight)
        + (pronunciation_clarity * profile.pronunciation_weight)
    )

    if adjusted_content < profile.low_content_cap_threshold:
        total = min(total, profile.low_content_cap)

    if profile.mid_content_cap_threshold is not None and profile.mid_content_cap is not None:
        if adjusted_content < profile.mid_content_cap_threshold:
            total = min(total, profile.mid_content_cap)

    if profile.low_rhythm_cap_threshold is not None and profile.low_rhythm_cap is not None:
        if rhythm_fluency < profile.low_rhythm_cap_threshold:
            total = min(total, profile.low_rhythm_cap)

    if pronunciation_clarity < profile.pronunciation_cap_threshold:
        total = min(total, profile.pronunciation_cap)

    if mispronounced_ratio is not None:
        if mispronounced_ratio >= 0.60:
            total = min(total, 5.4)
        elif mispronounced_ratio >= 0.45:
            total = min(total, 6.0)

    if transcript_match_score is not None:
        if transcript_match_score < 0.20:
            total = min(total, 4.5)
        elif transcript_match_score < 0.35:
            total = min(total, 5.0)
        elif transcript_match_score < 0.50:
            total = min(total, 5.5)

    if tail_content_coverage is not None:
        if tail_content_coverage < 0.34:
            total = min(total, 6.5)

    if content_substitution_count is not None and content_substitution_count >= 3:
        total = min(total, 6.5)

    if (
        content_recall is not None
        and content_precision is not None
        and (content_recall < profile.recall_threshold or content_precision < profile.precision_threshold)
    ):
        total = min(total, profile.recall_precision_total_cap)

    return clamp_score(total)


def score_request(request: dict[str, Any]) -> dict[str, Any]:
    runtime = get_runtime()
    aligner = runtime.aligner
    processor = aligner.charsiu_processor
    audio_path = Path(request["audio_path"]).expanduser().resolve()
    reference_text = str(request["reference_text"]).strip()
    if not reference_text:
        raise PipelineError("Missing reference_text for Charsiu scoring.")
    if not audio_path.exists():
        raise PipelineError(f"Missing audio file for Charsiu scoring: {audio_path}")
    profile = _get_scoring_profile(request.get("elo_rating"))

    reference = _build_reference_descriptor(_reference_cache_key(reference_text))

    audio = processor.audio_preprocess(str(audio_path), sr=aligner.sr)
    audio_tensor = runtime.torch.Tensor(audio).unsqueeze(0).to(aligner.device)
    with runtime.torch.no_grad():
        output = aligner.aligner(audio_tensor)
    cost = runtime.torch.softmax(output.logits, dim=-1).detach().cpu().numpy().squeeze()
    sil_mask = aligner._get_sil_mask(cost)
    nonsil_idx = runtime.np.argwhere(sil_mask != processor.sil_idx).reshape(-1)
    if nonsil_idx.size == 0:
        raise PipelineError("No speech detected. Try speaking closer to the microphone.")

    aligned_phone_positions = runtime.forced_align(cost[nonsil_idx, :], reference.phone_ids[1:-1])
    aligned_phone_symbols = [processor.mapping_id2phone(reference.phone_ids[1:-1][index]) for index in aligned_phone_positions]
    predicted_phone_sequence = aligner._merge_silence(aligned_phone_symbols, sil_mask)
    predicted_phones = runtime.seq2duration(predicted_phone_sequence, resolution=aligner.resolution)
    predicted_words = processor.align_words(predicted_phones, list(reference.phone_groups), list(reference.reference_words))

    frame_phone_scores = [
        float(cost[nonsil_idx[frame_index], reference.normalized_phone_ids[phone_index]])
        for frame_index, phone_index in enumerate(aligned_phone_positions)
    ]

    aligned_word_spans = [entry for entry in predicted_words if entry[2] != "[SIL]"]
    word_durations = [max(0.0, end - start) for start, end, _ in aligned_word_spans]
    median_duration = float(runtime.np.median(word_durations)) if word_durations else 0.14

    word_results: list[dict[str, Any]] = []
    content_evidence: list[dict[str, float | bool]] = []

    for word_index, reference_word in enumerate(reference.reference_words):
        start_phone, end_phone = reference.word_phone_ranges[word_index]
        matched_frame_indexes = [
            frame_index
            for frame_index, phone_index in enumerate(aligned_phone_positions)
            if start_phone <= phone_index < end_phone
        ]
        unique_phone_hits = {
            aligned_phone_positions[frame_index]
            for frame_index in matched_frame_indexes
        }
        coverage = len(unique_phone_hits) / max(1, end_phone - start_phone)

        confidence = (
            sum(frame_phone_scores[frame_index] for frame_index in matched_frame_indexes) / len(matched_frame_indexes)
            if matched_frame_indexes
            else 0.0
        )
        confidence_score = clamp_score(confidence * 10.0)
        coverage_score = clamp_score(coverage * 10.0)

        duration = word_durations[word_index] if word_index < len(word_durations) else 0.0
        duration_score = _duration_score(duration, median_duration)

        stressed_phones = reference.stressed_phone_offsets[word_index]
        if stressed_phones:
            stressed_frame_indexes = [
                frame_index
                for frame_index, phone_index in enumerate(aligned_phone_positions)
                if any((start_phone + offset) == phone_index for offset in stressed_phones)
            ]
            stress_confidence = (
                sum(frame_phone_scores[frame_index] for frame_index in stressed_frame_indexes) / len(stressed_frame_indexes)
                if stressed_frame_indexes
                else confidence
            )
            stress_score = clamp_score((stress_confidence * 10.0 * 0.75) + (duration_score * 0.25))
        else:
            stress_score = clamp_score((confidence_score * 0.7) + (duration_score * 0.3))

        word_score = _combine_word_score(
            confidence_score=confidence_score,
            coverage_score=coverage_score,
            duration_score=duration_score,
        )
        status = _status_for_score(word_score, profile)
        if duration < 0.05 or coverage < 0.45:
            status = "mispronounced"
            word_score = min(word_score, 4.9)

        content_evidence.append({
            "coverage": coverage,
            "duration": duration,
            "is_content_word": _is_content_word(reference_word),
        })
        word_results.append({
            "word": reference_word,
            "status": status,
            "score": word_score,
            "accuracy_score": confidence_score,
            "stress_score": stress_score,
        })

    total_duration = predicted_phones[-1][1] if predicted_phones else 0.0
    internal_silence = sum(
        max(0.0, end - start)
        for start, end, token in predicted_words[1:-1]
        if token == "[SIL]"
    )
    silence_ratio = internal_silence / max(total_duration, 0.01)
    mean_word_duration = (sum(word_durations) / len(word_durations)) if word_durations else 0.0
    duration_variance = (
        float(runtime.np.std(word_durations) / mean_word_duration)
        if mean_word_duration > 0 and len(word_durations) > 1
        else 0.0
    )
    words_per_second = len(reference.reference_words) / max(sum(word_durations), 0.01)

    pronunciation_clarity = clamp_score(sum(item["score"] for item in word_results) / len(word_results))
    raw_content_reproduction = _combine_content_reproduction(content_evidence)
    mispronounced_ratio = (
        sum(1 for item in word_results if item["status"] == "mispronounced") / len(word_results)
        if word_results
        else 0.0
    )
    transcript, transcript_error = _transcribe_audio_for_gate(audio_path)
    transcript_match_details = _compute_transcript_match_details(reference_text, transcript) if transcript else None
    transcript_match_score = transcript_match_details["score"] if transcript_match_details else None
    tail_content_coverage = transcript_match_details["tail_content_coverage"] if transcript_match_details else None
    content_recall = transcript_match_details["content_recall"] if transcript_match_details else None
    content_precision = transcript_match_details["content_precision"] if transcript_match_details else None
    content_substitution_count = transcript_match_details["content_substitution_count"] if transcript_match_details else None
    content_reproduction = _apply_content_guardrails(
        content_reproduction=raw_content_reproduction,
        profile=profile,
        transcript_match_score=transcript_match_score,
        tail_content_coverage=tail_content_coverage,
        content_recall=content_recall,
        content_precision=content_precision,
        content_substitution_count=content_substitution_count,
        mispronounced_ratio=mispronounced_ratio,
    )
    realized_coverage_ratio = sum(_realized_coverage_values(content_evidence)) / max(len(content_evidence), 1)
    base_fluency = clamp_score(9.4 - (silence_ratio * 16.0) - (abs(words_per_second - 2.6) * 0.7) - max(0.0, duration_variance - 0.75) * 2.8)
    prosody = clamp_score(7.2 - (silence_ratio * 8.0) - abs(duration_variance - 0.65) * 3.2)
    rhythm_fluency = clamp_score((base_fluency * 0.72) + (prosody * 0.28))
    total = _combine_listening_total_score(
        content_reproduction=content_reproduction,
        rhythm_fluency=rhythm_fluency,
        pronunciation_clarity=pronunciation_clarity,
        profile=profile,
        transcript_match_score=transcript_match_score,
        tail_content_coverage=tail_content_coverage,
        content_recall=content_recall,
        content_precision=content_precision,
        content_substitution_count=content_substitution_count,
        mispronounced_ratio=mispronounced_ratio,
    )

    return {
        "score": total,
        "pronunciation_score": pronunciation_clarity,
        "content_score": content_reproduction,
        "fluency_score": rhythm_fluency,
        "coverage_ratio": max(0.0, min(1.0, realized_coverage_ratio)),
        "transcript": transcript,
        "summary_cn": "",
        "tips_cn": [],
        "word_results": word_results,
        "utterance_scores": {
            "accuracy": pronunciation_clarity,
            "completeness": content_reproduction,
            "fluency": rhythm_fluency,
            "prosody": prosody,
            "content_reproduction": content_reproduction,
            "rhythm_fluency": rhythm_fluency,
            "pronunciation_clarity": pronunciation_clarity,
            "total": total,
        },
        "engine": "charsiu",
        "engine_version": ENGINE_VERSION,
        "debug": {
            "aligner": ALIGNER_MODEL,
            "device": aligner.device,
            "words_per_second": round(words_per_second, 3),
            "silence_ratio": round(silence_ratio, 3),
            "duration_variance": round(duration_variance, 3),
            "elo_rating": request.get("elo_rating"),
            "raw_content_reproduction": raw_content_reproduction,
            "transcript_match_score": transcript_match_score,
            "tail_content_coverage": tail_content_coverage,
            "content_recall": content_recall,
            "content_precision": content_precision,
            "content_substitution_count": content_substitution_count,
            "transcript_gate_error": transcript_error,
            "mispronounced_ratio": round(mispronounced_ratio, 3),
        },
    }
