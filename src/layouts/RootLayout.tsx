import { Snackbar } from '@components/Snackbar/Snackbar';
import { Toast } from '@components/Toast/Toast';
import { Outlet } from '@modules/router';
import { useSnackbarStore } from '@stores/snackbar';
import { useToastStore } from '@stores/toast';

/**
 * Корневой макет: `<main>` с дочерним маршрутом, тост и снекбар.
 * @returns {JSX.Element} макет
 */
export const RootLayout = () => {
    const toast = useToastStore((state) => state.toast);
    const snackbar = useSnackbarStore((state) => state.snackbar);

    return (
        <>
            <main key="main">
                <Outlet />
            </main>
            <Toast key="toast" toast={toast} />
            <Snackbar key="snackbar" snackbar={snackbar} />
        </>
    );
};
