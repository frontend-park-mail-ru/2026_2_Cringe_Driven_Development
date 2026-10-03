import { buttonClassName } from '../../components/Button/Button';
import { Logo } from '../../components/Logo/Logo';
import { Moon } from '../../components/Moon/Moon';
import { Link, useMatches, type RouteIds } from '../../modules/router';
import { AuthForm } from './AuthForm';
import './AuthPage.css';

const REGISTER_ROUTE: RouteIds = '/_guest/register';

/**
 * Вход и регистрация (экраны «01. Вход» и «02. Регистрация»): карточка с формой и луной.
 * Режим берётся из адреса: /login или /register.
 * @returns страница
 */
export function AuthPage() {
    const isRegister = useMatches().some((match) => match.routeId === REGISTER_ROUTE);
    const mode = isRegister ? 'register' : 'login';

    return (
        <div className={`auth auth--${mode}`}>
            <Logo key="logo" />
            <div key="card" className="auth__card">
                <div key="form" className="auth__form">
                    <AuthForm key={mode} mode={mode} />
                </div>
                <div key="side" className="auth__side">
                    <Moon key="moon" className="auth__moon" />
                    <div key="face" className="auth__face">
                        <h2 key="title" className="auth__face-title">
                            {isRegister ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'}
                        </h2>
                        <p key="pitch" className="auth__face-pitch">
                            {isRegister
                                ? 'Ваши блокноты ждут\nна орбите'
                                : 'Python прямо в браузере —\nбез установки окружения'}
                        </p>
                        <Link
                            key="switch"
                            to={isRegister ? '/login' : '/register'}
                            className={buttonClassName('inverse')}
                        >
                            {isRegister ? 'Войти' : 'Создать аккаунт'}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
