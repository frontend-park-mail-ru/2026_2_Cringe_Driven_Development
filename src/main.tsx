import { createRoot } from '@maninthecoat/react';
import { App } from './App';
import './styles/tokens.css';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден элемент #root');

createRoot(container).render(<App />);
