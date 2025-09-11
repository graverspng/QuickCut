import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import { useForm } from '@inertiajs/react';
import { useRef, useState } from 'react';
import ReactDOM from 'react-dom'; // ✅ import portal
import '@/../css/dashboard.css';

export default function DeleteUserForm({ className = '' }) {
    const [showModal, setShowModal] = useState(false);
    const passwordInput = useRef();

    const {
        data,
        setData,
        delete: destroy,
        processing,
        reset,
        errors,
    } = useForm({
        password: '',
    });

    const confirmUserDeletion = () => setShowModal(true);

    const deleteUser = (e) => {
        e.preventDefault();

        destroy(route('profile.destroy'), {
            preserveScroll: true,
            onSuccess: () => closeModal(),
            onError: () => passwordInput.current.focus(),
            onFinish: () => reset(),
        });
    };

    const closeModal = () => {
        setShowModal(false);
        reset();
    };

    return (
        <section className={`project-card slide-in space-y-6 ${className}`}>
            <header>
                <h2 className="text-lg font-medium text-white">Delete Account</h2>
                <p className="mt-1 text-sm text-gray-400">
                    Once your account is deleted, all resources and data will be permanently lost.
                    Please download any data you wish to keep.
                </p>
            </header>

            {/* Compact red button */}
            <button
                type="button"
                onClick={confirmUserDeletion}
                className="modal-create bg-red-600 hover:bg-red-700 text-white w-auto px-6 py-2"
            >
                Delete Account
            </button>

            {/* Portal modal */}
            {showModal &&
                ReactDOM.createPortal(
                    (
                        <div className="fixed top-0 left-0 w-screen h-screen bg-black bg-opacity-70 flex items-center justify-center z-[9999]">
                            <form onSubmit={deleteUser} className="modal-card fade-in-up relative">
                                <h2 className="text-xl font-semibold text-white mb-2">
                                    Are you sure you want to delete your account?
                                </h2>
                                <p className="text-sm text-gray-400 mb-4">
                                    This action is permanent. Please enter your password to confirm.
                                </p>

                                <div className="mt-4">
                                    <InputLabel htmlFor="password" value="Password" className="text-gray-300" />
                                    <TextInput
                                        id="password"
                                        type="password"
                                        ref={passwordInput}
                                        value={data.password}
                                        onChange={(e) => setData('password', e.target.value)}
                                        className="modal-input mt-1 block w-full"
                                        placeholder="Password"
                                    />
                                    <InputError message={errors.password} className="mt-2 text-red-400" />
                                </div>

                                <div className="flex justify-end space-x-2 mt-6">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="modal-cancel"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={processing}
                                        className="modal-create bg-red-600 hover:bg-red-700 text-white px-6 py-2"
                                    >
                                        Delete Account
                                    </button>
                                </div>
                            </form>
                        </div>
                    ),
                    document.body
                )
            }
        </section>
    );
}
