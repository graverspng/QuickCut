import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import DeleteUserForm from './Partials/DeleteUserForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';
import '@/../css/dashboard.css'; // 🔹 import dashboard styles

export default function Edit({ mustVerifyEmail, status }) {
    return (
        <AuthenticatedLayout>
            <Head title="Profile" />

            <div className="dashboard-page">
                <div className="dashboard-wrapper">
                    {/* Page title */}
                    <div className="text-center mb-10 fade-in-up">
                        <h2 className="text-4xl font-bold text-white">Profile</h2>
                        <p className="text-gray-400 mt-2">
                            Manage your account information below.
                        </p>
                    </div>

                    {/* Grid of cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <UpdateProfileInformationForm
                            mustVerifyEmail={mustVerifyEmail}
                            status={status}
                            className="project-card"
                        />

                        <UpdatePasswordForm className="project-card" />

                        <div className="md:col-span-2">
                            <DeleteUserForm className="project-card" />
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
