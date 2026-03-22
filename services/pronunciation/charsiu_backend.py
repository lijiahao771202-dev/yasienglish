#!/usr/bin/env python3
from __future__ import annotations

import os
import re
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


@dataclass(frozen=True)
class ReferenceDescriptor:
    phone_groups: tuple[tuple[str, ...], ...]
    reference_words: tuple[str, ...]
    phone_ids: tuple[int, ...]
    flat_phones: tuple[str, ...]
    normalized_phone_ids: tuple[int, ...]
    word_phone_ranges: tuple[tuple[int, int], ...]
    stressed_phone_offsets: tuple[tuple[int, ...], ...]


_RUNTIME_CACHE: Runtime | None = None
_RUNTIME_LOCK = threading.Lock()


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


def maybe_enable_offline_mode() -> None:
    if _has_cached_hf_repo("charsiu/en_w2v2_fc_10ms") and _has_cached_hf_repo("charsiu/tokenizer_en_cmu"):
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


def _status_for_score(score: float) -> str:
    if score >= 8.2:
        return "correct"
    if score >= 6.2:
        return "weak"
    return "mispronounced"


def _reference_cache_key(reference_text: str) -> str:
    normalized = re.sub(r"\s+", " ", reference_text.strip().lower())
    return normalized


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
    coverage_values: list[float] = []
    confidence_values: list[float] = []

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
        coverage_values.append(coverage)

        confidence = (
            sum(frame_phone_scores[frame_index] for frame_index in matched_frame_indexes) / len(matched_frame_indexes)
            if matched_frame_indexes
            else 0.0
        )
        confidence_values.append(confidence)
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
        status = _status_for_score(word_score)
        if duration < 0.05 or coverage < 0.45:
            status = "mispronounced"
            word_score = min(word_score, 4.9)

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

    accuracy = clamp_score(sum(item["score"] for item in word_results) / len(word_results))
    completeness = clamp_score((sum(coverage_values) / len(coverage_values)) * 10.0)
    fluency = clamp_score(9.4 - (silence_ratio * 16.0) - (abs(words_per_second - 2.6) * 0.7) - max(0.0, duration_variance - 0.75) * 2.8)
    prosody = clamp_score(7.2 - (silence_ratio * 8.0) - abs(duration_variance - 0.65) * 3.2)
    total = _combine_total_score(
        accuracy=accuracy,
        completeness=completeness,
        fluency=fluency,
        prosody=prosody,
    )

    return {
        "score": total,
        "pronunciation_score": accuracy,
        "content_score": completeness,
        "fluency_score": fluency,
        "coverage_ratio": max(0.0, min(1.0, sum(coverage_values) / len(coverage_values))),
        "transcript": "",
        "summary_cn": "",
        "tips_cn": [],
        "word_results": word_results,
        "utterance_scores": {
            "accuracy": accuracy,
            "completeness": completeness,
            "fluency": fluency,
            "prosody": prosody,
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
        },
    }
