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

test("collectSecrets includes DISCORD_TOKEN env", () => {
  const original = process.env.DISCORD_TOKEN;
  process.env.DISCORD_TOKEN = "env-token";
  const secrets = collectSecrets({ discordToken: "cfg-token" });
  process.env.DISCORD_TOKEN = original;
  assert.ok(secrets.includes("cfg-token"));
  assert.ok(secrets.includes("env-token"));
});
