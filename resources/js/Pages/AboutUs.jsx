import { Link, Head } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import '@/../css/AboutUs.css';

function ParticleCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, particles, raf;

    const resize = () => {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };

    const mkParticle = () => ({
      x:     Math.random() * (w ?? window.innerWidth),
      y:     Math.random() * (h ?? window.innerHeight),
      r:     Math.random() * 1.4 + 0.4,
      vx:    (Math.random() - 0.5) * 0.22,
      vy:    (Math.random() - 0.5) * 0.22,
      alpha: Math.random() * 0.35 + 0.08,
      pulse: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.008 + 0.004,
    });

    const init = () => {
      resize();
      particles = Array.from({ length: 90 }, mkParticle);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.speed;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        const a = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(43,168,74,${a.toFixed(3)})`;
        ctx.fill();
      }

      // faint connection lines between close particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(43,168,74,${(0.07 * (1 - dist / 100)).toFixed(3)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    init();
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="au-canvas" aria-hidden="true" />;
}

export default function AboutUs() {
  return (
    <>
      <Head title="About Us" />

      <div className="au-bg">
        <ParticleCanvas />

        <div className="au-orb au-orb--1" aria-hidden="true" />
        <div className="au-orb au-orb--2" aria-hidden="true" />
        <div className="au-orb au-orb--3" aria-hidden="true" />

        <img src="/QuickCut.png" alt="" className="au-watermark" aria-hidden="true" />

        <div className="au-container">
          <div className="au-eyebrow">
            <span className="au-eyebrow-dot" aria-hidden="true" />
            QuickCut
          </div>

          <h1 className="au-title">About Us</h1>
          <p className="au-subtitle">Building a creative platform with zero barriers.</p>

          <div className="au-divider" />

          <p className="au-text">
            Welcome to our project! We are a passionate team working on building amazing web applications.
            Our mission is to provide users with intuitive tools to manage their projects efficiently.
          </p>

          <p className="au-text">
            This is a school project, and I am trying to make a no-subscription editing web platform to create memories from nothing.
            I aim to give users full creative freedom to craft and preserve their moments without any limitations or costs.
          </p>

          <p className="au-text">
            QuickCut is all about <em>freedom</em>: no paywalls, no restrictions,
            just pure creative flow. Whether it's videos, music, or both — it's yours to craft.
          </p>

          <div className="au-features">
            <div className="au-feat">
              <span className="au-feat-icon">🚫💸</span>
              <div className="au-feat-title">No Paywalls</div>
              <div className="au-feat-desc">Every feature, free. No subscription, no hidden fees — ever.</div>
            </div>
            <div className="au-feat">
              <span className="au-feat-icon">🎨</span>
              <div className="au-feat-title">Full Freedom</div>
              <div className="au-feat-desc">Create without restrictions. Your vision, your rules.</div>
            </div>
            <div className="au-feat">
              <span className="au-feat-icon">🎬🎵</span>
              <div className="au-feat-title">Video & Audio</div>
              <div className="au-feat-desc">Edit clips, mix audio, and change formats — all in one place.</div>
            </div>
          </div>

          <div className="au-divider-mid" />

          <h2 className="au-tagline">
            <span className="au-tag-explore">Explore.</span>{' '}
            <span className="au-tag-create">Create.</span>{' '}
            <span className="au-tag-share">Share.</span>
          </h2>

          <div className="au-back">
            <Link href={route('dashboard')} className="au-back-btn">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
