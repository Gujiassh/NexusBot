const TOKEN_PATTERNS = [
  /[A-Za-z0-9_\-]{24}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27}/g, // Discord bot token
  /sk-[A-Za-z0-9]{20,}/g, // common API key pattern
];

export function redactText(input, secrets = []) {
  if (!input) return input;
  let text = String(input);

  for (const secret of secrets) {
    if (!secret) continue;
    const value = String(secret);
    if (!value) continue;
    text = text.split(value).join("[REDACTED]");
  }

  for (const pattern of TOKEN_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }

  return text;
}

export function collectSecrets(cfg) {
  const secrets = new Set();
  if (cfg?.discordToken) secrets.add(cfg.discordToken);
  if (process.env.DISCORD_TOKEN) secrets.add(process.env.DISCORD_TOKEN);
  return [...secrets];
}
