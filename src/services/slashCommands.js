import { SLASH_COMMAND_DATA } from "../commands/slashCommands.js";

export async function registerSlashCommands(client, cfg, logger = console) {
  if (!cfg.registerSlashCommands) {
    return { registered: 0, scope: "disabled" };
  }

  await client.application?.fetch();
  const app = client.application;
  if (!app) {
    throw new Error("Discord application is unavailable for slash command registration");
  }

  const guildIds = Array.isArray(cfg.slashGuildIds) ? cfg.slashGuildIds.filter(Boolean) : [];
  if (guildIds.length) {
    let success = 0;
    for (const guildId of guildIds) {
      try {
        const guild = await client.guilds.fetch(guildId);
        await guild.commands.set(SLASH_COMMAND_DATA);
        success += 1;
      } catch (error) {
        if (logger?.warn) {
          logger.warn("slash command guild registration failed", {
            guildId,
            error: error?.message || String(error),
          });
        }
      }
    }

    return { registered: SLASH_COMMAND_DATA.length, scope: `guild:${success}` };
  }

  await app.commands.set(SLASH_COMMAND_DATA);
  return { registered: SLASH_COMMAND_DATA.length, scope: "global" };
}
