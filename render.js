const puppeteer = require('puppeteer');
const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

/**
 * Функция для форматирования чисел с разделением тысяч пробелами (например: 1 500 000)
 */
function formatValue(val) {
  if (val === undefined || val === null || val === '') return '';
  const str = String(val).trim();
  
  // Очищаем строку от лишних пробелов для проверки на число
  const cleanNum = str.replace(/\s+/g, '').replace(',', '.');
  if (!isNaN(cleanNum) && cleanNum !== '') {
    const parts = cleanNum.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // Разделитель тысяч
    return parts.join('.');
  }
  return str;
}

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
  
  // Очищаем токен и chatId от случайных пробелов или переносов
  const token = (process.env.TELEGRAM_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

  if (!token || !chatId) {
    throw new Error('Отсутствуют или пусты секреты TELEGRAM_TOKEN или TELEGRAM_CHAT_ID в GitHub Secrets');
  }

  // 2. Генерация строк таблицы с разделением тысяч
  const rowsHtml = items.map((item, index) => {
    const isYellow = (index === 0 || index === items.length - 1);
    const bgStyle = isYellow ? 'background-color: #FEF3C7;' : 'background-color: #FFFFFF;';

    const valA = formatValue(item.a);
    const valB = formatValue(item.b);
    const valC = formatValue(item.c);
    const valD = formatValue(item.d);

    return `
      <tr style="${bgStyle}">
        <td class="col-a">${valA}</td>
        <td class="col-bcd">${valB}</td>
        <td class="col-bcd">${valC}</td>
        <td class="col-bcd">${valD}</td>
      </tr>
    `;
  }).join('');

  // 3. Шаблон HTML (A — широкий, B,C,D — динамические без отступов)
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-weight: normal !important; }
        body {
          width: 1200px;
          height: auto;
          background-color: #F8FAFC;
          font-family: Calibri, Candara, "Segoe UI", Optima, Arial, sans-serif;
          padding: 30px;
        }
        .container {
          width: 100%;
          background: #FFFFFF;
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
        }
        /* ШАПКА: Темно-серый заголовок, не жирный, с синей линией */
        .header-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 3px solid #3B82F6;
          padding-bottom: 18px;
          margin-bottom: 24px;
        }
        .title {
          font-size: 38px;
          color: #475569;
          font-weight: normal;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: auto;
        }
        td {
          padding: 16px 20px;
          border: 1px solid #E2E8F0;
          vertical-align: middle;
          font-weight: normal;
        }
        tr:first-child td {
          text-align: center !important;
        }

        /* ТАБЛИЦА: Столбец A — широкий (40%), B, C, D — динамические */
        .col-a {
          width: 40%;
          font-size: 24px;
          color: #0F172A;
          text-align: left;
          font-weight: normal;
          white-space: nowrap;
        }
        .col-bcd {
          width: auto; /* Автоматическое динамическое распределение оставшегося места */
          font-size: 26px;
          color: #1E293B;
          text-align: right;
          font-weight: normal;
          white-space: nowrap;
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

  // 4. Запуск Puppeteer и создание динамического снимка
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  await page.setViewport({
    width: 1200,
    height: 800,
    deviceScaleFactor: 2 // Двойная плотность пикселей (Retina quality)
  });

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  // Делаем снимок строго по границам карточки .container
  const containerElement = await page.$('.container');
  const imageBuffer = await containerElement.screenshot({ type: 'png' });

  await browser.close();

  // 5. Отправка фото в Telegram
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

  console.log('✅ Отчет успешно сформирован и отправлен в Telegram!');
}

main().catch(err => {
  console.error('❌ Ошибка выполнения:', err.message);
  process.exit(1);
});
