import { test, expect } from "bun:test";
import { parseMode, resolveSelfCommand } from "../src/entrypoint";

test("resolveSelfCommand uses script path for JS entry", () => {
  const result = resolveSelfCommand("/usr/bin/bun", "/abs/main.ts");
  expect(result.cmd).toBe("/usr/bin/bun");
  expect(result.args).toEqual(["/abs/main.ts"]);
});

test("resolveSelfCommand uses only exec for binary entry", () => {
  const result = resolveSelfCommand("/usr/bin/bun", undefined);
  expect(result.cmd).toBe("/usr/bin/bun");
  expect(result.args).toEqual([]);
});

test("parseMode returns daemon when flag present", () => {
  expect(parseMode(["--daemon"])).toBe("daemon");
});
