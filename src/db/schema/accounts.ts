import { pgTable, serial, integer, varchar, boolean, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { transactions } from './transactions';

export const accountTypeEnum = pgEnum('account_type', ['cash', 'bank', 'mobile_banking', 'credit_card', 'other']);

/**
 * What the balance means:
 * - own: my money (bank, wallets, cash)
 * - receivable: money someone owes me (lent out)
 * - held: money I keep for someone else (amanat / held in trust); negative = owed back
 */
export const ACCOUNT_ROLES = ['own', 'receivable', 'held'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  type: accountTypeEnum('type').notNull(),
  balance: integer('balance').default(0).notNull(), // stored in paisa
  currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
  icon: varchar('icon', { length: 50 }),
  color: varchar('color', { length: 7 }),
  role: varchar('role', { length: 20 }).$type<AccountRole>().default('own').notNull(),
  showOnDashboard: boolean('show_on_dashboard').default(true).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => {
  return {
    userIdIdx: index('account_user_id_idx').on(table.userId),
  };
});

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
  transactions: many(transactions, { relationName: 'accountTransactions' }),
  transfersTo: many(transactions, { relationName: 'transferToTransactions' }),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
