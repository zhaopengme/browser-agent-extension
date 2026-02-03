#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="$SCRIPT_DIR/dist/browser-agent-mcp"
PID_FILE="$SCRIPT_DIR/dist/browser-agent-mcp.pid"
LOG_FILE="$SCRIPT_DIR/dist/browser-agent-mcp.log"

start() {
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
}

stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo "PID 文件不存在，服务可能未运行"
        exit 0
    fi

    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        rm -f "$PID_FILE"
        echo "服务已停止 (PID: $PID)"
    else
        rm -f "$PID_FILE"
        echo "进程已不存在，已清理 PID 文件"
    fi
}

case "${1:-}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    *)
        echo "用法: $0 {start|stop}"
        exit 1
        ;;
esac
