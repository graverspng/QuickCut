import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useRef, useEffect, useMemo } from 'react';
import '@/../css/Editor.css';        // base editor styling
import '@/../css/AudioEditor.css';   // audio-specific overrides

export default function AudioEditor({ project }) {
    const [tracks, setTracks] = useState(project.tracks || []);
    const [mediaFiles, setMediaFiles] = useState([]);
    const [selectedTrackIndex, setSelectedTrackIndex] = useState(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Session length in seconds (default 120s)
    const [sessionLength, setSessionLength] = useState(120);

    const audioRefs = useRef([]);
    const editorRef = useRef(null);
    const [timelineWidth, setTimelineWidth] = useState(0);

    // --- dynamically track editor width
    useEffect(() => {
        if (!editorRef.current) return;
        const updateWidth = () => {
            setTimelineWidth(editorRef.current.offsetWidth);
        };
        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    // === HELPERS ===
    const normalizeTracks = (arr) =>
        arr.map((t) => ({
            ...t,
            startTime: t.startTime ?? 0,
            startOffset: t.startOffset ?? 0,
            sourceDuration: t.sourceDuration ?? 0,
            duration: t.duration || t.sourceDuration || 0,
            type: 'audio',
        }));

    const pxFromTime = (sec) =>
        timelineWidth > 0 ? (sec / sessionLength) * timelineWidth : 0;
    const timeFromPx = (px) =>
        timelineWidth > 0 ? (px / timelineWidth) * sessionLength : 0;

    // === FILE UPLOAD to Media Library ===
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

    // === Drag from Library to Timeline ===
    const handleDrop = (e) => {
        e.preventDefault();
        const index = parseInt(e.dataTransfer.getData('index'));
        const file = mediaFiles[index];
        if (!file) return;

        setTracks((prev) =>
            normalizeTracks([
                ...prev,
                {
                    ...file,
                    startTime: currentTime, // drop where playhead is
                    startOffset: 0,
                },
            ])
        );
    };

    // === Save to DB ===
    const handleSave = () => {
        router.put(route('audio.projects.update', project.id), {
            name: project.name,
            description: project.description,
            tracks,
        });
    };

    // === Reorder tracks vertically (layer order) ===
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

    // === Load audio metadata for true durations ===
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
    }, [tracks]);

    const totalDuration = sessionLength;

    // === Playback ===
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

            const trackStart = track.startTime || 0;
            const trackOffset = track.startOffset || 0;
            const trackEnd = trackStart + (track.duration || 0);

            if (currentTime >= trackStart && currentTime < trackEnd) {
                const rel = currentTime - trackStart;
                a.currentTime = trackOffset + rel;
                a.play().catch(() => {});
            } else {
                a.pause();
            }
        });
    };

    useEffect(() => {
        let id;
        if (isPlaying) {
            id = setInterval(() => {
                setCurrentTime((prev) => {
                    const next = prev + 0.1;
                    if (next >= totalDuration) {
                        setIsPlaying(false);
                        audioRefs.current.forEach((a) => a && a.pause());
                        return 0;
                    }

                    audioRefs.current.forEach((a, i) => {
                        const track = tracks[i];
                        if (!track || !a) return;

                        const trackStart = track.startTime || 0;
                        const trackOffset = track.startOffset || 0;
                        const trackEnd = trackStart + (track.duration || 0);

                        if (next >= trackStart && next < trackEnd) {
                            const rel = next - trackStart;
                            const desired = trackOffset + rel;
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
    }, [isPlaying, totalDuration, tracks]);

    // Spacebar toggle
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

    // === Seek on timeline click ===
    const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const newTime = timeFromPx(clickX);
        setCurrentTime(Math.max(0, Math.min(sessionLength, newTime)));

        audioRefs.current.forEach((a, i) => {
            const track = tracks[i];
            if (!track || !a) return;
            const s = track.startTime || 0;
            const off = track.startOffset || 0;
            const end = s + (track.duration || 0);

            if (newTime >= s && newTime < end) {
                a.currentTime = off + (newTime - s);
            } else {
                a.pause();
            }
        });
    };

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
                    {/* Media Library */}
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

                    {/* Timeline */}
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
                                {/* Tracks */}
                                {tracks.map((track, index) => {
                                    const left = pxFromTime(track.startTime || 0);
                                    const width = pxFromTime(track.duration || 0);
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
                                                style={{ left: `${left}px`, width: `${width}px` }}
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
