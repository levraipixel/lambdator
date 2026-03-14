/**
 * Registers (or updates) the bot's slash commands with Discord.
 *
 * Usage:
 *   DISCORD_APP_ID=<app_id> DISCORD_BOT_TOKEN=<token> node scripts/register-commands.mjs
 *
 * This performs a full PUT (bulk overwrite) so all listed commands become the
 * authoritative set. Propagation can take up to one hour globally.
 */

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN) {
  console.error('Error: DISCORD_APP_ID and DISCORD_BOT_TOKEN must be set.');
  process.exit(1);
}

const commands = [
  {
    name: 'hello',
    description: 'Say hello to Lambdator',
  },
];

const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

const response = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
});

if (!response.ok) {
  const error = await response.text();
  console.error(`Failed to register commands (${response.status}):`, error);
  process.exit(1);
}

const registered = await response.json();
console.log(`Successfully registered ${registered.length} command(s):`);
registered.forEach((cmd) => console.log(`  /${cmd.name} — ${cmd.description}`));
