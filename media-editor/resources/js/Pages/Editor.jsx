import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';

export default function Editor({ project }) {
    return (
        <AuthenticatedLayout
            header={<h2 className="text-xl font-semibold text-gray-800">{project.name}</h2>}
        >
            <Head title={project.name} />

            <div className="py-12">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
                    <div className="bg-white shadow-sm sm:rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4">Project Editor</h3>
                        <p>This is where you will build your editing interface.</p>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
