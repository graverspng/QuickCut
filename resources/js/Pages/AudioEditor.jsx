import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router } from '@inertiajs/react';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import '@/../css/AudioEditor.css';

// ─── Constants ───────────────────────────────────────────────────────────────
const MIN_SESSION_SECS = 60;
const PX_PER_SEC       = 80;
const TRACK_H          = 54;
const TRACK_GAP        = 6;
const ROW_H            = TRACK_H + TRACK_GAP;
const GUTTER_W         = 80; // left label gutter

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toNum = (v, fallback = 0) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
    const p = parseFloat(v);
    return Number.isFinite(p) ? p : fallback;
};

const fmtTime = (secs) => {
    const m  = Math.floor(secs / 60);
    const s  = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${ms}`;
};

const normTrack = (t) => ({
    ...t,
    startTime:      toNum(t.startTime, 0),
    startOffset:    toNum(t.startOffset, 0),
    sourceDuration: toNum(t.sourceDuration, 0),
    duration:       toNum(t.duration ?? t.sourceDuration, 0),
    volume:         Math.max(0, Math.min(2, toNum(t.volume ?? 1, 1))),
    type:           'audio',
});

const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

const isAudioFile = (f) => {
    if (!f) return false;
    if (f.type?.startsWith('audio')) return true;
    const ext = f.name?.split('.').pop()?.toLowerCase();
    return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'webm', 'opus'].includes(ext);
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function AudioEditor({ project }) {
    const [tracks, setTracks] = useState(() => {
        // Build a storageKey → URL map from media_files so saved tracks resolve to playable URLs
        const urlMap = {};
        (Array.isArray(project.media_files) ? project.media_files : []).forEach(f => {
            if (f.storageKey && f.url) urlMap[f.storageKey] = f.url;
        });
        return (Array.isArray(project.tracks) ? project.tracks : []).map(t => {
            const resolvedSource = (t.storageKey && urlMap[t.storageKey]) || t.source;
            return normTrack({ ...t, source: resolvedSource });
        });
    });
    const [mediaFiles, setMediaFiles] = useState(() =>
        Array.isArray(project.media_files) ? project.media_files : []
    );
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [currentTime, setCurrentTime]     = useState(0);
    const [isPlaying, setIsPlaying]         = useState(false);
    const [uploading, setUploading]         = useState(false);
    const [uploadError, setUploadError]     = useState('');
    const [saving, setSaving]               = useState(false);
    const [ghost, setGhost]                 = useState(null); // { name, startTime, duration }
    const [libDragOver, setLibDragOver]     = useState(false);

    // drag state: { type: 'move'|'resize'|'resize-left', index, startX, orig }
    const [drag, setDrag] = useState(null);

    const audioRefs       = useRef([]);
    const timelineRef     = useRef(null);
    const freshUploadsRef = useRef([]);
    // pending drag: set on mousedown, promoted to real drag only after 5px movement
    const pendingDragRef  = useRef(null);
    // true while a drag was in progress — suppresses the click event that fires after mouseup
    const dragMovedRef    = useRef(false);
    const [scrollLeft, setScrollLeft] = useState(0);

    // ── Derived ──────────────────────────────────────────────────────────────
    const sessionLength = useMemo(() => {
        const longestEnd = tracks.reduce((max, t) => {
            const end = toNum(t.startTime) + toNum(t.duration || t.sourceDuration);
            return Math.max(max, end);
        }, 0);
        return Math.max(longestEnd + 10, MIN_SESSION_SECS);
    }, [tracks]);

    const timelineContentWidth = sessionLength * PX_PER_SEC + GUTTER_W + 40;
    const timelineLayersHeight = Math.max(tracks.length * ROW_H + 80, 200);

    const secToPx  = useCallback((s) => s * PX_PER_SEC, []);
    const pxToSec  = useCallback((px) => px / PX_PER_SEC, []);

    // ── Load durations for tracks without them ────────────────────────────────
    useEffect(() => {
        tracks.forEach((track, i) => {
            if (!track.source) return;
            if (track.sourceDuration > 0 && track.duration > 0) return;
            const a = document.createElement('audio');
            a.src = track.source;
            a.onloadedmetadata = () => {
                setTracks(prev => {
                    const arr = [...prev];
                    if (!arr[i]) return prev;
                    const t = { ...arr[i] };
                    t.sourceDuration = a.duration;
                    if (!t.duration || t.duration <= 0) t.duration = a.duration;
                    arr[i] = normTrack(t);
                    return arr;
                });
            };
        });
    }, []); // only on mount — new tracks handle duration in handleDrop

    // ── Load durations for mediaFiles without them ────────────────────────────
    useEffect(() => {
        mediaFiles.forEach((f, i) => {
            if (!f.source || f.sourceDuration > 0) return;
            const a = document.createElement('audio');
            a.src = f.source;
            a.onloadedmetadata = () => {
                setMediaFiles(prev => {
                    const arr = [...prev];
                    if (!arr[i]) return prev;
                    arr[i] = { ...arr[i], sourceDuration: a.duration, duration: a.duration };
                    return arr;
                });
            };
        });
    }, [mediaFiles.length]); // re-run when new files added

    // ── Timeline scroll ───────────────────────────────────────────────────────
    useEffect(() => {
        const el = timelineRef.current;
        if (!el) return;
        const onScroll = () => setScrollLeft(el.scrollLeft);
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    // ── Playback ──────────────────────────────────────────────────────────────
    const syncAudio = useCallback((time, playing) => {
        audioRefs.current.forEach((a, i) => {
            const t = tracks[i];
            if (!t || !a) return;
            const start = t.startTime || 0;
            const off   = t.startOffset || 0;
            const end   = start + (t.duration || 0);
            a.volume = Math.max(0, Math.min(1, t.volume ?? 1));
            if (playing && time >= start && time < end) {
                const desired = off + (time - start);
                if (Math.abs(a.currentTime - desired) > 0.25) a.currentTime = desired;
                if (a.paused) a.play().catch(() => {});
            } else {
                if (!a.paused) a.pause();
            }
        });
    }, [tracks]);

    const togglePlay = useCallback(() => {
        if (isPlaying) {
            setIsPlaying(false);
            audioRefs.current.forEach(a => a?.pause());
        } else {
            setIsPlaying(true);
            syncAudio(currentTime, true);
        }
    }, [isPlaying, currentTime, syncAudio]);

    useEffect(() => {
        if (!isPlaying) return;
        const id = setInterval(() => {
            setCurrentTime(prev => {
                const next = prev + 0.1;
                if (next >= sessionLength) {
                    setIsPlaying(false);
                    audioRefs.current.forEach(a => a?.pause());
                    return 0;
                }
                syncAudio(next, true);
                return next;
            });
        }, 100);
        return () => clearInterval(id);
    }, [isPlaying, sessionLength, syncAudio]);

    // ── Seek ──────────────────────────────────────────────────────────────────
    const seekTo = useCallback((time) => {
        const t = Math.max(0, Math.min(sessionLength, time));
        setCurrentTime(t);
        syncAudio(t, false);
    }, [sessionLength, syncAudio]);

    const getTimeFromEvent = useCallback((e) => {
        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + timelineRef.current.scrollLeft - GUTTER_W;
        return Math.max(0, pxToSec(x));
    }, [pxToSec]);

    const handleTimelineClick = (e) => {
        if (drag) return;
        // Only seek if clicking background, not a track
        if (e.target.closest('.ae-clip, .ae-resize-handle, .ae-layer-label')) return;
        seekTo(getTimeFromEvent(e));
    };

    // ── Cleanup unsaved uploads ───────────────────────────────────────────────
    const cleanupFreshUploads = useCallback(() => {
        const keys = freshUploadsRef.current;
        if (!keys.length) return;
        const form = new FormData();
        form.append('_token', csrf());
        keys.forEach(k => form.append('storageKeys[]', k));
        navigator.sendBeacon(route('audio.projects.media.cleanup', project.id), form);
        freshUploadsRef.current = [];
    }, [project.id]);

    // Fire cleanup silently when tab/window closes without saving
    useEffect(() => {
        const onUnload = () => cleanupFreshUploads();
        window.addEventListener('pagehide', onUnload);
        return () => window.removeEventListener('pagehide', onUnload);
    }, [cleanupFreshUploads]);

    const handleBack = useCallback(() => {
        if (freshUploadsRef.current.length > 0) {
            if (!confirm('Uploaded files that haven\'t been saved will be removed. Leave anyway?')) return;
            cleanupFreshUploads();
        }
        router.visit(route('audio.projects'));
    }, [cleanupFreshUploads]);

    // ── Track drag (move / resize / resize-left) ──────────────────────────────
    const handleTrackMouseDown = (e, index, type) => {
        e.stopPropagation();
        // Do NOT call preventDefault — we want the click event to fire for pure clicks
        const track = tracks[index];
        let orig;
        if (type === 'resize-left') {
            orig = { startTime: track.startTime, startOffset: track.startOffset, duration: track.duration };
        } else {
            orig = type === 'move' ? track.startTime : track.duration;
        }
        dragMovedRef.current = false;
        pendingDragRef.current = { type, index, startX: e.clientX, startY: e.clientY, orig };
    };

    useEffect(() => {
        const onMove = (e) => {
            // Promote pending drag to real drag after 5px threshold
            if (pendingDragRef.current && !drag) {
                const dist = Math.hypot(
                    e.clientX - pendingDragRef.current.startX,
                    e.clientY - pendingDragRef.current.startY
                );
                if (dist > 5) {
                    const p = pendingDragRef.current;
                    pendingDragRef.current = null;
                    dragMovedRef.current = true;
                    setSelectedIndex(p.index);
                    setDrag({ type: p.type, index: p.index, startX: p.startX, orig: p.orig });
                }
                return;
            }
            if (!drag) return;
            const deltaSec = pxToSec(e.clientX - drag.startX);
            setTracks(prev => {
                const arr = [...prev];
                const t   = { ...arr[drag.index] };
                if (drag.type === 'move') {
                    t.startTime = Math.max(0, drag.orig + deltaSec);
                } else if (drag.type === 'resize') {
                    const maxDur = t.sourceDuration > 0
                        ? t.sourceDuration - (t.startOffset || 0)
                        : Infinity;
                    t.duration = Math.max(0.5, Math.min(drag.orig + deltaSec, maxDur));
                } else if (drag.type === 'resize-left') {
                    const maxExpand = Math.min(drag.orig.startTime, drag.orig.startOffset);
                    const clamped   = Math.max(-maxExpand, Math.min(drag.orig.duration - 0.5, deltaSec));
                    t.startTime   = drag.orig.startTime + clamped;
                    t.startOffset = drag.orig.startOffset + clamped;
                    t.duration    = drag.orig.duration - clamped;
                }
                arr[drag.index] = normTrack(t);
                return arr;
            });
        };
        const onUp = () => {
            pendingDragRef.current = null;
            setDrag(null);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [drag, pxToSec]);

    // ── Library drag-drop onto timeline ──────────────────────────────────────
    const handleLibraryDragStart = (e, index) => {
        e.dataTransfer.setData('mediaIndex', String(index));
    };

    const handleTimelineDrop = (e) => {
        e.preventDefault();
        const idx = parseInt(e.dataTransfer.getData('mediaIndex'), 10);
        const file = mediaFiles[idx];
        if (!file) return;
        const dropTime = getTimeFromEvent(e);
        const newTrack = normTrack({
            ...file,
            startTime:   dropTime,
            startOffset: 0,
            volume:      1,
        });
        setTracks(prev => [...prev, newTrack]);
        // Resolve duration after drop
        if (!newTrack.sourceDuration || newTrack.sourceDuration <= 0) {
            const a = document.createElement('audio');
            a.src = newTrack.source;
            a.onloadedmetadata = () => {
                setTracks(prev => {
                    const i = prev.length - 1;
                    const arr = [...prev];
                    if (!arr[i]) return prev;
                    arr[i] = normTrack({ ...arr[i], sourceDuration: a.duration, duration: a.duration });
                    return arr;
                });
            };
        }
        setGhost(null);
    };

    const handleTimelineDragOver = (e) => {
        e.preventDefault();
        const idx = parseInt(e.dataTransfer.getData('mediaIndex'), 10);
        const file = mediaFiles[idx];
        if (!file) return;
        const dur = toNum(file.duration || file.sourceDuration, 0) || 8;
        setGhost({ name: file.name, startTime: getTimeFromEvent(e), duration: dur });
    };

    // ── Upload ────────────────────────────────────────────────────────────────
    const handleUpload = async (files) => {
        const valid = Array.from(files || []).filter(isAudioFile);
        if (!valid.length) return;
        setUploading(true);
        setUploadError('');
        const uploaded = [];
        for (const f of valid) {
            if (f.size > 300 * 1024 * 1024) {
                setUploadError(`"${f.name}" exceeds the 300 MB limit.`);
                continue;
            }
            try {
                const form = new FormData();
                form.append('file', f);
                form.append('name', f.name);
                const res = await fetch(route('audio.projects.media.upload', project.id), {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-TOKEN':     csrf(),
                    },
                    body: form,
                });
                if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    const msg = json?.errors?.file?.[0] || json?.message || `Failed to upload "${f.name}".`;
                    setUploadError(msg);
                    continue;
                }
                const json = await res.json();
                if (json.storageKey) {
                    freshUploadsRef.current = [...freshUploadsRef.current, json.storageKey];
                }
                uploaded.push({
                    id:             json.id || `media-${Date.now()}`,
                    name:           json.name || f.name,
                    source:         json.url,
                    storageKey:     json.storageKey,
                    duration:       0,
                    sourceDuration: 0,
                    type:           'audio',
                });
            } catch (err) {
                setUploadError(`Upload error: ${err.message}`);
            }
        }
        if (uploaded.length) {
            setMediaFiles(prev => [...prev, ...uploaded]);
        }
        setUploading(false);
    };

    // ── Split ─────────────────────────────────────────────────────────────────
    const handleSplit = () => {
        if (selectedIndex === null) return;
        const track = tracks[selectedIndex];
        if (!track) return;
        const rel = currentTime - track.startTime;
        if (rel <= 0.05 || rel >= track.duration - 0.05) return;
        const before = normTrack({ ...track, duration: rel });
        const after  = normTrack({
            ...track,
            startTime:   track.startTime + rel,
            startOffset: track.startOffset + rel,
            duration:    track.duration - rel,
        });
        setTracks(prev => [
            ...prev.slice(0, selectedIndex),
            before,
            after,
            ...prev.slice(selectedIndex + 1),
        ]);
        setSelectedIndex(selectedIndex + 1);
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = () => {
        if (selectedIndex === null) return;
        audioRefs.current[selectedIndex]?.pause();
        audioRefs.current.splice(selectedIndex, 1);
        setTracks(prev => prev.filter((_, i) => i !== selectedIndex));
        setSelectedIndex(null);
    };

    // ── Volume ────────────────────────────────────────────────────────────────
    const handleVolumeChange = (vol) => {
        if (selectedIndex === null) return;
        setTracks(prev => {
            const arr = [...prev];
            arr[selectedIndex] = normTrack({ ...arr[selectedIndex], volume: vol });
            return arr;
        });
        if (audioRefs.current[selectedIndex]) {
            audioRefs.current[selectedIndex].volume = Math.max(0, Math.min(1, vol));
        }
    };

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = () => {
        setSaving(true);
        freshUploadsRef.current = []; // all uploaded files are now intentionally kept
        // Build URL map so tracks are saved with resolvable URLs, not raw storage paths
        const urlMap = {};
        mediaFiles.forEach(f => { if (f.storageKey && f.url) urlMap[f.storageKey] = f.url; });
        const tracksToSave = tracks.map(({ source, storageKey, ...rest }) => {
            const p = { ...rest };
            if (storageKey) {
                p.storageKey = storageKey;
                p.source = urlMap[storageKey] || source || storageKey;
            } else if (typeof source === 'string') {
                p.source = source;
            }
            return p;
        });
        router.put(
            route('audio.projects.update', project.id),
            { tracks: tracksToSave, media_files: mediaFiles },
            { onFinish: () => setSaving(false) }
        );
    };

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
            if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
            if ((e.code === 'Backspace' || e.code === 'Delete') && selectedIndex !== null) {
                e.preventDefault();
                handleDelete();
            }
            if (e.code === 'KeyS' && selectedIndex !== null) {
                e.preventDefault();
                handleSplit();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isPlaying, tracks, currentTime, selectedIndex]);

    // ── Ruler ticks ──────────────────────────────────────────────────────────
    const rulerTicks = useMemo(() => {
        const ticks = [];
        const step  = sessionLength > 120 ? 10 : sessionLength > 60 ? 5 : 2;
        for (let s = 0; s <= sessionLength + step; s += step) {
            ticks.push(s);
        }
        return ticks;
    }, [sessionLength]);

    const selectedTrack = selectedIndex !== null ? tracks[selectedIndex] : null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <AuthenticatedLayout hideNavbar={true}>
            <Head title={project.name} />

            <div className="editor-container audio-editor">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="editor-header">
                    <div className="editor-header-left">
                        <span className="editor-project-name">{project.name}</span>
                    </div>

                    <div className="editor-header-center ae-toolbar">
                        {/* Transport */}
                        <button
                            className={`ae-tool-btn ae-play-btn${isPlaying ? ' active' : ''}`}
                            onClick={togglePlay}
                            title="Play / Pause (Space)"
                        >
                            {isPlaying ? '⏸' : '▶'}
                        </button>
                        <span className="ae-time-display">{fmtTime(currentTime)}</span>

                        <div className="ae-toolbar-sep" />

                        {/* Track tools */}
                        <button
                            className="ae-tool-btn"
                            onClick={handleSplit}
                            disabled={!selectedTrack}
                            title="Split at playhead (S)"
                        >
                            ✂ Split
                        </button>
                        <button
                            className="ae-tool-btn ae-delete-btn"
                            onClick={handleDelete}
                            disabled={!selectedTrack}
                            title="Delete selected (Del)"
                        >
                            ✕ Delete
                        </button>

                        {/* Volume — shown only when track selected */}
                        {selectedTrack && (
                            <>
                                <div className="ae-toolbar-sep" />
                                <span className="ae-vol-label">Volume</span>
                                <input
                                    type="range" min="0" max="200"
                                    value={Math.round((selectedTrack.volume ?? 1) * 100)}
                                    onChange={e => handleVolumeChange(parseFloat(e.target.value) / 100)}
                                    className="ae-vol-slider"
                                />
                                <span className="ae-vol-value">
                                    {Math.round((selectedTrack.volume ?? 1) * 100)}%
                                </span>
                            </>
                        )}
                    </div>

                    <div className="editor-header-right">
                        <button onClick={handleSave} disabled={saving} className="save-btn">
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                        <Link href={route('audio.projects.export', project.id)} className="export-btn">
                            Export
                        </Link>
                        <button onClick={handleBack} className="back-btn">← Back</button>
                    </div>
                </div>

                {/* ── Main ───────────────────────────────────────────────── */}
                <div className="editor-main">

                    {/* ── Media Library ──────────────────────────────────── */}
                    <div className="media-library">
                        <div className="ae-lib-header">
                            <span className="ae-lib-title">Audio Files</span>
                            <label className={`ae-upload-btn${uploading ? ' ae-uploading' : ''}`}>
                                {uploading ? '…' : '+ Add'}
                                <input
                                    type="file"
                                    multiple
                                    accept="audio/*"
                                    style={{ display: 'none' }}
                                    onChange={e => handleUpload(e.target.files)}
                                    disabled={uploading}
                                />
                            </label>
                        </div>

                        {uploadError && (
                            <div className="ae-upload-error">
                                {uploadError}
                                <button onClick={() => setUploadError('')} className="ae-error-dismiss">✕</button>
                            </div>
                        )}

                        <div
                            className={`ae-lib-dropzone${libDragOver ? ' ae-drag-over' : ''}${uploading ? ' ae-uploading' : ''}`}
                            onDragOver={e => { e.preventDefault(); setLibDragOver(true); }}
                            onDragLeave={() => setLibDragOver(false)}
                            onDrop={e => { e.preventDefault(); setLibDragOver(false); handleUpload(e.dataTransfer.files); }}
                        >
                            {uploading ? '⟳ Uploading…' : '+ Drop audio files here\nor click Add above'}
                        </div>

                        <div className="ae-lib-list">
                            {mediaFiles.length === 0 && (
                                <p className="ae-lib-empty">Upload audio files to get started.</p>
                            )}
                            {mediaFiles.map((f, i) => (
                                <div
                                    key={f.id || i}
                                    className="media-item"
                                    draggable
                                    onDragStart={e => handleLibraryDragStart(e, i)}
                                    title={`Drag to timeline · ${f.name}`}
                                >
                                    <span className="ae-lib-icon">♪</span>
                                    <span className="ae-lib-name">{f.name}</span>
                                    {f.sourceDuration > 0 && (
                                        <span className="ae-lib-dur">
                                            {fmtTime(f.sourceDuration)}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Editor area ────────────────────────────────────── */}
                    <div className="editor-area">

                        {/* Ruler */}
                        <div className="ae-ruler">
                            <div
                                className="ae-ruler-inner"
                                style={{
                                    width:     timelineContentWidth,
                                    transform: `translateX(-${scrollLeft}px)`,
                                }}
                            >
                                {rulerTicks.map(s => (
                                    <div
                                        key={s}
                                        className="ae-tick"
                                        style={{ left: GUTTER_W + secToPx(s) }}
                                    >
                                        {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Scrollable timeline */}
                        <div
                            ref={timelineRef}
                            className="ae-timeline"
                            onClick={handleTimelineClick}
                            onDrop={handleTimelineDrop}
                            onDragOver={handleTimelineDragOver}
                            onDragLeave={() => setGhost(null)}
                        >
                            <div
                                className="ae-layers"
                                style={{
                                    width:     timelineContentWidth,
                                    minHeight: timelineLayersHeight,
                                }}
                            >
                                {/* Playhead */}
                                <div
                                    className="ae-playhead"
                                    style={{ left: GUTTER_W + secToPx(currentTime) }}
                                />

                                {/* Row backgrounds + labels */}
                                {tracks.map((_, i) => (
                                    <div
                                        key={`row-${i}`}
                                        className={`ae-layer-row${selectedIndex === i ? ' ae-layer-row--selected' : ''}`}
                                        style={{ top: i * ROW_H, height: TRACK_H }}
                                    >
                                        <span className="ae-layer-label">
                                            {i + 1}
                                        </span>
                                    </div>
                                ))}

                                {/* Ghost preview */}
                                {ghost && (
                                    <div
                                        className="ae-clip ae-clip--ghost"
                                        style={{
                                            left:   GUTTER_W + secToPx(ghost.startTime),
                                            width:  Math.max(4, secToPx(ghost.duration)),
                                            top:    tracks.length * ROW_H + 4,
                                            height: TRACK_H,
                                        }}
                                    >
                                        <span className="ae-clip-name">{ghost.name}</span>
                                    </div>
                                )}

                                {/* Tracks */}
                                {tracks.map((track, i) => {
                                    const left     = GUTTER_W + secToPx(track.startTime);
                                    const width    = Math.max(4, secToPx(track.duration));
                                    const selected = selectedIndex === i;
                                    const clipTop  = i * ROW_H + 4;
                                    const clipH    = TRACK_H - 8;
                                    return (
                                        <div
                                            key={i}
                                            className={`ae-clip${selected ? ' ae-clip--selected' : ''}`}
                                            style={{ left, width, top: clipTop, height: clipH }}
                                            onMouseDown={e => handleTrackMouseDown(e, i, 'move')}
                                            onClick={e => {
                                                e.stopPropagation();
                                                // If this mousedown turned into a real drag, don't toggle selection
                                                if (dragMovedRef.current) { dragMovedRef.current = false; return; }
                                                setSelectedIndex(prev => prev === i ? null : i);
                                            }}
                                        >
                                            <span className="ae-clip-name">{track.name}</span>
                                            {track.duration > 0 && (
                                                <span className="ae-clip-dur">{fmtTime(track.duration)}</span>
                                            )}

                                            {/* Left resize handle */}
                                            <div
                                                className="ae-resize-handle ae-resize-handle--left"
                                                onMouseDown={e => { e.stopPropagation(); handleTrackMouseDown(e, i, 'resize-left'); }}
                                            />

                                            {/* Right resize handle */}
                                            <div
                                                className="ae-resize-handle"
                                                onMouseDown={e => { e.stopPropagation(); handleTrackMouseDown(e, i, 'resize'); }}
                                            />

                                            {/* Hidden audio element */}
                                            <audio
                                                ref={el => { audioRefs.current[i] = el; }}
                                                src={track.source}
                                                preload="auto"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {tracks.length === 0 && (
                            <div className="ae-empty-state">
                                Upload audio files and drag them onto the timeline to start mixing.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
