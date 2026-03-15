import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import { getOrganizationDetails, getLastMembershipOrders, getAllMembershipOrders } from './helloasso.mjs';
import { upsertOrder } from './dynamodb.mjs';

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

  // Verify the request is genuinely from Discord (skipped in local dev mode)
  if (process.env.LOCAL_MODE !== 'true') {
    const isValid = verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY);
    if (!isValid) {
      return { statusCode: 401, body: 'Invalid request signature' };
    }
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

      if (action === 'refreshAll') {
        try {
          const orders = await getAllMembershipOrders();
          const results = await Promise.all(orders.map(upsertOrder));
          const newOrders = orders.filter((_, i) => results[i]);

          if (newOrders.length === 0) {
            return respond('0 new members added.');
          }

          const lines = newOrders.map((o) => {
            const d = new Date(o.date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            return `- ${day}/${month}/${d.getFullYear()}: ${o.payer.firstName} ${o.payer.lastName}`;
          });
          const truncated = lines.join('\n').slice(0, 1950);
          return respond(`${newOrders.length} new member(s) added:\n${truncated}`);
        } catch (error) {
          return respond(`❌ Failed to refresh all: ${error.message}`);
        }
      }

      if (action === 'refresh') {
        try {
          const from = new Date();
          from.setDate(from.getDate() - 30);

          const orders = await getLastMembershipOrders(from);
          const results = await Promise.all(orders.map(upsertOrder));
          const newOrders = orders.filter((_, i) => results[i]);

          if (newOrders.length === 0) {
            return respond('0 new members added.');
          }

          const lines = newOrders.map((o) => {
            const d = new Date(o.date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            return `- ${day}/${month}/${d.getFullYear()}: ${o.payer.firstName} ${o.payer.lastName}`;
          });
          const truncated = lines.join('\n').slice(0, 1950);
          return respond(`${newOrders.length} new member(s) added:\n${truncated}`);
        } catch (error) {
          return respond(`❌ Failed to refresh: ${error.message}`);
        }
      }
    }
  }

  return { statusCode: 400, body: 'Unknown interaction type' };
};
