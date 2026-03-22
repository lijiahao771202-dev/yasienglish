# Local Pronunciation Service

This folder contains the desktop-only pronunciation sidecar used by `listening` / `shadowing`.

## Runtime shape

- `service.py`: local HTTP service on `127.0.0.1:3132`
- `charsiu_backend.py`: built-in Charsiu forced-alignment backend with rule scoring

The app calls `service.py`. When `YASI_PRONUNCIATION_BACKEND=charsiu`, the service keeps a Charsiu aligner in memory and returns app-ready pronunciation scores.

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
