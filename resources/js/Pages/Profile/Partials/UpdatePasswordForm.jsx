import { Transition } from '@headlessui/react';
import { useForm } from '@inertiajs/react';
import { useRef } from 'react';

export default function UpdatePasswordForm({ animDelay = '0ms' }) {
    const passwordInput        = useRef(null);
    const currentPasswordInput = useRef(null);

    const { data, setData, errors, put, reset, processing, recentlySuccessful } = useForm({
        current_password:      '',
        password:              '',
        password_confirmation: '',
    });

    const updatePassword = (e) => {
        e.preventDefault();
        put(route('password.update'), {
            preserveScroll: true,
            onSuccess: () => reset(),
            onError: (errs) => {
                if (errs.password) {
                    reset('password', 'password_confirmation');
                    passwordInput.current?.focus();
                }
                if (errs.current_password) {
                    reset('current_password');
                    currentPasswordInput.current?.focus();
                }
            },
        });
    };

    return (
        <section className="prof-card" style={{ animationDelay: animDelay }}>
            <h2 className="prof-card-title">Update Password</h2>
            <p className="prof-card-sub">Use a long, random password to keep your account secure.</p>
            <div className="prof-divider" />

            <form onSubmit={updatePassword}>
                <div className="prof-field">
                    <label htmlFor="current_password" className="prof-label">Current Password</label>
                    <input
                        id="current_password"
                        type="password"
                        ref={currentPasswordInput}
                        className="prof-input"
                        value={data.current_password}
                        onChange={(e) => setData('current_password', e.target.value)}
                        autoComplete="current-password"
                    />
                    {errors.current_password && <p className="prof-error">{errors.current_password}</p>}
                </div>

                <div className="prof-field">
                    <label htmlFor="password" className="prof-label">New Password</label>
                    <input
                        id="password"
                        type="password"
                        ref={passwordInput}
                        className="prof-input"
                        value={data.password}
                        onChange={(e) => setData('password', e.target.value)}
                        autoComplete="new-password"
                    />
                    {errors.password && <p className="prof-error">{errors.password}</p>}
                </div>

                <div className="prof-field">
                    <label htmlFor="password_confirmation" className="prof-label">Confirm Password</label>
                    <input
                        id="password_confirmation"
                        type="password"
                        className="prof-input"
                        value={data.password_confirmation}
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                        autoComplete="new-password"
                    />
                    {errors.password_confirmation && <p className="prof-error">{errors.password_confirmation}</p>}
                </div>

                <div className="prof-footer">
                    <button type="submit" className="prof-save-btn" disabled={processing}>
                        {processing && <span className="prof-spinner" aria-hidden="true" />}
                        Save
                    </button>
                    <Transition
                        show={recentlySuccessful}
                        enter="transition ease-in-out"
                        enterFrom="opacity-0"
                        leave="transition ease-in-out"
                        leaveTo="opacity-0"
                    >
                        <p className="prof-saved-label">Saved.</p>
                    </Transition>
                </div>
            </form>
        </section>
    );
}
