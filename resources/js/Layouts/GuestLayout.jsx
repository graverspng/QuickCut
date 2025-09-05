import ApplicationLogo from '@/Components/ApplicationLogo';
import { Link } from '@inertiajs/react';

export default function GuestLayout({ children, fullWidth = false }) {
    // fullWidth: when true, don't render the centered wrapper so pages can use full width.
    // default (false) preserves Breeze centered look.

    if (fullWidth) {
        // Render children as-is (no centered wrapper)
        return <div className="min-h-screen bg-gray-100">{children}</div>;
    }

    // Default Breeze guest layout (keeps centered container)
    return (
        <div className="min-h-screen bg-gray-100">
            <div className="sm:fixed sm:top-0 sm:right-0 p-6 text-right">
                <Link href="/">
                    <ApplicationLogo className="w-20 h-20" />
                </Link>
            </div>

            <div className="flex flex-col items-center pt-6 sm:justify-center sm:pt-0">
                <div>
                    <Link href="/">
                        <ApplicationLogo className="w-20 h-20" />
                    </Link>
                </div>

                <div className="w-full sm:max-w-md mt-6 px-6 py-4 bg-white shadow-md overflow-hidden sm:rounded-lg">
                    {children}
                </div>
            </div>
        </div>
    );
}
