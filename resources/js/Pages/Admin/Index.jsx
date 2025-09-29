import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, usePage } from '@inertiajs/react';

export default function Index() {
  const { auth } = usePage().props;

  return (
    <AuthenticatedLayout
      user={auth.user}
      header={
        <h2 style={{ color: 'var(--light)' }}>
          Admin Panel
        </h2>
      }
    >
      <Head title="Admin Panel" />

      <div className="about-us-background">
        <svg className="quickcut-float" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="g" x1="0" x2="1">
              <stop offset="0" stopColor="var(--green-1)" />
              <stop offset="1" stopColor="var(--green-2)" />
            </linearGradient>
          </defs>
          <path d="M60,15 L185,60 L140,185 L15,140 Z" fill="url(#g)" />
        </svg>

        <div className="about-us-container">
          <h1 className="about-us-title">Admin Panel</h1>

          <p className="about-us-text">
            Welcome, <strong>{auth?.user?.name}</strong>. This page is visible <em>only</em> to admins.
          </p>

          <p className="about-us-text">
            Start by reviewing reports, managing users, or returning to your dashboard.
          </p>

          <div className="about-us-back" style={{ marginTop: '2.5rem' }}>
            <Link href={route('dashboard')} className="back-button">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
