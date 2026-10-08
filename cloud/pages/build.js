// Сборка страниц для клиентов: подставляет шрифты и логотип в шаблоны.
// Запуск: node cloud/pages/build.js
// Результат:
//   cloud/pages/register.html, cloud/pages/index.html — файлы для репозитория страниц (GitHub Pages);
//   assets/pages/pages.js — те же страницы строками для предпросмотра внутри приложения (WebView).
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'src'), read = f => fs.readFileSync(path.join(src, f), 'utf8');
const font = read('fonts.css'), logo = 'data:image/png;base64,' + fs.readFileSync(path.join(src, 'logo.png')).toString('base64');
const build = tpl => read(tpl).replace('{{FONT}}', () => font).split('{{LOGO}}').join(logo);
const reg = build('register.tpl.html'), book = build('booking.tpl.html');
fs.writeFileSync(path.join(__dirname, 'register.html'), reg);
fs.writeFileSync(path.join(__dirname, 'index.html'), book);
const out = path.join(__dirname, '..', '..', 'assets', 'pages'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'pages.js'),
  '// Создано cloud/pages/build.js — не править вручную.\nexport const REGISTER_HTML = ' + JSON.stringify(reg) + ';\nexport const BOOKING_HTML = ' + JSON.stringify(book) + ';\n');
console.log('готово: register.html', (reg.length / 1024) | 0, 'КБ, index.html', (book.length / 1024) | 0, 'КБ');
