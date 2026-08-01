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
  
  const token = (process.env.TELEGRAM_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

  if (!token || !chatId) {
    throw new Error('Отсутствуют или пусты секреты TELEGRAM_TOKEN или TELEGRAM_CHAT_ID в GitHub Secrets');
  }

  // 2. Генерация строк таблицы с правильной жирностью
  const numRows = items.length;
  const rowsHtml = items.map((item, index) => {
    const isFirstOrLast = (index === 0 || index === numRows - 1);
    const bgStyle = isFirstOrLast ? 'background-color: #FEF3C7;' : 'background-color: #FFFFFF;';
    const rowClass = isFirstOrLast ? 'row-bold' : 'row-normal';

    const valA = item.a !== undefined && item.a !== null ? String(item.a) : '';
    const valB = item.b !== undefined && item.b !== null ? String(item.b) : '';
    const valC = item.c !== undefined && item.c !== null ? String(item.c) : '';
    const valD = item.d !== undefined && item.d !== null ? String(item.d) : '';

    return `
      <tr class="${rowClass}" style="${bgStyle}">
        <td class="col-a">${valA}</td>
        <td class="col-b">${valB}</td>
        <td class="col-c">${valC}</td>
        <td class="col-d">${valD}</td>
      </tr>
    `;
  }).join('');

  // 3. Шаблон HTML с точной настройкой ширины и жирности
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          width: 1200px;
          height: auto;
          background-color: #F8FAFC;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          padding: 24px;
        }
        .container {
          width: 100%;
          background: #FFFFFF;
          border-radius: 12px;
          padding: 28px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
        }
        /* ТЕМНО-СЕРЫЙ НЕЖИРНЫЙ ЗАГОЛОВОК */
        .header-box {
          border-bottom: 2px solid #E2E8F0;
          padding-bottom: 14px;
          margin-bottom: 20px;
        }
        .title {
          font-size: 34px;
          font-weight: 400; /* Нежирный */
          color: #334155;  /* Темно-серый */
          letter-spacing: -0.5px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        td {
          padding: 14px 6px;
          border: 1px solid #E2E8F0;
          vertical-align: middle;
          white-space: nowrap; /* Без переноса чисел на новую строку */
        }
        tr:first-child td {
          text-align: center !important;
        }

        /* ПРОПОРЦИИ: А и С сделаны шире */
        .col-a {
          width: 38%;
          font-size: 24px;
          text-align: left;
          padding-left: 16px; /* Отступ только у столбца A */
        }
        .col-b {
          width: 14%;
          font-size: 24px;
          text-align: right;
          padding-right: 10px;
        }
        .col-c {
          width: 34%; /* Расширен под миллиарды */
          font-size: 24px;
          text-align: right;
          padding-right: 10px;
        }
        .col-d {
          width: 14%;
          font-size: 24px;
          text-align: right;
          padding-right: 10px;
        }

        /* НАСТРОЙКА ЖИРНОСТИ */
        .row-normal td {
          font-weight: 400; /* Нежирный для B, C, D в обычных строках */
          color: #334155;
        }
        .row-normal .col-a {
          font-weight: 600; /* Столбец A выделен */
          color: #0F172A;
        }
        .row-bold td {
          font-weight: 700; /* Первая и последняя строки — полностью жирные */
          color: #0F172A;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header-box">
          <div class="title">${title}</div>
        </div>
        <table>
          ${rowsHtml}
        </table>
      </div>
    </body>
    </html>
  `;

  // 4. Запуск Puppeteer
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  await page.setViewport({
    width: 1200,
    height: 800,
    deviceScaleFactor: 2
  });

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  // Снимок динамического размера карточки
  const containerElement = await page.$('.container');
  const imageBuffer = await containerElement.screenshot({ type: 'png' });

  await browser.close();

  // 5. Отправка в Telegram
  const telegramUrl = `https://api.telegram.org/bot${token}/sendPhoto`;

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', `📊 <b>${title}</b>\n\nПолный отчет по всем сотрудникам.`);
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

  console.log('✅ Обновленная фотография успешно отправлена в Telegram!');
}

main().catch(err => {
  console.error('❌ Ошибка выполнения:', err.message);
  process.exit(1);
});
