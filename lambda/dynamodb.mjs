// Facade — delegates to the local SQLite mock in dev, real DynamoDB in production.
const impl = await import(
  process.env.LOCAL_MODE === 'true' ? './dynamodb-local.mjs' : './dynamodb-aws.mjs'
);

export const upsertOrder = impl.upsertOrder;
export const getAllOrders = impl.getAllOrders;
export const getRecentOrders = impl.getRecentOrders;
