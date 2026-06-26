// Кнопки кастомного заголовка окна (свернуть/развернуть/закрыть).
// Вынесено из инлайн-скрипта index.html ради чистого CSP без 'unsafe-inline'.
document.getElementById('tbMin').addEventListener('click',   () => window.titlebar?.minimize());
document.getElementById('tbMax').addEventListener('click',   () => window.titlebar?.maximize());
document.getElementById('tbClose').addEventListener('click', () => window.titlebar?.close());
