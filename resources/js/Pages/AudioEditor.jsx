import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useRef, useEffect } from 'react';
import '@/../css/Editor.css';        // your base editor styles
import '@/../css/AudioEditor.css';   // audio-specific overrides

export default function AudioEditor({ project }) {
    const [tracks, setTracks] = useState(project.tracks || []);
    const [mediaFiles, setMediaFiles] = useState([]);
    const [selectedTrackIndex, setSelectedTrackIndex] = useState(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // We still keep a session length for playhead logic (seek/play),
    // but track visuals will "fit to screen".
    const [sessionLength] = useState(120); // seconds

    const audioRefs = useRef([]);
    const editorRef = useRef(null);
    const [timelineWidth, setTimelineWidth] = useState(0);

    // Dynamically measure right-side editor width so tracks fill it exactly
    useEffect(() => {
        const updateWidth = () => {
            if (editorRef.current) {
                setTimelineWidth(editorRef.current.offsetWidth);
            }
        };
        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    // Helpers
    const normalizeTracks = (arr) =>
        arr.map((t) => ({
            ...t,
            startTime: 0,                  // 🟢 force start at 0 so it begins at left edge
            startOffset: t.startOffset ?? 0,
            sourceDuration: t.sourceDuration ?? 0,
            duration: t.duration || t.sourceDuration || 0,
            type: 'audio',
        }));

    const pxFromTime = (sec) =>
        timelineWidth > 0 ? (sec / sessionLength) * timelineWidth : 0;

    // Upload to library
    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files).map((file) => ({
            name: file.name,
            source: URL.createObjectURL(file),
            duration: 0,
            startOffset: 0,
            startTime: 0,
            sourceDuration: 0,
            type: 'audio',
        }));
        setMediaFiles((prev) => [...prev, ...files]);
    };

    // Drag from library to timeline
    const handleDrop = (e) => {
        e.preventDefault();
        const index = parseInt(e.dataTransfer.getData('index'));
        const file = mediaFiles[index];
        if (!file) return;

        // Drop always adds a track that visually spans the timeline (fit-to-screen),
        // but we still keep duration for playback.
        setTracks((prev) =>
            normalizeTracks([
                ...prev,
                { ...file, startTime: 0, startOffset: 0 },
            ])
        );
    };

    // Save
    const handleSave = () => {
        router.put(route('audio.projects.update', project.id), {
            name: project.name,
            description: project.description,
            tracks,
        });
    };

    // Reorder layers vertically
    const handleTrackDragStart = (e, index) => {
        e.dataTransfer.setData('trackIndex', index);
    };

    const handleTrackDrop = (e, dropIndex) => {
        e.preventDefault();
        const draggedIndex = parseInt(e.dataTransfer.getData('trackIndex'));
        if (draggedIndex === dropIndex) return;

        setTracks((prev) => {
            const updated = [...prev];
            const [dragged] = updated.splice(draggedIndex, 1);
            updated.splice(dropIndex, 0, dragged);
            return normalizeTracks(updated);
        });
        setSelectedTrackIndex(dropIndex);
    };

    // Load true duration metadata
    useEffect(() => {
        tracks.forEach((track, i) => {
            if (!track.source) return;
            if (!track.sourceDuration || !track.duration) {
                const aud = document.createElement('audio');
                aud.src = track.source;
                aud.preload = 'auto';
                aud.onloadedmetadata = () => {
                    setTracks((prev) => {
                        const arr = [...prev];
                        const t = { ...arr[i] };
                        const d = aud.duration || 0;
                        t.sourceDuration = d;
                        if (!t.duration || t.duration <= 0) t.duration = d;
                        arr[i] = t;
                        return normalizeTracks(arr);
                    });
                };
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tracks.length]);

    // Playback
    const togglePlay = () => {
        if (isPlaying) {
            setIsPlaying(false);
            audioRefs.current.forEach((a) => a && a.pause());
            return;
        }

        setIsPlaying(true);

        audioRefs.current.forEach((a, i) => {
            const track = tracks[i];
            if (!track || !a) return;

            const trackStart = 0; // forced
            const trackEnd = trackStart + (track.duration || 0);
            const off = track.startOffset || 0;

            if (currentTime >= trackStart && currentTime < trackEnd) {
                a.currentTime = off + (currentTime - trackStart);
                a.play().catch(() => {});
            } else {
                a.pause();
            }
        });
    };

    // Drive playhead + sync
    useEffect(() => {
        let id;
        if (isPlaying) {
            id = setInterval(() => {
                setCurrentTime((prev) => {
                    const next = prev + 0.1;
                    if (next >= sessionLength) {
                        setIsPlaying(false);
                        audioRefs.current.forEach((a) => a && a.pause());
                        return 0;
                    }

                    audioRefs.current.forEach((a, i) => {
                        const track = tracks[i];
                        if (!track || !a) return;

                        const start = 0;
                        const end = start + (track.duration || 0);
                        const off = track.startOffset || 0;

                        if (next >= start && next < end) {
                            const desired = off + (next - start);
                            if (Math.abs((a.currentTime || 0) - desired) > 0.25) {
                                a.currentTime = desired;
                            }
                            if (a.paused) a.play().catch(() => {});
                        } else {
                            a.pause();
                        }
                    });

                    return next;
                });
            }, 100);
        }
        return () => clearInterval(id);
    }, [isPlaying, sessionLength, tracks]);

    // Spacebar
    useEffect(() => {
        const onKey = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, tracks, currentTime]);

    // Seek by click
    const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        // Convert pixel → time inside the visible width
        const newTime =
            timelineWidth > 0 ? (clickX / timelineWidth) * sessionLength : 0;

        const clamped = Math.max(0, Math.min(sessionLength, newTime));
        setCurrentTime(clamped);

        // Preposition audio
        audioRefs.current.forEach((a, i) => {
            const track = tracks[i];
            if (!track || !a) return;
            const start = 0;
            const end = start + (track.duration || 0);
            const off = track.startOffset || 0;

            if (clamped >= start && clamped < end) {
                a.currentTime = off + (clamped - start);
            } else {
                a.pause();
            }
        });
    };

    // Track visual width: fill visible area fully.
    const TRACK_INSET_X = 24; // left+right padding/gap inside row
    const fittedTrackWidth = Math.max(40, timelineWidth - TRACK_INSET_X);

    return (
        <AuthenticatedLayout hideNavbar={true}>
            <Head title={project.name} />

            <div className="editor-container">
                <div className="editor-header">
                    <h2>{project.name} 🎵</h2>
                    <div>
                        <button onClick={handleSave} className="save-btn">Save</button>
                        <button onClick={() => router.get(route('audio.projects'))} className="back-btn">Back</button>
                    </div>
                </div>

                <div className="editor-main">
                    {/* LEFT: Media Library */}
                    <div className="media-library">
                        <h3>Audio Library</h3>
                        <div
                            className="upload-dropzone"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                handleFileUpload({ target: { files: e.dataTransfer.files } });
                            }}
                            onClick={() => document.getElementById('hiddenAudioInput').click()}
                        >
                            <p style={{ fontSize: '10px' }}>Drop audio here or click to upload</p>
                            <input
                                id="hiddenAudioInput"
                                type="file"
                                multiple
                                accept="audio/*"
                                style={{ display: 'none' }}
                                onChange={handleFileUpload}
                            />
                        </div>

                        <div className="media-section audio-section">
                            <h4>🎵 Audio</h4>
                            <div className="section-divider" />
                            {mediaFiles.map((file, index) => (
                                <div
                                    key={index}
                                    draggable
                                    onDragStart={(e) => e.dataTransfer.setData('index', index)}
                                    className="media-item"
                                >
                                    {file.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT: Timeline */}
                    <div
                        ref={editorRef}
                        className="editor-area"
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        <div className="audio-player-controls">
                            <button className="play-btn" onClick={togglePlay}>
                                {isPlaying ? 'Pause' : 'Play'}
                            </button>
                        </div>

                        <div className="timeline fixed-timeline" onClick={handleSeek}>
                            <div className="layers-inner" style={{ width: `${timelineWidth}px` }}>
                                {/* Playhead */}
                                <div
                                    className="playhead"
                                    style={{ left: `${pxFromTime(currentTime)}px` }}
                                />

                                {/* Layers */}
                                {tracks.map((track, index) => {
                                    const isSelected = selectedTrackIndex === index;
                                    return (
                                        <div key={index} className="layer-row">
                                            <span className="layer-label">Layer {index + 1}</span>
                                            <div
                                                draggable
                                                onDragStart={(e) => handleTrackDragStart(e, index)}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => handleTrackDrop(e, index)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTrackIndex(isSelected ? null : index);
                                                }}
                                                className={`track ${isSelected ? 'selected' : ''}`}
                                                style={{
                                                    left: '0px',                       // 🟢 start at left edge
                                                    width: `${fittedTrackWidth}px`,   // 🟢 fill the visible timeline
                                                }}
                                            >
                                                {track.name}
                                                <audio
                                                    ref={(el) => (audioRefs.current[index] = el)}
                                                    src={track.source}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
