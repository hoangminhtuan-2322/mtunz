#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install -r requirements.txt
echo 'Mo http://127.0.0.1:8000 | admin / mtunz7 (chi de thu nghiem)'
exec .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8000
