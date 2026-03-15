import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import { getOrganizationDetails, getLastMembershipOrders, getAllMembershipOrders } from './helloasso.mjs';
import { upsertOrder, getAllOrders, getRecentOrders } from './dynamodb.mjs';
import { saveReminder, getAllReminders, getDueReminders, deleteReminder } from './reminders.mjs';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
// Eagerly resolve IAM credentials during cold start so the first handler
// invocation doesn't pay the IMDS latency cost inside the 3s Discord window.
lambdaClient.config.credentials().catch(() => {});

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

const respondEphemeral = (content) => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: 64 },
  }),
});

const deferResponse = () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  }),
});

const editOriginalResponse = async (applicationId, token, content) => {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`Discord webhook error: ${res.status} ${await res.text()}`);
  }
};

const runRefreshAll = async () => {
  console.log('refreshAll: fetching all membership orders from HelloAsso...');
  const orders = await getAllMembershipOrders();
  console.log(`refreshAll: fetched ${orders.length} orders, upserting into DynamoDB...`);
  const results = await Promise.all(orders.map(upsertOrder));
  const newOrders = orders.filter((_, i) => results[i]);
  console.log(`refreshAll: ${newOrders.length} new orders inserted`);

  if (newOrders.length === 0) return '0 new members added.';

  const lines = newOrders.map(formatApiOrderLine);
  const truncated = lines.join('\n').slice(0, 1950);
  return `${newOrders.length} new member(s) added:\n${truncated}`;
};

export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event));

  // Scheduled task: check for due reminders and send DMs
  if (event.asyncTask === 'checkReminders') {
    console.log('Running async task: checkReminders');
    const now = new Date();
    const due = await getDueReminders(now);
    console.log(`checkReminders: ${due.length} due reminder(s)`);
    await Promise.all(due.map(async (reminder) => {
      try {
        const guildPart = reminder.guildId ?? '@me';
        const link = `https://discord.com/channels/${guildPart}/${reminder.channelId}/${reminder.messageId}`;
        const dmRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          },
          body: JSON.stringify({ recipient_id: reminder.userId }),
        });
        if (!dmRes.ok) throw new Error(`Failed to open DM: ${dmRes.status} ${await dmRes.text()}`);
        const { id: dmChannelId } = await dmRes.json();

        const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannelId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          },
          body: JSON.stringify({ content: `You asked me to remind you of ${link}` }),
        });
        if (!msgRes.ok) throw new Error(`Failed to send DM: ${msgRes.status} ${await msgRes.text()}`);

        await deleteReminder(reminder.id);
        console.log(`checkReminders: sent reminder ${reminder.id} to user ${reminder.userId}`);
      } catch (err) {
        console.error(`checkReminders: failed for reminder ${reminder.id}:`, err);
      }
    }));
    return { statusCode: 200 };
  }

  // Async self-invocation: perform the actual refreshAll work and call Discord's webhook
  if (event.asyncTask === 'refreshAll') {
    console.log('Running async task: refreshAll');
    const { applicationId, token } = event;
    try {
      const content = await runRefreshAll();
      console.log('refreshAll complete, editing Discord response');
      await editOriginalResponse(applicationId, token, content);
    } catch (error) {
      console.error('refreshAll failed:', error);
      await editOriginalResponse(applicationId, token, `❌ Failed to refresh all: ${error.message}`);
    }
    return { statusCode: 200 };
  }

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

  // Message context menu command handling (type 3 = MESSAGE)
  if (interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data.type === 3) {
    const { name, target_id: messageId } = interaction.data;

    if (name === 'Remind me in 1 hour') {
      const remindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await saveReminder({
        userId: interaction.member?.user?.id ?? interaction.user?.id,
        messageId,
        channelId: interaction.channel_id,
        guildId: interaction.guild_id ?? null,
        remindAt,
      });
      return respondEphemeral('Got it! I\'ll remind you about this message in 1 hour. ⏰');
    }
  }

  // Slash command handling
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;
    const args = options?.map((o) => `${o.name}=${o.value}`).join(', ') ?? '';
    console.log(`Command: /${name}${args ? ` (${args})` : ''}`);

    if (name === 'remind') {
      const action = options?.find((o) => o.name === 'action')?.value;
      const userId = interaction.member?.user?.id ?? interaction.user?.id;
      const all = await getAllReminders();
      const mine = all.filter((r) => r.userId === userId);

      if (action === 'list') {
        if (mine.length === 0) return respondEphemeral('You have no scheduled reminders.');
        const lines = mine.map((r) => {
          const guildPart = r.guildId ?? '@me';
          const link = `https://discord.com/channels/${guildPart}/${r.channelId}/${r.messageId}`;
          const ts = Math.floor(new Date(r.remindAt).getTime() / 1000);
          return `- ${link} — <t:${ts}:R>`;
        });
        return respondEphemeral(`Your reminders:\n${lines.join('\n')}`);
      }

      if (action === 'clear') {
        if (mine.length === 0) return respondEphemeral('You have no reminders to clear.');
        await Promise.all(mine.map((r) => deleteReminder(r.id)));
        return respondEphemeral(`Cleared ${mine.length} reminder(s).`);
      }
    }

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
        // In local dev mode, run synchronously (no Lambda to invoke)
        if (process.env.LOCAL_MODE === 'true') {
          try {
            return respond(await runRefreshAll());
          } catch (error) {
            return respond(`❌ Failed to refresh all: ${error.message}`);
          }
        }

        // In production: trigger the async work, then ACK Discord.
        // Credentials are pre-warmed at module init so this only pays for the
        // HTTP round-trip to Lambda API (~200ms), staying well within the 3s deadline.
        await lambdaClient.send(
          new InvokeCommand({
            FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
            InvocationType: 'Event',
            Payload: Buffer.from(
              JSON.stringify({
                asyncTask: 'refreshAll',
                applicationId: interaction.application_id,
                token: interaction.token,
              })
            ),
          })
        );
        console.log('Async refreshAll invoked');
        return deferResponse();
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
