// Функция для форматирования чисел с разделением тысяч пробелами
  function formatValue(val) {
    if (val === undefined || val === null || val === '') return '';
    const str = String(val).trim();
    // Проверяем, является ли значение числом
    const cleanNum = str.replace(/\s+/g, '').replace(',', '.');
    if (!isNaN(cleanNum) && cleanNum !== '') {
      const parts = cleanNum.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // Разделитель тысяч
      return parts.join('.');
    }
    return str;
  }

  // 2. Генерация строк таблицы
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

  // 3. Шаблон HTML (Calibri, без жирности, темно-серый заголовок)
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
        /* ШАПКА: Темно-серый заголовок, без жирности, с синей линией */
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
          color: #475569; /* Темно-серый цвет */
          font-weight: normal;
        }
        table {
          width: 100%;
          border-collapse: collapse;
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

        /* ПРОПОРЦИИ СТОЛБЦОВ: B, C, D расширены до 25% каждый */
        .col-a {
          width: 25%;
          font-size: 24px;
          color: #0F172A;
          text-align: left;
          font-weight: normal;
        }
        .col-bcd {
          width: 25%; /* Увеличено до 25% */
          font-size: 26px;
          color: #1E293B;
          text-align: right;
          font-weight: normal;
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
    deviceScaleFactor: 2
  });

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  const containerElement = await page.$('.container');
  const imageBuffer = await containerElement.screenshot({ type: 'png' });

  await browser.close();
