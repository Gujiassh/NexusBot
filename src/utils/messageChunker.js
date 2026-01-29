export function splitDiscordMessage(text, maxLen = 1900) {
  const chunks = [];
  let remaining = text || "";
  while (remaining.length > maxLen) {
    let sliceIndex = remaining.lastIndexOf("\n", maxLen);
    if (sliceIndex < 500) sliceIndex = maxLen;
    chunks.push(remaining.slice(0, sliceIndex));
    remaining = remaining.slice(sliceIndex).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks.length ? chunks : ["(empty response)"];
}
