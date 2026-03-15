import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.REMINDERS_TABLE_NAME;

export const saveReminder = async ({ userId, messageId, channelId, guildId, remindAt }) => {
  const id = crypto.randomUUID();
  await client.send(new PutCommand({
    TableName: TABLE,
    Item: { id, userId, messageId, channelId, guildId: guildId ?? null, remindAt },
  }));
  return id;
};

export const getAllReminders = async () => {
  const result = await client.send(new ScanCommand({ TableName: TABLE }));
  return result.Items;
};

export const getDueReminders = async (now) => {
  const result = await client.send(new ScanCommand({ TableName: TABLE }));
  return result.Items.filter((r) => r.remindAt <= now.toISOString());
};

export const deleteReminder = async (id) => {
  await client.send(new DeleteCommand({ TableName: TABLE, Key: { id } }));
};
