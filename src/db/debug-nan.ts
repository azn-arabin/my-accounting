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
  const m = text.match(amountRegex);
  if (!m) return 0;
  return parseFloat(m[1].replace(/,/g, ''));
}
for (const msg of messages) {
  const b = msg.body;
  const amt = extractAmount(b);
  if (isNaN(amt)) console.log('NaN amount in:', b);
}

