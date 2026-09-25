import { pgTable, serial, integer, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * A named set of categories (main or sub) the owner saved to analyze together in Insights,
 * e.g. "Home setup" = Furniture & Household + Electronics. Shown as one series in charts.
 */
export const categoryGroups = pgTable('category_groups', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  categoryIds: integer('category_ids').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => {
  return {
    userIdIdx: index('category_group_user_id_idx').on(table.userId),
  };
});

export type CategoryGroup = typeof categoryGroups.$inferSelect;
