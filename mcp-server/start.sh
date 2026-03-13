#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="$SCRIPT_DIR/dist/browser-agent-mcp"
PID_FILE="$SCRIPT_DIR/dist/browser-agent-mcp.pid"
LOG_FILE="$SCRIPT_DIR/dist/browser-agent-mcp.log"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "服务已在运行中 (PID: $PID)"
        exit 1
    fi
    rm -f "$PID_FILE"
fi

if [ ! -f "$BINARY" ]; then
    echo "二进制文件不存在: $BINARY"
    echo "请先运行: bun run build"
    exit 1
fi

mkdir -p "$(dirname "$PID_FILE")"
nohup "$BINARY" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "服务已启动 (PID: $(cat "$PID_FILE"))"
