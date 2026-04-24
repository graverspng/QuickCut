import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import DeleteUserForm from './Partials/DeleteUserForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';
import '@/../css/profile.css';

export default function Edit({ mustVerifyEmail, status }) {
    return (
        <AuthenticatedLayout>
            <Head title="Profile" />

            <div className="prof-page">
                <div className="prof-wrapper">

                    <div className="prof-hero">
                        <div className="prof-eyebrow">
                            <span className="prof-eyebrow-dot" aria-hidden="true" />
                            Settings
                        </div>
                        <h1 className="prof-hero-title">Your Profile</h1>
                        <p className="prof-hero-sub">Manage your account information and security settings.</p>
                    </div>

                    <div className="prof-grid">
                        <UpdateProfileInformationForm
                            mustVerifyEmail={mustVerifyEmail}
                            status={status}
                            animDelay="150ms"
                        />
                        <UpdatePasswordForm animDelay="250ms" />
                        <div className="prof-grid-full">
                            <DeleteUserForm animDelay="350ms" />
                        </div>
                    </div>

                </div>
            </div>
        </AuthenticatedLayout>
    );
}
