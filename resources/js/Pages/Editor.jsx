import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useRef, useEffect, useMemo } from 'react';

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
                duration: 0,        // segment duration for clips / segment length for audio segments
                sourceDuration: 0,  // full source duration
                type: isAudio ? 'audio' : 'video',
                startOffset: 0,     // for video segments: offset inside the source
                startTime: 0,       // for audio segments: timeline position (global seconds)
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
            // add clip segment referencing full source; metadata loader will set durations
            setClips((prev) => [...prev, { ...file, startOffset: 0 }]);
        } else if (file.type === 'audio') {
            // place audio at playhead, startOffset 0 within source by default
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

    // CUT TOOL: only cut selected items (video or audio). If nothing selected, do nothing.
    const handleCut = () => {
        // If a clip is selected, cut that clip at playhead (segment-relative).
        if (selectedClipIndex !== null) {
            const targetIndex = selectedClipIndex;
            const clip = clips[targetIndex];
            if (!clip || clip.type === 'gap') return;

            // compute elapsed before the targeted segment
            const elapsedBefore = clips.slice(0, targetIndex).reduce((s, c) => s + (c.duration || 0), 0);
            const relativeTime = currentTime - elapsedBefore; // time into the selected segment

            if (relativeTime <= 0 || relativeTime >= (clip.duration || 0)) return; // ignore if at boundary

            const before = {
                ...clip,
                // keep original name
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

            // select the after piece for convenience
            setSelectedClipIndex(targetIndex + 1);
            return;
        }

        // If an audio (music) is selected, cut that track at playhead (global time relative to track)
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

            // select the after piece
            setSelectedMusicIndex(tIndex + 1);
            return;
        }

        // If nothing selected, do nothing (keeps user control explicit)
    };

    // Load durations and sourceDuration metadata for video and audio
    useEffect(() => {
        clips.forEach((clip, i) => {
            if (!clip.source) return;
            // Only query metadata if we don't yet have sourceDuration or duration
            if (!clip.sourceDuration || !clip.duration) {
                const vid = document.createElement('video');
                vid.src = clip.source;
                vid.onloadedmetadata = () => {
                    setClips((prev) => {
                        const newClips = [...prev];
                        const c = { ...newClips[i] };
                        const srcDur = vid.duration || 0;
                        c.sourceDuration = srcDur;
                        // If duration missing (newly dropped), default to remaining source length
                        const startOffset = c.startOffset || 0;
                        if (!c.duration || c.duration <= 0) {
                            c.duration = Math.max(0, srcDur - startOffset);
                        }
                        newClips[i] = c;
                        return newClips;
                    });
                };
            }
        });

        musicTracks.forEach((track, i) => {
            if (!track.source) return;
            if (!track.sourceDuration || !track.duration) {
                const aud = document.createElement('audio');
                aud.src = track.source;
                aud.onloadedmetadata = () => {
                    setMusicTracks((prev) => {
                        const arr = [...prev];
                        const t = { ...arr[i] };
                        const srcDur = aud.duration || 0;
                        t.sourceDuration = srcDur;
                        if (!t.duration || t.duration <= 0) {
                            // default to full source length minus startOffset
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

    // Switch active clip — seek to segment startOffset
    useEffect(() => {
        const video = videoRef.current;
        const seg = clips[activeClipIndex];
        if (!video || !seg) return;

        video.src = seg.source;
        const start = seg.startOffset || 0;

        const seekAndPlay = () => {
            video.currentTime = start;
            video.play().catch(() => {});
            video.removeEventListener('loadedmetadata', seekAndPlay);
        };

        if (isFinite(video.duration) && video.duration > 0) {
            video.currentTime = start;
            video.play().catch(() => {});
        } else {
            video.addEventListener('loadedmetadata', seekAndPlay);
        }
    }, [activeClipIndex, clips]);

    // Sync video + music, and enforce segment ends using startOffset & duration
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onTimeUpdate = () => {
            const seg = clips[activeClipIndex];
            if (!seg) return;

            const segStartOffset = seg.startOffset || 0;
            const segDuration = seg.duration || 0;
            const segEndInSource = segStartOffset + segDuration;

            // relative time inside this segment
            const segRelative = Math.max(0, (video.currentTime || 0) - segStartOffset);

            // compute global timeline time
            const elapsedBefore = clips.slice(0, activeClipIndex).reduce((s, c) => s + (c.duration || 0), 0);
            const globalTime = elapsedBefore + segRelative;
            setCurrentTime(globalTime);

            // check segment end and advance if needed
            if ((video.currentTime || 0) >= segEndInSource - 0.03) {
                if (activeClipIndex < clips.length - 1) {
                    setActiveClipIndex((p) => p + 1);
                } else {
                    video.pause();
                    setActiveClipIndex(0);
                    setCurrentTime(0);
                    // reset audios
                    audioRefs.current.forEach((a) => {
                        if (a) {
                            a.pause();
                            a.currentTime = 0;
                        }
                    });
                }
                return;
            }

            // MUSIC SYNC: use track.startOffset + (globalTime - track.startTime)
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
                    // before track — pause and reset to its startOffset
                    audio.pause();
                    audio.currentTime = track.startOffset || 0;
                } else {
                    // past track end — pause but do NOT reset to 0 (keeps last state)
                    if (!audio.paused && audio.currentTime < (track.startOffset || 0) + trackDur) {
                        // allow it to finish naturally if it is currently playing
                    } else {
                        // ensure it's paused to avoid playing unintended parts
                        audio.pause();
                    }
                }
            });
        };

        const onEnded = () => {
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
        };

        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('ended', onEnded);

        return () => {
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('ended', onEnded);
        };
    }, [clips, activeClipIndex, musicTracks]);

    const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const timelineWidth = rect.width;
        const newGlobalTime = (clickX / timelineWidth) * totalDuration;

        // find segment and relative inside it
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
            const doSeek = () => {
                videoRef.current.currentTime = seekTimeInSource;
                videoRef.current.play().catch(() => {});
                videoRef.current.removeEventListener('loadedmetadata', doSeek);
            };
            if (isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
                videoRef.current.currentTime = seekTimeInSource;
                videoRef.current.play().catch(() => {});
            } else {
                videoRef.current.addEventListener('loadedmetadata', doSeek);
            }
        }

        // sync audio elements
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
                // past end — pause (leave position)
                audio.pause();
            }
        });
    };

    // hotkeys
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            }
            if ((e.code === 'Backspace' || e.code === 'Delete') && selectedClipIndex !== null) {
                // remove clip entirely
                setClips((prev) => prev.filter((_, i) => i !== selectedClipIndex));
                setSelectedClipIndex(null);
            }
            if ((e.code === 'Backspace' || e.code === 'Delete') && selectedMusicIndex !== null) {
                setMusicTracks((prev) => prev.filter((_, i) => i !== selectedMusicIndex));
                setSelectedMusicIndex(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedClipIndex, selectedMusicIndex]);

    return (
        <AuthenticatedLayout hideNavbar={true}>
            <Head title={project.name} />

            <div className="flex flex-col h-screen p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">{project.name}</h2>
                    <div className="flex space-x-2">
                        <button
                            onClick={goBack}
                            className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleCut}
                            className="bg-blue-500 px-3 py-1 rounded text-white hover:bg-blue-600"
                        >
                            ✂️ Cut Clip
                        </button>
                        <button
                            onClick={handleSave}
                            className="bg-green-500 px-3 py-1 rounded text-white hover:bg-green-600"
                        >
                            Save
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Media Library */}
                    <div className="w-1/4 bg-gray-100 border-r overflow-y-auto p-4">
                        <h3 className="font-semibold mb-2">Media Library</h3>
                        <input type="file" multiple onChange={handleFileUpload} className="mb-2" />
                        <div className="space-y-2">
                            {mediaFiles.map((file, index) => (
                                <div
                                    key={index}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    className="bg-gray-200 h-16 flex items-center justify-center cursor-pointer"
                                >
                                    {file.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Editor Area */}
                    <div
                        className="flex-1 flex flex-col bg-gray-50"
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        {/* Video Player */}
                        <div className="flex-1 relative bg-black flex justify-center items-center">
                            <video ref={videoRef} className="w-full h-full object-contain" />
                            <button
                                className="absolute bottom-2 left-2 bg-white px-2 py-1 rounded"
                                onClick={togglePlay}
                            >
                                Play / Pause
                            </button>
                        </div>

                        {/* Video Timeline */}
                        <div
                            className="h-24 bg-gray-300 p-2 flex items-center overflow-x-auto relative cursor-pointer"
                            onClick={handleSeek}
                        >
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
                                            className={`h-full rounded flex items-center justify-center text-white cursor-pointer ${
                                                isSelected ? 'bg-red-500' : 'bg-blue-500'
                                            }`}
                                            style={{ width: `${width}px` }}
                                        >
                                            {clip.name}
                                        </div>
                                    );
                                })}

                                {/* Playhead */}
                                <div
                                    className="absolute top-0 bottom-0 w-1 bg-red-700"
                                    style={{
                                        left: `${(currentTime / totalDuration) * 1200}px`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* Music Timeline */}
                        <div
                            className="h-16 bg-yellow-100 p-2 flex items-center overflow-x-auto relative cursor-pointer"
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
                                            className={`h-full rounded flex items-center justify-center text-black cursor-pointer ${
                                                isSelected ? 'bg-purple-500' : 'bg-purple-300'
                                            }`}
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
