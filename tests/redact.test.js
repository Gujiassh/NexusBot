import test from "node:test";
import assert from "node:assert/strict";

import { collectSecrets, redactText } from "../src/utils/redact.js";

test("redactText replaces explicit secrets", () => {
  const input = "token=super-secret-value";
  const output = redactText(input, ["super-secret-value"]);
  assert.equal(output, "token=[REDACTED]");
});

test("redactText replaces Discord token pattern", () => {
  const token = "AAAAAAAAAAAAAAAAAAAAAAAA.BBBBBB.CCCCCCCCCCCCCCCCCCCCCCCCCCC";
  const input = `bot ${token}`;
  const output = redactText(input, []);
  assert.equal(output, "bot [REDACTED]");
});

test("redactText replaces authorization and cookie values", () => {
  const input = "Authorization: Bearer abc123\nCookie: sid=xyz";
  const output = redactText(input, []);
  assert.match(output, /Authorization: \[REDACTED\]/i);
  assert.match(output, /Cookie: \[REDACTED\]/i);
});

test("collectSecrets includes config and env tokens", () => {
  const originalDiscord = process.env.DISCORD_TOKEN;
  const originalOpenai = process.env.OPENAI_API_KEY;
  process.env.DISCORD_TOKEN = "env-token";
  process.env.OPENAI_API_KEY = "sk-test-12345678901234567890";

  const secrets = collectSecrets({ discordToken: "cfg-token" });

  process.env.DISCORD_TOKEN = originalDiscord;
  process.env.OPENAI_API_KEY = originalOpenai;

  assert.ok(secrets.includes("cfg-token"));
  assert.ok(secrets.includes("env-token"));
  assert.ok(secrets.includes("sk-test-12345678901234567890"));
});
