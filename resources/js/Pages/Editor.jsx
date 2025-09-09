import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useRef, useEffect, useMemo } from 'react';
import '@/../css/Editor.css';

export default function Editor({ project }) {
    const [mediaFiles, setMediaFiles] = useState(project.media_files || []);
    const [clips, setClips] = useState(project.clips || []);
    const [musicTracks, setMusicTracks] = useState(project.music_tracks || []);
    const [activeClipIndex, setActiveClipIndex] = useState(0);
    const [selectedClipIndex, setSelectedClipIndex] = useState(null);
    const [selectedMusicIndex, setSelectedMusicIndex] = useState(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [globalDuration, setGlobalDuration] = useState(60);
    const videoRef = useRef(null);
    const audioRefs = useRef([]);

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) videoRef.current.play();
        else videoRef.current.pause();
    };

    const goBack = () => router.get(route('dashboard'));

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files).map((file) => {
            const isAudio = file.type.startsWith('audio/');
            const fileObj = {
                name: file.name,
                source: URL.createObjectURL(file),
                duration: 0,
                type: isAudio ? 'audio' : 'video',
                startOffset: 0,
                startTime: 0,
                sourceDuration: 0,
            };
            return fileObj;
        });

        const audioFiles = files.filter((f) => f.type === 'audio');
        const videoFiles = files.filter((f) => f.type === 'video');

        setMediaFiles((prev) => [...prev, ...videoFiles]);
        setMusicTracks((prev) => [...prev, ...audioFiles]);
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
            setClips((prev) => [...prev, { ...file, startOffset: 0 }]);
        } else if (file.type === 'audio') {
            setMusicTracks((prev) => [...prev, { ...file, startTime: currentTime, startOffset: 0 }]);
        }
    };

    const handleSave = () => {
        router.post(route('projects.store'), {
            project_id: project.id,
            media_files: mediaFiles,
            clips: clips,
            music_tracks: musicTracks,
        });
    };

    const handleCut = () => {
        if (selectedClipIndex !== null) {
            const targetIndex = selectedClipIndex;
            const clip = clips[targetIndex];
            if (!clip || clip.type === 'gap') return;

            const elapsedBefore = clips.slice(0, targetIndex).reduce((s, c) => s + (c.duration || 0), 0);
            const relativeTime = currentTime - elapsedBefore;

            if (relativeTime <= 0 || relativeTime >= (clip.duration || 0)) return;

            const before = {
                ...clip,
                name: clip.name,
                startOffset: clip.startOffset || 0,
                duration: relativeTime,
            };
            const after = {
                ...clip,
                name: clip.name,
                startOffset: (clip.startOffset || 0) + relativeTime,
                duration: (clip.duration || 0) - relativeTime,
            };

            setClips((prev) => {
                const newClips = [...prev];
                newClips.splice(targetIndex, 1, before, after);
                return newClips;
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
                name: track.name,
                startOffset: track.startOffset || 0,
                startTime: track.startTime,
                duration: relativeTime,
            };

            const after = {
                ...track,
                name: track.name,
                startOffset: (track.startOffset || 0) + relativeTime,
                startTime: (track.startTime || 0) + relativeTime,
                duration: (track.duration || 0) - relativeTime,
            };

            setMusicTracks((prev) => {
                const newTracks = [...prev];
                newTracks.splice(tIndex, 1, before, after);
                return newTracks;
            });

            setSelectedMusicIndex(tIndex + 1);
            return;
        }
    };

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
                        const startOffset = c.startOffset || 0;
                        if (!c.duration || c.duration <= 0) {
                            c.duration = Math.max(0, srcDur - startOffset);
                        }
                        list[i] = c;
                        return list;
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
                        return arr;
                    });
                };
            }
        });
    }, [clips, musicTracks]);

    const totalDuration = useMemo(() => {
        const s = clips.reduce((sum, c) => sum + (c.duration || 0), 0);
        return s || globalDuration;
    }, [clips, globalDuration]);

    useEffect(() => {
        const video = videoRef.current;
        const seg = clips[activeClipIndex];
        if (!video || !seg) return;

        const start = seg.startOffset || 0;
        video.src = seg.source;
        video.currentTime = start;

        const playPromise = video.play();
        if (playPromise !== undefined) playPromise.catch(() => {});
    }, [activeClipIndex, clips]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onTimeUpdate = () => {
            const seg = clips[activeClipIndex];
            if (!seg) return;

            const segStartOffset = seg.startOffset || 0;
            const segDuration = seg.duration || 0;
            const segEndInSource = segStartOffset + segDuration;

            const segRelative = Math.max(0, (video.currentTime || 0) - segStartOffset);
            const elapsedBefore = clips.slice(0, activeClipIndex).reduce((s, c) => s + (c.duration || 0), 0);
            const globalTime = elapsedBefore + segRelative;
            setCurrentTime(globalTime);

            if ((video.currentTime || 0) >= segEndInSource - 0.05) {
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
                    if (!video.paused && audio.paused) {
                        audio.play().catch(() => {});
                    }
                    if (video.paused && !audio.paused) {
                        audio.pause();
                    }
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

        let acc = 0;
        let newIndex = 0;
        for (let i = 0; i < clips.length; i++) {
            const segDur = clips[i].duration || 0;
            if (newGlobalTime < acc + segDur) {
                newIndex = i;
                break;
            }
            acc += segDur;
        }

        const seg = clips[newIndex];
        const segRelative = Math.max(0, newGlobalTime - acc);
        const seekTimeInSource = (seg?.startOffset || 0) + segRelative;

        setActiveClipIndex(newIndex);

        if (videoRef.current && seg) {
            videoRef.current.src = seg.source;
            videoRef.current.currentTime = seekTimeInSource;
            videoRef.current.play().catch(() => {});
        }

        musicTracks.forEach((track, i) => {
            const audio = audioRefs.current[i];
            if (!audio) return;
            const tStart = track.startTime || 0;
            const tDur = track.duration || 0;
            const tOffset = track.startOffset || 0;

            if (newGlobalTime >= tStart && newGlobalTime <= tStart + tDur) {
                audio.currentTime = tOffset + (newGlobalTime - tStart);
                if (!videoRef.current.paused) audio.play().catch(() => {});
            } else if (newGlobalTime < tStart) {
                audio.pause();
                audio.currentTime = tOffset;
            } else {
                audio.pause();
            }
        });
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            }

            if ((e.code === 'Backspace' || e.code === 'Delete') && selectedClipIndex !== null) {
                setClips((prev) => prev.filter((_, i) => i !== selectedClipIndex));
                setSelectedClipIndex(null);
            }

            if ((e.code === 'Backspace' || e.code === 'Delete') && selectedMusicIndex !== null) {
                setMusicTracks((prev) => {
                    const delIndex = selectedMusicIndex;
                    const deleted = prev[delIndex];
                    if (!deleted) return prev;
                    const delDur = deleted.duration || 0;

                    const newTracks = prev.reduce((acc, t, i) => {
                        if (i === delIndex) return acc;
                        const copy = { ...t };
                        if (i > delIndex) {
                            copy.startTime = Math.max(0, (copy.startTime || 0) - delDur);
                        }
                        acc.push(copy);
                        return acc;
                    }, []);

                    setTimeout(() => {
                        newTracks.forEach((track, idx) => {
                            const audio = audioRefs.current[idx];
                            if (!audio) return;
                            const tStart = track.startTime || 0;
                            const tDur = track.duration || 0;
                            const tOffset = track.startOffset || 0;

                            if (currentTime >= tStart && currentTime <= tStart + tDur) {
                                audio.currentTime = tOffset + (currentTime - tStart);
                                if (!videoRef.current.paused) audio.play().catch(() => {});
                            } else if (currentTime < tStart) {
                                audio.pause();
                                audio.currentTime = tOffset;
                            } else {
                                audio.pause();
                            }
                        });
                    }, 0);

                    return newTracks;
                });

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
                {/* Hidden preloaders */}
                <div style={{ display: "none" }}>
                    {clips.map((clip, i) => (
                        <video key={i} src={clip.source} preload="auto" />
                    ))}
                </div>

                <div className="editor-header">
                    <h2>{project.name}</h2>
                    <div>
                        <button onClick={goBack} className="back-btn">Back</button>
                        <button onClick={handleCut} className="cut-btn">✂️ Cut Clip</button>
                        <button onClick={handleSave} className="save-btn">Save</button>
                    </div>
                </div>

                <div className="editor-main">
                    <div className="media-library">
                        <h3>Media Library</h3>
                        <input type="file" multiple onChange={handleFileUpload} className="mb-2" />
                        <div>
                            {mediaFiles.map((file, index) => (
                                <div
                                    key={index}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
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
                            <div className="flex items-center" style={{ width: '1200px' }}>
                                {clips.map((clip, index) => {
                                    const width = (clip.duration / totalDuration) * 1200;
                                    const isSelected = selectedClipIndex === index;
                                    return (
                                        <div
                                            key={index}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedClipIndex(isSelected ? null : index);
                                            }}
                                            className={`clip ${isSelected ? 'selected' : ''}`}
                                            style={{ width: `${width}px` }}
                                        >
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
