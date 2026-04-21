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

const formatDurationLabel = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Not calculated';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
};

const slugify = (name) =>
  (name || 'quickcut-audio')
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

export default function AudioExport({ project, exportWindow }) {
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
    if (!isAllowed) return undefined;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsAllowed(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isAllowed]);

  const handleDownload = async () => {
    if (downloading) return;
    setError('');
    setSuccess('');

    if (!isAllowed) {
      setError('Please save your project in the editor before exporting.');
      return;
    }

    setDownloading(true);
    setProgress(null);

    try {
      const response = await fetch(route('audio.projects.export.download', project.id), {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });

      if (!response.ok) {
        let message = 'Export failed. Please try again after saving.';
        if (response.status === 504) {
          message =
            'Export timed out (504). Your server/proxy ended the request before the export finished rendering. Increase Nginx/PHP timeouts or run exports in the background.';
        }
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

      const contentType = response.headers.get('Content-Type') || 'audio/mpeg';
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
      const fallback = `${slugify(project?.name ?? 'quickcut-audio')}-quickcut-export.mp3`;
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
    { label: 'Audio Tracks', value: summary?.tracks ?? 0 },
    { label: 'Unique Sources', value: summary?.sources ?? 0 },
  ];

  const durationLabel = useMemo(() => formatDurationLabel(summary?.duration), [summary]);

  return (
    <AuthenticatedLayout>
      <Head title="Export Audio" />
      <div className="export-page">
        <div className="export-header">
          <div>
            <p className="export-eyebrow">Audio Mix Export</p>
            <h1>{project?.name || 'Untitled Audio Project'}</h1>
            {description && <p className="export-description">{description}</p>}
          </div>
          <div className="export-header-actions">
            <Link className="export-secondary" href={route('audio.editor', project.id)}>
              Back to Editor
            </Link>
            <button
              type="button"
              className="export-primary"
              onClick={handleDownload}
              disabled={!isAllowed || downloading}
            >
              {downloading ? 'Rendering…' : 'Download Audio'}
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
            <h2>Session Summary</h2>
            <div className="export-chips">
              {chips.map((chip) => (
                <div key={chip.label} className="export-chip">
                  <span className="chip-value">{chip.value}</span>
                  <span className="chip-label">{chip.label}</span>
                </div>
              ))}
            </div>
            <div className="export-duration">
              <span className="duration-label">Timeline Length</span>
              <span className="duration-value">{durationLabel}</span>
            </div>
          </div>
        </div>

        <div className="export-card">
          <h2>What&apos;s Included</h2>
          <ul className="export-includes">
            <li>
              <strong>MP3 Mixdown</strong> — a stereo render of your arranged audio session.
            </li>
            <li>
              <strong>Project Timing</strong> — honors start offsets, trims, and mix balance when rendering.
            </li>
          </ul>
          <p className="export-note">
            Tip: Save after any edits to refresh the export window and capture the latest arrangement.
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
