import { Link } from '@cdd-team/router';

/**
 * Страница «Не найдено» — маршрут `/404`: сюда ведут неизвестный адрес, отсутствующий и чужой
 * блокнот.
 */
export const NotFoundPage = () => (
    <section>
        <h1>Страница не найдена</h1>
        <Link to="/">На главную</Link>
    </section>
);
