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
  {
    name: 'helloasso',
    description: 'Interact with the HelloAsso API',
    options: [
      {
        name: 'action',
        description: 'Action to perform',
        type: 3, // STRING
        required: true,
        choices: [
          { name: 'info — Get organization information', value: 'info' },
          { name: 'list — List membership orders', value: 'list' },
          { name: 'refresh — Sync last 30 days membership orders and show new additions', value: 'refresh' },
          { name: 'refreshAll — Sync all-time membership orders and show new additions', value: 'refreshAll' },
        ],
      },
      {
        name: 'filter',
        description: 'Filter for the list action',
        type: 3, // STRING
        required: false,
        choices: [
          { name: 'recent — 5 most recent orders', value: 'recent' },
          { name: 'expired — Expired and not renewed', value: 'expired' },
          { name: 'expiring — Expiring within the next month', value: 'expiring' },
        ],
      },
    ],
  },
  {
    name: 'remind',
    description: 'Manage your scheduled reminders',
    options: [
      {
        name: 'action',
        description: 'Action to perform',
        type: 3, // STRING
        required: true,
        choices: [
          { name: 'list — Show your scheduled reminders', value: 'list' },
          { name: 'clear — Delete all your reminders', value: 'clear' },
        ],
      },
    ],
  },
  {
    name: 'config',
    description: 'Show bot configuration',
  },
  // Message context menu command
  {
    name: 'Remind me in 1 hour',
    type: 3, // MESSAGE
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
registered.forEach((cmd) => console.log(`  [type ${cmd.type ?? 1}] ${cmd.name}`));
