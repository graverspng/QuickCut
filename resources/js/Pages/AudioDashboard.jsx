import { useEffect, useRef, useState } from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import '@/../css/dashboard.css';

const MAX_PROJECT_NAME_LENGTH = 20;
const PROJECT_NAME_LIMIT_MESSAGE = 'Project name is limited to 20 characters';

export default function AudioDashboard({ projects = [] }) {
  const [showModal, setShowModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const inputRef = useRef(null);
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
    if (showModal) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      const onKey = (e) => {
        if (e.key === 'Escape') closeModal();
      };
      window.addEventListener('keydown', onKey);
      return () => {
        clearTimeout(t);
        window.removeEventListener('keydown', onKey);
      };
    }
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
    if (name.length > MAX_PROJECT_NAME_LENGTH) {
      setToastMsg(PROJECT_NAME_LIMIT_MESSAGE);
      return;
    }
    setCreating(true);
    router.post(route('audio.projects.store'), { name }, {
      onSuccess: () => {
        setToastMsg('Audio project created');
        closeModal();
      },
      onFinish: () => setCreating(false)
    });
  };

  const deleteProject = (id) => {
    if (!confirm('Are you sure you want to delete this audio project?')) return;
    router.delete(route('audio.projects.destroy', id), {
      onSuccess: () => setToastMsg('Audio project deleted')
    });
  };

  const toggleFavorite = (project) => {
    const next = !project.favorited_project;
    router.put(route('audio.projects.update', project.id), {
      favorited_project: next
    }, {
      preserveScroll: true,
      preserveState: true,
      onSuccess: () => setToastMsg(next ? 'Audio project added to favorites' : 'Audio project removed from favorites')
    });
  };

  const onOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const onKeyDownInput = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      createProject(e);
    }
  };

  return (
    <AuthenticatedLayout>
      <Head title="Audio Projects" />
      <div className="dashboard-page">
        <div className="dashboard-wrapper">
          <div className="dashboard-header fade-in-up">
            <div>
              <h2 className="dashboard-title">Your Audio Projects</h2>
              <p className="dashboard-subtitle">Create, manage, and edit your audio projects below.</p>
            </div>
            <button className="dashboard-cta" onClick={openModal}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="rgba(0,0,0,0.3)" strokeWidth="2" strokeLinecap="round"/></svg>
              New Audio Project
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            <div className="project-card create-card cursor-pointer slide-in" onClick={openModal}>
              <span className="text-6xl font-bold">+</span>
              <p className="mt-2 text-gray-300">New Audio Project</p>
            </div>

            {projects.map((project, i) => (
              <div
                key={project.id}
                className={`project-card group slide-in${project.favorited_project ? ' favorited' : ''}`}
                style={{ animationDelay: `${i * 120}ms` }}
              >
                                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(project);
                  }}
                  className={`favorite-btn ${project.favorited_project ? 'is-active' : 'opacity-0 group-hover:opacity-100'}`}
                  aria-label={`${project.favorited_project ? 'Remove from' : 'Add to'} favorites`}
                  title={project.favorited_project ? 'Favorited project' : 'Favorite project'}
                >
                  {project.favorited_project ? '★' : '☆'}
                </button>
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => router.get(route('audio.editor', project.id))}
                >
                  <h3 className="project-card-title">{project.name}</h3>
                  <p className="project-card-sub">Click to edit</p>
                </div>
                <button
                  onClick={() => deleteProject(project.id)}
                  className="delete-btn opacity-0 group-hover:opacity-100"
                  aria-label={`Delete ${project.name}`}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onMouseDown={onOverlayMouseDown}>
          <div className="modal-card fade-in-up" role="dialog" aria-modal="true" aria-labelledby="create-audio-title">
            <h2 id="create-audio-title" className="text-xl font-semibold text-white mb-4">Name your audio project</h2>
            <form onSubmit={createProject}>
              <input
                type="text"
                ref={inputRef}
                className="modal-input"
                placeholder="Audio project name"
                value={projectName}
                onChange={handleProjectNameChange}
                onKeyDown={onKeyDownInput}
                required
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-cancel"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button type="submit" className="modal-create" disabled={creating || projectName.trim().length === 0}>
                  {creating && <span className="btn-spinner" aria-hidden="true" />} {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="dash-toast" role="status" aria-live="polite">
          <span className="dot" aria-hidden="true" />
          <span>{toastMsg}</span>
        </div>
      )}
    </AuthenticatedLayout>
  );
}
