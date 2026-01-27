import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeStartupLog } from "../src/logging";

test("writeStartupLog writes a line to file", () => {
  const dir = mkdtempSync(join(tmpdir(), "browser-agent-"));
  const logFile = join(dir, "browser-agent.log");

  writeStartupLog(logFile, {
    mode: "mcp",
    daemonSocket: "/tmp/test.sock",
  });

  const content = readFileSync(logFile, "utf8");
  expect(content).toContain("mode=mcp");
  expect(content).toContain("daemonSocket=/tmp/test.sock");
});
