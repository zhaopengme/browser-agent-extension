import { test, expect } from "bun:test";
import { runMain } from "../src/main";

test("runMain returns daemon when flag present", () => {
  const mode = runMain({ argv: ["--daemon"], dryRun: true });
  expect(mode).toBe("daemon");
});
