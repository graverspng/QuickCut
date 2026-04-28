import { Head, Link } from '@inertiajs/react';
import '@/../css/Welcome.css';
import QuickCutCutout from '@/Pages/Auth/img/QuickCut_Cutout.png';

const FEATURES = [
    { icon: '✂️',   title: 'Cut & Trim',         desc: 'Split clips with precision. Drag, reorder, and build your timeline exactly as you envision it.' },
    { icon: '🎵',   title: 'Music & Audio',       desc: 'Layer background tracks, control volume, and mix audio directly over your footage.' },
    { icon: '✏️',   title: 'Text Overlays',       desc: 'Drop in titles, captions, or animated text — positioned and styled exactly your way.' },
    { icon: '✨',   title: 'Transitions',         desc: 'Smooth, polished transitions between clips with fully adjustable duration.' },
    { icon: '📤',   title: 'Export Anywhere',     desc: 'Export to MP4, convert formats, and download your finished video in minutes.' },
    { icon: '🚫💸', title: 'Forever Free',        desc: 'No paywall. No subscription. Every feature open to everyone, always.' },
];

export default function Welcome({ auth }) {
    const isLoggedIn = !!auth?.user;

    return (
        <>
            <Head title="QuickCut — Free Video Editor" />

            <div className="wl-page">
                {/* Background orbs */}
                <div className="wl-orb wl-orb--1" aria-hidden="true" />
                <div className="wl-orb wl-orb--2" aria-hidden="true" />
                <div className="wl-orb wl-orb--3" aria-hidden="true" />

                {/* ── Nav ── */}
                <nav className="wl-nav">
                    <div className="wl-nav-inner">
                        <div className="wl-nav-logo">
                            <img src={QuickCutCutout} alt="" className="wl-logo-img" aria-hidden="true" />
                            <span className="wl-logo-name">QuickCut</span>
                        </div>
                        <div className="wl-nav-links">
                            {isLoggedIn ? (
                                <Link href={route('dashboard')} className="wl-btn wl-btn--primary">
                                    Dashboard →
                                </Link>
                            ) : (
                                <>
                                    <Link href={route('login')} className="wl-btn wl-btn--ghost">Log in</Link>
                                    <Link href={route('register')} className="wl-btn wl-btn--primary">Sign Up</Link>
                                </>
                            )}
                        </div>
                    </div>
                </nav>

                {/* ── Hero ── */}
                <section className="wl-hero">
                    <div className="wl-hero-eyebrow">
                        <span className="wl-hero-dot" aria-hidden="true" />
                        100% Free · No Downloads · No Subscription
                    </div>

                    <h1 className="wl-hero-title">
                        Edit Videos Like&nbsp;a&nbsp;Pro.
                        <br />
                        <span className="wl-hero-accent">Free,&nbsp;Forever.</span>
                    </h1>

                    <p className="wl-hero-sub">
                        A browser-based video editor built for everyone.
                        Cut, mix, add text and transitions — right in your browser.
                    </p>

                    <div className="wl-hero-ctas">
                        <Link
                            href={isLoggedIn ? route('dashboard') : route('register')}
                            className="wl-cta-main"
                        >
                            Start Editing for Free →
                        </Link>
                        {!isLoggedIn && (
                            <Link href={route('login')} className="wl-cta-secondary">
                                Already have an account?
                            </Link>
                        )}
                    </div>

                    {/* Editor mockup */}
                    <div className="wl-mockup" aria-hidden="true">
                        <div className="wl-mock-bar">
                            <span className="wl-mock-dot wl-mock-dot--r" />
                            <span className="wl-mock-dot wl-mock-dot--y" />
                            <span className="wl-mock-dot wl-mock-dot--g" />
                            <span className="wl-mock-title">QuickCut Editor</span>
                            <span className="wl-mock-time">00:00:04 / 00:01:23</span>
                        </div>
                        <div className="wl-mock-preview">
                            <div className="wl-mock-play">▶</div>
                        </div>
                        <div className="wl-mock-timeline">
                            <div className="wl-mock-track">
                                <span className="wl-mock-track-label">V</span>
                                <div className="wl-mock-clips">
                                    <div className="wl-mock-clip wl-mock-clip--1" />
                                    <div className="wl-mock-clip wl-mock-clip--2" />
                                    <div className="wl-mock-clip wl-mock-clip--3" />
                                </div>
                            </div>
                            <div className="wl-mock-track">
                                <span className="wl-mock-track-label">M</span>
                                <div className="wl-mock-clips">
                                    <div className="wl-mock-clip wl-mock-clip--audio" />
                                </div>
                            </div>
                            <div className="wl-mock-track wl-mock-track--thin">
                                <span className="wl-mock-track-label">T</span>
                                <div className="wl-mock-clips">
                                    <div className="wl-mock-clip wl-mock-clip--text" />
                                    <div className="wl-mock-clip wl-mock-clip--text2" />
                                </div>
                            </div>
                            <div className="wl-mock-playhead" />
                        </div>
                    </div>
                </section>

                {/* ── Features ── */}
                <section className="wl-features">
                    <div className="wl-section-label">What you get</div>
                    <h2 className="wl-section-title">Everything you need. Nothing else.</h2>
                    <div className="wl-feat-grid">
                        {FEATURES.map((f, i) => (
                            <div
                                className="wl-feat-card"
                                key={f.title}
                                style={{ animationDelay: `${i * 0.07}s` }}
                            >
                                <span className="wl-feat-icon">{f.icon}</span>
                                <div className="wl-feat-title">{f.title}</div>
                                <div className="wl-feat-desc">{f.desc}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Bottom CTA ── */}
                <section className="wl-bottom-cta">
                    <div className="wl-bottom-cta-inner">
                        <h2 className="wl-bottom-title">
                            Start creating
                            <span className="wl-hero-accent"> today.</span>
                        </h2>
                        <p className="wl-bottom-sub">No credit card. No download. Just open your browser and edit.</p>
                        <Link
                            href={isLoggedIn ? route('dashboard') : route('register')}
                            className="wl-cta-main"
                        >
                            Open QuickCut →
                        </Link>
                    </div>
                </section>

                {/* ── Footer ── */}
                <footer className="wl-footer">
                    <div className="wl-footer-logo">
                        <img src={QuickCutCutout} alt="" className="wl-footer-logo-img" aria-hidden="true" />
                        QuickCut
                    </div>
                    <p className="wl-footer-copy">A free, open creative platform. No strings attached.</p>
                    <div className="wl-footer-links">
                        {!isLoggedIn && <Link href={route('login')}>Log in</Link>}
                        {!isLoggedIn && <Link href={route('register')}>Sign up</Link>}
                        {isLoggedIn && <Link href={route('dashboard')}>Dashboard</Link>}
                    </div>
                </footer>
            </div>
        </>
    );
}
