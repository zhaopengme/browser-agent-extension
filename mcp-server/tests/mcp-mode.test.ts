import { test, expect } from "bun:test";
import { buildSpawnArgs } from "../src/mcp";

test("buildSpawnArgs returns --daemon for self spawn", () => {
  const result = buildSpawnArgs({ cmd: "/usr/bin/bun", args: ["/abs/main.ts"] });
  expect(result.args).toContain("--daemon");
});
