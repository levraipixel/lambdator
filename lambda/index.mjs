import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import { getOrganizationDetails, getLastMembershipOrders, getAllMembershipOrders } from './helloasso.mjs';
import { upsertOrder, getAllOrders, getRecentOrders } from './dynamodb.mjs';

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
};

// For DB records (flat fields)
const formatOrderLine = (o) =>
  `- ${formatDate(o.date)}: ${o.pseudo} (${o.firstName} ${o.lastName})`;

// For raw HelloAsso API objects (nested fields, withDetails)
const formatApiOrderLine = (o) => {
  const pseudo = o.items?.[0]?.customFields?.find((f) => f.name === 'Pseudo')?.answer ?? '?';
  return `- ${formatDate(o.date)}: ${pseudo} (${o.payer.firstName} ${o.payer.lastName})`;
};

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
            return formatApiOrderLine(o);
          });
          const truncated = lines.join('\n').slice(0, 1950);
          return respond(`${newOrders.length} new member(s) added:\n${truncated}`);
        } catch (error) {
          return respond(`❌ Failed to refresh all: ${error.message}`);
        }
      }

      if (action === 'list') {
        const filter = options?.find((o) => o.name === 'filter')?.value;
        if (!filter) return respond('Please provide a filter: `recent`, `expired`, or `expiring`.');

        try {
          if (filter === 'recent') {
            const orders = await getRecentOrders(5);
            if (orders.length === 0) return respond('No membership orders found.');
            return respond(orders.map(formatOrderLine).join('\n'));
          }

          const allOrders = await getAllOrders();

          // Keep only the most recent order per email (= renewal detection)
          const latestPerEmail = new Map();
          for (const order of allOrders) {
            const existing = latestPerEmail.get(order.email);
            if (!existing || new Date(order.date) > new Date(existing.date)) {
              latestPerEmail.set(order.email, order);
            }
          }

          const now = new Date();
          const twelveMonthsAgo = new Date(now);
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
          const elevenMonthsAgo = new Date(now);
          elevenMonthsAgo.setMonth(elevenMonthsAgo.getMonth() - 11);

          const candidates = [...latestPerEmail.values()];
          let filtered;

          if (filter === 'expired') {
            filtered = candidates.filter((o) => new Date(o.date) < twelveMonthsAgo);
          } else {
            // expiring: will expire within the next month (ordered between 11 and 12 months ago)
            filtered = candidates.filter((o) => {
              const d = new Date(o.date);
              return d >= twelveMonthsAgo && d < elevenMonthsAgo;
            });
          }

          filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

          const label = filter === 'expired' ? 'expired' : 'expiring soon';
          if (filtered.length === 0) return respond(`No ${label} memberships.`);

          const lines = filtered.map(formatOrderLine).join('\n').slice(0, 1950);
          return respond(`${filtered.length} ${label}:\n${lines}`);
        } catch (error) {
          return respond(`❌ Failed to list: ${error.message}`);
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
            return formatApiOrderLine(o);
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
