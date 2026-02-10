const TOKEN_PATTERNS = [
  /[A-Za-z0-9_\-]{24}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /(authorization\s*[:=]\s*)(bearer\s+)?[^\s,;]+/gi,
  /(cookie\s*[:=]\s*)[^\n]+/gi,
  /("?(api[_-]?key|token|secret|password)"?\s*[:=]\s*")([^"]+)(")/gi,
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactText(input, secrets = []) {
  if (input === undefined || input === null) return input;

  let text = String(input);

  for (const secret of secrets) {
    if (!secret) continue;
    const pattern = new RegExp(escapeRegExp(String(secret)), "g");
    text = text.replace(pattern, "[REDACTED]");
  }

  for (const pattern of TOKEN_PATTERNS) {
    text = text.replace(pattern, (...args) => {
      if (pattern === TOKEN_PATTERNS[2] || pattern === TOKEN_PATTERNS[3]) {
        return `${args[1]}[REDACTED]`;
      }
      if (pattern === TOKEN_PATTERNS[4]) {
        return `${args[1]}[REDACTED]${args[4]}`;
      }
      return "[REDACTED]";
    });
  }

  return text;
}

export function collectSecrets(cfg) {
  const values = new Set();

  if (cfg?.discordToken) values.add(cfg.discordToken);
  if (process.env.DISCORD_TOKEN) values.add(process.env.DISCORD_TOKEN);
  if (process.env.OPENAI_API_KEY) values.add(process.env.OPENAI_API_KEY);

  return [...values];
}
