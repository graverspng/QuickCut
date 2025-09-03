import { useState } from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';

export default function Dashboard({ projects = [] }) {
    const [showModal, setShowModal] = useState(false);
    const [projectName, setProjectName] = useState('');

    const createProject = (e) => {
        e.preventDefault();
        if (!projectName) return;

        // Send POST request to Laravel
        router.post('/projects', { name: projectName }, {
            onSuccess: () => {
                setShowModal(false);
            }
        });
    };

    return (
        <AuthenticatedLayout
            header={<h2 className="text-xl font-semibold text-gray-800">Projects</h2>}
        >
            <Head title="Projects" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {/* Create New Project Block */}
                        <div
                            className="flex items-center justify-center h-40 bg-white rounded-lg shadow-md cursor-pointer hover:bg-gray-100 transition"
                            onClick={() => setShowModal(true)}
                        >
                            <span className="text-4xl font-bold text-gray-500">+</span>
                        </div>

                        {/* Render Existing Projects */}
                        {projects.map((project) => (
    <div
        key={project.id}
        className="h-40 bg-white rounded-lg shadow-md p-4 flex flex-col justify-between hover:shadow-lg transition cursor-pointer"
        onClick={() => router.get(route('editor', project.id))}
    >
        <h3 className="text-lg font-semibold text-gray-800 truncate">
            {project.name}
        </h3>
    </div>
))}

                    </div>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-80">
                        <h2 className="text-lg font-semibold mb-4">Choose a project name</h2>
                        <form onSubmit={createProject}>
                            <input
                                type="text"
                                className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
                                placeholder="Project name"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                required
                            />
                            <div className="flex justify-end space-x-2">
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                                >
                                    Create
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
