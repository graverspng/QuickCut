import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useRef, useEffect } from 'react';
import '@/../css/Editor.css';
import '@/../css/AudioEditor.css';

export default function AudioEditor({ project }) {
    const [tracks, setTracks] = useState(() =>
        (project.tracks || []).map((t) => {
            if (t.source?.startsWith('local-')) {
                const data = localStorage.getItem(t.source);
                return { ...t, source: data || '', storageKey: t.source };
            }
            return t;
        })
    );
    const [mediaFiles, setMediaFiles] = useState([]);
    const [selectedTrackIndex, setSelectedTrackIndex] = useState(null);
    const [ghostClip, setGhostClip] = useState(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const [sessionLength, setSessionLength] = useState(120); // seconds

    const audioRefs = useRef([]);
    const timelineRef = useRef(null);
    const [scrollLeft, setScrollLeft] = useState(0);

    // === CONSTANTS for a stable layout like your video editor ===
    const TIMELINE_PX = 1200; // fixed pixel width of the timeline area (matches Editor.jsx)

    // === HELPERS ===
    const normalizeTracks = (arr) =>
        arr.map((t) => ({
            ...t,
            startTime: t.startTime ?? 0,
            startOffset: t.startOffset ?? 0,
            sourceDuration: t.sourceDuration ?? 0,
            duration: t.duration || t.sourceDuration || 0,
            volume: t.volume ?? 1,
            type: 'audio',
        }));

    const pxFromTime = (sec) => (sec / sessionLength) * TIMELINE_PX;
    const timeFromPx = (px) => (px / TIMELINE_PX) * sessionLength;
    const snapToGrid = (time, step = 1) => Math.round(time / step) * step;

    const isAudioFile = (file) => {
        if (!file) return false;
        if (file.type && file.type.startsWith('audio')) return true;
        const ext = file.name?.split('.').pop()?.toLowerCase();
        return (
            ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext) ||
            file.source?.startsWith('data:audio')
        );
    };

    // === FILE UPLOAD to Media Library ===
    const handleFileUpload = async (e) => {
        const fileList = Array.from(e.target.files).filter(isAudioFile);
    
        const files = await Promise.all(
            fileList.map(
                (file) =>
                    new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () =>
                            resolve({
                                name: file.name,
                                source: reader.result,
                                duration: 0,
                                startOffset: 0,
                                startTime: 0,
                                sourceDuration: 0,
                                volume: 1,
                                type: 'audio',
                            });
                        reader.readAsDataURL(file);
                    })
            )
        );
    
        setMediaFiles((prev) => [...prev, ...files]);  // ✅ Add this
    }; // ✅ close the function properly
    

    const getTimeFromEvent = (e) => {
        const rect = timelineRef.current.getBoundingClientRect();
        const dropX = e.clientX - rect.left + timelineRef.current.scrollLeft - 80;
        return snapToGrid(timeFromPx(Math.max(dropX, 0)), 1);
    };

    // === Drag from Library to Timeline ===
    const handleDrop = (e) => {
        e.preventDefault();
        const index = parseInt(e.dataTransfer.getData('index'));
        const file = mediaFiles[index];   // ✅ correct    
        if (!file || !isAudioFile(file)) return;

        const dropTime = getTimeFromEvent(e);
        setTracks((prev) =>
            normalizeTracks([
                ...prev,
                {
                    ...file,
                    startTime: dropTime,
                    startOffset: 0,
                    volume: file.volume ?? 1,
                },
            ])
        );
        setGhostClip(null);
    };

    const handleDragOverTimeline = (e) => {
        e.preventDefault();
        const index = parseInt(e.dataTransfer.getData('index'));
        const file = mediaFiles[index];
        if (!file || !isAudioFile(file)) return;
        setGhostClip({
            name: file.name,
            startTime: getTimeFromEvent(e),
            duration: 10,
        });
    };

    // === Save to DB ===
    const handleSave = () => {
        const tracksToSave = tracks.map(({ storageKey, source, ...rest }) => ({
            ...rest,
            source: storageKey || source,
        }));

        router.put(route('audio.projects.update', project.id), {
            name: project.name,
            description: project.description,
            tracks: tracksToSave,
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

    // === Load audio metadata for true durations and expand session length ===
    useEffect(() => {
        tracks.forEach((track, i) => {
            if (!track.source) return;
            if (!track.sourceDuration || !track.duration) {
                const aud = document.createElement('audio');
                aud.src = track.source;
                aud.preload = 'auto';
                const start = track.startTime || 0;
                aud.onloadedmetadata = () => {
                    const d = aud.duration || 0;
                    setTracks((prev) => {
                        const arr = [...prev];
                        const t = { ...arr[i] };
                        t.sourceDuration = d;
                        if (!t.duration || t.duration <= 0) t.duration = d;
                        arr[i] = t;
                        return normalizeTracks(arr);
                    });
                    setSessionLength((prev) => {
                        const end = start + d;
                        return prev >= end ? prev : end;
                    });
                };
            }
        });
    }, [tracks]);

    useEffect(() => {
        const el = timelineRef.current;
        if (!el) return;
        const onScroll = () => setScrollLeft(el.scrollLeft);
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    // === Project length is fixed by sessionLength; playhead stops there ===
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
            a.volume = track.volume ?? 1;
            if (currentTime >= trackStart && currentTime < trackEnd) {
                const rel = currentTime - trackStart;
                a.currentTime = trackOffset + rel;
                a.play().catch(() => {});
            } else {
                a.pause();
            }
        });
    };

    // Drive playhead + keep audio in sync
    useEffect(() => {
        let id;
        if (isPlaying) {
            id = setInterval(() => {
                setCurrentTime((prev) => {
                    const next = prev + 0.1;
                    if (next >= totalDuration) {
                        // stop at the end of session
                        setIsPlaying(false);
                        audioRefs.current.forEach((a) => a && a.pause());
                        return 0;
                    }

                    // sync all tracks to new time
                    audioRefs.current.forEach((a, i) => {
                        const track = tracks[i];
                        if (!track || !a) return;

                        const trackStart = track.startTime || 0;
                        const trackOffset = track.startOffset || 0;
                        const trackEnd = trackStart + (track.duration || 0);
                        a.volume = track.volume ?? 1;
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
        const rect = timelineRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft - 80;
        const newTime = snapToGrid(timeFromPx(clickX), 1);
        setCurrentTime(Math.max(0, Math.min(sessionLength, newTime)));

        audioRefs.current.forEach((a, i) => {
            const track = tracks[i];
            if (!track || !a) return;
            const s = track.startTime || 0;
            const off = track.startOffset || 0;
            const end = s + (track.duration || 0);
            a.volume = track.volume ?? 1;
            if (newTime >= s && newTime < end) {
                a.currentTime = off + (newTime - s);
            } else {
                a.pause();
            }
        });
    };

    const handleVolumeChange = (index, vol) => {
        setTracks((prev) => {
            const arr = [...prev];
            arr[index] = { ...arr[index], volume: vol };
            return normalizeTracks(arr);
        });
        if (audioRefs.current[index]) audioRefs.current[index].volume = vol;
    };

    return (
        <AuthenticatedLayout hideNavbar={true}>
            <Head title={project.name} />

            <div className="editor-container">
                {/* Header (shared look) */}
                <div className="editor-header">
                    <h2>{project.name} 🎵</h2>
                    <div>
                        {selectedTrackIndex !== null && (
                            <label className="volume-control">
                                Volume
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={(tracks[selectedTrackIndex]?.volume ?? 1) * 100}
                                    onChange={(e) =>
                                        handleVolumeChange(
                                            selectedTrackIndex,
                                            parseFloat(e.target.value) / 100
                                        )
                                    }
                                />
                                <span className="volume-value">
                                    {Math.round((tracks[selectedTrackIndex]?.volume ?? 1) * 100)}
                                </span>
                            </label>
                        )}
                        <button onClick={handleSave} className="save-btn">Save</button>
                        <button onClick={() => router.get(route('audio.projects'))} className="back-btn">Back</button>
                    </div>
                </div>

                <div className="editor-main">
                    {/* LEFT: Media Library (unchanged width, always visible) */}
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

                    {/* RIGHT: Audio timeline area */}
                    <div className="editor-area">
                        <div className="audio-player-controls">
                            <button className="play-btn" onClick={togglePlay}>
                                {isPlaying ? 'Pause' : 'Play'}
                            </button>
                        </div>

                        {/* Time ruler */}
                        <div className="time-ruler top">
                            <div
                                className="ruler-inner"
                                style={{
                                    width: `${TIMELINE_PX}px`,
                                    transform: `translateX(-${scrollLeft}px)`,
                                }}
                            >
                                {Array.from({ length: Math.ceil(sessionLength) + 1 }, (_, i) => {
                                    if (i % 5 !== 0) return null;
                                    return (
                                        <div
                                            key={i}
                                            className="time-tick"
                                            style={{ left: `${pxFromTime(i)}px` }}
                                        >
                                            {Math.floor(i / 60)}:{String(i % 60).padStart(2, '0')}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Scrollable timeline */}
                        <div
                            className="timeline"
                            ref={timelineRef}
                            onClick={handleSeek}
                            onDrop={handleDrop}
                            onDragOver={handleDragOverTimeline}
                        >
                            <div className="layers-inner" style={{ width: `${TIMELINE_PX}px` }}>
                                <div
                                    className="playhead"
                                    style={{ left: `${pxFromTime(currentTime)}px` }}
                                />

                                {ghostClip && (
                                    <div
                                        className="track ghost-track"
                                        style={{
                                            left: `${pxFromTime(ghostClip.startTime)}px`,
                                            width: `${pxFromTime(ghostClip.duration)}px`,
                                            top: '5px',
                                        }}
                                    >
                                        {ghostClip.name}
                                    </div>
                                )}

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
                                                style={{
                                                    left: `${left}px`,
                                                    width: `${width}px`,
                                                }}
                                            >
                                                <span className="track-name">{track.name}</span>
                                                <audio
                                                    ref={(el) => (audioRefs.current[index] = el)}
                                                    src={track.source}
                                                    volume={track.volume ?? 1}
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
