import { Transition } from '@headlessui/react';
import { Link, useForm, usePage } from '@inertiajs/react';

export default function UpdateProfileInformationForm({
    mustVerifyEmail,
    status,
    animDelay = '0ms',
}) {
    const user = usePage().props.auth.user;

    const { data, setData, patch, errors, processing, recentlySuccessful } = useForm({
        name:  user.name,
        email: user.email,
    });

    const submit = (e) => {
        e.preventDefault();
        patch(route('profile.update'));
    };

    return (
        <section className="prof-card" style={{ animationDelay: animDelay }}>
            <h2 className="prof-card-title">Profile Information</h2>
            <p className="prof-card-sub">Update your name and email address.</p>
            <div className="prof-divider" />

            <form onSubmit={submit}>
                <div className="prof-field">
                    <label htmlFor="name" className="prof-label">Name</label>
                    <input
                        id="name"
                        type="text"
                        className="prof-input"
                        value={data.name}
                        onChange={(e) => setData('name', e.target.value)}
                        required
                        autoComplete="name"
                    />
                    {errors.name && <p className="prof-error">{errors.name}</p>}
                </div>

                <div className="prof-field">
                    <label htmlFor="email" className="prof-label">Email</label>
                    <input
                        id="email"
                        type="email"
                        className="prof-input"
                        value={data.email}
                        onChange={(e) => setData('email', e.target.value)}
                        required
                        autoComplete="username"
                    />
                    {errors.email && <p className="prof-error">{errors.email}</p>}
                </div>

                {mustVerifyEmail && user.email_verified_at === null && (
                    <p className="prof-error" style={{ marginBottom: 12 }}>
                        Your email is unverified.{' '}
                        <Link
                            href={route('verification.send')}
                            method="post"
                            as="button"
                            style={{ color: '#2BA84A', textDecoration: 'underline' }}
                        >
                            Resend verification email
                        </Link>
                        {status === 'verification-link-sent' && (
                            <span style={{ display: 'block', marginTop: 4, color: '#3CCF65' }}>
                                Verification link sent!
                            </span>
                        )}
                    </p>
                )}

                <div className="prof-footer">
                    <button type="submit" className="prof-save-btn" disabled={processing}>
                        {processing && <span className="prof-spinner" aria-hidden="true" />}
                        Save
                    </button>
                    <Transition show={recentlySuccessful}>
                        <p className="prof-saved-label">Saved.</p>
                    </Transition>
                </div>
            </form>
        </section>
    );
}
