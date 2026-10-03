import { useState } from '@maninthecoat/react';

export const HomePage = () => {
    const [count, setCount] = useState(0);

    return (
        <section>
            <h1>Cellestial: Vite работает</h1>
            <button onClick={() => setCount(count + 1)}>Кликов: {count}</button>
        </section>
    );
};
