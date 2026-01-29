export function hasCommandPrefix(content, prefix) {
  if (!content) return false;
  return content.trim().startsWith(prefix);
}

export function extractPrompt(content, prefix) {
  if (!content) return "";
  const trimmed = content.trim();
  if (!trimmed.startsWith(prefix)) return "";
  return trimmed.slice(prefix.length).trim();
}

export function usageMessage(prefix) {
  return [
    `usage: ${prefix} <prompt>`,
    `${prefix} task <prompt>`,
    `${prefix} schedule add <channelId|here> <interval> <message>`,
    `${prefix} schedule list`,
    `${prefix} schedule remove <id>`,
    `${prefix} sessions [n]`,
    `${prefix} session <id|last>`,
    `${prefix} owners`,
    `${prefix} owner add <id>`,
    `${prefix} owner remove <id>`,
  ].join("\n");
}
