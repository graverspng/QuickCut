import Dropdown from '@/Components/Dropdown';
import NavLink from '@/Components/NavLink';
import ResponsiveNavLink from '@/Components/ResponsiveNavLink';
import { Link, usePage } from '@inertiajs/react';
import { useState } from 'react';

import QuickCutCutoutImg from '@/Pages/Auth/Img/QuickCut_Cutout.png';

export default function AuthenticatedLayout({ header, children, hideNavbar }) {
    const user = usePage().props.auth.user;
    const [showingNavigationDropdown, setShowingNavigationDropdown] = useState(false);

    return (
        <div className="min-h-screen bg-black text-[#FCFFFC]">
            {!hideNavbar && (
                <nav className="border-b border-gray-800 bg-[#1a1a1a]">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="flex h-16 justify-between">
                            {/* Logo */}
                            <div className="flex items-center">
                                <Link href="/">
                                    <img
                                        src={QuickCutCutoutImg}
                                        alt="QuickCut Logo"
                                        className="h-20 w-auto"
                                    />
                                </Link>
                            </div>

                            {/* Nav Links (Desktop) */}
                            <div className="hidden space-x-8 sm:-my-px sm:ms-10 sm:flex">
                                <NavLink
                                    href={route('dashboard')}
                                    active={route().current('dashboard')}
                                    className="text-[#2BA84A] hover:text-[#248232] font-semibold transition"
                                >
                                    Media Projects
                                </NavLink>

                                {/* 🔹 New Audio Projects link */}
                                <NavLink
                                    href={route('audio.projects')}
                                    active={route().current('audio.projects')}
                                    className="text-[#2BA84A] hover:text-[#248232] font-semibold transition"
                                >
                                    Audio Projects
                                </NavLink>
                                {console.log('Format changer route:', route('format.changer'))}
<NavLink
    href={route('format.changer')}
    active={route().current('format.changer')}
    className="text-[#2BA84A] hover:text-[#248232] font-semibold transition"
>
    Format Changer
</NavLink>




                                <NavLink
                                    href={route('about.us')}
                                    active={route().current('about.us')}
                                    className="text-[#2BA84A] hover:text-[#248232] font-semibold transition"
                                >
                                    About Us
                                </NavLink>
                            </div>

                            {/* User Dropdown */}
                            <div className="hidden sm:ms-6 sm:flex sm:items-center">
                                <div className="relative ms-3">
                                    <Dropdown>
                                        <Dropdown.Trigger>
                                            <span className="inline-flex rounded-md">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center rounded-md bg-[#1a1a1a] px-3 py-2 text-sm font-medium text-gray-300 transition hover:text-[#2BA84A] focus:outline-none"
                                                >
                                                    {user.name}
                                                    <svg
                                                        className="-me-0.5 ms-2 h-4 w-4"
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        viewBox="0 0 20 20"
                                                        fill="currentColor"
                                                    >
                                                        <path
                                                            fillRule="evenodd"
                                                            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                                            clipRule="evenodd"
                                                        />
                                                    </svg>
                                                </button>
                                            </span>
                                        </Dropdown.Trigger>

                                        {/* 🔹 Dark dropdown menu */}
                                        <Dropdown.Content className="bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-lg">
                                            <Dropdown.Link
                                                href={route('profile.edit')}
                                                className="text-[#2BA84A] hover:text-[#248232] font-semibold"
                                            >
                                                Profile
                                            </Dropdown.Link>
                                            <Dropdown.Link
                                                href={route('logout')}
                                                method="post"
                                                as="button"
                                                className="text-red-400 hover:text-red-500"
                                            >
                                                Log Out
                                            </Dropdown.Link>
                                        </Dropdown.Content>
                                    </Dropdown>
                                </div>
                            </div>

                            {/* Mobile Menu Button */}
                            <div className="-me-2 flex items-center sm:hidden">
                                <button
                                    onClick={() => setShowingNavigationDropdown((prev) => !prev)}
                                    className="inline-flex items-center justify-center rounded-md p-2 text-gray-300 hover:bg-[#2BA84A] hover:text-black focus:outline-none"
                                >
                                    <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                                        <path
                                            className={!showingNavigationDropdown ? 'inline-flex' : 'hidden'}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2"
                                            d="M4 6h16M4 12h16M4 18h16"
                                        />
                                        <path
                                            className={showingNavigationDropdown ? 'inline-flex' : 'hidden'}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2"
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Mobile Dropdown */}
                    <div className={(showingNavigationDropdown ? 'block' : 'hidden') + ' sm:hidden'}>
                        <div className="space-y-1 pb-3 pt-2 bg-[#1a1a1a]">
                            <ResponsiveNavLink
                                href={route('dashboard')}
                                active={route().current('dashboard')}
                                className="text-[#2BA84A] hover:text-[#248232] font-semibold"
                            >
                                Projects
                            </ResponsiveNavLink>

                            {/* 🔹 New Audio Projects link for mobile */}
                            <ResponsiveNavLink
                                href={route('audio.projects')}
                                active={route().current('audio.projects')}
                                className="text-[#2BA84A] hover:text-[#248232] font-semibold"
                            >
                                Audio Projects
                            </ResponsiveNavLink>
                            <ResponsiveNavLink
                                href={route('format.changer')}
                                active={route().current('format.changer')}
                                className="text-[#2BA84A] hover:text-[#248232] font-semibold"
                            >
                                Format Changer
                            </ResponsiveNavLink>

                            <ResponsiveNavLink
                                href={route('about.us')}
                                active={route().current('about.us')}
                                className="text-[#2BA84A] hover:text-[#248232] font-semibold"
                            >
                                About Us
                            </ResponsiveNavLink>
                        </div>

                        <div className="border-t border-gray-700 pb-1 pt-4 bg-[#1a1a1a]">
                            <div className="px-4">
                                <div className="text-base font-medium text-white">{user.name}</div>
                                <div className="text-sm font-medium text-gray-400">{user.email}</div>
                            </div>

                            <div className="mt-3 space-y-1">
                                <ResponsiveNavLink
                                    href={route('profile.edit')}
                                    className="text-[#2BA84A] hover:text-[#248232] font-semibold"
                                >
                                    Profile
                                </ResponsiveNavLink>
                                <ResponsiveNavLink
                                    method="post"
                                    href={route('logout')}
                                    as="button"
                                    className="text-red-400 hover:text-red-500"
                                >
                                    Log Out
                                </ResponsiveNavLink>
                            </div>
                        </div>
                    </div>
                </nav>
            )}

            {header && (
                <header className="bg-[#1a1a1a] shadow">
                    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 text-[#FCFFFC]">
                        {header}
                    </div>
                </header>
            )}

            <main>{children}</main>
        </div>
    );
}
