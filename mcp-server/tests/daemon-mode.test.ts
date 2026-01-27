import { test, expect } from "bun:test";
import { runDaemon } from "../src/daemon";

test("runDaemon supports dryRun", () => {
  expect(() => runDaemon({ dryRun: true })).not.toThrow();
});
