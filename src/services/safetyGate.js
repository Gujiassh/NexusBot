const RISK_RULES = [
  { pattern: /\brm\b.*\b-rf\b/i, reason: "dangerous delete" },
  { pattern: /\bmkfs\b|\bformat\b/i, reason: "disk format" },
  { pattern: /\bdd\b.*\bof=\/dev\//i, reason: "raw disk write" },
  { pattern: /\bshutdown\b|\breboot\b|\bpoweroff\b/i, reason: "system power control" },
  { pattern: /\buseradd\b|\buserdel\b|\bpasswd\b/i, reason: "account change" },
  { pattern: /\bchmod\b.*\b777\b/i, reason: "permission change" },
  { pattern: /\bsudo\b/i, reason: "privilege escalation" },
  { pattern: /\biptables\b|\bufw\b/i, reason: "firewall change" },
  { pattern: /\bssh\b|\bscp\b|\brsync\b/i, reason: "remote access" },
  { pattern: /\btoken\b|\bpassword\b|\bsecret\b|\bapi key\b/i, reason: "secret access" },
  { pattern: /id_rsa|authorized_keys|\.ssh\b/i, reason: "ssh keys" },
  { pattern: /\.aws\b|aws_secret|aws_access/i, reason: "cloud credentials" },
  { pattern: /\.gnupg\b|gpg/i, reason: "crypto keys" },
  { pattern: /\/etc\/passwd|\/etc\/shadow/i, reason: "system credentials" },
  { pattern: /\/proc\/|\/sys\//i, reason: "system internals" },
  { pattern: /history\.jsonl|history/i, reason: "history access" },
  { pattern: /auth\.json|\.codex\/auth/i, reason: "auth tokens" },
  { pattern: /curl\b.*(webhook|paste|upload)|wget\b.*(upload|paste)/i, reason: "exfiltration" },
];

export function assessRisk(prompt) {
  const text = String(prompt || "");
  const reasons = [];
  for (const rule of RISK_RULES) {
    if (rule.pattern.test(text)) reasons.push(rule.reason);
  }
  if (!text.trim()) return { level: "safe", reasons: [] };
  if (reasons.length) return { level: "high", reasons };
  return { level: "safe", reasons: [] };
}
