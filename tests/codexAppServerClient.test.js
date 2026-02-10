import test from "node:test";
import assert from "node:assert/strict";

import { parseJsonLine } from "../src/services/codexAppServerClient.js";

test("parseJsonLine parses valid json line", () => {
  const parsed = parseJsonLine('{"id":1,"method":"initialize"}');
  assert.equal(parsed.id, 1);
  assert.equal(parsed.method, "initialize");
});

test("parseJsonLine returns null for non-json lines", () => {
  assert.equal(parseJsonLine(""), null);
  assert.equal(parseJsonLine("hello world"), null);
  assert.equal(parseJsonLine("[1,2,3]"), null);
});

test("parseJsonLine returns null for broken json", () => {
  assert.equal(parseJsonLine('{"id":1,'), null);
});
