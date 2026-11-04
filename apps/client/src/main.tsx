import { createRoot } from '@cdd-team/react';

import { onSessionLost } from './api/trpc';
import { readBootstrap } from './bootstrap';
import { RouterProvider } from '@cdd-team/router';
import { router } from './router';
import { registerServiceWorker } from './serviceWorker';
import { setPreloadedNotebook } from './stores/preloaded';
import { watchConnection } from '@stores/connection';
import { initSession, loseSession } from './stores/session';
import { showToast } from './stores/toast';
import './styles/tokens.css';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден элемент #root');

// Пользователь — из первого HTML: первый рендер уже знает, гость это или вошедший.
// Сломанный bootstrap — ошибка запуска, гостем и запасным users.me она не прикрывается.
let started = false;
try {
    const { user, notebookPage } = readBootstrap();
    initSession(user);
    setPreloadedNotebook(notebookPage);
    started = true;
} catch (error) {
    console.error(error);
    container.textContent = 'Не удалось запустить приложение. Обновите страницу.';
}

// BFF не смог продлить сессию: гость и вход, прежние данные с экрана уходят вместе с маршрутом
onSessionLost(() => {
    loseSession();
    showToast('Сессия закончилась — войдите снова', 'info');
    void router.navigate({ to: '/login', replace: true });
});

registerServiceWorker();
watchConnection();

if (started) createRoot(container).render(<RouterProvider router={router} />);
