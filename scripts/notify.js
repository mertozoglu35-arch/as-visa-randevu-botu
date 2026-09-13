import fs from 'node:fs';

const mode = process.argv[2] || 'manual';
const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/^bot/i, '');
const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();

if (!token || !chatId) {
  console.error('TELEGRAM_BOT_TOKEN veya TELEGRAM_CHAT_ID eksik.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync('result.json', 'utf8'));

async function send(text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body?.description || `Telegram HTTP ${res.status}`);
}

function resultLines() {
  return (data.results || []).map(r => {
    const label = `${r.country} - ${r.city}`;
    if (r.status === 'slots') return `✅ ${label}: ${r.slots?.length || 0} uygun saat`;
    if (r.status === 'none') return `• ${label}: randevu yok`;
    if (r.status === 'challenge') return `⚠️ ${label}: CAPTCHA / doğrulama`;
    return `❌ ${label}: hata`;
  });
}

let text = '';
if (mode === 'slots') {
  const rows = (data.slots || []).slice(0, 12);
  text = '🚨 AS VISA RANDEVU BULUNDU\n\n' + rows.map(s => [
    `${s.country} - ${s.city}`,
    `Tarih: ${s.date || 'belirtilmedi'}`,
    `Saat: ${s.time || 'belirtilmedi'}`,
    s.purpose ? `Amaç: ${s.purpose}` : '',
    s.url
  ].filter(Boolean).join('\n')).join('\n\n');
  if ((data.slots || []).length > rows.length) text += `\n\n+${data.slots.length - rows.length} başka slot daha var.`;
} else if (mode === 'challenge') {
  text = '⚠️ AS Visa bulut taraması doğrulamaya takıldı.\n\nGitHub sunucusu CAPTCHA / erişim doğrulaması görüyor. Bu durumda otomatik tarama güvenilir değildir.\n\n' + resultLines().join('\n');
} else {
  text = '🧪 AS Visa GitHub testi tamamlandı.\n\n' + resultLines().join('\n') + `\n\nKontrol zamanı: ${data.generatedAt}`;
}

await send(text);
console.log('Telegram mesajı gönderildi:', mode);
