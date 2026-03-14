import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';

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
    const { name } = interaction.data;

    if (name === 'hello') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Hello! I am Lambdator, your serverless Discord bot powered by AWS Lambda! 🚀',
          },
        }),
      };
    }
  }

  return { statusCode: 400, body: 'Unknown interaction type' };
};
