import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { useMemo } from 'react';
import '@/../css/Login.css'; // shared CSS for login/register styling

export default function Register() {
    const { data, setData, post, processing, errors, reset } = useForm({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });

    const passwordInsights = useMemo(() => {
        const value = data.password || '';
        const checks = [
            {
                key: 'length',
                label: 'At least 8 characters',
                met: value.length >= 8,
            },
            {
                key: 'uppercase',
                label: 'At least one uppercase letter',
                met: /[A-Z]/.test(value),
            },
            {
                key: 'number',
                label: 'At least one number',
                met: /\d/.test(value),
            },
            {
                key: 'symbol',
                label: 'At least one symbol',
                met: /[^A-Za-z0-9]/.test(value),
            },
        ];

        return {
            checklist: checks,
            isStrong: checks.every((item) => item.met),
        };
    }, [data.password]);
    const { checklist: passwordChecklist, isStrong: isPasswordStrong } = passwordInsights;

    const submit = (e) => {
        e.preventDefault();

        post(route('register'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <GuestLayout fullWidth={true}>
            <Head title="Register" />

            <div className="login-page">
                <div className="login-wrapper">
                    {/* Left pane with illustration */}
                    <div className="login-left">
                        <img
                            src="/img/QuickCut.png" // use public folder path
                            alt="Illustration"
                            className="login-illustration"
                        />
                    </div>

                    {/* Right pane with form */}
                    <div className="login-right">
                        <div className="right-inner">
                            <div className="login-card">
                                <div className="text-center mb-6">
                                    <h2 className="text-3xl font-semibold text-white">
                                        Create Account
                                    </h2>
                                    <p className="text-sm text-gray-300 mt-1">
                                        Sign up to get started
                                    </p>
                                </div>

                                <form onSubmit={submit}>
                                    <div>
                                        <InputLabel htmlFor="name" value="Name" className="text-white" />
                                        <TextInput
                                            id="name"
                                            name="name"
                                            value={data.name}
                                            className="mt-1 block w-full"
                                            autoComplete="name"
                                            isFocused={true}
                                            onChange={(e) => setData('name', e.target.value)}
                                            required
                                        />
                                        <InputError message={errors.name} className="mt-2" />
                                    </div>

                                    <div className="mt-4">
                                        <InputLabel htmlFor="email" value="Email" className="text-white" />
                                        <TextInput
                                            id="email"
                                            type="email"
                                            name="email"
                                            value={data.email}
                                            className="mt-1 block w-full"
                                            autoComplete="username"
                                            onChange={(e) => setData('email', e.target.value)}
                                            required
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
                                            autoComplete="new-password"
                                            onChange={(e) => setData('password', e.target.value)}
                                            required
                                        />
                                        <InputError message={errors.password} className="mt-2" />
                                        <ul className="password-criteria-compact">
                                            {passwordChecklist.map((item) => (
                                                <li key={item.key} className={item.met ? 'valid' : ''}>
                                                    <span className="indicator">{item.met ? '✔' : '•'}</span>
                                                    {item.label}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className="mt-4">
                                        <InputLabel htmlFor="password_confirmation" value="Confirm Password" className="text-white" />
                                        <TextInput
                                            id="password_confirmation"
                                            type="password"
                                            name="password_confirmation"
                                            value={data.password_confirmation}
                                            className="mt-1 block w-full"
                                            autoComplete="new-password"
                                            onChange={(e) => setData('password_confirmation', e.target.value)}
                                            required
                                        />
                                        <InputError message={errors.password_confirmation} className="mt-2" />
                                    </div>

                                    <div className="mt-6 flex items-center justify-between">
                                        <Link
                                            href={route('login')}
                                            className="rounded-md text-sm text-gray-300 underline hover:text-white"
                                        >
                                            Already registered?
                                        </Link>

                                        {/* Use custom smaller login button style */}
                                        <button
                                            type="submit"
                                            className="login-button"
                                            disabled={processing}
                                        >
                                            Register
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </GuestLayout>
    );
}
