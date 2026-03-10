#!/bin/sh
echo "=== START: PORT=${PORT} ==="
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" 2>&1
