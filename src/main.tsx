import { createRoot } from '@maninthecoat/react';

import { RouterProvider } from './modules/router';
import { router } from './router';
import { restoreSession } from './stores/session';
import './styles/tokens.css';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден элемент #root');

void restoreSession();

createRoot(container).render(<RouterProvider router={router} />);
