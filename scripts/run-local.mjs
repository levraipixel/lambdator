/**
 * Run a slash command locally against the Lambda handler.
 * Requires Node.js >= 20 (uses --env-file flag).
 *
 * Usage:
 *   node --env-file=.env scripts/run-local.mjs <command> [action]
 *
 * Examples:
 *   node --env-file=.env scripts/run-local.mjs hello
 *   node --env-file=.env scripts/run-local.mjs helloasso info
 */

const [, , command = 'hello', action] = process.argv;

const interaction = {
  type: 2, // APPLICATION_COMMAND
  data: {
    name: command,
    options: action ? [{ name: 'action', value: action }] : [],
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
