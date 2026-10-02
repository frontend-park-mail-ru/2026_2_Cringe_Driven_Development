import { Link } from '../../router/Link';
import { ROUTES } from '../../router/router';
import './Placeholder.css';

/** Свойства {@link Placeholder}. */
interface PlaceholderProps {
    /** Название экрана */
    title: string;
}

/**
 * Временная заглушка экрана: проверка маршрутизации на этапе 1.
 * Заменяется настоящими страницами на следующих этапах.
 * @param props свойства заглушки
 * @returns заглушка со ссылками на остальные адреса
 */
export function Placeholder({ title }: PlaceholderProps) {
    return (
        <main className="placeholder">
            <h1 key="title">{title}</h1>
            <nav key="nav" className="placeholder__nav">
                <Link key="home" to={ROUTES.home}>
                    Главная
                </Link>
                <Link key="login" to={ROUTES.login}>
                    Вход
                </Link>
                <Link key="signup" to={ROUTES.signup}>
                    Регистрация
                </Link>
            </nav>
        </main>
    );
}
