import { useForm } from '@inertiajs/react';
import { useRef, useState } from 'react';
import ReactDOM from 'react-dom';

export default function DeleteUserForm({ animDelay = '0ms' }) {
    const [showModal, setShowModal] = useState(false);
    const passwordInput = useRef(null);

    const { data, setData, delete: destroy, processing, reset, errors } = useForm({
        password: '',
    });

    const deleteUser = (e) => {
        e.preventDefault();
        destroy(route('profile.destroy'), {
            preserveScroll: true,
            onSuccess: () => closeModal(),
            onError:   () => passwordInput.current?.focus(),
            onFinish:  () => reset(),
        });
    };

    const closeModal = () => {
        setShowModal(false);
        reset();
    };

    return (
        <section className="prof-card prof-card--danger" style={{ animationDelay: animDelay }}>
            <h2 className="prof-card-title">Delete Account</h2>
            <p className="prof-card-sub">
                Once deleted, all your projects and data are permanently gone. Download anything you want to keep first.
            </p>
            <div className="prof-divider" />

            <button type="button" onClick={() => setShowModal(true)} className="prof-delete-btn">
                Delete Account
            </button>

            {showModal && ReactDOM.createPortal(
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.75)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                    }}
                    onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div style={{
                        background: 'linear-gradient(160deg, #1e1515, #161111)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: 18,
                        padding: 32,
                        width: 440,
                        maxWidth: '92%',
                        boxShadow: '0 24px 60px rgba(0,0,0,0.75)',
                    }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FCFFFC', margin: '0 0 8px' }}>
                            Delete your account?
                        </h2>
                        <p style={{ fontSize: '0.85rem', color: 'rgba(252,255,252,0.5)', margin: '0 0 20px', lineHeight: 1.6 }}>
                            This is permanent and cannot be undone. Enter your password to confirm.
                        </p>

                        <form onSubmit={deleteUser}>
                            <div className="prof-field">
                                <label htmlFor="del-password" className="prof-label">Password</label>
                                <input
                                    id="del-password"
                                    type="password"
                                    ref={passwordInput}
                                    className="prof-input"
                                    value={data.password}
                                    onChange={(e) => setData('password', e.target.value)}
                                    placeholder="Your password"
                                />
                                {errors.password && <p className="prof-error">{errors.password}</p>}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                                <button type="button" onClick={closeModal} className="prof-modal-cancel">
                                    Cancel
                                </button>
                                <button type="submit" disabled={processing} className="prof-delete-btn">
                                    {processing && <span className="prof-spinner" aria-hidden="true" />}
                                    {processing ? 'Deleting…' : 'Delete Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </section>
    );
}
