import Dropdown from '@/Components/Dropdown';
import { Link, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import ReportIssue from '@/Pages/Auth/img/ReportIssue.png';
import QuickCutCutoutImg from '@/Pages/Auth/img/QuickCut_Cutout.png';
import '@/../css/navbar.css';

const NavItem = ({ href, routeName, label }) => (
    <Link
        href={href}
        className={`qc-nav-link${route().current(routeName) ? ' qc-nav-link--active' : ''}`}
    >
        {label}
    </Link>
);

const MobileNavItem = ({ href, routeName, label }) => (
    <Link
        href={href}
        className={`qc-mobile-link${route().current(routeName) ? ' qc-mobile-link--active' : ''}`}
    >
        {label}
    </Link>
);

export default function AuthenticatedLayout({ header, children, hideNavbar }) {
    const { auth, flash } = usePage().props;
    const user = auth.user;
    const [showMenu, setShowMenu]     = useState(false);
    const [loginToast, setLoginToast] = useState('');
    const [reportToast, setReportToast] = useState('');
    const shownLoginRef  = useRef(false);
    const shownReportRef = useRef(false);

    useEffect(() => {
        if (flash?.loginSuccess && !shownLoginRef.current) {
            shownLoginRef.current = true;
            setLoginToast(`Welcome back, ${user.name}!`);
        }
    }, [flash?.loginSuccess]);

    useEffect(() => {
        if (flash?.reportSubmitted && !shownReportRef.current) {
            shownReportRef.current = true;
            setReportToast('Thank you for your report!');
        }
    }, [flash?.reportSubmitted]);

    useEffect(() => {
        if (!loginToast) return;
        const t = setTimeout(() => setLoginToast(''), 4000);
        return () => clearTimeout(t);
    }, [loginToast]);

    useEffect(() => {
        if (!reportToast) return;
        const t = setTimeout(() => setReportToast(''), 4000);
        return () => clearTimeout(t);
    }, [reportToast]);

    return (
        <div className="min-h-screen bg-black text-[#FCFFFC]">
            {!hideNavbar && (
                <nav className="qc-nav">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between py-1">

                            {/* Logo */}
                            <Link href={route('dashboard')} className="flex items-center flex-shrink-0">
                                <img src={QuickCutCutoutImg} alt="QuickCut" className="h-20 w-auto" />
                            </Link>

                            {/* Desktop nav links */}
                            <div className="hidden sm:flex items-center gap-1">
                                <NavItem href={route('dashboard')}      routeName="dashboard"      label="Media Projects" />
                                <NavItem href={route('audio.projects')} routeName="audio.projects" label="Audio Projects" />
                                <NavItem href={route('format.changer')} routeName="format.changer" label="Format Changer" />
                                <NavItem href={route('about.us')}       routeName="about.us"       label="About Us" />
                            </div>

                            {/* Right side */}
                            <div className="hidden sm:flex items-center gap-2">
                                {/* Report icon */}
                                <Link
                                    href={route('reports.create')}
                                    className="qc-nav-icon-btn"
                                    aria-label="Report an issue"
                                >
                                    <img src={ReportIssue} alt="" className="h-7 w-auto" />
                                </Link>

                                {/* User dropdown */}
                                <Dropdown>
                                    <Dropdown.Trigger>
                                        <button type="button" className="qc-nav-user-btn">
                                            <span className="qc-nav-avatar">
                                                {user.name[0]?.toUpperCase()}
                                            </span>
                                            <span>{user.name}</span>
                                            <svg className="qc-nav-chevron" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </Dropdown.Trigger>

                                    <Dropdown.Content
                                        contentClasses="py-1.5 bg-[#0e0e0e] border border-[rgba(43,168,74,0.18)] text-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.7)]"
                                    >
                                        <Dropdown.Link
                                            href={route('profile.edit')}
                                            className="text-[rgba(252,255,252,0.7)] hover:text-[#FCFFFC] font-medium"
                                        >
                                            Profile
                                        </Dropdown.Link>
                                        {Boolean(user?.is_admin) && (
                                            <Dropdown.Link
                                                href={route('admin.index')}
                                                className="text-[rgba(252,255,252,0.7)] hover:text-[#FCFFFC] font-medium"
                                            >
                                                Admin Panel
                                            </Dropdown.Link>
                                        )}
                                        <Dropdown.Link
                                            href={route('logout')}
                                            method="post"
                                            as="button"
                                            className="text-red-400 hover:text-red-300 font-medium"
                                        >
                                            Log Out
                                        </Dropdown.Link>
                                    </Dropdown.Content>
                                </Dropdown>
                            </div>

                            {/* Mobile hamburger */}
                            <button
                                className="sm:hidden qc-nav-hamburger"
                                onClick={() => setShowMenu(p => !p)}
                                aria-label="Toggle navigation"
                            >
                                <svg className="h-5 w-5" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                                    <path
                                        className={!showMenu ? 'block' : 'hidden'}
                                        strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                        d="M4 6h16M4 12h16M4 18h16"
                                    />
                                    <path
                                        className={showMenu ? 'block' : 'hidden'}
                                        strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Mobile menu */}
                    {showMenu && (
                        <div className="sm:hidden qc-mobile-menu">
                            <MobileNavItem href={route('dashboard')}      routeName="dashboard"      label="Media Projects" />
                            <MobileNavItem href={route('audio.projects')} routeName="audio.projects" label="Audio Projects" />
                            <MobileNavItem href={route('format.changer')} routeName="format.changer" label="Format Changer" />
                            <MobileNavItem href={route('about.us')}       routeName="about.us"       label="About Us" />

                            <div className="qc-mobile-divider" />

                            <div className="qc-mobile-user-section">
                                <p className="qc-mobile-user-name">{user.name}</p>
                                <p className="qc-mobile-user-email">{user.email}</p>
                            </div>

                            <MobileNavItem href={route('profile.edit')} routeName="profile.edit" label="Profile" />
                            {user.is_admin && (
                                <MobileNavItem href={route('admin.index')} routeName="admin.index" label="Admin Panel" />
                            )}
                            <Link
                                href={route('logout')}
                                method="post"
                                as="button"
                                className="qc-mobile-link"
                                style={{ color: 'rgba(248,113,113,0.85)' }}
                            >
                                Log Out
                            </Link>
                        </div>
                    )}
                </nav>
            )}

            {header && (
                <header className="bg-[#111] border-b border-[rgba(255,255,255,0.05)] shadow">
                    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 text-[#FCFFFC]">
                        {header}
                    </div>
                </header>
            )}

            <main>{children}</main>

            {/* Login toast */}
            {loginToast && (
                <div className="qc-toast" role="status" aria-live="polite">
                    <span className="qc-toast-dot" aria-hidden="true" />
                    <span>{loginToast}</span>
                </div>
            )}

            {/* Report submitted toast */}
            {reportToast && (
                <div className="qc-toast" role="status" aria-live="polite">
                    <span className="qc-toast-dot" aria-hidden="true" />
                    <span>{reportToast}</span>
                </div>
            )}
        </div>
    );
}
