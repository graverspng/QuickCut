import { useEffect, useRef, useState } from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import '@/../css/dashboard.css';

const MAX_PROJECT_NAME_LENGTH = 20;
const PROJECT_NAME_LIMIT_MESSAGE = 'Project name is limited to 20 characters';

export default function Dashboard({ projects = [] }) {
  const [showModal, setShowModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [filter, setFilter] = useState('all');
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
      const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
      window.addEventListener('keydown', onKey);
      return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
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
    if (name.length > MAX_PROJECT_NAME_LENGTH) { setToastMsg(PROJECT_NAME_LIMIT_MESSAGE); return; }
    setCreating(true);
    router.post('/projects', { name }, {
      onSuccess: () => { setToastMsg('Project created'); closeModal(); },
      onFinish: () => setCreating(false)
    });
  };

  const deleteProject = (id) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    router.delete(route('projects.destroy', id), {
      onSuccess: () => setToastMsg('Project deleted')
    });
  };

  const toggleFavorite = (project) => {
    const next = !project.favorited_project;
    router.put(route('projects.update', project.id), { favorited_project: next }, {
      preserveScroll: true,
      preserveState: true,
      onSuccess: () => setToastMsg(next ? 'Project added to favorites' : 'Project removed from favorites')
    });
  };

  const onOverlayMouseDown = (e) => { if (e.target === e.currentTarget) closeModal(); };
  const onKeyDownInput = (e) => { if (e.key === 'Enter' && !e.shiftKey) createProject(e); };

  const filteredProjects = projects.filter(p => {
    if (filter === 'favorites') return p.favorited_project;
    return true;
  });

  const totalProjects = projects.length;
  const favCount = projects.filter(p => p.favorited_project).length;

  return (
    <AuthenticatedLayout>
      <Head title="Projects" />
      <div className="dashboard-page">
        <div className="dashboard-wrapper">

          {/* Header */}
          <div className="dashboard-header fade-in-up">
            <div>
              <h2 className="dashboard-title">Media Projects</h2>
              <p className="dashboard-subtitle">Create, manage, and edit your media projects below.</p>
            </div>
            <button className="dashboard-cta" onClick={openModal}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              New Project
            </button>
          </div>

          {/* Stats row */}
          <div className="stats-row fade-in-up" style={{ animationDelay: '60ms' }}>
            <div className="stat-card">
              <div className="stat-label">Total projects</div>
              <div className="stat-value">{totalProjects}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Favorited</div>
              <div className="stat-value">{favCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Last edited</div>
              <div className="stat-value stat-value--sm">
                {projects[0]?.name ?? '—'}
              </div>
            </div>
          </div>

          {/* Filter row */}
          <div className="filter-row fade-in-up" style={{ animationDelay: '100ms' }}>
            <button className={`filter-btn${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</button>
            <button className={`filter-btn${filter === 'favorites' ? ' active' : ''}`} onClick={() => setFilter('favorites')}>
              ★ Favorites
            </button>
          </div>

          {/* Grid */}
          <div className="projects-grid">
            <div className="project-card create-card cursor-pointer slide-in" onClick={openModal}>
              <div className="create-plus">+</div>
              <p className="create-label">New Media Project</p>
            </div>

            {filteredProjects.map((project, i) => (
              <div
                key={project.id}
                className={`project-card group slide-in${project.favorited_project ? ' favorited' : ''}`}
                style={{ animationDelay: `${(i + 1) * 80}ms` }}
              >
                {/* Thumbnail area */}
                <div className="project-thumb" onClick={() => router.get(route('editor', project.id))}>
                  <div className="thumb-play">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <polygon points="6,4 20,12 6,20" fill="#3ddc84"/>
                    </svg>
                  </div>
                  <div className="thumb-bars">
                    {[40,70,55,90,65,45,80,50,75,35].map((h, idx) => (
                      <div key={idx} className="thumb-bar" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>

                {/* Info */}
                <div className="project-info" onClick={() => router.get(route('editor', project.id))}>
                  <h3 className="project-card-title">{project.name}</h3>
                  <p className="project-card-sub">Click to edit</p>
                </div>

                {/* Actions */}
                <div className="project-actions">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(project); }}
                    className={`favorite-btn${project.favorited_project ? ' is-active' : ''}`}
                    aria-label={`${project.favorited_project ? 'Remove from' : 'Add to'} favorites`}
                    title={project.favorited_project ? 'Favorited' : 'Favorite'}
                  >
                    {project.favorited_project ? '★' : '☆'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                    className="delete-btn"
                    aria-label={`Delete ${project.name}`}
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredProjects.length === 0 && filter === 'favorites' && (
            <div className="empty-state fade-in-up">
              <div className="empty-icon">☆</div>
              <p>No favorited projects yet.<br/>Click the star on any project to pin it here.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onMouseDown={onOverlayMouseDown}>
          <div className="modal-card fade-in-up" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <h2 id="create-title" className="modal-title">Name your project</h2>
            <form onSubmit={createProject}>
              <input
                type="text"
                ref={inputRef}
                className="modal-input"
                placeholder="Project name"
                value={projectName}
                onChange={handleProjectNameChange}
                onKeyDown={onKeyDownInput}
                required
              />
              <div className="char-count">{projectName.length} / {MAX_PROJECT_NAME_LENGTH}</div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="modal-create" disabled={creating || projectName.trim().length === 0}>
                  {creating && <span className="btn-spinner" aria-hidden="true" />}
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="dash-toast" role="status" aria-live="polite">
          <span className="dot" aria-hidden="true" />
          <span>{toastMsg}</span>
        </div>
      )}
    </AuthenticatedLayout>
  );
}
