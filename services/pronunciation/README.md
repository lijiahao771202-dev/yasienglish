# Local Pronunciation Service

This folder contains the desktop-only pronunciation sidecar used by `listening` / `shadowing`.

## Runtime shape

- `service.py`: local HTTP service on `127.0.0.1:3132`
- `charsiu_backend.py`: built-in Charsiu forced-alignment backend with rule scoring

The app calls `service.py`. When `YASI_PRONUNCIATION_BACKEND=charsiu`, the service keeps a Charsiu aligner in memory and returns app-ready pronunciation scores.

The service can also run an optional transcript gate with `faster-whisper` to detect unrelated speech. This keeps `charsiu` responsible for pronunciation / rhythm while the transcript gate limits scores when the spoken content does not actually resemble the reference sentence.

## Quick start

1. Create a Python runtime:

```bash
python3 -m venv services/pronunciation/.venv-pronunciation
source services/pronunciation/.venv-pronunciation/bin/activate
python -m pip install --upgrade pip
python -m pip install -r services/pronunciation/requirements.txt
```

2. Clone the official Charsiu repo once:

```bash
git clone https://github.com/lingjzhu/charsiu .cache/charsiu
```

3. Launch the desktop app with:

```bash
YASI_PRONUNCIATION_BACKEND=charsiu
YASI_PRONUNCIATION_PYTHON=/abs/path/to/yasi/services/pronunciation/.venv-pronunciation/bin/python
YASI_CHARSIU_REPO=/abs/path/to/yasi/.cache/charsiu
HF_HUB_DISABLE_XET=1
```

The first startup downloads the Charsiu aligner weights from Hugging Face and NLTK resources. After that, the service reuses the loaded runtime in memory.

Optional transcript gate tuning:

```bash
YASI_ENABLE_TRANSCRIPT_GATE=1
YASI_FASTER_WHISPER_MODEL=small.en
YASI_FASTER_WHISPER_DEVICE=cpu
YASI_FASTER_WHISPER_COMPUTE_TYPE=int8
```

## HTTP contract

`POST /score`

```json
{
  "audio_base64": "...",
  "reference_text": "The market opens before sunrise."
}
```

Response:

```json
{
  "score": 7.8,
  "pronunciation_score": 7.9,
  "content_score": 8.0,
  "fluency_score": 7.1,
  "coverage_ratio": 0.92,
  "word_results": [
    {
      "word": "market",
      "status": "weak",
      "score": 6.8,
      "accuracy_score": 6.5,
      "stress_score": 7.0
    }
  ],
  "utterance_scores": {
    "accuracy": 7.9,
    "completeness": 8.0,
    "fluency": 7.1,
    "prosody": 6.9,
    "total": 7.8
  },
  "engine": "charsiu",
  "engine_version": "charsiu-en_w2v2_fc_10ms"
}
```

## Scoring model

This backend does **not** use GOPT. It uses:

- Charsiu forced alignment
- per-phone alignment confidence
- per-word coverage
- pause and duration heuristics

The service then builds:

- word-level `score / accuracy_score / stress_score`
- utterance-level `accuracy / completeness / fluency / prosody / total`

These are rule-based scores derived from the alignment output, not GOPT inference.

## Guardrails

The listening scorer now uses two guardrail layers:

- `charsiu` scoring profiles still change by Elo band
- a transcript gate can cap content / total scores when the recognized utterance is unrelated to the reference
- additional total-score caps prevent low-band attempts with very weak pronunciation from earning overly generous scores
