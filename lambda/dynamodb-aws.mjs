import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.DYNAMODB_TABLE_NAME;

/**
 * Inserts an order if it doesn't already exist (idempotent).
 * Returns true if the order was new, false if it already existed.
 */
export const upsertOrder = async (order) => {
  try {
    await client.send(new PutCommand({
      TableName: TABLE,
      Item: {
        id: String(order.id),
        date: order.date,
        firstName: order.payer.firstName,
        lastName: order.payer.lastName,
        amount: order.amount.total,
        email: order.payer.email,
        apiResponse: JSON.stringify(order),
      },
      ConditionExpression: 'attribute_not_exists(id)',
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
};

/**
 * Returns the most recent orders sorted by date descending.
 */
export const getRecentOrders = async (limit = 5) => {
  const result = await client.send(new ScanCommand({ TableName: TABLE }));
  return result.Items
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
};
