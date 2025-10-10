import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, useForm, Link } from '@inertiajs/react';
import '@/../css/ReportIssue.css';
import { useEffect, useMemo, useState } from 'react';

export default function ReportIssue() {
  const ISSUE_MAX = 1000;
  const MIN_LEN = 10;

  const { data, setData, post, processing, errors, reset } = useForm({
    project: '',
    issue: '',
  });

  const [selectedProject, setSelectedProject] = useState('');
  const [showToast, setShowToast] = useState(false);

  const canSubmit = useMemo(() => {
    const hasProject = !!data.project;
    const hasIssue = data.issue.trim().length >= MIN_LEN;
    return hasProject && hasIssue && !processing;
  }, [data.project, data.issue, processing]);

  const charUsed = data.issue.length;
  const progress = Math.min(100, Math.round((charUsed / ISSUE_MAX) * 100));

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    post(route('reports.store'), {
      preserveScroll: true,
      onSuccess: () => {
        setShowToast(true);
        reset();
        setSelectedProject('');
      },
    });
  };

  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(false), 3800);
    return () => clearTimeout(t);
  }, [showToast]);

  const onKeyDownTextarea = (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    if ((isMac && e.metaKey && e.key === 'Enter') || (!isMac && e.ctrlKey && e.key === 'Enter')) {
      submit(e);
    }
  };

  const getIssueLabel = () => {
    if (!selectedProject) return 'Describe the issue';
    if (selectedProject === 'Somewhere else') return 'What was the issue?';
    return `What was the issue in your ${selectedProject}?`;
  };

const getProjectExample = (project) => {
  switch (project) {
    case 'Media project':
      return `In Media project, exporting a 4K video freezes around 87%.`;
    case 'Audio project':
      return `In Audio project, sound cuts off halfway during playback.`;
    case 'Format changer':
      return `Format changer converts files but the audio track is missing.`;
    case 'Profile page':
      return `On Profile page, changing my password gets me stuck on the loading bar.`;
    case 'Somewhere else':
      return `In the Dashboard, projects cant be favorited.`;
    default:
      return 'Include what you were doing and what went wrong.';
  }
};


  return (
    <AuthenticatedLayout hideNavbar>
      <Head title="Report an Issue" />

      <div className="report-issue-background">
        <img src="/QuickCut.png" alt="" className="report-float" aria-hidden="true" />

        <div className="report-issue-container" role="region" aria-labelledby="report-title">
          <div className="report-title-wrap">
            <span className="report-title-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3l7 3v6c0 4.418-3.582 8-8 8s-8-3.582-8-8V6l9-3Z" stroke="rgba(0,0,0,0.25)" fill="rgba(255,255,255,0.25)"/>
              </svg>
            </span>
            <h1 id="report-title" className="report-title">Report an Issue</h1>
          </div>
          <p className="report-subtitle">
            Help us fix things fast. Share where the problem occurred and what happened.
          </p>

          <div className="report-divider" />

          <form onSubmit={submit} noValidate>
            <div className="report-field report-dropdown-container">
              <label htmlFor="project" className="report-label">
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h10" stroke="url(#g1)" strokeWidth="2" strokeLinecap="round" />
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="24" y2="0">
                      <stop stopColor="#248232"/><stop offset="1" stopColor="#2BA84A"/>
                    </linearGradient>
                  </defs>
                </svg>
                Select Project
              </label>

              <select
                id="project"
                value={data.project}
                onChange={(e) => {
                  setData('project', e.target.value);
                  setSelectedProject(e.target.value);
                }}
                className="report-dropdown"
                aria-invalid={!!errors.project}
                aria-describedby={errors.project ? 'project-error' : 'project-hint'}
              >
                <option value="">-- Choose an option --</option>
                <option value="Media project">Media project</option>
                <option value="Audio project">Audio project</option>
                <option value="Format changer">Format changer</option>
                <option value="Profile page">Profile page</option>
                <option value="Somewhere else">Somewhere else</option>
              </select>

              {errors.project ? (
                <p id="project-error" className="report-error">{errors.project}</p>
              ) : (
                <p id="project-hint" className="report-hint">Pick the closest area where the issue appeared.</p>
              )}
            </div>

            <div className="report-field">
              <label htmlFor="issue" className="report-label">
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4v8m0 4h.01" stroke="url(#g2)" strokeWidth="2" strokeLinecap="round"/>
                  <defs>
                    <linearGradient id="g2" x1="0" y1="0" x2="24" y2="0">
                      <stop stopColor="#248232"/><stop offset="1" stopColor="#2BA84A"/>
                    </linearGradient>
                  </defs>
                </svg>
                {getIssueLabel()}
              </label>

              <textarea
                id="issue"
                rows={6}
                value={data.issue}
                maxLength={ISSUE_MAX}
                onChange={(e) => setData('issue', e.target.value)}
                onKeyDown={onKeyDownTextarea}
                className="report-textarea"
                placeholder={selectedProject ? getProjectExample(selectedProject) : getProjectExample('')}
                aria-invalid={!!errors.issue}
                aria-describedby={errors.issue ? 'issue-error' : 'issue-hint'}
              />

              {errors.issue ? (
                <p id="issue-error" className="report-error">{errors.issue}</p>
              ) : (
                <p id="issue-hint" className="report-hint">
                  Tip: Include the action you were taking, what you expected, and what you saw instead. Press
                  <span className="visually-hidden"> </span>
                  <span aria-hidden="true"> ⌘/Ctrl + Enter </span> to submit quickly.
                </p>
              )}

              <div className="report-field-footer">
                <div className="report-counter">
                  {charUsed}/{ISSUE_MAX}
                </div>
                <div className="report-meter" style={{ '--progress': `${progress}%` }}>
                  <span />
                </div>
              </div>
            </div>

            <div className="report-buttons">
              <Link href={route('dashboard')} className="report-back">
                ← Back to Home
              </Link>

              <button
                type="submit"
                disabled={!canSubmit}
                className="report-submit"
                aria-disabled={!canSubmit}
              >
                {processing && <span className="btn-spinner" aria-hidden="true" />}
                {processing ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showToast && (
        <div className="report-toast" role="status" aria-live="polite">
          <span className="dot" aria-hidden="true" />
          <span>Your report was sent. Thank you!</span>
        </div>
      )}
    </AuthenticatedLayout>
  );
}
