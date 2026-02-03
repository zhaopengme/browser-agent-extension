import { test, expect } from "bun:test";
import app from "../src/main";

test("server health endpoint returns correct structure", async () => {
  const req = new Request("http://localhost:3026/health");
  const res = await app.fetch(req);
  const data = await res.json();
  expect(data.status).toBe("ok");
  expect(typeof data.extensionConnected).toBe("boolean");
  expect(["idle", "ready", "busy"]).toContain(data.state);
});
