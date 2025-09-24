import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, useForm, Link } from '@inertiajs/react';
import '@/../css/ReportIssue.css';

export default function ReportIssue() {
    const { data, setData, post, processing, errors } = useForm({
        issue: '',
    });

    const submit = (e) => {
        e.preventDefault();
        post(route('reports.store'));
    };

    return (
        <AuthenticatedLayout hideNavbar>
            <Head title="Report an Issue" />

            <div className="report-issue-background">
                {/* Floating QuickCut background */}
                <img src="/QuickCut.png" alt="Background" className="report-float" />

                <div className="report-issue-container">
                    <h1 className="report-title">Report an Issue</h1>

                    <form onSubmit={submit}>
                        <div>
                            <label htmlFor="issue" className="report-label">
                                Describe the issue
                            </label>
                            <textarea
                                id="issue"
                                rows="6"
                                value={data.issue}
                                onChange={(e) => setData('issue', e.target.value)}
                                className="report-textarea"
                                placeholder="Let us know what went wrong..."
                            />
                            {errors.issue && (
                                <p className="report-error">{errors.issue}</p>
                            )}
                        </div>

                        {/* Button Row */}
                        <div className="report-buttons">
                            <Link
                                href={route('dashboard')}
                                className="report-back"
                            >
                                ← Back to Home
                            </Link>

                            <button
                                type="submit"
                                disabled={processing}
                                className="report-submit"
                            >
                                Submit Report
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
