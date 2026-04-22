import { useEffect, useMemo, useRef, useState } from 'react';
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

export default function Export({ project, exportWindow }) {
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
    setIsAllowed(now < expires);
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, [exportWindow]);

  // Poll render status
  useEffect(() => {
    if (!renderId || renderStatus === 'done' || renderStatus === 'failed') {
      clearInterval(pollRef.current);
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch(
          route('projects.export.render.status', { project: project.id, render: renderId }),
          { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
        );
        if (!res.ok) return;
        const data = await res.json();
        setRenderStatus(data.status);
        if (data.status === 'failed') {
          setRenderError(data.error_message || 'Export failed. Please try again.');
          clearInterval(pollRef.current);
        } else if (data.status === 'done') {
          clearInterval(pollRef.current);
        }
      } catch (_) {}
    };
    clearInterval(pollRef.current);
    pollRef.current = setInterval(poll, 2000);
    poll();
    return () => clearInterval(pollRef.current);
  }, [renderId, renderStatus]);

  const startExport = async () => {
    if (dispatching) return;
    setDispatching(true);
    setDispatchError('');
    setRenderId(null);
    setRenderStatus(null);
    setRenderError('');
    try {
      const res = await fetch(route('projects.export.queue', project.id), {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.head.querySelector('meta[name="csrf-token"]')?.content ?? '',
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setDispatchError(data?.message || 'Failed to start export. Please try again.');
        return;
      }
      setRenderId(data.render_id);
      setRenderStatus(data.status ?? 'pending');
    } catch (_) {
      setDispatchError('Network error. Please try again.');
    } finally {
      setDispatching(false);
    }
  };

  const retry = () => {
    setRenderId(null);
    setRenderStatus(null);
    setRenderError('');
    setDispatchError('');
  };

  const summary = useMemo(() => project?.summary ?? {}, [project]);
  const description = project?.description?.trim();

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

  const isProcessing = renderStatus === 'pending' || renderStatus === 'processing';
  const isDone = renderStatus === 'done';
  const isFailed = renderStatus === 'failed';

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

            {/* Not yet started or after a failed retry */}
            {!renderId && (
              <button
                type="button"
                className="export-primary"
                onClick={startExport}
                disabled={!isAllowed || dispatching}
              >
                {dispatching ? 'Queuing…' : 'Start Export'}
              </button>
            )}

            {/* Processing spinner */}
            {isProcessing && (
              <div className="export-progress" role="status" aria-live="polite" aria-label="Export progress">
                <div className="export-progress-ring" data-indeterminate="true">
                  <span className="export-progress-value">•••</span>
                </div>
                <div className="export-progress-copy">
                  <span className="export-progress-title">
                    {renderStatus === 'pending' ? 'Queued…' : 'Rendering…'}
                  </span>
                  <span className="export-progress-subtitle">
                    {renderStatus === 'pending' ? 'Waiting for a worker' : 'FFmpeg is processing your video'}
                  </span>
                </div>
              </div>
            )}

            {/* Done — download */}
            {isDone && (
              <a
                className="export-primary"
                href={route('projects.export.render.download', { project: project.id, render: renderId })}
              >
                Download Video
              </a>
            )}

            {/* Failed — retry */}
            {isFailed && (
              <button type="button" className="export-primary" onClick={retry}>
                Try Again
              </button>
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
            <h2>Render Status</h2>
            {!renderId ? (
              <p className="export-timestamp">No export started yet.</p>
            ) : (
              <>
                <div className={`export-status ${isDone ? 'ready' : isFailed ? 'blocked' : 'ready'}`}>
                  <span className="status-indicator" aria-hidden="true" />
                  <span>
                    {renderStatus === 'pending' && 'Queued — waiting for worker'}
                    {renderStatus === 'processing' && 'Rendering in background…'}
                    {renderStatus === 'done' && 'Done — ready to download'}
                    {renderStatus === 'failed' && 'Export failed'}
                  </span>
                </div>
                {isDone && (
                  <p className="export-timer">Your video is ready. Click Download Video above.</p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="export-status-grid">
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
            <p className="export-note" style={{ marginTop: '0.75rem' }}>
              Exports run as background jobs — FFmpeg processes your video in the background.
              Start a fresh export anytime.
            </p>
          </div>
        </div>

        {(dispatchError || renderError) && (
          <div className="export-feedback error" role="alert">
            {dispatchError || renderError}
          </div>
        )}

        {isDone && (
          <div className="export-feedback success" role="status">
            Export ready! Click <strong>Download Video</strong> above to save your file.
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
}
