import { useEffect, useMemo, useState } from 'react';
import { Head, Link } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import '@/../css/Export.css';

const formatSeconds = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins <= 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
};

const slugify = (name) =>
  (name || 'quickcut-project')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

const parseDispositionFilename = (header) => {
  if (!header) return null;
  const match = header.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (!match) return null;
  const value = decodeURIComponent(match[1] || match[2] || '');
  return value || null;
};

export default function Export({ project, exportWindow }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [progress, setProgress] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isAllowed, setIsAllowed] = useState(Boolean(exportWindow?.allowed));

  const summary = useMemo(() => project?.summary ?? {}, [project]);
  const description = project?.description?.trim();
  const lastSavedLabel = useMemo(() => {
    if (!exportWindow?.last_saved_for_humans) return 'recently';
    return exportWindow.last_saved_for_humans.toLowerCase();
  }, [exportWindow]);

  useEffect(() => {
    const initial = Math.max(
      0,
      (exportWindow?.recent_window_seconds ?? 0) - (exportWindow?.seconds_since_save ?? 0),
    );
    setRemainingSeconds(initial);
    setIsAllowed(Boolean(exportWindow?.allowed) && initial > 0);
  }, [exportWindow]);

useEffect(() => {
  const expiresAtIso = exportWindow?.export_expires_at;
  if (!expiresAtIso) {
    setIsAllowed(Boolean(exportWindow?.allowed));
    setRemainingSeconds(0);
    return;
  }
  const tick = () => {
    const now = Date.now();
    const expires = new Date(expiresAtIso).getTime();
    const delta = Math.max(0, Math.floor((expires - now) / 1000));
    setRemainingSeconds(delta);
    setIsAllowed(delta >= 0);
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, [exportWindow]);

  const handleDownload = async () => {
    if (downloading) return;
    setError('');
    setSuccess('');

    if (!isAllowed) {
      setError('Please save your project in the editor before exporting.');
      return;
    }

    setDownloading(true);
    setProgress(0);
    try {
      const response = await fetch(route('projects.export.download', project.id), {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });

      if (!response.ok) {
        let message = 'Export failed. Please try again after saving.';
        try {
          const data = await response.json();
          if (data?.message) message = data.message;
          if (data?.exportWindow) {
            const initial = Math.max(
              0,
              (data.exportWindow.recent_window_seconds ?? 0) -
                (data.exportWindow.seconds_since_save ?? 0),
            );
            setRemainingSeconds(initial);
            setIsAllowed(Boolean(data.exportWindow.allowed) && initial > 0);
          }
        } catch (parseError) {
          // Ignore JSON parse issues
        }
        throw new Error(message);
      }

      const contentType = response.headers.get('Content-Type') || 'video/mp4';
      const contentLengthHeader = response.headers.get('Content-Length');
      const totalBytes = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : Number.NaN;
      let blob;

      if (response.body && Number.isFinite(totalBytes) && totalBytes > 0) {
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            const percent = Math.min(100, Math.max(0, Math.round((received / totalBytes) * 100)));
            setProgress(percent);
          }
        }

        blob = new Blob(chunks, { type: contentType });
        setProgress(100);
      } else {
        setProgress(null);
        blob = await response.blob();
        setProgress(100);
      }
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const headerName = parseDispositionFilename(response.headers.get('Content-Disposition'));
      const fallback = `${slugify(project?.name ?? 'quickcut-project')}-quickcut-export.mp4`;
      link.download = headerName || fallback;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setSuccess('Export ready! Your download should begin automatically.');
    } catch (err) {
      setError(err.message || 'Export failed.');
      setProgress(null);
    } finally {
      setDownloading(false);
      setTimeout(() => setProgress(null), 800);
    }
  };

  const chips = [
    { label: 'Clips', value: summary?.clips ?? 0 },
    { label: 'Media Assets', value: summary?.media ?? 0 },
    { label: 'Music Tracks', value: summary?.music ?? 0 },
    { label: 'Effects', value: summary?.effects ?? 0 },
    { label: 'Text Overlays', value: summary?.text ?? 0 },
    { label: 'Transitions', value: summary?.transitions ?? 0 },
  ];

  const durationLabel = useMemo(() => {
    const duration = summary?.duration ?? 0;
    if (!duration) return 'Not calculated';
    const mins = Math.floor(duration / 60);
    const secs = Math.round(duration % 60);
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  }, [summary]);

  return (
    <AuthenticatedLayout>
      <Head title="Export Project" />
      <div className="export-page">
        <div className="export-header">
          <div>
            <p className="export-eyebrow">Project Export</p>
            <h1>{project?.name || 'Untitled Project'}</h1>
            {description && <p className="export-description">{description}</p>}
          </div>
          <div className="export-header-actions">
            <Link className="export-secondary" href={route('editor', project.id)}>
              Back to Editor
            </Link>
            <button
              type="button"
              className="export-primary"
              onClick={handleDownload}
              disabled={!isAllowed || downloading}
            >
              {downloading ? 'Rendering…' : 'Download Video'}
            </button>
            {(downloading || progress !== null) && (
              <div
                className="export-progress"
                role="status"
                aria-live="polite"
                aria-label="Export progress"
              >
                <div
                  className="export-progress-ring"
                  style={{ '--progress': progress ?? 0 }}
                  data-indeterminate={progress === null}
                >
                  <span className="export-progress-value">
                    {progress === null ? '•••' : `${progress}%`}
                  </span>
                </div>
                <div className="export-progress-copy">
                  <span className="export-progress-title">Rendering export…</span>
                  <span className="export-progress-subtitle">
                    {progress === null ? 'Preparing your download' : `${progress}% complete`}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="export-status-grid">
          <div className="export-card">
            <h2>Export Readiness</h2>
            <p className="export-timestamp">Last saved {lastSavedLabel}</p>
            <div className={`export-status ${isAllowed ? 'ready' : 'blocked'}`}>
              <span className="status-indicator" aria-hidden="true" />
              <span>{isAllowed ? 'Ready to export' : 'Save required before exporting'}</span>
            </div>
            <p className="export-timer">
              {isAllowed
                ? `Window expires in ${formatSeconds(remainingSeconds)}`
                : 'Save in the editor to refresh the export window.'}
            </p>
          </div>

          <div className="export-card">
            <h2>Timeline Summary</h2>
            <div className="export-chips">
              {chips.map((chip) => (
                <div key={chip.label} className="export-chip">
                  <span className="chip-value">{chip.value}</span>
                  <span className="chip-label">{chip.label}</span>
                </div>
              ))}
            </div>
            <div className="export-duration">
              <span className="duration-label">Estimated Duration</span>
              <span className="duration-value">{durationLabel}</span>
            </div>
          </div>
        </div>

        <div className="export-card">
          <h2>What&apos;s Included</h2>
          <ul className="export-includes">
            <li>
            <strong>MP4 Video</strong> — a rendered export of your timeline, ready to share or archive.
            </li>
            <li>
              <strong>Clips &amp; Audio</strong> — combined in the exported video based on your project timeline.
            </li>
          </ul>
          <p className="export-note">
            Tip: If any media is missing, re-upload it in the editor and save to include it in the next export.
          </p>
        </div>

        {(error || success) && (
          <div className={`export-feedback ${error ? 'error' : 'success'}`} role="alert">
            {error || success}
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
}