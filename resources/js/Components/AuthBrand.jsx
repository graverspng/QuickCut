import QuickCutImg from '@/Pages/Auth/img/QuickCut_Cutout.png';

export default function AuthBrand() {
    return (
        <div className="lp-brand">
            <div className="lp-orb lp-orb--1" aria-hidden="true" />
            <div className="lp-orb lp-orb--2" aria-hidden="true" />
            <img src={QuickCutImg} alt="" className="lp-watermark" aria-hidden="true" />

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
                    No subscription. No paywalls. Just pure creative flow — yours to own.
                </p>

                <div className="lp-divider" />

                <div className="lp-features">
                    <div className="lp-feat">
                        <span className="lp-feat-icon">🚫💸</span>
                        <div>
                            <div className="lp-feat-title">No Paywalls</div>
                            <div className="lp-feat-desc">Every feature, completely free. No hidden fees — ever.</div>
                        </div>
                    </div>
                    <div className="lp-feat">
                        <span className="lp-feat-icon">🎨</span>
                        <div>
                            <div className="lp-feat-title">Full Creative Freedom</div>
                            <div className="lp-feat-desc">Your vision, your rules. Zero restrictions.</div>
                        </div>
                    </div>
                    <div className="lp-feat">
                        <span className="lp-feat-icon">🎬🎵</span>
                        <div>
                            <div className="lp-feat-title">Video & Audio</div>
                            <div className="lp-feat-desc">Edit clips, layer audio, export — all in one place.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
