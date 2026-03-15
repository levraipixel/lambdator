/**
 * Run a slash command locally against the Lambda handler.
 * Requires Node.js >= 20 (uses --env-file flag).
 *
 * Usage:
 *   node --env-file=.env scripts/run-local.mjs <command> [action] [filter]
 *
 * Examples:
 *   node --env-file=.env scripts/run-local.mjs hello
 *   node --env-file=.env scripts/run-local.mjs helloasso info
 *   node --env-file=.env scripts/run-local.mjs helloasso list recent
 *   node --env-file=.env scripts/run-local.mjs helloasso list expired
 *   node --env-file=.env scripts/run-local.mjs helloasso list expiring
 */

const [, , command = 'hello', action, filter] = process.argv;

const options = [];
if (action) options.push({ name: 'action', value: action });
if (filter) options.push({ name: 'filter', value: filter });

const interaction = {
  type: 2, // APPLICATION_COMMAND
  data: {
    name: command,
    options,
  },
};

const body = JSON.stringify(interaction);

const event = {
  headers: {
    'x-signature-ed25519': 'local',
    'x-signature-timestamp': 'local',
  },
  body,
};

const { handler } = await import('../lambda/index.mjs');
const result = await handler(event);

console.log(`\nStatus: ${result.statusCode}`);
if (result.body) {
  const parsed = JSON.parse(result.body);
  console.log('Response:', JSON.stringify(parsed, null, 2));
}
