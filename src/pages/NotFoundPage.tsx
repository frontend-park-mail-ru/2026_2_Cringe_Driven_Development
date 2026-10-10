import { Link } from '@modules/router';

/**
 * Страница «Не найдено»: показывается, когда адресу не подошёл ни один маршрут.
 * @returns {JSX.Element} страница
 */
export const NotFoundPage = () => (
    <section>
        <h1>Страница не найдена</h1>
        <Link to="/">На главную</Link>
    </section>
);
