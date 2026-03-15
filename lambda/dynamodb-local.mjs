import Database from 'better-sqlite3';
import { join } from 'path';

// Stored at the project root so it is never included in the Lambda archive
const db = new Database(join(process.cwd(), '.lambdator-local.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS membership_orders (
    id           TEXT PRIMARY KEY,
    date         TEXT NOT NULL,
    firstName    TEXT NOT NULL,
    lastName     TEXT NOT NULL,
    amount       INTEGER NOT NULL,
    email        TEXT,
    apiResponse  TEXT
  )
`);

export const upsertOrder = async (order) => {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO membership_orders (id, date, firstName, lastName, amount, email, apiResponse)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    String(order.id),
    order.date,
    order.payer.firstName,
    order.payer.lastName,
    order.amount.total,
    order.payer.email,
    JSON.stringify(order),
  );
  return result.changes > 0;
};

export const getRecentOrders = async (limit = 5) => {
  return db
    .prepare(`SELECT * FROM membership_orders ORDER BY date DESC LIMIT ?`)
    .all(limit);
};
