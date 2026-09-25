/**
 * Rebuild the ledger from the SMS backup in data/.
 *
 *   npx tsx src/db/migrate-real-data.ts           dry run: writes data/migration-report.md + data/migration-rows.csv
 *   npx tsx src/db/migrate-real-data.ts --apply   WIPES the DB in .env.local and inserts the ledger (one DB transaction)
 *
 * --apply refuses to run once transactions entered in the app exist (is_historical = false), because the
 * wipe would delete them; pass --force-wipe as well only if that is really intended.
 * Saved Insights groups survive (re-linked to the new categories by name).
 *
 * How it stays correct:
 * - Duplicate SMS (same sender + body) are dropped.
 * - Every wallet SMS carries a running balance (bank: C/B, Rocket/bKash/Nagad: Balance). Each account's
 *   booked balance is checked against it after every message; a mismatch means an SMS is missing and is
 *   booked as an "Unrecorded" adjustment, so final balances equal the real ones.
 * - Wallets are told apart by SIM (sub_id): SIM 3 = 01794973067, SIM 2 = 01324190634.
 * - Both SMS of an own-account move (e.g. Bank → Rocket) are paired so the move is booked once, as a transfer.
 * - Amounts are stored in paisa.
 *
 * Classification rules (confirmed with the owner):
 * - ATM withdrawal = transfer Bank → Cash. Reversed ATM withdrawals (negative amount) cancel out.
 * - Family Support ONLY when a bKash/Nagad agent Cash In >= 8,000 happens on the same day after ATM
 *   withdrawals covering it: Cash → wallet transfer + Family Support expense (the cash-in amount).
 * - Other agent Cash Ins = Cash → wallet. CRM/CDM deposits = Cash → Bank.
 * - Bank credits >= 18,000 via NPSB/EFT = Salary. Room rent is paid in cash (see RENT), not from the bank.
 * - Anything the rules can't place is booked with a best guess and listed under "Needs review"
 *   in the report; fix those via OVERRIDES below.
 */
import fs from 'fs';
import path from 'path';
import { loadEnvConfig } from '@next/env';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, sql } from 'drizzle-orm';
import * as schema from './schema';

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes('--apply');
const FORCE_WIPE = process.argv.includes('--force-wipe');
const XML_PATH = path.join(process.cwd(), 'data', 'sms-20260921214106.xml');
const REPORT_PATH = path.join(process.cwd(), 'data', 'migration-report.md');
const CSV_PATH = path.join(process.cwd(), 'data', 'migration-rows.csv');

const USER = { name: 'MD Asaduzzaman', email: 'aznarabin@gmail.com' };
const OWN_NUMBERS = ['01794973067', '01324190634'];
const FAMILY_SUPPORT_MIN = 8000;
const SALARY_MIN = 18000;

// ---------------------------------------------------------------------------
// Accounts & categories
// ---------------------------------------------------------------------------

type AccKey = 'bank' | 'rocket' | 'rocket2' | 'bkash' | 'bkash2' | 'nagad' | 'cash' | 'loans' | 'amanat';

const ACCOUNTS: Record<AccKey, { name: string; type: 'bank' | 'mobile_banking' | 'cash' | 'other'; color: string; icon: string; role?: 'own' | 'receivable' | 'held' }> = {
  bank: { name: 'DBBL Bank', type: 'bank', color: '#005bea', icon: 'building-library' },
  rocket: { name: 'DBBL Rocket', type: 'mobile_banking', color: '#8b5cf6', icon: 'device-phone-mobile' },
  rocket2: { name: 'DBBL Rocket (01324190634)', type: 'mobile_banking', color: '#a78bfa', icon: 'device-phone-mobile' },
  bkash: { name: 'bKash', type: 'mobile_banking', color: '#ec4899', icon: 'device-phone-mobile' },
  bkash2: { name: 'bKash (01324190634)', type: 'mobile_banking', color: '#f472b6', icon: 'device-phone-mobile' },
  nagad: { name: 'Nagad', type: 'mobile_banking', color: '#f97316', icon: 'device-phone-mobile' },
  cash: { name: 'Cash', type: 'cash', color: '#10b981', icon: 'banknotes' },
  // Money lent out: still mine, but not in hand
  loans: { name: 'Lucky apu', type: 'other', color: '#0d9488', icon: 'hand-coins', role: 'receivable' },
  // Money kept for someone else: negative balance = owed back, so it never counts as own money
  amanat: { name: 'Ammu', type: 'other', color: '#a855f7', icon: 'hand-heart', role: 'held' },
};

type CatType = 'income' | 'expense' | 'transfer';
const CATEGORIES: Array<{ name: string; type: CatType; color: string; children?: string[] }> = [
  { name: 'Salary', type: 'income', color: '#10b981', children: ['Bonus'] },
  { name: 'Bank Interest', type: 'income', color: '#34d399' },
  { name: 'Cashback', type: 'income', color: '#6ee7b7' },
  { name: 'Side Income', type: 'income', color: '#047857' },
  { name: 'Reimbursement', type: 'income', color: '#65a30d' },
  { name: 'Refund', type: 'income', color: '#a7f3d0' },
  { name: 'Unrecorded Inflow', type: 'income', color: '#9ca3af' },
  { name: 'Family Support', type: 'expense', color: '#ef4444' },
  { name: 'Room Rent', type: 'expense', color: '#f97316' },
  { name: 'Daily Expenses', type: 'expense', color: '#fda4af' },
  { name: 'Laptop', type: 'expense', color: '#8b5cf6', children: ['Laptop Purchase', 'Laptop Repair'] },
  { name: 'Personal Expense', type: 'expense', color: '#f43f5e' },
  { name: 'Loan Repayment', type: 'expense', color: '#fb7185' },
  { name: 'Mobile Recharge', type: 'expense', color: '#eab308' },
  { name: 'Transport', type: 'expense', color: '#0ea5e9', children: ['Railway Ticket'] },
  { name: 'Online Payment', type: 'expense', color: '#6366f1' },
  { name: 'Government Fees', type: 'expense', color: '#64748b', children: ['NID Fee', 'Exam Fee'] },
  { name: 'Education', type: 'expense', color: '#14b8a6', children: ['University Fee'] },
  { name: 'Utilities', type: 'expense', color: '#f59e0b', children: ['Electricity', 'Internet'] },
  { name: 'Shopping', type: 'expense', color: '#d946ef' },
  { name: 'Electronics', type: 'expense', color: '#a855f7' },
  { name: 'Furniture & Household', type: 'expense', color: '#c084fc' },
  { name: 'Office Purchase (reimbursed)', type: 'expense', color: '#a3a3a3' },
  { name: 'Bank Charges', type: 'expense', color: '#78716c' },
  { name: 'Unrecorded Outflow', type: 'expense', color: '#9ca3af' },
  { name: 'Internal Transfer', type: 'transfer', color: '#3b82f6' },
  { name: 'Cash In & Returns', type: 'transfer', color: '#0ea5e9' },
  { name: 'Amanat (held in trust)', type: 'transfer', color: '#a855f7', children: ['Amanat — Ammu'] },
  { name: 'Loans Given', type: 'transfer', color: '#0d9488', children: ['Loan — Lucky apu'] },
];

/**
 * Manual reclassification of specific rows, keyed by `YYYY-MM-DD HH:mm|amount` (Dhaka time, taka)
 * as shown in the report's "Needs review" table. Value = category name (must match the row's type).
 */
type Split = Array<{ cat: string; amount: number; desc: string }>;
const OVERRIDES: Record<string, string | { cat?: string; desc: string; asIncome?: boolean } | { split: Split }> = {
  // Confirmed by owner 2026-09-23: all four were sent home
  '2025-05-11 18:02|25100': { cat: 'Family Support', desc: 'Sent home (bank transfer)' },
  '2025-07-31 22:30|10000': { cat: 'Family Support', desc: 'Sent home (bank transfer)' },
  '2026-05-12 20:16|20000': { cat: 'Family Support', desc: 'Sent home (bank transfer)' },
  '2026-07-29 21:43|30000': { cat: 'Family Support', desc: 'Sent home (bank transfer)' },
  // Salaries paid late / partial
  '2026-03-02 13:40|32000': { desc: 'Salary — Jan 2026 (paid late)' },
  '2026-03-20 15:38|20267': { desc: 'Salary — Feb 2026 (partial, job from 20 Feb)' },
  '2026-05-24 19:05|28645': { desc: 'Salary — Mar 2026, RiseUp (paid late)' },
  '2025-02-04 16:45|31800': { split: [
    { cat: 'Salary', amount: 30000, desc: 'Salary — Jan 2025' },
    { cat: 'Reimbursement', amount: 1800, desc: 'Office keyboard reimbursement (office money, not mine)' },
  ] },
  '2024-06-02 18:13|32500': { split: [
    { cat: 'Salary', amount: 22500, desc: 'Salary — May 2024 (25,000 − 2,500 loan deduction)' },
    { cat: 'Bonus', amount: 10000, desc: 'Eid-ul-Adha bonus 2024' },
  ] },
  '2024-04-02 17:43|22500': { desc: 'Salary — Mar 2024 (25,000 − 2,500 loan deduction)' },
  '2024-05-02 17:54|22500': { desc: 'Salary — Apr 2024 (25,000 − 2,500 loan deduction)' },
  '2024-07-04 18:12|22500': { desc: 'Salary — Jun 2024 (25,000 − 2,500 loan deduction)' },
  // Payment for other work, from someone else
  '2024-01-09 08:25|5000': { cat: 'Side Income', desc: 'Payment for other work', asIncome: true },
  '2024-01-21 12:00|3000': { cat: 'Side Income', desc: 'Payment for other work', asIncome: true },
  // Laptop ৳63,500 = 5 installments (৳30,500) + ৳33,000 paid in Mar 2024 (see MANUAL)
  '2024-04-08 17:50|6000': { cat: 'Laptop Purchase', desc: 'Laptop installment 1/5' },
  '2024-05-02 20:24|7000': { cat: 'Laptop Purchase', desc: 'Laptop installment 2/5' },
  '2024-06-05 21:29|6500': { cat: 'Laptop Purchase', desc: 'Laptop installment 3/5' },
  '2024-07-04 19:00|5000': { cat: 'Laptop Purchase', desc: 'Laptop installment 4/5' },
  '2024-08-04 18:46|6000': { cat: 'Laptop Purchase', desc: 'Laptop installment 5/5' },
  '2026-04-29 14:43|3000': { cat: 'Laptop Repair', desc: 'Laptop display change (2nd) — bank part 1' },
  '2026-04-29 17:51|5200': { cat: 'Laptop Repair', desc: 'Laptop display change (2nd) — bank part 2' },
};

/** Rent paid by bank transfer; the rest of each month's rent was paid in cash (see RENT). */
const RENT_FROM_BANK: Array<{ key: string; month: string }> = [
  { key: '2025-07-25 14:17|7500', month: '2025-07' },
  { key: '2026-02-09 12:53|7500', month: '2026-02' },
  { key: '2026-03-12 19:28|7500', month: '2026-03' },
  { key: '2026-06-10 21:39|7500', month: '2026-06' },
];

/** Cash in hand told by the owner. Untracked cash spending is booked month by month so Cash ends here. */
const CASH_NOW = { at: '2026-09-23 22:00', amount: 3100 };

/** Room rent, paid in cash on the 5th of each month (Nov–Dec 2023 from the bank: there was no cash yet). */
const RENT: Array<{ from: string; to: string; amount: number }> = [
  { from: '2023-11', to: '2024-01', amount: 1800 },
  { from: '2024-02', to: '2024-05', amount: 6000 },
  { from: '2024-06', to: '2024-11', amount: 5500 },
  { from: '2024-12', to: '2025-08', amount: 5000 },
  { from: '2025-09', to: '2026-09', amount: 8000 },
];

/** Entries with no SMS, told by the owner. `at` is Dhaka time; amounts in taka. */
const MANUAL: Array<{ at: string; type: CatType; amount: number; acc: AccKey; to?: AccKey; cat: string; desc: string }> = [
  // Job started Nov 2023; SMS start Jan 2024. The bank's statement SMS says the balance on 31/12/23 was
  // ৳14,888.70 and the first ATM SMS (1 Jan) implies ৳39,888.70, so Dec's salary arrived on 1 Jan.
  // Assumes ~৳0 before the job; the difference is Nov–Dec spending that has no SMS.
  { at: '2023-11-30 12:00', type: 'income', amount: 25000, acc: 'bank', cat: 'Salary', desc: 'Salary — Nov 2023 (no SMS, told by owner)' },
  { at: '2023-12-31 12:00', type: 'expense', amount: 6511.30, acc: 'bank', cat: 'Unrecorded Outflow', desc: 'Nov–Dec 2023 other spending (no SMS; balance on 31/12/23 was ৳14,888.70)' },
  { at: '2024-01-01 09:00', type: 'income', amount: 25000, acc: 'bank', cat: 'Salary', desc: 'Salary — Dec 2023 (SMS missing; implied by balance)' },
  // Salaries paid in hand (not in the bank)
  { at: '2024-03-01 12:00', type: 'income', amount: 25000, acc: 'cash', cat: 'Salary', desc: 'Salary — Feb 2024 (not in bank; told by owner)' },
  // Office loan ৳10,000, the month before 4 × ৳2,500 was deducted (Mar–Jun 2024 salaries); no SMS
  { at: '2024-02-28 12:00', type: 'income', amount: 10000, acc: 'cash', cat: 'Salary', desc: 'Salary advance — Feb 2024 (office loan; repaid by 4 × ৳2,500 deductions, Mar–Jun 2024)' },
  // Keyboard for the office bought with own money, reimbursed with the Jan 2025 salary (date approximate)
  { at: '2025-01-31 12:00', type: 'expense', amount: 1800, acc: 'cash', cat: 'Office Purchase (reimbursed)', desc: 'Office keyboard (reimbursed in Feb 2025)' },
  // Mar 2025 salary was paid in hand before Eid-ul-Fitr (31 Mar 2025)
  { at: '2025-03-27 12:00', type: 'income', amount: 30000, acc: 'cash', cat: 'Salary', desc: 'Salary — Mar 2025 (paid in hand before Eid)' },
  { at: '2025-03-27 12:01', type: 'income', amount: 8000, acc: 'cash', cat: 'Bonus', desc: 'Eid bonus (paid in hand)' },
  // Apr & May 2025 paid in hand; May's came before Eid-ul-Adha (7 Jun 2025) with a ৳10,000 bonus.
  // The CRM/CDM cash deposits of May–Jun 2025 (৳56,000) are this money going into the bank.
  { at: '2025-05-05 12:00', type: 'income', amount: 30000, acc: 'cash', cat: 'Salary', desc: 'Salary — Apr 2025 (paid in hand)' },
  { at: '2025-06-01 12:00', type: 'income', amount: 30000, acc: 'cash', cat: 'Salary', desc: 'Salary — May 2025 (paid in hand)' },
  { at: '2025-06-01 12:01', type: 'income', amount: 10000, acc: 'cash', cat: 'Bonus', desc: 'Eid-ul-Adha bonus 2025 (paid in hand)' },
  // Money for home without an SMS trail
  { at: '2025-06-05 12:00', type: 'expense', amount: 15000, acc: 'cash', cat: 'Family Support', desc: 'Given at home in hand (Eid-ul-Adha 2025)' },
  { at: '2025-03-28 12:00', type: 'expense', amount: 30000, acc: 'cash', cat: 'Family Support', desc: 'Given at home (Eid-ul-Fitr 2025, from in-hand salary)' },
  { at: '2026-05-26 15:40', type: 'expense', amount: 25000, acc: 'cash', cat: 'Family Support', desc: 'Spent for home (Eid-ul-Adha 2026; ATM ৳20,000 + ৳5,000 that day)' },
  // Purchases (cash)
  { at: '2024-01-01 20:40', type: 'expense', amount: 22000, acc: 'cash', cat: 'Electronics', desc: 'Phone' },
  { at: '2024-01-01 20:41', type: 'expense', amount: 2200, acc: 'cash', cat: 'Shopping', desc: 'Luggage' },
  { at: '2024-02-01 18:00', type: 'expense', amount: 3600, acc: 'cash', cat: 'Furniture & Household', desc: 'Table' },
  { at: '2024-02-01 18:01', type: 'expense', amount: 500, acc: 'cash', cat: 'Furniture & Household', desc: 'Tosok' },
  { at: '2024-03-30 14:30', type: 'expense', amount: 33000, acc: 'cash', cat: 'Laptop Purchase', desc: 'Laptop (rest of ৳63,500 after 5 installments)' },
  { at: '2024-06-03 12:00', type: 'expense', amount: 6000, acc: 'cash', cat: 'Furniture & Household', desc: 'Chair' },
  { at: '2024-07-05 15:00', type: 'expense', amount: 3000, acc: 'cash', cat: 'Furniture & Household', desc: 'Bed (khat)' },
  { at: '2024-07-05 15:01', type: 'expense', amount: 2000, acc: 'cash', cat: 'Furniture & Household', desc: 'Tosok + mattress' },
  { at: '2024-08-13 16:00', type: 'expense', amount: 13000, acc: 'cash', cat: 'Laptop Repair', desc: 'Laptop display change (1st)' },
  // 2nd display change ৳9,000 = bank NPSB ৳3,000 + ৳5,200 on 29 Apr 2026 (see OVERRIDES) + ৳800 in hand
  { at: '2026-04-29 17:55', type: 'expense', amount: 800, acc: 'cash', cat: 'Laptop Repair', desc: 'Laptop display change (2nd) — cash part' },
  { at: '2026-05-15 19:30', type: 'expense', amount: 3000, acc: 'cash', cat: 'Laptop Repair', desc: 'Laptop servicing' },
  // Ammu's ৳23,000 kept in the bank. Assumed: she gave cash that went in with the ৳24,500 CDM deposit on 15 Jun 2026
  { at: '2026-06-15 12:00', type: 'transfer', amount: 23000, acc: 'amanat', to: 'cash', cat: 'Amanat — Ammu', desc: "Ammu's money to keep (amanat) — deposited to bank on 15 Jun 2026" },
  // 7 Sep 2026: ৳4,500 bank → Rocket, then Rocket cash-out ৳5,000 → lent to Lucky apu
  { at: '2026-09-07 19:45', type: 'transfer', amount: 5000, acc: 'cash', to: 'loans', cat: 'Loan — Lucky apu', desc: 'Lent to Lucky apu (Rocket cash-out)' },
  // 19 Sep 2026: ৳43,000 withdrawn → ৳8,000 home (Nagad), ৳30,000 repaid to Mukty apu (money given via home), rest cash
  { at: '2026-09-19 19:30', type: 'expense', amount: 30000, acc: 'cash', cat: 'Loan Repayment', desc: 'Repaid Mukty apu (money originally given via home)' },
];

/**
 * Bank withdrawals whose SMS is missing but whose effect is visible in the C/B chain.
 * 4 Dec 2025 C/B ৳56,177.84 → 9 Dec implies ৳36,177.84: ৳20,000 left with no SMS, and ৳10,000 was
 * cashed in to Nagad on 5 Dec evening → treated as an ATM withdrawal that day.
 */
const rentDue = new Map<string, number>();
for (const r of RENT) {
  for (let ym = r.from; ym <= r.to; ym = nextMonth(ym)) rentDue.set(ym, r.amount);
}
const rentMonths = [...rentDue.keys()];
const rentBankPart = new Map<string, number>();
for (const b of RENT_FROM_BANK) {
  let left = Number(b.key.split('|')[1]);
  const covered: string[] = [];
  for (const ym of rentMonths.filter(ym => ym >= b.month)) {
    const take = Math.min(left, rentDue.get(ym)! - (rentBankPart.get(ym) ?? 0));
    if (take <= 0) continue;
    rentBankPart.set(ym, (rentBankPart.get(ym) ?? 0) + take);
    covered.push(ym);
    if (!(left -= take)) break;
  }
  OVERRIDES[b.key] = { cat: 'Room Rent', desc: `Room rent — ${covered.join(' + ')} (bank)` };
}
for (const [ym, due] of rentDue) {
  const cash = due - (rentBankPart.get(ym) ?? 0);
  if (cash <= 0) continue;
  MANUAL.push({
    at: ym === '2023-11' ? '2023-11-30 12:05' : `${ym}-05 12:00`, type: 'expense', amount: cash,
    acc: ym < '2024-01' ? 'bank' : 'cash', cat: 'Room Rent',
    desc: `Room rent — ${ym}${rentBankPart.has(ym) ? ' (rest, cash)' : ''}`,
  });
}

const MISSING_ATM: Array<{ at: string; amount: number }> = [
  { at: '2025-12-05 17:30', amount: 20000 },
];

// ---------------------------------------------------------------------------
// SMS parsing
// ---------------------------------------------------------------------------

interface Sms {
  addr: string;
  sub: string;
  t: number;
  body: string;
  day: string; // YYYY-MM-DD, Asia/Dhaka
  hm: string; // HH:mm, Asia/Dhaka
}

const decode = (s: string) =>
  s.replace(/&#10;/g, '\n').replace(/&#13;/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const dhaka = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

function readSms(): Sms[] {
  const xml = fs.readFileSync(XML_PATH, 'utf-8');
  const seen = new Set<string>();
  const out: Sms[] = [];
  for (const m of xml.matchAll(/<sms\s+([^>]+)>/g)) {
    const attr = (n: string) => decode(m[1].match(new RegExp(` ${n}="([^"]*)"`))?.[1] ?? '');
    const addr = attr('address');
    const body = attr('body');
    if (seen.has(addr + '\u0000' + body)) continue;
    seen.add(addr + '\u0000' + body);
    const t = Number(attr('date'));
    const [day, hm] = dhaka.format(new Date(t)).split(' ');
    out.push({ addr, sub: attr('sub_id'), t, body, day, hm });
  }
  return out.sort((a, b) => a.t - b.t);
}

function syntheticSms(at: string, body: string): Sms {
  const t = Date.parse(`${at.replace(' ', 'T')}:00+06:00`);
  const [day, hm] = dhaka.format(new Date(t)).split(' ');
  return { addr: 'manual', sub: '', t, body, day, hm };
}

const num = (s: string) => parseFloat(s.replace(/,/g, ''));
const paisa = (taka: number) => Math.round(taka * 100);
const taka = (p: number) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Wallet events: one per SMS that moves money and states the resulting balance
// ---------------------------------------------------------------------------

interface Ev {
  sms: Sms;
  acc: AccKey;
  delta: number; // paisa, signed effect on the balance (incl. fees)
  amount: number; // paisa, principal
  fee: number; // paisa
  bal: number | null; // paisa, balance stated by the SMS
  kind: string;
  counterparty?: string;
  payee?: string;
  // Classification result (a row), or null when handled elsewhere (paired / voided)
  row?: Row | null;
  pairedWith?: Ev;
  fees?: Row[]; // booked together with the event (already inside the SMS balance)
  after?: Row[]; // booked after the balance check (e.g. money sent home after the cash-in)
  void?: boolean; // cancelled by a reversal: no rows, no balance check
}

function bankEvents(sms: Sms[]): Ev[] {
  const evs: Ev[] = [];
  for (const s of sms) {
    if (s.addr !== '16216') continue;
    const m = s.body.replace(/\s+/g, ' ').match(/A\/C \*\*\*8445 (debited|credited)\s*\(?(.*?)\)?\s*by Tk\s?(-?[\d,]+\.\d+) on (\d\d)-(\d\d)-(\d{4}) (\d\d):(\d\d):(\d\d) (AM|PM) C\/B Tk\s?(-?[\d,]+\.\d+)/);
    if (!m) continue;
    const amt = paisa(num(m[3]));
    const credit = m[1] === 'credited';
    evs.push({ sms: s, acc: 'bank', delta: credit ? amt : -amt, amount: Math.abs(amt), fee: 0, bal: paisa(num(m[11])), kind: m[2].trim() });
  }
  return evs;
}

function walletEvents(sms: Sms[]): Ev[] {
  const evs: Ev[] = [];
  for (const s of sms) {
    const b = s.body.replace(/\s+/g, ' ');
    const money = (re: RegExp) => { const m = b.match(re); return m ? paisa(num(m[1])) : null; };

    if (s.addr === '16216' && !b.includes('***8445')) {
      // Rocket (NexusPay) wallet — only messages that state the wallet balance
      const bal = money(/(?:Balance|NetBal|Bal):\s?Tk(?:\.(?=[\d,]+\.\d))?\s?([\d,]*\.?\d+)/);
      if (bal === null) continue;
      const acc: AccKey = s.sub === '2' ? 'rocket2' : 'rocket';
      const amount = money(/Tk(?:\.(?=[\d,]+\.\d))?\s?([\d,]*\.?\d+)/) ?? 0;
      const fee = money(/Fee:\s?Tk(?:\.(?=\d+\.\d))?\s?([\d,]*\.?\d+)/) ?? 0; // \"Tk.09\" = ৳0.09, \"Tk.10.00\" = ৳10
      const cp = b.match(/(?:from|to) A\/C:\s?([*\d]+)/)?.[1];
      let kind: string, sign: 1 | -1;
      if (/credited for reversal|Refund of/.test(b)) { kind = 'refund'; sign = 1; }
      else if (/received from Bank A\/C/.test(b)) { kind = 'from-bank'; sign = 1; }
      else if (/received from A\/C:(102010103|\*\*\*103)/.test(b)) { kind = 'from-bank'; sign = 1; }
      else if (/received from A\/C/.test(b)) { kind = 'received'; sign = 1; }
      else if (/^Cash-In from/.test(b)) { kind = 'agent-cash-in'; sign = 1; }
      else if (/transferred to Bank A\/C/.test(b)) { kind = 'to-bank'; sign = -1; }
      else if (/transferred to A\/C/.test(b)) { kind = 'send'; sign = -1; }
      else if (/^Cash-Out/.test(b)) { kind = 'cash-out'; sign = -1; }
      else if (/debited to recharge mobile/.test(b)) { kind = 'recharge'; sign = -1; }
      else if (/paid through e-Commerce/.test(b)) { kind = 'ecommerce'; sign = -1; }
      else if (/paid to/.test(b)) { kind = 'payment'; sign = -1; }
      else continue;
      const payee = b.match(/paid to (.+?) (?:Id|ID) /)?.[1];
      evs.push({ sms: s, acc, delta: sign * (amount + (sign < 0 ? fee : 0)), amount, fee, bal, kind, counterparty: cp, payee });
      continue;
    }

    if (/^bkash$/i.test(s.addr)) {
      if (/is being reserved|was successful|OTP|verification code/i.test(b)) continue;
      const bal = money(/Balance Tk\s?([\d,]+\.\d+)/);
      if (bal === null) continue;
      const acc: AccKey = s.sub === '2' ? 'bkash2' : 'bkash';
      const fee = money(/Fee:? Tk\s?([\d,]+\.\d+)/) ?? 0;
      let kind: string, sign: 1 | -1, amount: number | null, cp: string | undefined, payee: string | undefined;
      if (/Cashback Tk/.test(b)) { kind = 'cashback'; sign = 1; amount = money(/Cashback Tk\s?([\d,]+\.\d+)/); }
      else if (/^Cash In Tk/.test(b)) { kind = 'agent-cash-in'; sign = 1; amount = money(/Cash In Tk\s?([\d,]+\.\d+)/); cp = b.match(/from (\d+)/)?.[1]; }
      else if (/received deposit from iBanking/.test(b)) { kind = 'received'; sign = 1; amount = money(/of Tk\s?([\d,]+\.\d+)/); cp = b.match(/from ([A-Za-z ]+Bank)/)?.[1]; }
      else if (/received Tk/.test(b)) { kind = 'received'; sign = 1; amount = money(/received Tk\s?([\d,]+\.\d+)/); cp = b.match(/from (\d+)/)?.[1]; }
      else if (/Recharge request of Tk/.test(b)) { kind = 'recharge'; sign = -1; amount = money(/of Tk\s?([\d,]+\.\d+)/); }
      else if (/^Payment (of )?Tk/.test(b)) { kind = 'payment'; sign = -1; amount = money(/Tk\s?([\d,]+\.\d+)/); payee = b.match(/ to (.+?) is successful/)?.[1]; }
      else continue;
      if (amount === null) continue;
      evs.push({ sms: s, acc, delta: sign * (amount + (sign < 0 ? fee : 0)), amount, fee, bal, kind, counterparty: cp, payee });
      continue;
    }

    if (!/^nagad$/i.test(s.addr)) continue;

    // Nagad
    const bal = money(/Bal(?:ance)?:\s?(?:Tk\s?)?([\d,]+\.\d+)/);
    if (bal === null) continue;
    const amount = money(/(?:Amount|Amt):\s?Tk\s+([\d,.]+)/);
    if (amount === null) continue;
    let kind: string, sign: 1 | -1, payee: string | undefined;
    const cp = b.match(/Sender: (\d+)/)?.[1];
    if (/Cash In Received/.test(b)) { kind = 'agent-cash-in'; sign = 1; }
    else if (/Money Received/.test(b)) { kind = 'received'; sign = 1; }
    else if (/Add Money from Bank/.test(b)) { kind = 'received'; sign = 1; }
    else if (/Mobile Recharge Request/.test(b)) { kind = 'recharge'; sign = -1; }
    else if (/^Payment to/.test(b)) { kind = 'payment'; sign = -1; payee = b.match(/Payment to '(.+?)'/)?.[1]; }
    else continue;
    evs.push({ sms: s, acc: 'nagad', delta: sign * amount, amount, fee: 0, bal, kind, counterparty: cp ?? (b.match(/From: (\w+)/)?.[1]), payee });
  }

  // bKash bill payments: "Bill successfully paid" carries no balance, but the next bKash balance reflects it.
  for (const s of sms) {
    if (!/^bkash$/i.test(s.addr) || !/Bill successfully paid/.test(s.body)) continue;
    const b = s.body.replace(/\s+/g, ' ');
    const amount = paisa(num(b.match(/Amount: Tk\s?([\d,]+\.\d+)/)![1]));
    const fee = paisa(num(b.match(/Fee: Tk\s?([\d,]+\.\d+)/)?.[1] ?? '0'));
    const payee = b.match(/Biller: (\S+)/)?.[1];
    evs.push({ sms: s, acc: s.sub === '2' ? 'bkash2' : 'bkash', delta: -(amount + fee), amount, fee, bal: null, kind: 'bill', payee });
  }
  return evs;
}

// ---------------------------------------------------------------------------
// Rows (future transactions)
// ---------------------------------------------------------------------------

interface Row {
  t: number;
  day: string;
  hm: string;
  type: CatType;
  amount: number; // paisa, > 0
  acc: AccKey;
  to?: AccKey;
  cat: string;
  desc: string;
  review?: string; // why a human should look at it
}

/** 'YYYY-MM' of the following month. */
function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Salary credited on day ≤ 15 is last month's salary. */
function workMonth(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (d > 15) return `${MONTHS[m - 1]} ${y}`;
  return m === 1 ? `Dec ${y - 1}` : `${MONTHS[m - 2]} ${y}`;
}

function payeeCategory(payee = ''): { cat: string; label: string } {
  const p = payee.toLowerCase();
  if (/desco|bpdb/.test(p)) return { cat: 'Electricity', label: 'Electricity bill' };
  if (/amber it/.test(p)) return { cat: 'Internet', label: 'Internet bill' };
  if (/buet|university|\bru\b|certificate/.test(p)) return { cat: 'University Fee', label: payee };
  if (/bscs|erecruitment/.test(p)) return { cat: 'Exam Fee', label: 'BB recruitment exam fee' };
  if (/nidfee/.test(p)) return { cat: 'NID Fee', label: 'NID correction fee' };
  if (/shohoj|railway/.test(p)) return { cat: 'Railway Ticket', label: 'Railway ticket' };
  if (/skitto|grameenphone|topup/.test(p)) return { cat: 'Mobile Recharge', label: payee };
  return { cat: 'Online Payment', label: payee || 'Online payment' };
}

// ---------------------------------------------------------------------------
// Build the ledger
// ---------------------------------------------------------------------------

function build() {
  const sms = readSms();
  const bank = bankEvents(sms);
  for (const m of MISSING_ATM) {
    bank.push({ sms: syntheticSms(m.at, 'missing ATM SMS'), acc: 'bank', delta: -paisa(m.amount), amount: paisa(m.amount), fee: 0, bal: null, kind: 'ATM Cash Withdrawal', payee: 'missing-sms' });
  }
  bank.sort((a, b) => a.sms.t - b.sms.t);
  const wallets = walletEvents(sms);
  const rows: Row[] = [];
  const notes: string[] = [];
  const within = (a: Sms, b: Sms, min: number) => Math.abs(a.t - b.t) <= min * 60_000;
  const mk = (s: Sms, r: Omit<Row, 't' | 'day' | 'hm'>): Row => ({ t: s.t, day: s.day, hm: s.hm, ...r });

  // --- NexusPay messages without a wallet balance: funded by the bank (pair with a bank debit) or by Rocket
  const nexusNoBal = sms.filter(s => s.addr === '16216' && !s.body.includes('***8445')
    && /paid to .+ (Id|ID) |Loyalty Card .* debited\(TopUp\)/.test(s.body)
    && !/(Balance|NetBal|Bal):\s?Tk/.test(s.body))
    .map(s => {
      const b = s.body.replace(/\s+/g, ' ');
      const topup = /debited\(TopUp\)/.test(b);
      return {
        sms: s,
        amount: paisa(num((b.match(/Tk\.?([\d,]+\.\d+) paid to/) ?? b.match(/BDT ([\d,]+\.\d+)/))![1])),
        fee: paisa(num(b.match(/Fee: Tk\.?([\d.]+)/)?.[1] ?? '0')),
        payee: topup ? 'TopUp' : b.match(/paid to (.+?) (?:Id|ID) /)![1],
        used: false,
      };
    });

  // --- Pair own-account moves
  const debitFT = bank.filter(e => e.delta < 0 && /^(Fund Transfer Debit|Mobile Banking Fund Transfer Withdrawal)$/.test(e.kind));
  for (const w of wallets.filter(w => w.kind === 'from-bank')) {
    const b = debitFT.find(e => !e.pairedWith && e.amount === w.amount && within(e.sms, w.sms, 10));
    if (b) { b.pairedWith = w; w.pairedWith = b; } else notes.push(`Rocket "received from bank" without bank SMS: ${w.sms.day} ${w.sms.hm} ৳${taka(w.amount)}`);
  }
  for (const w of wallets.filter(w => w.kind === 'to-bank')) {
    const b = bank.find(e => !e.pairedWith && e.delta > 0 && /MB Fund Transfer Deposit/.test(e.kind) && e.amount === w.amount && within(e.sms, w.sms, 10));
    if (b) { b.pairedWith = w; w.pairedWith = b; }
  }
  // Own wallet ↔ own wallet (e.g. Rocket SIM3 → Rocket SIM2, bKash SIM2 → bKash SIM3)
  const isOwn = (cp?: string) => !!cp && OWN_NUMBERS.some(n => cp.startsWith(n));
  for (const w of wallets.filter(w => w.kind === 'send' && isOwn(w.counterparty))) {
    const r = wallets.find(x => !x.pairedWith && x.kind === 'received' && x.amount === w.amount && x.acc !== w.acc && within(x.sms, w.sms, 10));
    if (r) { r.pairedWith = w; w.pairedWith = r; }
  }
  // Bank debits that paid a NexusPay bill / top-up directly
  for (const e of debitFT.filter(e => !e.pairedWith)) {
    const n = nexusNoBal.find(n => !n.used && n.amount + n.fee === e.amount && within(n.sms, e.sms, 3));
    if (n) { n.used = true; e.payee = n.payee; }
  }
  // Bank "Fund Transfer" ৳10 right next to an NPSB/BEFTN transfer = transfer fee
  for (const e of bank) {
    if (e.delta === -1000 && /^Fund Transfer$/.test(e.kind)
      && bank.some(o => o !== e && o.delta < -1000 && /^(Fund Transfer|NPSB Acc to Acc Txn)$/.test(o.kind) && within(o.sms, e.sms, 1))) {
      e.kind = 'transfer-fee';
    }
  }

  // --- ATM withdrawals: void reversed pairs, then find the ones that funded a home cash-in
  const atms = bank.filter(e => /ATM Cash Withdrawal/.test(e.kind));
  for (const rev of atms.filter(e => e.delta > 0)) { // "debited by Tk-X" = reversal
    const orig = atms.filter(e => e.delta < 0 && !e.pairedWith && e.amount === rev.amount && e.sms.t < rev.sms.t && within(e.sms, rev.sms, 15)).pop();
    if (orig) { orig.pairedWith = rev; rev.pairedWith = orig; orig.row = rev.row = null; orig.void = rev.void = true; }
    else notes.push(`ATM reversal without matching withdrawal: ${rev.sms.day} ${rev.sms.hm} ৳${taka(rev.amount)}`);
  }
  const familySupport = new Set<Ev>();
  for (const ci of wallets.filter(w => w.kind === 'agent-cash-in' && (w.acc === 'bkash' || w.acc === 'bkash2' || w.acc === 'nagad'))) {
    if (ci.amount < paisa(FAMILY_SUPPORT_MIN)) continue;
    const sameDayAtm = atms.filter(a => a.delta < 0 && a.row !== null && a.sms.day === ci.sms.day && a.sms.t <= ci.sms.t)
      .reduce((s, a) => s + a.amount, 0);
    if (sameDayAtm >= ci.amount) familySupport.add(ci);
    else notes.push(`Cash In ≥ ৳${FAMILY_SUPPORT_MIN} NOT counted as Family Support (no same-day ATM covering it): ${ci.sms.day} ${ci.sms.hm} ${ACCOUNTS[ci.acc].name} ৳${taka(ci.amount)}`);
  }

  // --- Classify bank events
  for (const e of bank) {
    if (e.row === null) continue;
    const s = e.sms;
    const k = e.kind;
    const amount = e.amount;
    if (e.delta > 0) {
      if (/Interest Credit/i.test(k)) e.row = mk(s, { type: 'income', amount, acc: 'bank', cat: 'Bank Interest', desc: 'Bank interest' });
      else if (/CRM\/CDM Cash Deposit/i.test(k)) e.row = mk(s, { type: 'transfer', amount, acc: 'cash', to: 'bank', cat: 'Internal Transfer', desc: 'Cash deposit (CRM/CDM)' });
      else if (/MB Fund Transfer Deposit/.test(k) && e.pairedWith) e.row = null; // booked from the Rocket side
      else if (/NPSB|EFT/i.test(k) && amount >= paisa(SALARY_MIN)) e.row = mk(s, { type: 'income', amount, acc: 'bank', cat: 'Salary', desc: `Salary — ${workMonth(s.day)}` });
      else e.row = mk(s, { type: 'transfer', amount, acc: 'cash', to: 'bank', cat: 'Cash In & Returns', desc: `Bank credit (${k.split('|')[0].trim()}) — own deposit or money returned` });
      continue;
    }
    if (/ATM Cash Withdrawal/.test(k)) e.row = mk(s, { type: 'transfer', amount, acc: 'bank', to: 'cash', cat: 'Internal Transfer', desc: e.payee === 'missing-sms' ? 'ATM withdrawal (SMS missing; inferred from balance)' : 'ATM withdrawal' });
    else if (/POS/i.test(k)) e.row = mk(s, { type: 'expense', amount, acc: 'bank', cat: 'Shopping', desc: 'POS purchase' });
    else if (/ECOM/i.test(k)) e.row = mk(s, { type: 'expense', amount, acc: 'bank', cat: 'Online Payment', desc: 'Card e-commerce purchase' });
    else if (/Fee|VAT|Tax|Excise/i.test(k) || k === 'transfer-fee') e.row = mk(s, { type: 'expense', amount, acc: 'bank', cat: 'Bank Charges', desc: k === 'transfer-fee' ? 'Transfer fee' : k });
    else if (e.pairedWith) e.row = mk(s, { type: 'transfer', amount, acc: 'bank', to: e.pairedWith.acc, cat: 'Internal Transfer', desc: `Bank → ${ACCOUNTS[e.pairedWith.acc].name}` });
    else if (e.payee) { const p = payeeCategory(e.payee); e.row = mk(s, { type: 'expense', amount, acc: 'bank', cat: e.payee === 'TopUp' ? 'Mobile Recharge' : p.cat, desc: `${e.payee === 'TopUp' ? 'Mobile recharge' : p.label} (NexusPay, from bank)` }); }
    else e.row = mk(s, { type: 'expense', amount, acc: 'bank', cat: 'Personal Expense', desc: `Bank transfer out — unidentified (${k})`, review: 'Unidentified bank transfer' });
  }

  // --- Classify wallet events
  for (const w of wallets) {
    const s = w.sms;
    const acc = w.acc;
    const name = ACCOUNTS[acc].name;
    switch (w.kind) {
      case 'from-bank': w.row = w.pairedWith ? null : mk(s, { type: 'transfer', amount: w.amount, acc: 'cash', to: acc, cat: 'Cash In & Returns', desc: 'Received from bank (bank SMS missing)', review: 'Bank SMS missing' }); break;
      case 'to-bank':
        w.row = mk(s, { type: 'transfer', amount: w.amount, acc, to: 'bank', cat: 'Internal Transfer', desc: `${name} → Bank` });
        if (w.fee) w.fees = [mk(s, { type: 'expense', amount: w.fee, acc, cat: 'Bank Charges', desc: 'Rocket → Bank fee' })];
        break;
      case 'agent-cash-in':
        w.row = mk(s, { type: 'transfer', amount: w.amount, acc: 'cash', to: acc, cat: 'Internal Transfer', desc: `Cash In to ${name} (agent)` });
        if (familySupport.has(w)) w.after = [mk(s, { type: 'expense', amount: w.amount, acc, cat: 'Family Support', desc: `Sent home (ATM → ${name} Cash In)` })];
        break;
      case 'cash-out':
        w.row = mk(s, { type: 'transfer', amount: w.amount, acc, to: 'cash', cat: 'Internal Transfer', desc: `Cash Out from ${name}` });
        if (w.fee) w.fees = [mk(s, { type: 'expense', amount: w.fee, acc, cat: 'Bank Charges', desc: 'Cash out fee' })];
        break;
      case 'send':
        if (w.pairedWith) w.row = mk(s, { type: 'transfer', amount: w.amount, acc, to: w.pairedWith.acc, cat: 'Internal Transfer', desc: `${name} → ${ACCOUNTS[w.pairedWith.acc].name}` });
        else w.row = mk(s, { type: 'expense', amount: w.amount + w.fee, acc, cat: 'Personal Expense', desc: `Send money to ${w.counterparty}`, review: 'Rocket send money' });
        break;
      case 'received':
        if (w.pairedWith) w.row = null; // booked by the sending side
        else if (isOwn(w.counterparty)) {
          const from: AccKey = acc === 'bkash' ? 'bkash2' : acc === 'bkash2' ? 'bkash' : acc === 'rocket' ? 'rocket2' : 'rocket';
          w.row = mk(s, { type: 'transfer', amount: w.amount, acc: from, to: acc, cat: 'Internal Transfer', desc: `${ACCOUNTS[from].name} → ${name}` });
        } else w.row = mk(s, { type: 'transfer', amount: w.amount, acc: 'cash', to: acc, cat: 'Cash In & Returns', desc: `Received from ${w.counterparty ?? 'unknown'} — own cash-in or money returned` });
        break;
      case 'cashback': w.row = mk(s, { type: 'income', amount: w.amount, acc, cat: 'Cashback', desc: 'Cashback' }); break;
      case 'refund': w.row = mk(s, { type: 'income', amount: w.amount, acc, cat: 'Refund', desc: 'Reversal / refund' }); break;
      case 'recharge': w.row = mk(s, { type: 'expense', amount: w.amount + w.fee, acc, cat: 'Mobile Recharge', desc: `Mobile recharge (${name})` }); break;
      case 'ecommerce': w.row = mk(s, { type: 'expense', amount: w.amount, acc, cat: 'Online Payment', desc: 'e-Commerce payment (Rocket)' }); break;
      case 'payment': case 'bill': {
        const p = payeeCategory(w.payee);
        w.row = mk(s, { type: 'expense', amount: w.amount + w.fee, acc, cat: p.cat, desc: p.label + (w.fee ? ` (incl. ৳${taka(w.fee)} fee)` : '') });
        break;
      }
    }
  }

  const manual: Ev[] = MANUAL.map(m => {
    const sm = syntheticSms(m.at, m.desc);
    const row = mk(sm, { type: m.type, amount: paisa(m.amount), acc: m.acc, to: m.to, cat: m.cat, desc: m.desc });
    return { sms: sm, acc: m.acc, delta: 0, amount: row.amount, fee: 0, bal: null, kind: 'manual', row };
  });
  const events = [...bank, ...wallets, ...manual].sort((a, b) => a.sms.t - b.sms.t);

  // --- Replay: book rows in time order and check each account against the balance its SMS states.
  const booked: Record<AccKey, number> = { bank: 0, rocket: 0, rocket2: 0, bkash: 0, bkash2: 0, nagad: 0, cash: 0, loans: 0, amanat: 0 };
  const opening: Partial<Record<AccKey, number>> = { cash: 0 };
  const lastBal: Partial<Record<AccKey, number>> = {};
  const adjustments: Row[] = [];
  const applied = new Set<Row>();
  const effect = (r: Row, acc: AccKey) =>
    r.type === 'income' ? (r.acc === acc ? r.amount : 0)
      : r.type === 'expense' ? (r.acc === acc ? -r.amount : 0)
        : (r.acc === acc ? -r.amount : 0) + (r.to === acc ? r.amount : 0);
  const apply = (r: Row) => {
    if (applied.has(r)) return;
    applied.add(r);
    for (const k of Object.keys(booked) as AccKey[]) booked[k] += effect(r, k);
    rows.push(r);
  };
  // Rows booked when an event is processed. A paired move is booked by whichever of its two SMS comes first.
  const rowsOf = (e: Ev): Row[] => {
    const own = e.row ?? (e.pairedWith && !e.void ? e.pairedWith.row : null);
    const partnerFees = e.row === null && e.pairedWith ? e.pairedWith.fees ?? [] : [];
    return [own, ...(e.fees ?? []), ...partnerFees].filter((r): r is Row => !!r && !applied.has(r));
  };
  // NexusPay payments (no balance in their SMS) that explain a Rocket shortfall: 1 or 2 payments, plus a small fee
  const matchNexus = (short: number, t: number) => {
    const c = nexusNoBal.filter(n => !n.used && n.sms.t <= t && n.sms.t > t - 45 * 86_400_000);
    const ok = (sum: number) => short - sum >= 0 && short - sum <= Math.max(500, Math.round(sum * 0.02));
    for (const n of c) if (ok(n.amount)) return [n];
    for (let a = 0; a < c.length; a++) for (let b = a + 1; b < c.length; b++) if (c[a].payee === c[b].payee && ok(c[a].amount + c[b].amount)) return [c[a], c[b]];
    return null;
  };
  const fits = (e: Ev) => e.bal !== null && e.bal === booked[e.acc] + rowsOf(e).reduce((x, r) => x + effect(r, e.acc), 0);

  for (let i = 0; i < events.length; i++) {
    let e = events[i];
    // Same-minute SMS often arrive out of order (a ৳10 fee before its transfer): if this one doesn't
    // fit but a later one for the same account within 3 minutes does, take that one first.
    if (!e.void && e.bal !== null && e.acc in opening && !fits(e)) {
      for (let j = i + 1; j < events.length && events[j].sms.t - e.sms.t <= 3 * 60_000; j++) {
        const o = events[j];
        if (o.acc === e.acc && !o.void && fits(o)) { events.splice(j, 1); events.splice(i, 0, o); e = o; break; }
      }
    }
    const s = e.sms;
    const now = e.void ? [] : rowsOf(e);
    // The bank states the same C/B on every SMS of one posting (e.g. a transfer and its ৳10 fee):
    // only the last SMS of such a group is checked.
    const grouped = events.slice(i + 1).some(o => o.sms.t - s.t <= 2 * 60_000 && o.acc === e.acc && o.bal === e.bal && !o.void);
    if (e.bal !== null && !e.void && !grouped) {
      const expected = booked[e.acc] + now.reduce((x, r) => x + effect(r, e.acc), 0);
      if (!(e.acc in opening)) {
        opening[e.acc] = e.bal - expected;
        booked[e.acc] += e.bal - expected;
      } else if (e.bal !== expected) {
        const gap = e.bal - expected;
        // A Rocket gap may be a NexusPay payment whose own SMS states no balance
        const paid = gap < 0 && e.acc.startsWith('rocket') ? matchNexus(-gap, s.t) : null;
        if (paid) {
          for (const n of paid) n.used = true;
          const p = payeeCategory(paid[0].payee);
          const fee = -gap - paid.reduce((x, n) => x + n.amount, 0);
          apply(mk(paid[0].sms, { type: 'expense', amount: -gap, acc: e.acc, cat: p.cat, desc: `${p.label} (NexusPay${paid.length > 1 ? ` ×${paid.length}` : ''}${fee ? `, incl. ৳${taka(fee)} fee` : ''})` }));
        } else {
          const adj = mk(s, {
            type: gap > 0 ? 'income' : 'expense', amount: Math.abs(gap), acc: e.acc,
            cat: gap > 0 ? 'Unrecorded Inflow' : 'Unrecorded Outflow',
            desc: `Balance adjustment — SMS missing (booked ৳${taka(expected)}, SMS says ৳${taka(e.bal)})`,
          });
          apply(adj);
          adjustments.push(adj);
        }
      }
    } else if (!(e.acc in opening)) {
      opening[e.acc] = 0;
    }
    now.forEach(apply);
    e.after?.forEach(apply);
    if (e.bal !== null && !e.void) lastBal[e.acc] = e.bal;
  }

  // FlexiLoad / Skitto recharge confirmations: skip those already booked from a wallet/bank, the rest were paid in cash
  const recharges = rows.filter(r => r.cat === 'Mobile Recharge');
  for (const s of sms) {
    const m = s.addr === 'FlexiLoad' && s.body.match(/amount ([\d.]+) BDT/);
    if (!m) continue;
    const amount = paisa(num(m[1]));
    const match = recharges.find(r => !('matched' in r) && r.amount === amount && Math.abs(r.t - s.t) <= 5 * 60_000);
    if (match) { Object.defineProperty(match, 'matched', { value: true }); continue; }
    const bankDebit = rows.find(r => r.review === 'Unidentified bank transfer' && r.amount === amount && Math.abs(r.t - s.t) <= 5 * 60_000);
    if (bankDebit) { Object.assign(bankDebit, { cat: 'Mobile Recharge', desc: 'Mobile recharge (NexusPay, from bank)', review: undefined }); continue; }
    apply(mk(s, { type: 'expense', amount, acc: 'cash', cat: 'Mobile Recharge', desc: 'Mobile recharge (paid in cash)' }));
  }

  // Overrides (before the cash smoothing, so any cash effect they have is included)
  const usedOverrides = new Set<string>();
  for (const r of [...rows]) {
    const key = `${r.day} ${r.hm}|${r.amount / 100}`;
    const o = OVERRIDES[key];
    if (!o) continue;
    if (typeof o === 'string') r.cat = o;
    else if ('split' in o) {
      if (paisa(o.split.reduce((x, p) => x + p.amount, 0)) !== r.amount) throw new Error(`Split of ${key} doesn't add up`);
      const [first, ...rest] = o.split;
      Object.assign(r, { cat: first.cat, amount: paisa(first.amount), desc: first.desc });
      for (const p of rest) rows.push({ ...r, cat: p.cat, amount: paisa(p.amount), desc: p.desc });
    } else {
      if ('asIncome' in o && o.asIncome && r.type === 'transfer') Object.assign(r, { type: 'income', acc: r.to, to: undefined });
      r.cat = o.cat ?? r.cat;
      r.desc = o.desc;
    }
    r.review = undefined;
    usedOverrides.add(key);
  }
  for (const key of Object.keys(OVERRIDES)) if (!usedOverrides.has(key)) notes.push(`Override matched no row: ${key}`);

  // Untracked cash spending. At each month end, book as "Daily Expenses" whatever cash can be spent
  // without the balance ever dropping below 0 later (so later cash purchases stay covered) and so
  // that Cash ends at the amount in hand today.
  {
    rows.sort((a, b) => a.t - b.t);
    const cashFx = (r: Row) => (r.acc === 'cash' ? (r.type === 'income' ? r.amount : -r.amount) : 0) + (r.to === 'cash' ? r.amount : 0);
    const pts: Array<{ t: number; bal: number }> = [];
    let bal = 0;
    for (const r of rows) { bal += cashFx(r); pts.push({ t: r.t, bal }); }
    const endT = syntheticSms(CASH_NOW.at, '').t;
    const target = paisa(CASH_NOW.amount);
    const finalBal = bal;
    if (finalBal < target) notes.push(`Cash booked (৳${taka(finalBal)}) is below cash in hand (৳${taka(target)})`);
    let spent = 0;
    const firstCash = rows.find(r => cashFx(r) !== 0)!;
    for (let ym = firstCash.day.slice(0, 7); ; ym = nextMonth(ym)) {
      const [y, m] = ym.split('-').map(Number);
      const at = `${ym}-${new Date(Date.UTC(y, m, 0)).getUTCDate()} 23:59`;
      const t = syntheticSms(at, '').t;
      if (t >= endT) break;
      const balAt = pts.filter(p => p.t <= t).pop()?.bal ?? 0;
      const future = Math.min(balAt, ...pts.filter(p => p.t > t).map(p => p.bal), finalBal - target);
      const amount = future - spent;
      if (amount > 0) {
        const sm = syntheticSms(at, '');
        rows.push(mk(sm, { type: 'expense', amount, acc: 'cash', cat: 'Daily Expenses', desc: `Untracked cash spending — ${ym} (food, transport, etc.)` }));
        booked.cash -= amount;
        spent += amount;
      }
    }
    const rest = finalBal - target - spent;
    if (rest > 0) {
      const sm = syntheticSms(CASH_NOW.at, '');
      rows.push(mk(sm, { type: 'expense', amount: rest, acc: 'cash', cat: 'Daily Expenses', desc: `Untracked cash spending — ${sm.day.slice(0, 7)} (to date)` }));
      booked.cash -= rest;
    }
    booked.cash = finalBal - spent - Math.max(rest, 0);
  }

  // Every row's type must match its category's type (a sub-category inherits its parent's type)
  const catType = new Map<string, CatType>();
  for (const c of CATEGORIES) { catType.set(c.name, c.type); for (const ch of c.children ?? []) catType.set(ch, c.type); }
  for (const r of rows) {
    if (!catType.has(r.cat)) throw new Error(`Unknown category "${r.cat}" (${r.day} ${r.desc})`);
    if (catType.get(r.cat) !== r.type) throw new Error(`Row type ${r.type} ≠ category "${r.cat}" (${catType.get(r.cat)}) on ${r.day} ${r.hm}: ${r.desc}`);
  }


  rows.sort((a, b) => a.t - b.t);
  return { rows, booked, opening: opening as Record<AccKey, number>, lastBal, adjustments, notes, familySupport: rows.filter(r => r.cat === 'Family Support') };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function report(l: ReturnType<typeof build>) {
  const out: string[] = [];
  const keys = Object.keys(ACCOUNTS) as AccKey[];
  out.push(`# Migration dry run — ${new Date().toISOString()}`, '', `Rows: **${l.rows.length}**`, '');
  out.push('## Accounts', '', '| Account | Opening | Final (booked) | Last SMS balance | Match |', '|---|--:|--:|--:|:-:|');
  for (const k of keys) {
    const last = l.lastBal[k];
    out.push(`| ${ACCOUNTS[k].name} | ${taka(l.opening[k] ?? 0)} | ${taka(l.booked[k])} | ${last === undefined ? '—' : taka(last)} | ${last === undefined ? '—' : last === l.booked[k] ? '✅' : '⚠️'} |`);
  }
  const byCat: Record<string, { type: CatType; n: number; sum: number }> = {};
  for (const r of l.rows) { const c = (byCat[r.cat] ??= { type: r.type, n: 0, sum: 0 }); c.n++; c.sum += r.amount; }
  out.push('', '## Categories', '', '| Category | Type | Count | Total |', '|---|---|--:|--:|');
  for (const [c, v] of Object.entries(byCat).sort((a, b) => a[1].type.localeCompare(b[1].type) || b[1].sum - a[1].sum)) out.push(`| ${c} | ${v.type} | ${v.n} | ${taka(v.sum)} |`);
  const table = (title: string, rs: Row[]) => {
    out.push('', `## ${title} (${rs.length})`, '', '| When | Account | Amount | Category | Description |', '|---|---|--:|---|---|');
    for (const r of rs) out.push(`| ${r.day} ${r.hm} | ${ACCOUNTS[r.acc].name}${r.to ? ' → ' + ACCOUNTS[r.to].name : ''} | ${taka(r.amount)} | ${r.cat} | ${r.desc} |`);
  };
  table('Family Support', l.familySupport);
  out.push('', `**Total sent home: ৳${taka(l.familySupport.reduce((x, r) => x + r.amount, 0))}**`);
  const byMonth = (rs: Row[]) => {
    const g = new Map<string, Row[]>();
    for (const r of rs) g.set(r.day.slice(0, 7), [...(g.get(r.day.slice(0, 7)) ?? []), r]);
    return [...g.entries()].sort();
  };
  out.push('', '### Sent home, by month', '', '| Month | Amount | How |', '|---|--:|---|');
  for (const [mo, rs] of byMonth(l.familySupport)) out.push(`| ${mo} | ${taka(rs.reduce((x, r) => x + r.amount, 0))} | ${rs.map(r => `${taka(r.amount)} ${r.desc}`).join('<br>')} |`);

  // Salary by the month it was earned (parsed from the description), bonuses alongside
  const salary = l.rows.filter(r => r.cat === 'Salary' || r.cat === 'Bonus');
  const earned = (r: Row) => {
    const m = r.desc.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})/);
    if (m) return `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}`;
    const w = workMonth(r.day).split(' ');
    return `${w[1]}-${String(MONTHS.indexOf(w[0]) + 1).padStart(2, '0')}`;
  };
  out.push('', '## Salary, by month earned', '', '| Month | Salary | Bonus | Paid on | Via |', '|---|--:|--:|---|---|');
  const months = [...new Set(salary.map(earned))].sort();
  for (let mo = months[0]; mo <= months[months.length - 1]; mo = nextMonth(mo)) {
    const rs = salary.filter(r => earned(r) === mo);
    const sum = (c: string) => rs.filter(r => r.cat === c).reduce((x, r) => x + r.amount, 0);
    out.push(rs.length
      ? `| ${mo} | ${taka(sum('Salary'))} | ${sum('Bonus') ? taka(sum('Bonus')) : ''} | ${[...new Set(rs.map(r => r.day))].join(', ')} | ${[...new Set(rs.map(r => ACCOUNTS[r.acc].name === 'Cash' ? 'in hand' : 'bank'))].join(', ')} |`
      : `| ${mo} | **— missing —** | | | |`);
  }
  out.push('', `**Total salary: ৳${taka(salary.filter(r => r.cat === 'Salary').reduce((x, r) => x + r.amount, 0))} + bonus ৳${taka(salary.filter(r => r.cat === 'Bonus').reduce((x, r) => x + r.amount, 0))}**`);

  const rent = l.rows.filter(r => r.cat === 'Room Rent');
  out.push('', '## Room rent', '', '| Paid on | Amount | From | Description |', '|---|--:|---|---|');
  for (const r of rent) out.push(`| ${r.day} | ${taka(r.amount)} | ${ACCOUNTS[r.acc].name} | ${r.desc} |`);
  out.push('', `**Total rent: ৳${taka(rent.reduce((x, r) => x + r.amount, 0))}**`);
  table('Balance adjustments (SMS missing)', l.adjustments);
  table('Unidentified — owner does not remember; kept as best guess', l.rows.filter(r => r.review));
  out.push('', '## Notes', '', ...l.notes.map(n => `- ${n}`));
  fs.writeFileSync(REPORT_PATH, out.join('\n') + '\n');

  const csv = ['date,time,type,account,to_account,amount,category,description,review'];
  for (const r of l.rows) csv.push([r.day, r.hm, r.type, ACCOUNTS[r.acc].name, r.to ? ACCOUNTS[r.to].name : '', (r.amount / 100).toFixed(2), r.cat, r.desc, r.review ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  fs.writeFileSync(CSV_PATH, csv.join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

async function applyToDb(l: ReturnType<typeof build>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! });
  const db = drizzle(pool, { schema });
  const host = new URL(process.env.DATABASE_URL!).host;
  console.log(`Applying to ${host} ...`);

  // Keep the existing password; nothing secret needs to live in this file.
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, USER.email));
  const passwordHash = existing?.passwordHash ?? process.env.MIGRATION_PASSWORD_HASH;
  if (!passwordHash) throw new Error(`No existing user ${USER.email}; set MIGRATION_PASSWORD_HASH (bcrypt) to create one.`);

  await db.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_historical boolean DEFAULT false NOT NULL`);

    // Never silently delete entries typed into the app
    const live = await tx.execute(sql`SELECT count(*)::int AS n FROM transactions WHERE is_historical = false`);
    const liveCount = (live.rows[0] as { n: number }).n;
    if (liveCount > 0 && !FORCE_WIPE) {
      throw new Error(`${liveCount} transaction(s) were entered in the app since the import; --apply would delete them. Aborting (use --force-wipe to override).`);
    }

    // Saved Insights groups, remembered by category name so they can be re-linked after the reinsert
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS category_groups (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name varchar(100) NOT NULL,
      category_ids integer[] NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS category_group_user_id_idx ON category_groups (user_id)`);
    const savedGroups = (await tx.execute(sql`
      SELECT g.name, ARRAY(SELECT c.name FROM categories c WHERE c.id = ANY(g.category_ids)) AS category_names
      FROM category_groups g ORDER BY g.id`)).rows as Array<{ name: string; category_names: string[] }>;

    await tx.execute(sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS role varchar(20) DEFAULT 'own' NOT NULL`);
    await tx.execute(sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS show_on_dashboard boolean DEFAULT true NOT NULL`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS transaction_is_historical_idx ON transactions (is_historical)`);
    await tx.execute(sql`TRUNCATE TABLE category_groups, transactions, accounts, categories, users RESTART IDENTITY CASCADE`);
    const [user] = await tx.insert(schema.users).values({ ...USER, passwordHash }).returning();

    const accId = {} as Record<AccKey, number>;
    for (const k of Object.keys(ACCOUNTS) as AccKey[]) {
      const [a] = await tx.insert(schema.accounts).values({ userId: user.id, ...ACCOUNTS[k], role: ACCOUNTS[k].role ?? 'own', balance: l.booked[k], currency: 'BDT' }).returning();
      accId[k] = a.id;
    }

    const catId: Record<string, number> = {};
    for (const c of CATEGORIES) {
      const [row] = await tx.insert(schema.categories).values({ name: c.name, type: c.type, color: c.color }).returning();
      catId[c.name] = row.id;
      for (const child of c.children ?? []) {
        const [ch] = await tx.insert(schema.categories).values({ name: child, type: c.type, color: c.color, parentId: row.id }).returning();
        catId[child] = ch.id;
      }
    }

    for (const g of savedGroups) {
      const ids = g.category_names.map(n => catId[n]).filter(Boolean);
      if (ids.length) await tx.insert(schema.categoryGroups).values({ userId: user.id, name: g.name, categoryIds: ids });
    }

    const values = l.rows.map(r => {
      if (!catId[r.cat]) throw new Error(`Unknown category ${r.cat}`);
      return {
        amount: r.amount, type: r.type, categoryId: catId[r.cat], accountId: accId[r.acc],
        toAccountId: r.to ? accId[r.to] : null, description: r.desc, date: r.day, currency: 'BDT', isHistorical: true,
        createdAt: new Date(r.t),
      };
    });
    for (let i = 0; i < values.length; i += 200) await tx.insert(schema.transactions).values(values.slice(i, i + 200));

    // Sanity: balances implied by the inserted rows must equal the stored balances
    const check = await tx.execute(sql`
      SELECT a.name, a.balance,
        COALESCE((SELECT SUM(CASE WHEN t.type='income' THEN t.amount WHEN t.type IN ('expense','transfer') THEN -t.amount END) FROM transactions t WHERE t.account_id=a.id),0)
          + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.to_account_id=a.id AND t.type='transfer'),0) AS movement
      FROM accounts a`);
    for (const r of check.rows as Array<{ name: string; balance: number; movement: string }>) {
      const k = (Object.keys(ACCOUNTS) as AccKey[]).find(k => ACCOUNTS[k].name === r.name)!;
      if ((l.opening[k] ?? 0) + Number(r.movement) !== Number(r.balance)) throw new Error(`Balance check failed for ${r.name}`);
    }
  });
  await pool.end();
  console.log('Done.');
}

async function main() {
  const ledger = build();
  report(ledger);
  console.log(`Rows: ${ledger.rows.length}. Report: ${path.relative(process.cwd(), REPORT_PATH)}`);
  for (const k of Object.keys(ACCOUNTS) as AccKey[]) console.log(`  ${ACCOUNTS[k].name.padEnd(28)} ${taka(ledger.booked[k]).padStart(14)}`);
  if (APPLY) await applyToDb(ledger);
  else console.log('Dry run only. Re-run with --apply to write to the database.');
}

main().catch((e) => { console.error(e); process.exit(1); });
