import { createRoot } from '@maninthecoat/react';

import { RouterProvider } from './modules/router';
import { router } from './router';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден элемент #root');

createRoot(container).render(<RouterProvider router={router} />);
