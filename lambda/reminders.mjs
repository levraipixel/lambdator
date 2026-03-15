// Facade — delegates to the local SQLite mock in dev, real DynamoDB in production.
const impl = await import(
  process.env.LOCAL_MODE === 'true' ? './reminders-local.mjs' : './reminders-aws.mjs'
);

export const saveReminder = impl.saveReminder;
export const getAllReminders = impl.getAllReminders;
export const getDueReminders = impl.getDueReminders;
export const deleteReminder = impl.deleteReminder;
