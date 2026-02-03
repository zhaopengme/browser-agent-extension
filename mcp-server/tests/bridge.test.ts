import { test, expect } from "bun:test";
import { BridgeStore } from "../src/bridge/store";

test("BridgeStore starts in idle state", () => {
  const store = new BridgeStore();
  expect(store.getState().status).toBe("idle");
  expect(store.isConnected()).toBe(false);
  expect(store.isReady()).toBe(false);
});

test("BridgeStore throws when sending request in idle state", async () => {
  const store = new BridgeStore();
  expect(store.sendRequest({ action: "test" })).rejects.toThrow("Browser extension not connected");
});
