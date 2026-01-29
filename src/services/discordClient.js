import { Client, GatewayIntentBits, Partials } from "discord.js";

export function createDiscordClient(cfg) {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ];

  if (cfg.allowedRoleIds?.length) {
    intents.push(GatewayIntentBits.GuildMembers);
  }

  const client = new Client({
    intents,
    partials: [Partials.Channel],
  });

  client.once("ready", () => {
    console.log(`discord connected as ${client.user?.tag || "unknown"}`);
  });

  client.on("shardDisconnect", (event, shardId) => {
    console.warn(`discord shard ${shardId} disconnected`, event?.code);
  });

  client.on("shardReconnecting", (shardId) => {
    console.warn(`discord shard ${shardId} reconnecting`);
  });

  client.on("error", (err) => {
    console.error("discord client error", err);
  });

  return client;
}

export function checkAllowlist(message, cfg) {
  if (!message?.content) return { allowed: false, reason: "empty_content" };
  if (message.author?.bot) return { allowed: false, reason: "bot_message" };
  const ownerIds = Array.isArray(cfg.ownerUserIds) ? cfg.ownerUserIds : [];
  if (ownerIds.length && message.author?.id && ownerIds.includes(message.author.id)) {
    return { allowed: true, reason: "owner" };
  }
  const isDm = message.guildId == null;
  if (isDm && cfg.allowDm === false) {
    return { allowed: false, reason: "dm_disallowed" };
  }
  if (cfg.channelAllowlist?.length) {
    if (!isDm && !cfg.channelAllowlist.includes(message.channelId)) {
      return { allowed: false, reason: "channel_not_allowlisted" };
    }
  }
  if (cfg.allowedUserIds?.length) {
    if (!cfg.allowedUserIds.includes(message.author.id)) {
      return { allowed: false, reason: "user_not_allowlisted" };
    }
  }
  if (!isDm && cfg.allowedRoleIds?.length) {
    const member = message.member;
    const roleIds = member?.roles?.cache ? [...member.roles.cache.keys()] : [];
    if (!roleIds.length) return { allowed: false, reason: "role_unavailable" };
    const hasRole = cfg.allowedRoleIds.some((id) => roleIds.includes(id));
    if (!hasRole) return { allowed: false, reason: "role_not_allowlisted" };
  }
  return { allowed: true };
}
