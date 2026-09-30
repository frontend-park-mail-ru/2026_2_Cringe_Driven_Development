import { createRoot, useState } from '@maninthecoat/react';

const App = () => {
    const [count, setCount] = useState(0);

    return (
        <main>
            <h1>Cellestial: Vite работает</h1>
            <button onClick={() => setCount(count + 1)}>Кликов: {count}</button>
        </main>
    );
};

const container = document.getElementById('root');
if (!container) throw new Error('Не найден элемент #root');

createRoot(container).render(<App />);
