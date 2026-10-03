import { Snackbar } from '../components/Snackbar/Snackbar';
import { Toast } from '../components/Toast/Toast';
import { Outlet } from '../modules/router';
import { useSnackbar } from '../stores/snackbar';
import { useToast } from '../stores/toast';

export const RootLayout = () => {
    const toast = useToast((state) => state.toast);
    const snackbar = useSnackbar((state) => state.snackbar);

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
