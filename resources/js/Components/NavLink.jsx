import { Link } from '@inertiajs/react';

export default function NavLink({ href, active, children }) {
    return (
        <Link
            href={href}
            className={
                (active
                    ? "border-b-2 font-semibold"
                    : "border-b-2 border-transparent") +
                " inline-flex items-center px-1 pt-1 text-sm transition-colors duration-300 ease-in-out"
            }
            style={{
                color: active ? "var(--green-2)" : "var(--green-1)",
                textShadow: active ? "0 0 8px rgba(43,168,74,0.6)" : "none",
                transition: "color 0.4s ease, text-shadow 0.6s ease",
            }}
            onMouseEnter={(e) => {
                e.target.style.color = "var(--green-2)";
                e.target.style.textShadow =
                    "0 0 8px rgba(43,168,74,0.8), 0 0 14px rgba(43,168,74,0.5)";
            }}
            onMouseLeave={(e) => {
                e.target.style.color = active ? "var(--green-2)" : "var(--green-1)";
                e.target.style.textShadow = active
                    ? "0 0 8px rgba(43,168,74,0.6)"
                    : "none";
            }}
        >
            {children}
        </Link>
    );
}
