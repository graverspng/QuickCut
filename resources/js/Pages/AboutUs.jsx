import { Link, Head } from '@inertiajs/react';
import '@/../css/AboutUs.css';

export default function AboutUs() {
    return (
        <>
            <Head title="About Us" />

            <div className="about-us-background">
                {/* Floating QuickCut background */}
                <img src="/QuickCut.png" alt="Background" className="quickcut-float" />

                <div className="about-us-container">
                    <h1 className="about-us-title">About Us</h1>

                    <p className="about-us-text">
                        Welcome to our project! We are a passionate team working on building amazing web applications.
                        Our mission is to provide users with intuitive tools to manage their projects efficiently.
                    </p>

                    <p className="about-us-text">
                        This is a school project, and I am trying to make a no-subscription editing web platform to create memories from nothing. 
                        I aim to give users full creative freedom to craft and preserve their moments without any limitations or costs.
                    </p>

                    <p className="about-us-text">
                        QuickCut is all about <em>freedom</em>: no paywalls, no restrictions, 
                        just pure creative flow. Whether it’s videos, music, or both — it’s yours to craft.
                    </p>

                    {/* Tagline */}
                    <h2 className="about-us-tagline">
                        <span className="tag-explore">Explore.</span>{' '}
                        <span className="tag-create">Create.</span>{' '}
                        <span className="tag-share">Share.</span>
                    </h2>

                    <div className="about-us-back">
                        <Link
                            href={route('dashboard')}
                            className="back-button"
                        >
                            ← Back to Home
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
