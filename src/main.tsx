import { createRoot } from '@maninthecoat/react';

import { RouterProvider } from './router';
import { router } from './routes';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден элемент #root');

createRoot(container).render(<RouterProvider router={router} />);
