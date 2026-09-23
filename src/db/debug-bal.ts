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
    dateObj: new Date(parseInt(getAttr('date'))),
  });
}
messages.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

const amountRegex = /Tk\s*\.?\s*(-?\d[\d,]*(\.\d+)?)/i;
const amountReverseRegex = /(-?\d[\d,]*(\.\d+)?)\s*Tk/i;

function extractAmount(text: string): number {
  let m = text.match(amountRegex);
  if (!m) m = text.match(amountReverseRegex);
  if (!m) return 0;
  const val = parseFloat(m[1].replace(/,/g, ''));
  return isNaN(val) ? 0 : val;
}

let bankBal = 39888.70;
for (const msg of messages) {
  const b = msg.body;
  const lowerBody = b.toLowerCase();
  const addr = msg.address.toUpperCase();
  const amt = extractAmount(b);
  if (amt === 0) continue;

  let isBank = false;
  if (addr === '16216' && lowerBody.includes('***8445')) {
     isBank = true;
  }

  if (isBank) {
     const cbMatch = lowerBody.match(/c\/b\s*tk\s*([\d,]+(\.\d+)?)/);
     let cbAmount = null;
     if (cbMatch) {
         cbAmount = parseFloat(cbMatch[1].replace(/,/g, ''));
     }

     if (cbAmount !== null) {
        // If there's a discrepancy BEFORE applying this transaction, it means a previous SMS was lost!
        // We calculate what the balance should have been before this transaction to reach cbAmount.
        let expectedPrevBal = bankBal;
        if (lowerBody.includes('credited')) expectedPrevBal = cbAmount - Math.abs(amt);
        else if (lowerBody.includes('debited') || lowerBody.includes('atm cash withdrawal')) {
            if (amt < 0) expectedPrevBal = cbAmount - Math.abs(amt); // Reversal adds to balance
            else expectedPrevBal = cbAmount + amt; // Debit removes from balance
        }

        const diff = Math.round(expectedPrevBal - bankBal);
        if (Math.abs(diff) > 10) {
           console.log(`MISSING SMS DETECTED: expected ${expectedPrevBal}, had ${bankBal}, diff ${diff}. Inserting Adjustment!`);
           bankBal = expectedPrevBal;
        }
     }

     // Now apply the transaction
     if (lowerBody.includes('credited')) bankBal += Math.abs(amt);
     else if (lowerBody.includes('atm cash withdrawal')) {
       if (amt < 0) bankBal += Math.abs(amt);
       else bankBal -= amt;
     }
     else if (lowerBody.includes('debited')) {
       if (amt < 0) bankBal += Math.abs(amt);
       else bankBal -= amt;
     }
  }
}

console.log('Final Bank Bal:', bankBal);

