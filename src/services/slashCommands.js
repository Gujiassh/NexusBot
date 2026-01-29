import { SlashCommandBuilder } from "discord.js";

const COMMANDS = [
  new SlashCommandBuilder()
    .setName("approvals")
    .setDescription("Codex: approvals"),
  new SlashCommandBuilder()
    .setName("compact")
    .setDescription("Codex: compact"),
  new SlashCommandBuilder()
    .setName("skill")
    .setDescription("Codex: skill"),
  new SlashCommandBuilder()
    .setName("skill-creator")
    .setDescription("Codex: skill-creator"),
  new SlashCommandBuilder()
    .setName("new")
    .setDescription("Codex: new thread"),
  new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Codex: resume thread"),
  new SlashCommandBuilder()
    .setName("fork")
    .setDescription("Codex: fork thread"),
];

const COMMAND_DATA = COMMANDS.map((command) => command.toJSON());

export async function registerSlashCommands(client, cfg) {
  if (!cfg.registerSlashCommands) return { registered: 0, scope: "disabled" };

  try {
    await client.application?.fetch();
  } catch (err) {
    console.warn("slash commands: unable to fetch application", err?.message || err);
  }

  const app = client.application;
  if (!app) {
    console.warn("slash commands: missing application instance");
    return { registered: 0, scope: "missing_app" };
  }

  const guildIds = Array.isArray(cfg.slashGuildIds) ? cfg.slashGuildIds.filter(Boolean) : [];
  if (guildIds.length) {
    let success = 0;
    for (const guildId of guildIds) {
      try {
        const guild = await client.guilds.fetch(guildId);
        await guild.commands.set(COMMAND_DATA);
        success += 1;
      } catch (err) {
        console.warn(
          `slash commands: failed to register for guild ${guildId}`,
          err?.message || err
        );
      }
    }
    return { registered: COMMAND_DATA.length, scope: `guild:${success}` };
  }

  await app.commands.set(COMMAND_DATA);
  return { registered: COMMAND_DATA.length, scope: "global" };
}
