import { pgTable, serial, integer, text, date, varchar, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { accounts } from './accounts';
import { categories } from './categories';

export const transactionTypeEnum = pgEnum('transaction_type', ['income', 'expense', 'transfer']);

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  amount: integer('amount').notNull(), // in paisa
  type: transactionTypeEnum('type').notNull(),
  categoryId: integer('category_id').references(() => categories.id).notNull(),
  accountId: integer('account_id').references(() => accounts.id).notNull(),
  toAccountId: integer('to_account_id').references(() => accounts.id),
  description: text('description'),
  date: date('date').notNull(),
  currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => {
  return {
    categoryIdIdx: index('transaction_category_id_idx').on(table.categoryId),
    accountIdIdx: index('transaction_account_id_idx').on(table.accountId),
    toAccountIdIdx: index('transaction_to_account_id_idx').on(table.toAccountId),
    dateIdx: index('transaction_date_idx').on(table.date),
  };
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
    relationName: 'accountTransactions',
  }),
  toAccount: one(accounts, {
    fields: [transactions.toAccountId],
    references: [accounts.id],
    relationName: 'transferToTransactions',
  }),
}));

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
