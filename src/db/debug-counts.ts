import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL!);
async function check() {
  const users = await sql`SELECT count(*) FROM users`;
  const accounts = await sql`SELECT count(*) FROM accounts`;
  const txns = await sql`SELECT count(*) FROM transactions`;
  console.log(`Users: ${users[0].count}, Accounts: ${accounts[0].count}, Transactions: ${txns[0].count}`);
}
check().catch(console.error);

