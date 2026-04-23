import { useEffect, useRef, useState } from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import '@/../css/dashboard.css';

const MAX_PROJECT_NAME_LENGTH = 20;
const PROJECT_NAME_LIMIT_MESSAGE = 'Project name is limited to 20 characters';

const ART_GRADS = [
    'linear-gradient(135deg, #0b1f0e, #112914)',
    'linear-gradient(135deg, #0e1a1f, #0a2030)',
    'linear-gradient(135deg, #1a1010, #2a1515)',
    'linear-gradient(135deg, #151520, #0f1030)',
    'linear-gradient(135deg, #1a1a0a, #2a2a10)',
];
const artGrad = (id) => ART_GRADS[id % ART_GRADS.length];

const relativeTime = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)  return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30)  return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
};

export default function Dashboard({ projects = [] }) {
    const [showModal, setShowModal]   = useState(false);
    const [projectName, setProjectName] = useState('');
    const [creating, setCreating]     = useState(false);
    const [toastMsg, setToastMsg]     = useState('');
    const inputRef  = useRef(null);
    const openerRef = useRef(null);

    const openModal = () => {
        openerRef.current = document.activeElement;
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setProjectName('');
        if (openerRef.current && typeof openerRef.current.focus === 'function') openerRef.current.focus();
    };

    useEffect(() => {
        if (!showModal) return;
        const t     = setTimeout(() => inputRef.current?.focus(), 50);
        const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
        window.addEventListener('keydown', onKey);
        return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
    }, [showModal]);

    useEffect(() => {
        if (!toastMsg) return;
        const t = setTimeout(() => setToastMsg(''), 3600);
        return () => clearTimeout(t);
    }, [toastMsg]);

    const handleProjectNameChange = (e) => {
        const value = e.target.value;
        if (value.length > MAX_PROJECT_NAME_LENGTH) {
            setToastMsg(PROJECT_NAME_LIMIT_MESSAGE);
            setProjectName(value.slice(0, MAX_PROJECT_NAME_LENGTH));
            return;
        }
        setProjectName(value);
    };

    const createProject = (e) => {
        e.preventDefault();
        const name = projectName.trim();
        if (!name) return;
        if (name.length > MAX_PROJECT_NAME_LENGTH) { setToastMsg(PROJECT_NAME_LIMIT_MESSAGE); return; }
        setCreating(true);
        router.post('/projects', { name }, {
            onSuccess: () => { setToastMsg('Project created'); closeModal(); },
            onFinish:  () => setCreating(false),
        });
    };

    const deleteProject = (id) => {
        if (!confirm('Are you sure you want to delete this project?')) return;
        router.delete(route('projects.destroy', id), {
            onSuccess: () => setToastMsg('Project deleted'),
        });
    };

    const toggleFavorite = (project) => {
        const next = !project.favorited_project;
        router.put(route('projects.update', project.id), { favorited_project: next }, {
            preserveScroll: true,
            preserveState:  true,
            onSuccess: () => setToastMsg(next ? 'Added to favorites' : 'Removed from favorites'),
        });
    };

    return (
        <AuthenticatedLayout>
            <Head title="Projects" />
            <div className="db-page">
                <div className="db-wrapper">

                    {/* ── Hero ── */}
                    <header className="db-hero">
                        <div className="db-hero-left">
                            <div className="db-eyebrow">
                                <span className="db-eyebrow-dot" aria-hidden="true" />
                                QuickCut
                            </div>
                            <h1 className="db-hero-title">Media Projects</h1>
                            <p className="db-hero-sub">Create, manage, and edit your video projects.</p>
                        </div>
                        <button className="db-new-btn" onClick={openModal}>
                            <span className="db-new-btn-icon" aria-hidden="true">+</span>
                            New Project
                        </button>
                    </header>

                    {/* ── Section label ── */}
                    <div className="db-section">
                        <span className="db-section-label">All Projects</span>
                        <span className="db-section-line" />
                        <span className="db-section-count">{projects.length}</span>
                    </div>

                    {/* ── Grid ── */}
                    <div className="db-grid">
                        {/* Create card */}
                        <div
                            className="pcard-new"
                            onClick={openModal}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && openModal()}
                            aria-label="Create new project"
                        >
                            <div className="pcard-new-plus" aria-hidden="true">+</div>
                            <span className="pcard-new-label">New Project</span>
                            <span className="pcard-new-sub">Start from scratch</span>
                        </div>

                        {/* Empty state */}
                        {projects.length === 0 && (
                            <div className="db-empty">
                                <span className="db-empty-icon">🎬</span>
                                <p className="db-empty-text">No projects yet — create your first one!</p>
                            </div>
                        )}

                        {/* Project cards */}
                        {projects.map((project, i) => (
                            <div
                                key={project.id}
                                className={`pcard${project.favorited_project ? ' favorited' : ''}`}
                                style={{
                                    '--card-art-bg': artGrad(project.id),
                                    animationDelay: `${(i + 1) * 80}ms`,
                                }}
                            >
                                <div
                                    className="pcard-art"
                                    onClick={() => router.get(route('editor', project.id))}
                                >
                                    <div className="pcard-art-noise" aria-hidden="true" />
                                    <span className="pcard-initial" aria-hidden="true">
                                        {project.name[0]?.toUpperCase()}
                                    </span>
                                    <span className="pcard-type-icon" aria-hidden="true">🎬</span>
                                    {project.favorited_project && (
                                        <span className="pcard-fav-star" aria-hidden="true">★</span>
                                    )}
                                </div>

                                <div
                                    className="pcard-body"
                                    onClick={() => router.get(route('editor', project.id))}
                                >
                                    <p className="pcard-name">{project.name}</p>
                                    <p className="pcard-date">
                                        {relativeTime(project.updated_at || project.created_at)}
                                    </p>
                                </div>

                                <div className="pcard-foot">
                                    <button
                                        type="button"
                                        className="pcard-open-btn"
                                        onClick={() => router.get(route('editor', project.id))}
                                    >
                                        Open →
                                    </button>
                                    <button
                                        type="button"
                                        className={`pcard-icon-btn pcard-icon-btn--fav${project.favorited_project ? ' active' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(project); }}
                                        aria-label={project.favorited_project ? 'Remove from favorites' : 'Add to favorites'}
                                        title={project.favorited_project ? 'Unfavorite' : 'Favorite'}
                                    >
                                        ★
                                    </button>
                                    <button
                                        type="button"
                                        className="pcard-icon-btn pcard-icon-btn--del"
                                        onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                                        aria-label={`Delete ${project.name}`}
                                        title="Delete"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Modal ── */}
            {showModal && (
                <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
                    <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
                        <h2 id="create-title" className="modal-card-title">Name your project</h2>
                        <p className="modal-card-sub">Enter a name to get started.</p>
                        <form onSubmit={createProject}>
                            <input
                                type="text"
                                ref={inputRef}
                                className="modal-input"
                                placeholder="Project name"
                                value={projectName}
                                onChange={handleProjectNameChange}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) createProject(e); }}
                                required
                            />
                            <p className="modal-char-count">{projectName.length} / {MAX_PROJECT_NAME_LENGTH}</p>
                            <div className="modal-actions">
                                <button type="button" className="modal-cancel" onClick={closeModal}>Cancel</button>
                                <button
                                    type="submit"
                                    className="modal-create"
                                    disabled={creating || projectName.trim().length === 0}
                                >
                                    {creating && <span className="btn-spinner" aria-hidden="true" />}
                                    {creating ? 'Creating…' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Toast ── */}
            {toastMsg && (
                <div className="dash-toast" role="status" aria-live="polite">
                    <span className="dot" aria-hidden="true" />
                    <span>{toastMsg}</span>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
