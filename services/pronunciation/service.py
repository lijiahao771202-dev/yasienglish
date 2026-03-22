#!/usr/bin/env python3
import base64
import json
import os
import re
import sys
import tempfile
import time
import threading
from difflib import SequenceMatcher
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from charsiu_backend import PipelineError as CharsiuPipelineError
from charsiu_backend import get_runtime as get_charsiu_runtime
from charsiu_backend import healthcheck as charsiu_healthcheck
from charsiu_backend import score_request as score_with_charsiu_request

PORT = int(os.environ.get("YASI_PRONUNCIATION_SERVICE_PORT", "3132"))
BACKEND = os.environ.get("YASI_PRONUNCIATION_BACKEND", "mock").strip().lower() or "mock"
ENGINE_VERSION = os.environ.get("YASI_PRONUNCIATION_ENGINE_VERSION", "charsiu-mock-v1").strip() or "charsiu-mock-v1"


def clamp_score(value):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(10.0, round(numeric, 1)))


def tokenize(text):
    normalized = re.sub(r"[^a-z0-9'\s]", " ", (text or "").lower())
    return [part for part in normalized.split() if part]


def similarity(a, b):
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def score_with_mock(reference_text, transcript):
    effective_transcript = transcript or reference_text
    target_words = tokenize(reference_text)
    spoken_words = tokenize(effective_transcript)
    results = []
    spoken_index = 0

    for target in target_words:
        best_index = -1
        best_ratio = 0.0

        for candidate_index in range(spoken_index, min(spoken_index + 3, len(spoken_words))):
            ratio = similarity(target, spoken_words[candidate_index])
            if ratio > best_ratio:
                best_ratio = ratio
                best_index = candidate_index

        if best_index == -1 or best_ratio < 0.42:
            results.append({
                "word": target,
                "status": "missing",
                "spoken": "",
                "score": 0.0,
            })
            continue

        for extra_index in range(spoken_index, best_index):
            results.append({
                "word": spoken_words[extra_index],
                "status": "inserted",
                "spoken": spoken_words[extra_index],
                "score": 0.0,
            })

        spoken_word = spoken_words[best_index]
        spoken_index = best_index + 1

        if best_ratio >= 0.93:
            status = "correct"
            score = 9.5
        elif best_ratio >= 0.75:
            status = "weak"
            score = 7.3
        else:
            status = "mispronounced"
            score = 4.8

        results.append({
            "word": target,
            "status": status,
            "spoken": spoken_word,
            "score": score,
        })

    for extra_word in spoken_words[spoken_index:]:
        results.append({
            "word": extra_word,
            "status": "inserted",
            "spoken": extra_word,
            "score": 0.0,
        })

    reference_results = [row for row in results if row["status"] != "inserted"]
    pronunciation_score = clamp_score(
        sum(row["score"] for row in reference_results) / max(1, len(reference_results))
    )
    fluency_penalty = len([row for row in results if row["status"] == "inserted"]) * 0.2
    fluency_score = clamp_score(pronunciation_score - fluency_penalty)

    return {
        "transcript": effective_transcript,
        "pronunciation_score": pronunciation_score,
        "fluency_score": fluency_score,
        "word_results": results,
        "engine": "charsiu",
        "engine_version": ENGINE_VERSION,
    }


def maybe_prewarm_charsiu_runtime():
    if BACKEND != "charsiu":
        return

    def _prewarm():
        started_at = time.perf_counter()
        try:
            get_charsiu_runtime()
            elapsed_ms = round((time.perf_counter() - started_at) * 1000)
            sys.stdout.write(f"[pronunciation-service] charsiu runtime warmed in {elapsed_ms}ms\n")
        except Exception as exc:
            sys.stdout.write(f"[pronunciation-service] charsiu runtime prewarm failed: {exc}\n")

    threading.Thread(target=_prewarm, daemon=True).start()


def score_with_charsiu(audio_base64, reference_text):
    try:
        audio_bytes = base64.b64decode(audio_base64, validate=True)
    except Exception as exc:
        raise RuntimeError(f"Invalid audio_base64 payload: {exc}") from exc

    with tempfile.TemporaryDirectory(prefix="yasi-charsiu-audio-") as temp_dir:
        audio_path = Path(temp_dir) / "input.wav"
        audio_path.write_bytes(audio_bytes)
        try:
            payload = score_with_charsiu_request({
                "audio_path": audio_path,
                "reference_text": reference_text,
            })
        except CharsiuPipelineError as exc:
            raise RuntimeError(str(exc)) from exc

    payload.setdefault("engine", "charsiu")
    payload.setdefault("engine_version", ENGINE_VERSION)
    return payload


def health_payload():
    if BACKEND == "mock":
        return {
            "status": "ready",
            "backend": "mock",
            "engine": "charsiu",
            "engine_version": ENGINE_VERSION,
        }

    if BACKEND == "charsiu":
        try:
            payload = charsiu_healthcheck()
            return {
                "status": payload.get("status", "ready"),
                "backend": "charsiu",
                "engine": "charsiu",
                "engine_version": payload.get("engine_version", ENGINE_VERSION),
                **({"details": payload.get("details")} if payload.get("details") else {}),
                **({"error": payload.get("error")} if payload.get("error") else {}),
                "execution_mode": "direct",
            }
        except Exception as exc:
            return {
                "status": "unavailable",
                "backend": "charsiu",
                "engine": "charsiu",
                "engine_version": ENGINE_VERSION,
                "error": str(exc),
                "execution_mode": "direct",
            }

    return {
        "status": "unavailable",
        "backend": BACKEND,
        "engine": "charsiu",
        "engine_version": ENGINE_VERSION,
        "error": f"Unsupported pronunciation backend: {BACKEND}",
    }


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            self._send_json(404, {"error": "Not found"})
            return

        payload = health_payload()
        status_code = 200 if payload["status"] == "ready" else 503
        self._send_json(status_code, payload)

    def do_POST(self):
        if self.path != "/score":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length)
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "Invalid JSON payload."})
            return

        reference_text = (payload.get("reference_text") or "").strip()
        transcript = (payload.get("transcript") or "").strip()
        audio_base64 = payload.get("audio_base64") or ""

        if not reference_text:
            self._send_json(400, {"error": "Missing reference_text."})
            return

        try:
            started_at = time.perf_counter()
            if BACKEND == "mock":
                result = score_with_mock(reference_text, transcript)
            elif BACKEND == "charsiu":
                result = score_with_charsiu(audio_base64, reference_text)
                execution_mode = "direct"
                result.setdefault("debug", {})
                if isinstance(result["debug"], dict):
                    result["debug"]["execution_mode"] = execution_mode
                    result["debug"]["service_elapsed_ms"] = round((time.perf_counter() - started_at) * 1000)
            else:
                raise RuntimeError(f"Unsupported backend: {BACKEND}")
        except Exception as exc:
            self._send_json(503, {"error": str(exc)})
            return

        self._send_json(200, result)

    def log_message(self, format_str, *args):
        sys.stdout.write("[pronunciation-service] " + (format_str % args) + "\n")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[pronunciation-service] backend={BACKEND} port={PORT}", flush=True)
    maybe_prewarm_charsiu_runtime()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
