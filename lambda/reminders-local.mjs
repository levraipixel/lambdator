import Database from 'better-sqlite3';
import { join } from 'path';
import { randomUUID } from 'crypto';

const db = new Database(join(process.cwd(), '.lambdator-local.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id         TEXT PRIMARY KEY,
    userId     TEXT NOT NULL,
    messageId  TEXT NOT NULL,
    channelId  TEXT NOT NULL,
    guildId    TEXT,
    remindAt   TEXT NOT NULL
  )
`);

export const saveReminder = async ({ userId, messageId, channelId, guildId, remindAt }) => {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO reminders (id, userId, messageId, channelId, guildId, remindAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, messageId, channelId, guildId ?? null, remindAt);
  return id;
};

export const getAllReminders = async () => {
  return db.prepare(`SELECT * FROM reminders`).all();
};

export const getDueReminders = async (now) => {
  return db.prepare(`SELECT * FROM reminders WHERE remindAt <= ?`).all(now.toISOString());
};

export const deleteReminder = async (id) => {
  db.prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
};
