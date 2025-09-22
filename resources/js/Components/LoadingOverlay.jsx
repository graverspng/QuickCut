import { useEffect, useState } from 'react';

const LoadingOverlay = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        let hideTimeout;

        const show = () => {
            clearTimeout(hideTimeout);
            setIsVisible(true);
        };

        const hide = () => {
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                setIsVisible(false);
            }, 150);
        };

        const handleStart = () => show();
        const handleFinish = () => hide();

        document.addEventListener('inertia:start', handleStart);
        document.addEventListener('inertia:finish', handleFinish);
        document.addEventListener('inertia:success', handleFinish);
        document.addEventListener('inertia:error', handleFinish);
        document.addEventListener('inertia:invalid', handleFinish);

        return () => {
            clearTimeout(hideTimeout);
            document.removeEventListener('inertia:start', handleStart);
            document.removeEventListener('inertia:finish', handleFinish);
            document.removeEventListener('inertia:success', handleFinish);
            document.removeEventListener('inertia:error', handleFinish);
            document.removeEventListener('inertia:invalid', handleFinish);
        };
    }, []);

    if (!isVisible) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-200">
            <div className="flex flex-col items-center gap-4">
            <div className="h-24 w-24 animate-spin rounded-full border-8 border-[#248232] border-t-transparent" />
                <p className="text-sm font-semibold tracking-wide text-[#2BA84A]">Loading...</p>
            </div>
        </div>
    );
};

export default LoadingOverlay;