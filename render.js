const puppeteer = require('puppeteer');
const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function main() {
  // 1. Извлекаем payload, переданный из Google Таблиц
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    throw new Error('Не найден файл события GITHUB_EVENT_PATH');
  }

  const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const payload = eventData.client_payload || {};

  const title = payload.title || 'Отчет';
  const items = payload.items || [];
  
  // Очищаем токен и chatId от случайных пробелов или символов
  const token = (process.env.TELEGRAM_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

  if (!token || !chatId) {
    throw new Error('Отсутствуют или пусты секреты TELEGRAM_TOKEN или TELEGRAM_CHAT_ID в GitHub Secrets');
  }

  // 2. Генерация строк таблицы с крупными шрифтами для мобильных экранов
  const rowsHtml = items.map((item, index) => {
    const isYellow = (index === 0 || index === items.length - 1);
    const bgStyle = isYellow ? 'background-color: #FEF3C7;' : 'background-color: #FFFFFF;';

    const valA = item.a !== undefined && item.a !== null ? String(item.a) : '';
    const valB = item.b !== undefined && item.b !== null ? String(item.b) : '';
    const valC = item.c !== undefined && item.c !== null ? String(item.c) : '';
    const valD = item.d !== undefined && item.d !== null ? String(item.d) : '';

    return `
      <tr style="${bgStyle}">
        <td class="col-a">${valA}</td>
        <td class="col-bcd">${valB}</td>
        <td class="col-bcd">${valC}</td>
        <td class="col-bcd">${valD}</td>
      </tr>
    `;
  }).join('');

  // 3. Шаблон HTML (1200x1200px)
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          width: 1200px;
          height: 1200px;
          background-color: #FFFFFF;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 60px;
        }
        .container {
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        .title {
          font-size: 36px;
          font-weight: 700;
          color: #1E293B;
          margin-bottom: 24px;
          text-align: left;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        td {
          padding: 14px 16px;
          border: 1px solid #E2E8F0;
          vertical-align: middle;
        }
        tr:first-child td {
          text-align: center !important;
        }
        .col-a {
          width: 46%;
          font-size: 24px;
          font-weight: 700;
          color: #0F172A;
          text-align: left;
        }
        .col-bcd {
          width: 18%;
          font-size: 26px;
          font-weight: 500;
          color: #334155;
          text-align: right;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="title">${title}</div>
        <table>
          ${rowsHtml}
        </table>
      </div>
    </body>
    </html>
  `;

  // 4. Запуск Puppeteer (встроенный Chrome + новый Headless режим)
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 1200,
    height: 1200,
    deviceScaleFactor: 2
  });

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  const imageBuffer = await page.screenshot({ type: 'png' });
  await browser.close();

  // 5. Отправка изображения в Telegram API (абсолютный URL)
  const telegramUrl = `https://api.telegram.org/bot${token}/sendPhoto`;

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', `📊 <b>${title}</b>\n\nПолный отчет по сотрудникам.`);
  form.append('parse_mode', 'HTML');
  form.append('photo', imageBuffer, {
    filename: 'Schedule_Card.png',
    contentType: 'image/png'
  });

  const response = await fetch(telegramUrl, {
    method: 'POST',
    body: form
  });

  const resJson = await response.json();
  if (!resJson.ok) {
    throw new Error(`Telegram API Error: ${JSON.stringify(resJson)}`);
  }

  console.log('✅ Фотография успешно отправлена в Telegram!');
}

main().catch(err => {
  console.error('❌ Ошибка выполнения:', err.message);
  process.exit(1);
});
