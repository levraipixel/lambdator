import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import { getOrganizationDetails } from './helloasso.mjs';

const respond = (content) => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content },
  }),
});

export const handler = async (event) => {
  const signature = event.headers['x-signature-ed25519'];
  const timestamp = event.headers['x-signature-timestamp'];
  const rawBody = event.body ?? '';

  // Verify the request is genuinely from Discord
  const isValid = await verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY);
  if (!isValid) {
    return { statusCode: 401, body: 'Invalid request signature' };
  }

  const interaction = JSON.parse(rawBody);

  // Discord endpoint validation (PING)
  if (interaction.type === InteractionType.PING) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: InteractionResponseType.PONG }),
    };
  }

  // Slash command handling
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;

    if (name === 'hello') {
      return respond('Hello! I am Lambdator, your serverless Discord bot powered by AWS Lambda! 🚀');
    }

    if (name === 'helloasso') {
      const action = options?.find((o) => o.name === 'action')?.value;

      if (action === 'info') {
        try {
          const data = await getOrganizationDetails();
          const json = JSON.stringify(data, null, 2);
          // Discord messages are capped at 2000 characters
          const truncated = json.length > 1950 ? json.slice(0, 1950) + '\n…' : json;
          return respond(`\`\`\`json\n${truncated}\n\`\`\``);
        } catch (error) {
          return respond(`❌ Failed to fetch organization info: ${error.message}`);
        }
      }
    }
  }

  return { statusCode: 400, body: 'Unknown interaction type' };
};
