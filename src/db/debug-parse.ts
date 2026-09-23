import fs from 'fs';
import path from 'path';

const xmlPath = path.join(process.cwd(), 'data', 'sms-20260921214106.xml');
const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

const smsRegex = /<sms\s+([^>]+)>/g;
const messages: any[] = [];

let match;
while ((match = smsRegex.exec(xmlContent)) !== null) {
  const attrsStr = match[1];
  const getAttr = (name: string) => {
    const m = attrsStr.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1] : '';
  };
  messages.push({
    address: getAttr('address'),
    body: getAttr('body').replace(/&#10;/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
  });
}

const amountRegex = /Tk\s*(-?[\d,]+(\.\d+)?)/i;
function extractAmount(text: string): number {
  const match = text.match(amountRegex);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, ''));
}

let totalIncome = 0;
let totalExpense = 0;
let currentBalance = 39888.70;

for (const msg of messages) {
  const b = msg.body;
  const lowerBody = b.toLowerCase();
  const addr = msg.address.toUpperCase();
  const amt = extractAmount(b); 
  
  if (amt === 0) continue;
  
  if (addr === '16216') {
     let matched = false;
    if (lowerBody.includes('credited')) {
       totalIncome += amt;
       matched = true;
    } else if (lowerBody.includes('debited') || lowerBody.includes('paid to') || lowerBody.includes('paid through') || lowerBody.includes('pos')) {
       if (amt < 0) {
          totalIncome += Math.abs(amt);
       } else {
          totalExpense += amt;
       }
       matched = true;
    }
    
    if (!matched) {
        console.log('UNMATCHED DBBL SMS:', b);
    }
  }
}

console.log('Total Income:', totalIncome);
console.log('Total Expense:', totalExpense);
console.log('Net Balance (Bank):', 39888.70 + totalIncome - totalExpense);

