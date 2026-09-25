import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, categories, transactions } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { parseHistoricalMode } from '@/lib/historical';
import { ancestorsOf, descendantIds } from '@/lib/categories';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ['income', 'expense', 'transfer'] as const;
type TxnType = (typeof TYPES)[number];

/** A requested series: one category (no name) or a named group of categories. */
interface SeriesSpec { key: string; name?: string; ids: number[] }

function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

function parseSeries(raw: string | null): SeriesSpec[] | null {
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    return list.slice(0, 20).flatMap((s): SeriesSpec[] => {
      const ids = Array.isArray(s?.ids) ? [...new Set<number>(s.ids.filter((i: unknown) => Number.isInteger(i) && (i as number) > 0))] : [];
      if (!ids.length || typeof s.key !== 'string') return [];
      return [{ key: s.key.slice(0, 40), name: typeof s.name === 'string' ? s.name.slice(0, 100) : undefined, ids }];
    });
  } catch {
    return null;
  }
}

/**
 * Income/expense analysis.
 *   series=[{key,name?,ids}]  what to show: each entry is one category, or a named group shown as ONE series.
 *                             Sub-categories of a chosen category are included. Missing = every category of `type`.
 *   type=expense              used only without `series`
 *   group=main|sub            main: roll sub-categories into their parent; sub: split them out
 *                             (with `series`, only single main categories are split — groups stay whole)
 *   start/end                 YYYY-MM-DD, optional
 *   historical                include | exclude | only
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = request.nextUrl.searchParams;
  const specs = parseSeries(q.get('series'));
  const type = (TYPES as readonly string[]).includes(q.get('type') ?? '') ? (q.get('type') as TxnType) : 'expense';
  const start = DATE.test(q.get('start') ?? '') ? q.get('start')! : null;
  const end = DATE.test(q.get('end') ?? '') ? q.get('end')! : null;
  const group = q.get('group') === 'sub' ? 'sub' : 'main';
  const historical = parseHistoricalMode(q.get('historical'));

  const allCats = await db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories);
  const byId = new Map(allCats.map(c => [c.id, c]));
  const childrenOf = (id: number) => allCats.filter(c => c.parentId === id).map(c => c.id);
  const branchOf = (id: number) => [id, ...descendantIds(id, allCats)];
  const topOf = (id: number) => { const c = byId.get(id); return c ? (ancestorsOf(c, byId)[0]?.id ?? id) : id; };
  /** The direct child of `root` whose branch contains `id` (or `root` itself). */
  const branchChild = (root: number, id: number) => {
    const c = byId.get(id);
    if (!c || id === root) return root;
    const chain = [...ancestorsOf(c, byId).map(a => a.id), id];
    const i = chain.indexOf(root);
    return i >= 0 && i + 1 < chain.length ? chain[i + 1] : root;
  };

  // Which series each category belongs to (first series wins, so nothing is counted twice)
  const owner = new Map<number, SeriesSpec>();
  const overlaps = new Set<string>();
  for (const spec of specs ?? []) {
    for (const id of spec.ids.flatMap(branchOf)) {
      if (owner.has(id)) { if (owner.get(id) !== spec) overlaps.add(byId.get(id)?.name ?? String(id)); }
      else owner.set(id, spec);
    }
  }

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      type: transactions.type,
      month: sql<string>`to_char(${transactions.date}::date, 'YYYY-MM')`,
      amount: sql<number>`SUM(${transactions.amount})::bigint`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(transactions)
    .where(and(
      sql`${transactions.accountId} IN (SELECT ${accounts.id} FROM ${accounts} WHERE ${accounts.userId} = ${session.userId})`,
      specs ? (owner.size ? inArray(transactions.categoryId, [...owner.keys()]) : sql`false`) : eq(transactions.type, type),
      start ? gte(transactions.date, start) : undefined,
      end ? lte(transactions.date, end) : undefined,
      historical === 'include' ? undefined : eq(transactions.isHistorical, historical === 'only'),
    ))
    .groupBy(transactions.categoryId, transactions.type, sql`to_char(${transactions.date}::date, 'YYYY-MM')`);

  const label = (id: number) => byId.get(id)?.name ?? 'Unknown';
  /** Where a category sits: "Daily Expense › Travel" for "Office" (null at top level). */
  const parentName = (id: number) => {
    const c = byId.get(id);
    const path = c ? ancestorsOf(c, byId).map(a => a.name) : [];
    return path.length ? path.join(' › ') : null;
  };

  // Series key/name for a transaction's category
  const seriesOf = (categoryId: number): { key: string; name: string; kind: 'category' | 'group'; parentName: string | null } => {
    if (specs) {
      const spec = owner.get(categoryId)!;
      if (spec.name) return { key: spec.key, name: spec.name, kind: 'group', parentName: null };
      const chosen = spec.ids[0];
      if (group === 'sub' && childrenOf(chosen).length) {
        // one level down: each direct child with its whole branch, plus entries made on the chosen one itself
        const part = branchChild(chosen, categoryId);
        return part === chosen
          ? { key: `${spec.key}/${chosen}`, name: `${label(chosen)} (general)`, kind: 'category', parentName: null }
          : { key: `${spec.key}/${part}`, name: label(part), kind: 'category', parentName: label(chosen) };
      }
      return { key: spec.key, name: label(chosen), kind: 'category', parentName: parentName(chosen) };
    }
    // No series chosen: top-level categories, or every category separately
    const id = group === 'main' ? topOf(categoryId) : categoryId;
    return { key: `c:${id}`, name: label(id), kind: 'category', parentName: parentName(id) };
  };

  const totals = Object.fromEntries(TYPES.map(t => [t, { amount: 0, count: 0 }])) as Record<TxnType, { amount: number; count: number }>;
  const perKey = new Map<string, { name: string; kind: 'category' | 'group'; parentName: string | null; types: Set<TxnType>; amount: number; count: number; months: Map<string, number> }>();
  let firstMonth: string | null = null;
  let lastMonth: string | null = null;

  for (const r of rows) {
    const amount = Number(r.amount);
    totals[r.type].amount += amount;
    totals[r.type].count += r.count;
    const s = seriesOf(r.categoryId);
    const entry = perKey.get(s.key) ?? { ...s, types: new Set<TxnType>(), amount: 0, count: 0, months: new Map() };
    entry.types.add(r.type);
    entry.amount += amount;
    entry.count += r.count;
    entry.months.set(r.month, (entry.months.get(r.month) ?? 0) + amount);
    perKey.set(s.key, entry);
    if (!firstMonth || r.month < firstMonth) firstMonth = r.month;
    if (!lastMonth || r.month > lastMonth) lastMonth = r.month;
  }

  const now = new Date().toISOString().slice(0, 7);
  const months = monthsBetween(start?.slice(0, 7) ?? firstMonth ?? now, end?.slice(0, 7) ?? lastMonth ?? now).slice(-60);

  const series = [...perKey.entries()]
    .map(([key, e]) => ({
      key,
      name: e.name,
      kind: e.kind,
      parentName: e.parentName,
      types: [...e.types],
      amount: e.amount,
      count: e.count,
      monthly: months.map(m => e.months.get(m) ?? 0),
    }))
    .sort((a, b) => b.amount - a.amount);

  return NextResponse.json({ totals, series, months, overlaps: [...overlaps] });
}
