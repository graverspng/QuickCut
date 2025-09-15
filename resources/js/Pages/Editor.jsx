import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { normalizeClips, normalizeTracks, getClipWidth } from '@/utils/timelineUtils';
import '@/../css/Editor.css';
import '@/../css/EditorMobile.css'; // 📱 mobile overrides

export default function Editor({ project }) {
    const resolveLocal = (key, fallback = '') => {
        try {
            return localStorage.getItem(key) || fallback;
        } catch (_) {
            return fallback;
        }
    };

    const [mediaFiles, setMediaFiles] = useState(() =>
        (project.media_files || []).map((f) => {
            if (f.source?.startsWith('local-')) {
                const data = resolveLocal(f.source, '');
                return { ...f, source: data, storageKey: f.source };
            }
            return f;
        })
    );
    const [clips, setClips] = useState(() =>
        (project.clips || []).map((c) => {
            if (c.source?.startsWith('local-')) {
                const data = resolveLocal(c.source, '');
                return { ...c, source: data, storageKey: c.source };
            }
            return c;
        })
    );
    const [musicTracks, setMusicTracks] = useState(() =>
        (project.music_tracks || []).map((t) => {
            if (t.source?.startsWith('local-')) {
                const data = resolveLocal(t.source, '');
                return { ...t, source: data, storageKey: t.source };
            }
            return t;
        })
    );
    const [activeClipIndex, setActiveClipIndex] = useState(0);
    const [selectedClipIndex, setSelectedClipIndex] = useState(null);
    const [selectedMusicIndex, setSelectedMusicIndex] = useState(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [globalDuration, setGlobalDuration] = useState(60);
    const videoRef = useRef(null);
    const audioRefs = useRef([]);
    const [resizeState, setResizeState] = useState(null);

    // === HELPERS TO NORMALIZE TIMELINE ===
    const normalizeClips = (clips) => {
        let accumulated = 0;
        return clips.map((clip) => {
            const c = { ...clip };
            c.startTime = accumulated;
            accumulated += c.duration || 0;
            return c;
        });
    };

    const normalizeTracks = (tracks) => {
        let accumulated = 0;
        return tracks.map((track) => {
            const t = { ...track };
            t.startTime = accumulated;
            accumulated += t.duration || 0;
            return t;
        });
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) videoRef.current.play();
        else videoRef.current.pause();
    };

    const goBack = () => router.get(route('dashboard'));

    // Store uploaded files as data URLs in localStorage
    const handleFileUpload = async (e) => {
        const uploads = Array.from(e.target.files);

        const files = await Promise.all(
            uploads.map(
                (file) =>
                    new Promise((resolve) => {
                        const reader = new FileReader();
                        const key = `local-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
                        reader.onload = () => {
                            const dataUrl = reader.result;
                            try {
                                localStorage.setItem(key, dataUrl);
                            } catch (_) {
                                // ignore quota errors
                            }
                            resolve({
                                name: file.name,
                                source: dataUrl,
                                storageKey: key,
                                duration: 0,
                                type: file.type.startsWith('audio/') ? 'audio' : 'video',
                                startOffset: 0,
                                startTime: 0,
                                sourceDuration: 0,
                            });
                        };
                        reader.readAsDataURL(file);
                    })
            )
        );

        // ✅ Add ALL files (video + audio) only to Media Library
        setMediaFiles((prev) => [...prev, ...files]);
    };

    const handleDragStart = (e, index) => {
        e.dataTransfer.setData('index', index);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const index = parseInt(e.dataTransfer.getData('index'));
        const file = mediaFiles[index];
        if (!file) return;

        if (file.type === 'video') {
            setClips((prev) =>
                normalizeClips([
                    ...prev,
                    {
                        ...file,
                        startOffset: 0,
                        startTime: prev.reduce((sum, c) => sum + (c.duration || 0), 0),
                    },
                ])
            );
        } else if (file.type === 'audio') {
            setMusicTracks((prev) =>
                normalizeTracks([...prev, { ...file, startTime: currentTime, startOffset: 0 }])
            );
        }
    };

    const handleSave = () => {
        const mediaToSave = mediaFiles.map(({ storageKey, source, ...rest }) => ({
            ...rest,
            source: storageKey || source,
        }));
        const clipsToSave = clips.map(({ storageKey, source, ...rest }) => ({
            ...rest,
            source: storageKey || source,
        }));
        const tracksToSave = musicTracks.map(({ storageKey, source, ...rest }) => ({
            ...rest,
            source: storageKey || source,
        }));


        router.put(route('projects.update', project.id), {
            media_files: mediaToSave,
            clips: clipsToSave,
            music_tracks: tracksToSave,
        });
    };

    const handleCut = () => {
        if (selectedClipIndex !== null) {
            const targetIndex = selectedClipIndex;
            const clip = clips[targetIndex];
            if (!clip || clip.type === 'gap') return;

            const relativeTime = currentTime - (clip.startTime || 0);
            if (relativeTime <= 0 || relativeTime >= (clip.duration || 0)) return;

            const before = {
                ...clip,
                startOffset: clip.startOffset || 0,
                startTime: clip.startTime,
                duration: relativeTime,
            };
            const after = {
                ...clip,
                startOffset: (clip.startOffset || 0) + relativeTime,
                startTime: (clip.startTime || 0) + relativeTime,
                duration: (clip.duration || 0) - relativeTime,
            };

            setClips((prev) => {
                const newClips = [
                    ...prev.slice(0, targetIndex),
                    before,
                    after,
                    ...prev.slice(targetIndex + 1),
                ];
                return normalizeClips(newClips);
            });

            setSelectedClipIndex(targetIndex + 1);
            return;
        }

        if (selectedMusicIndex !== null) {
            const tIndex = selectedMusicIndex;
            const track = musicTracks[tIndex];
            if (!track) return;

            const relativeTime = currentTime - (track.startTime || 0);
            if (relativeTime <= 0 || relativeTime >= (track.duration || 0)) return;

            const before = {
                ...track,
                startOffset: track.startOffset || 0,
                startTime: track.startTime,
                duration: relativeTime,
            };

            const after = {
                ...track,
                startOffset: (track.startOffset || 0) + relativeTime,
                startTime: (track.startTime || 0) + relativeTime,
                duration: (track.duration || 0) - relativeTime,
            };

            setMusicTracks((prev) => {
                const newTracks = [
                    ...prev.slice(0, tIndex),
                    before,
                    after,
                    ...prev.slice(tIndex + 1),
                ];
                return normalizeTracks(newTracks);
            });

            setSelectedMusicIndex(tIndex + 1);
            return;
        }
    };

    // --- DRAG & DROP HANDLERS ---
    const handleClipDragStart = (e, index) => {
        e.dataTransfer.setData('clipIndex', index);
    };

    const handleClipDrop = (e, dropIndex) => {
        e.preventDefault();
        const draggedIndex = parseInt(e.dataTransfer.getData('clipIndex'));
        if (draggedIndex === dropIndex) return;

        setClips((prev) => {
            const updated = [...prev];
            const [draggedClip] = updated.splice(draggedIndex, 1);
            updated.splice(dropIndex, 0, draggedClip);
            return normalizeClips(updated);
        });

        setSelectedClipIndex(dropIndex);
    };

    const handleTrackDragStart = (e, index) => {
        e.dataTransfer.setData('trackIndex', index);
    };

    const handleTrackDrop = (e, dropIndex) => {
        e.preventDefault();
        const draggedIndex = parseInt(e.dataTransfer.getData('trackIndex'));
        if (draggedIndex === dropIndex) return;

        setMusicTracks((prev) => {
            const updated = [...prev];
            const [draggedTrack] = updated.splice(draggedIndex, 1);
            updated.splice(dropIndex, 0, draggedTrack);
            return normalizeTracks(updated);
        });

        setSelectedMusicIndex(dropIndex);
    };

    // --- CLIP RESIZING ---
    const startResize = (e, index, edge) => {
        e.stopPropagation();
        e.preventDefault();
        const clip = clips[index];
        if (!clip) return;
        const pxPerSec = 1200 / totalDuration;
        setResizeState({
            index,
            edge,
            startX: e.clientX,
            origStartOffset: clip.startOffset || 0,
            origDuration: clip.duration || 0,
            sourceDuration: clip.sourceDuration || clip.duration || 0,
            pxPerSec,
        });
    };

    // --- LOAD CLIP & TRACK METADATA ---
    useEffect(() => {
        clips.forEach((clip, i) => {
            if (!clip.source) return;
            if (!clip.sourceDuration || !clip.duration) {
                const vid = document.createElement('video');
                vid.src = clip.source;
                vid.preload = 'auto';
                vid.onloadedmetadata = () => {
                    setClips((prev) => {
                        const list = [...prev];
                        const c = { ...list[i] };
                        const srcDur = vid.duration || 0;
                        c.sourceDuration = srcDur;
                        if (!c.duration || c.duration <= 0) {
                            const startOffset = c.startOffset || 0;
                            c.duration = Math.max(0, srcDur - startOffset);
                        }
                        list[i] = c;
                        return normalizeClips(list);
                    });
                };
            }
        });

        musicTracks.forEach((track, i) => {
            if (!track.source) return;
            if (!track.sourceDuration || !track.duration) {
                const aud = document.createElement('audio');
                aud.src = track.source;
                aud.preload = 'auto';
                aud.onloadedmetadata = () => {
                    setMusicTracks((prev) => {
                        const arr = [...prev];
                        const t = { ...arr[i] };
                        const srcDur = aud.duration || 0;
                        t.sourceDuration = srcDur;
                        if (!t.duration || t.duration <= 0) {
                            const startOffset = t.startOffset || 0;
                            t.duration = Math.max(0, srcDur - startOffset);
                        }
                        arr[i] = t;
                        return normalizeTracks(arr);
                    });
                };
            }
        });
    }, [clips, musicTracks]);

    const totalDuration = useMemo(() => {
        const s = clips.reduce((sum, c) => sum + (c.duration || 0), 0);
        return s || globalDuration;
    }, [clips, globalDuration]);

    // Handle resize dragging
    useEffect(() => {
        if (!resizeState) return;
        const onMove = (e) => {
            setClips((prev) => {
                const arr = [...prev];
                const clip = { ...arr[resizeState.index] };
                const deltaTime = (e.clientX - resizeState.startX) / resizeState.pxPerSec;
                if (resizeState.edge === 'end') {
                    let newDuration = resizeState.origDuration + deltaTime;
                    const maxDuration = resizeState.sourceDuration - resizeState.origStartOffset;
                    newDuration = Math.max(0, Math.min(maxDuration, newDuration));
                    clip.duration = newDuration;
                } else if (resizeState.edge === 'start') {
                    let ns = resizeState.origStartOffset + deltaTime;
                    ns = Math.max(0, Math.min(ns, resizeState.origStartOffset + resizeState.origDuration));
                    const end = resizeState.origStartOffset + resizeState.origDuration;
                    clip.startOffset = ns;
                    clip.duration = end - ns;
                }
                arr[resizeState.index] = clip;
                return normalizeClips(arr);
            });
        };
        const onUp = () => setResizeState(null);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [resizeState]);


    // --- VIDEO PLAYBACK ---
    useEffect(() => {
        const video = videoRef.current;
        const seg = clips[activeClipIndex];
        if (!video || !seg || !seg.source) return;

        // regenerate blob URL if needed
        let source = seg.source;
        if (seg.file && seg.source.startsWith("blob:")) {
            source = URL.createObjectURL(seg.file);
        }

        video.src = source;
        video.currentTime = seg.startOffset || 0;

        const playPromise = video.play();
        if (playPromise !== undefined) playPromise.catch(() => {});
    }, [activeClipIndex, clips]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onTimeUpdate = () => {
            const seg = clips[activeClipIndex];
            if (!seg) return;

            const segStartTime = seg.startTime || 0;
            const segDuration = seg.duration || 0;

            const globalTime = segStartTime + (video.currentTime - (seg.startOffset || 0));
            setCurrentTime(globalTime);

            if ((video.currentTime || 0) >= (seg.startOffset || 0) + segDuration - 0.05) {
                if (activeClipIndex < clips.length - 1) {
                    setActiveClipIndex((p) => p + 1);
                } else {
                    video.pause();
                    setActiveClipIndex(0);
                    setCurrentTime(0);
                    audioRefs.current.forEach((a) => {
                        if (a) {
                            a.pause();
                            a.currentTime = 0;
                        }
                    });
                }
            }

            musicTracks.forEach((track, i) => {
                const audio = audioRefs.current[i];
                if (!audio) return;

                const trackStart = track.startTime || 0;
                const trackDur = track.duration || 0;
                const trackOffset = track.startOffset || 0;

                if (globalTime >= trackStart && globalTime <= trackStart + trackDur) {
                    const rel = globalTime - trackStart;
                    const desired = trackOffset + rel;
                    if (Math.abs((audio.currentTime || 0) - desired) > 0.25) {
                        audio.currentTime = desired;
                    }
                    if (!video.paused && audio.paused) audio.play().catch(() => {});
                    if (video.paused && !audio.paused) audio.pause();
                } else if (globalTime < trackStart) {
                    audio.pause();
                    audio.currentTime = track.startOffset || 0;
                } else {
                    audio.pause();
                }
            });
        };

        video.addEventListener('timeupdate', onTimeUpdate);
        return () => video.removeEventListener('timeupdate', onTimeUpdate);
    }, [clips, activeClipIndex, musicTracks]);

    const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const timelineWidth = rect.width;
        const newGlobalTime = (clickX / timelineWidth) * totalDuration;

        let newIndex = 0
        for (let i = 0; i < clips.length; i++) {
            const clipStart = clips[i].startTime || 0;
            const clipEnd = clipStart + (clips[i].duration || 0);
            if (newGlobalTime >= clipStart && newGlobalTime < clipEnd) {
                newIndex = i;
                break;
            }
        }

        const seg = clips[newIndex];
        if (!seg) return;

        const segRelative = Math.max(0, newGlobalTime - (seg.startTime || 0));
        const seekTimeInSource = (seg.startOffset || 0) + segRelative;

        // ✅ remember playback state
        const wasPlaying = videoRef.current && !videoRef.current.paused;

        setActiveClipIndex(newIndex);

        if (videoRef.current) {
            videoRef.current.src = seg.source;
            videoRef.current.currentTime = seekTimeInSource;

            if (wasPlaying) {
                videoRef.current.play().catch(() => {});
            } else {
                videoRef.current.pause(); // ✅ force it to stay paused
            }
        }

        setCurrentTime(newGlobalTime);
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            }

            if ((e.code === 'Backspace' || e.code === 'Delete') && selectedClipIndex !== null) {
                setClips((prev) =>
                    normalizeClips(prev.filter((_, i) => i !== selectedClipIndex))
                );
                setSelectedClipIndex(null);
            }

            if ((e.code === 'Backspace' || e.code === 'Delete') && selectedMusicIndex !== null) {
                setMusicTracks((prev) =>
                    normalizeTracks(prev.filter((_, i) => i !== selectedMusicIndex))
                );
                setSelectedMusicIndex(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedClipIndex, selectedMusicIndex, currentTime, musicTracks]);

    return (
        <AuthenticatedLayout hideNavbar={true}>
            <Head title={project.name} />

            <div className="editor-container">
                <div style={{ display: "none" }}>
                        {clips.map((clip, i) => (
                        <video key={i} src={clip.source} preload="auto" />
                    ))}
                </div>

                <div className="editor-header">
                    <h2>{project.name}</h2>
                    <div>
                        <button onClick={handleCut} className="cut-btn">✂️ Cut Clip</button>
                        <button onClick={goBack} className="back-btn">Back</button>
                        <button onClick={handleSave} className="save-btn">Save</button>
                    </div>
                </div>

                <div className="editor-main">
                <div className="media-library">
    <h3>Media Library</h3>
    <div
    className="upload-dropzone"
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => {
        e.preventDefault();
        handleFileUpload({ target: { files: e.dataTransfer.files } });
    }}
    onClick={() => document.getElementById('hiddenFileInput').click()}
>
<p style={{ fontSize: "10px" }}>Drop files here or click to upload</p>
    <input
        id="hiddenFileInput"
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFileUpload}
    />
</div>


    {/* --- Video Section --- */}
    <div className="media-section video-section">
        <h4>📹 Video</h4>
        <div className="section-divider" />
        {mediaFiles.filter(f => f.type === 'video').map((file, index) => (
            <div
                key={index}
                draggable
                onDragStart={(e) => handleDragStart(e, mediaFiles.indexOf(file))}
                className="media-item"
            >
                {file.name}
            </div>
        ))}
    </div>

    {/* --- Audio Section --- */}
    <div className="media-section audio-section">
        <h4>🎵 Audio</h4>
        <div className="section-divider" />
        {mediaFiles.filter(f => f.type === 'audio').map((file, index) => (
            <div
                key={index}
                draggable
                onDragStart={(e) => handleDragStart(e, mediaFiles.indexOf(file))}
                className="media-item"
            >
                {file.name}
            </div>
        ))}
    </div>
</div>



                    <div
                        className="editor-area"
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        <div className="video-player">
                            <video ref={videoRef} />
                            <button className="play-btn" onClick={togglePlay}>
                                Play / Pause
                            </button>
                        </div>

                        <div className="timeline" onClick={handleSeek}>
                            <div className="flex items-center" style={{ width: '100%' }}>
                                {clips.map((clip, index) => {
                                    const width = (clip.duration / totalDuration) * 1200;
                                    const isSelected = selectedClipIndex === index;
                                    return (
                                        <div
                                            key={index}
                                            draggable={!isSelected}
                                            onDragStart={(e) => handleClipDragStart(e, index)}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => handleClipDrop(e, index)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedClipIndex(isSelected ? null : index);
                                            }}
                                            className={`clip ${isSelected ? 'selected' : ''}`}
                                            style={{ width: `${width}px` }}
                                        >
                                            {isSelected && (
                                                <>
                                                    <div
                                                        className="clip-handle left"
                                                        onMouseDown={(e) => startResize(e, index, 'start')}
                                                    />
                                                    <div
                                                        className="clip-handle right"
                                                        onMouseDown={(e) => startResize(e, index, 'end')}
                                                    />
                                                </>
                                            )}
                                            {clip.name}
                                        </div>
                                    );
                                })}

                                <div
                                    className="playhead"
                                    style={{
                                        left: `${(currentTime / totalDuration) * 1200}px`,
                                    }}
                                />
                            </div>
                        </div>

                        <div
                            className="music-timeline"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMusicIndex(null);
                            }}
                        >
                            <div className="flex items-center" style={{ width: '1200px' }}>
                                {musicTracks.map((track, index) => {
                                    const width = (track.duration / totalDuration) * 1200;
                                    const isSelected = selectedMusicIndex === index;
                                    return (
                                        <div
                                            key={index}
                                            draggable
                                            onDragStart={(e) => handleTrackDragStart(e, index)}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => handleTrackDrop(e, index)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedMusicIndex(isSelected ? null : index);
                                            }}
                                            className={`track ${isSelected ? 'selected' : ''}`}
                                            style={{ width: `${width}px` }}
                                        >
                                            {track.name}
                                            <audio
                                                ref={(el) => (audioRefs.current[index] = el)}
                                                src={track.source}
                                            />
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