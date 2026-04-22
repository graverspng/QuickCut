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
  const [progressStep, setProgressStep] = useState('');
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
    setIsAllowed(now < expires);
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, [exportWindow]);

  const [phase, setPhase] = useState('idle'); // idle | queued | processing | downloading

  const triggerBlobDownload = (blob, contentType, dispositionHeader) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const headerName = parseDispositionFilename(dispositionHeader);
    const fallback = `${slugify(project?.name ?? 'quickcut-project')}-quickcut-export.mp4`;
    link.download = headerName || fallback;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const streamDownload = async (renderId) => {
    setPhase('downloading');
    setProgress(null);

    const response = await fetch(
      route('projects.export.render.download', { project: project.id, render: renderId }),
      { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
    );

    if (!response.ok) {
      let message = 'Download failed. Please try again.';
      try {
        const data = await response.json();
        if (data?.message) message = data.message;
      } catch (_) {}
      throw new Error(message);
    }

    const contentType = response.headers.get('Content-Type') || 'video/mp4';
    const totalBytes = Number.parseInt(response.headers.get('Content-Length') ?? '', 10);
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
          setProgress(Math.min(100, Math.round((received / totalBytes) * 100)));
        }
      }
      blob = new Blob(chunks, { type: contentType });
      setProgress(100);
    } else {
      blob = await response.blob();
      setProgress(100);
    }

    triggerBlobDownload(blob, contentType, response.headers.get('Content-Disposition'));
  };

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
    setProgressStep('');
    setPhase('queued');

    let renderId = null;

    try {
      // 1. Enqueue the render job
      const queueRes = await fetch(route('projects.export.queue', project.id), {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content ?? '',
        },
      });

      if (!queueRes.ok) {
        let message = 'Could not start export. Please save and try again.';
        try {
          const data = await queueRes.json();
          if (data?.message) message = data.message;
          if (data?.exportWindow) {
            setIsAllowed(Boolean(data.exportWindow.allowed));
          }
        } catch (_) {}
        throw new Error(message);
      }

      const queued = await queueRes.json();
      renderId = queued.render_id;
      setPhase('processing');

      // 2. Poll until done or failed (10 min timeout)
      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 10 * 60 * 1000;
        const poll = async () => {
          if (Date.now() > deadline) {
            reject(new Error('Export timed out after 10 minutes. The server may be low on memory — try again or simplify your project.'));
            return;
          }
          try {
            const statusRes = await fetch(
              route('projects.export.render.status', { project: project.id, render: renderId }),
              { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
            );

            if (!statusRes.ok) {
              reject(new Error('Lost connection to render job.'));
              return;
            }

            const status = await statusRes.json();

            if (status.progress_step) {
              setProgressStep(status.progress_step);
            }

            if (status.status === 'done') {
              resolve();
            } else if (status.status === 'failed') {
              reject(new Error(status.error_message || 'Render failed. Please try again.'));
            } else {
              setTimeout(poll, 2500);
            }
          } catch (err) {
            reject(err);
          }
        };
        poll();
      });

      // 3. Stream the finished file
      await streamDownload(renderId);
      setSuccess('Export ready! Your download should begin automatically.');
    } catch (err) {
      setError(err.message || 'Export failed.');
      setProgress(null);
    } finally {
      setDownloading(false);
      setPhase('idle');
      setTimeout(() => { setProgress(null); setProgressStep(''); }, 800);
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

  const estimatedRenderLabel = useMemo(() => {
    const duration = summary?.duration ?? 0;
    if (!duration) return null;
    // Base + per-second of video + per-feature overhead
    const base = 5;
    const videoTime = duration * 1.2;
    const effectTime = (summary?.effects ?? 0) * 4;
    const transitionTime = (summary?.transitions ?? 0) * 2;
    const textTime = (summary?.text ?? 0) * 1;
    const musicTime = (summary?.music ?? 0) * 2;
    const total = base + videoTime + effectTime + transitionTime + textTime + musicTime;
    if (total < 60) return `~${Math.round(total)}s`;
    const mins = Math.floor(total / 60);
    const secs = Math.round(total % 60);
    return secs === 0 ? `~${mins}m` : `~${mins}m ${secs}s`;
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
              {phase === 'queued' && 'Starting…'}
              {phase === 'processing' && 'Rendering…'}
              {phase === 'downloading' && 'Downloading…'}
              {phase === 'idle' && 'Download Video'}
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
                  <span className="export-progress-title">
                    {phase === 'queued' && 'Starting export…'}
                    {phase === 'processing' && 'Rendering video…'}
                    {phase === 'downloading' && 'Downloading…'}
                    {phase === 'idle' && 'Exporting…'}
                  </span>
                  <span className="export-progress-subtitle">
                    {phase === 'queued' && 'Queuing render job…'}
                    {phase === 'processing' && (progressStep || 'FFmpeg is encoding your timeline…')}
                    {phase === 'downloading' && (progress === null ? 'Preparing file…' : `${progress}% complete`)}
                    {phase === 'idle' && (progress === null ? 'Please wait…' : `${progress}% complete`)}
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
              <span className="duration-label">Video Duration</span>
              <span className="duration-value">{durationLabel}</span>
            </div>
            {estimatedRenderLabel && (
              <div className="export-duration">
                <span className="duration-label">Estimated Render Time</span>
                <span className="duration-value">{estimatedRenderLabel}</span>
              </div>
            )}
          </div>
        </div>

        <div className="export-card">
          <h2>What&apos;s Included</h2>
          <ul className="export-includes">
            <li>
              <strong>MP4 Video</strong> —{' '}
              {summary?.clips > 0
                ? `${summary.clips} clip${summary.clips !== 1 ? 's' : ''}${summary.transitions > 0 ? ` with ${summary.transitions} transition${summary.transitions !== 1 ? 's' : ''}` : ''}, encoded at up to 1920px wide`
                : 'your timeline encoded as a single video file'}
            </li>
            {summary?.effects > 0 && (
              <li>
                <strong>{summary.effects} Visual Effect{summary.effects !== 1 ? 's' : ''}</strong> — brightness, glow, and blur applied directly to the video frames
              </li>
            )}
            {summary?.text > 0 && (
              <li>
                <strong>{summary.text} Text Overlay{summary.text !== 1 ? 's' : ''}</strong> — burned into the video at the positions set in the editor
              </li>
            )}
            {summary?.music > 0 && (
              <li>
                <strong>{summary.music} Music Track{summary.music !== 1 ? 's' : ''}</strong> — mixed with the clip audio and included in the output
              </li>
            )}
            {!summary?.effects && !summary?.text && !summary?.music && (
              <li>
                <strong>Clips &amp; Audio</strong> — combined in timeline order with no additional effects
              </li>
            )}
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
