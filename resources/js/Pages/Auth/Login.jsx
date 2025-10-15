import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import '@/../css/Login.css';
import QuickCutImg from '@/Pages/Auth/img/QuickCut.png';

export default function Login({ status, canResetPassword }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const submit = (e) => {
        e.preventDefault();
        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    return (
        <GuestLayout fullWidth={true}>
            <Head title="Log in" />

            <div className="login-page">
                <div className="login-wrapper">
                    <div className="login-left">
                        <img
                            src={QuickCutImg}
                            alt="Illustration"
                            className="login-illustration"
                        />
                    </div>

                    <div className="login-right">
                        <div className="right-inner">
                            <div className="login-card">
                                <div className="text-center mb-6">
                                    <h2 className="text-3xl font-semibold text-white">
                                        Welcome back
                                    </h2>
                                    <p className="text-sm text-gray-300 mt-1">
                                        Sign in to continue
                                    </p>
                                </div>

                                {status && (
                                    <div className="mb-4 text-sm font-medium text-green-400">
                                        {status}
                                    </div>
                                )}

                                <form onSubmit={submit}>
                                    <div>
                                        <InputLabel htmlFor="email" value="Email" className="text-white" />
                                        <TextInput
                                            id="email"
                                            type="email"
                                            name="email"
                                            value={data.email}
                                            className="mt-1 block w-full"
                                            autoComplete="username"
                                            isFocused={true}
                                            onChange={(e) => setData('email', e.target.value)}
                                        />
                                        <InputError message={errors.email} className="mt-2" />
                                    </div>

                                    <div className="mt-4">
                                        <InputLabel htmlFor="password" value="Password" className="text-white" />
                                        <TextInput
                                            id="password"
                                            type="password"
                                            name="password"
                                            value={data.password}
                                            className="mt-1 block w-full"
                                            autoComplete="current-password"
                                            onChange={(e) => setData('password', e.target.value)}
                                        />
                                        <InputError message={errors.password} className="mt-2" />
                                    </div>

                                    <div className="mt-4 block">
                                        <label className="flex items-center text-white">
                                            <Checkbox
                                                name="remember"
                                                checked={data.remember}
                                                onChange={(e) =>
                                                    setData('remember', e.target.checked)
                                                }
                                            />
                                            <span className="ms-2 text-sm text-gray-300">
                                                Remember me
                                            </span>
                                        </label>
                                    </div>

                                    <div className="mt-6 flex justify-center">
                                        <button
                                            type="submit"
                                            className="login-button"
                                            disabled={processing}
                                        >
                                            Continue
                                        </button>
                                    </div>
                                </form>

                                <div className="mt-6 text-center text-gray-300">
                                    <span className="text-sm">Don’t have an account?</span>
                                    <Link
                                        href={route('register')}
                                        className="ml-2 text-sm text-pink-400 hover:text-pink-300 font-medium underline"
                                    >
                                        Sign Up
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </GuestLayout>
    );
}
