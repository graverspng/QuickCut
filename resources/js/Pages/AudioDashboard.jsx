import { useState } from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import '@/../css/dashboard.css';

export default function AudioDashboard({ projects = [] }) {
    const [showModal, setShowModal] = useState(false);
    const [projectName, setProjectName] = useState('');

    const createProject = (e) => {
        e.preventDefault();
        if (!projectName) return;

        router.post(route('audio.projects.store'), { name: projectName }, {
            onSuccess: () => {
                setShowModal(false);
                setProjectName('');
            }
        });
    };

    const deleteProject = (id) => {
        if (confirm("Are you sure you want to delete this audio project?")) {
            router.delete(route('audio.projects.destroy', id));
        }
    };

    return (
        <AuthenticatedLayout>
            <Head title="Audio Projects" />

            <div className="dashboard-page">
                <div className="dashboard-wrapper">
                    <div className="text-center mb-10 fade-in-up">
                        <h2 className="text-4xl font-bold text-white">Your Audio Projects</h2>
                        <p className="text-gray-400 mt-2">
                            Create, manage, and edit your audio projects below.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                        <div
                            className="project-card create-card cursor-pointer slide-in"
                            onClick={() => setShowModal(true)}
                        >
                            <span className="text-6xl font-bold">+</span>
                            <p className="mt-2 text-gray-300">New Audio Project</p>
                        </div>

                        {projects.map((project, i) => (
                            <div
                            key={project.id}
                            className="project-card group slide-in"
                            style={{ animationDelay: `${i * 120}ms` }}
                        >
                            <div
                                className="flex-1 cursor-pointer"
                                onClick={() => router.get(route('audio.editor', project.id))}
                            >
                                <h3 className="text-xl font-semibold text-white truncate">
                                    {project.name}
                                </h3>
                                <p className="text-gray-400 text-sm mt-1">Click to edit</p>
                            </div>
                            <button
                                onClick={() => deleteProject(project.id)}
                                className="delete-btn opacity-0 group-hover:opacity-100"
                            >
                                ✕
                            </button>
                        </div>
                        
                        ))}
                    </div>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
                    <div className="modal-card fade-in-up">
                        <h2 className="text-xl font-semibold text-white mb-4">Name your audio project</h2>
                        <form onSubmit={createProject}>
                            <input
                                type="text"
                                className="modal-input"
                                placeholder="Audio project name"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                required
                            />
                            <div className="flex justify-end space-x-2 mt-4">
                                <button
                                    type="button"
                                    className="modal-cancel"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="modal-create">
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
