import { Snackbar } from '@components/Snackbar/Snackbar';
import { Toast } from '@components/Toast/Toast';
import { Outlet } from '@cdd-team/router';
import { useConnectionStore } from '@stores/connection';
import { useSnackbarStore } from '@stores/snackbar';
import { useToastStore } from '@stores/toast';

/** Корневой макет: `<main>` с дочерним маршрутом, тост, снекбар ошибки и предупреждение о сети. */
export const RootLayout = () => {
    const toast = useToastStore((state) => state.toast);
    const snackbar = useSnackbarStore((state) => state.snackbar);
    const offline = useConnectionStore((state) => state.lost);

    return (
        <>
            <main key="main">
                <Outlet />
            </main>
            <Toast key="toast" toast={toast} />
            <Snackbar key="snackbar" snackbar={snackbar} offline={offline} />
        </>
    );
};
