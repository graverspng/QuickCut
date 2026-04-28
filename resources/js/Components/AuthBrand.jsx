import QuickCutImg from '@/Pages/Auth/img/QuickCut_Cutout.png';

export default function AuthBrand() {
    return (
        <div className="lp-brand">
            <div className="lp-orb lp-orb--1" aria-hidden="true" />
            <div className="lp-orb lp-orb--2" aria-hidden="true" />

            <div className="lp-brand-content">
                <div className="lp-eyebrow">
                    <span className="lp-eyebrow-dot" aria-hidden="true" />
                    Free Browser-Based Video Editor
                </div>

                <h1 className="lp-tagline">
                    <span className="lp-tag-explore">Explore.</span>
                    <br />
                    <span className="lp-tag-create">Create.</span>
                    <br />
                    <span className="lp-tag-share">Share.</span>
                </h1>

                <p className="lp-pitch">
                    No subscription. No paywalls. Just pure creative flow.
                </p>

                <div className="lp-divider" />

                <img src={QuickCutImg} alt="QuickCut" className="lp-logo-center" />
            </div>
        </div>
    );
}
