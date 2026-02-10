export async function createDiscordClient(cfg, logger = console) {
  const { Client, GatewayIntentBits, Partials } = await import("discord.js");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.once("clientReady", () => {
    logger?.info?.("discord connected", {
      botTag: client.user?.tag || "unknown",
      botId: client.user?.id || "unknown",
    });
  });

  client.on("shardDisconnect", (event, shardId) => {
    logger?.warn?.("discord shard disconnected", {
      shardId,
      code: event?.code,
      reason: event?.reason,
    });
  });

  client.on("shardReconnecting", (shardId) => {
    logger?.warn?.("discord shard reconnecting", { shardId });
  });

  client.on("error", (error) => {
    logger?.error?.("discord client error", {
      error: error?.message || String(error),
    });
  });

  return client;
}

export function isOwnerUser(userId, cfg) {
  if (!userId || !cfg?.ownerUserId) return false;
  return String(userId) === String(cfg.ownerUserId);
}

export function isDmContext(value) {
  return value?.guildId == null;
}

export function checkMessageAccess(message, cfg) {
  if (!message) return { allowed: false, reason: "missing_message" };
  if (message.author?.bot) return { allowed: false, reason: "bot_message" };
  if (!isOwnerUser(message.author?.id, cfg)) return { allowed: false, reason: "not_owner" };
  if (!isDmContext(message)) return { allowed: false, reason: "not_dm" };
  return { allowed: true, reason: "owner_dm" };
}

export function checkInteractionAccess(interaction, cfg) {
  if (!interaction) return { allowed: false, reason: "missing_interaction" };
  if (!isOwnerUser(interaction.user?.id, cfg)) return { allowed: false, reason: "not_owner" };
  if (!isDmContext(interaction)) return { allowed: false, reason: "not_dm" };
  return { allowed: true, reason: "owner_dm" };
}
