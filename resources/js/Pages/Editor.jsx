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
                duration: 0,             // segment duration (for clips) or full duration (for audio)
                sourceDuration: 0,       // for video sources; filled on metadata load
                type: isAudio ? 'audio' : 'video',
                startOffset: 0,          // for video segments: where this segment starts within the source
                startTime: 0,            // for audio tracks on the timeline
            };
            return fileObj;
        });

        const audioFiles = files.filter(f => f.type === 'audio');
        const videoFiles = files.filter(f => f.type === 'video');

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
            // add a new segment that initially covers the whole source once metadata loads
            setClips((prev) => [...prev, { ...file, startOffset: 0 }]);
        } else if (file.type === 'audio') {
            setMusicTracks((prev) => [...prev, { ...file, startTime: currentTime }]);
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

    // ✂️ CUT TOOL FUNCTION
    const handleCut = () => {
        // figure out which clip the playhead is in and the time within that clip (segment-relative)
        let acc = 0;
        let targetIndex = null;
        let relativeTimeInSegment = 0;

        for (let i = 0; i < clips.length; i++) {
            const segDur = clips[i].duration || 0;
            if (currentTime < acc + segDur) {
                targetIndex = i;
                relativeTimeInSegment = currentTime - acc; // seconds into this segment
                break;
            }
            acc += segDur;
        }

        if (targetIndex === null) return;

        const clip = clips[targetIndex];
        const segDuration = clip.duration || 0;

        // only cut if inside the segment, not at boundaries
        if (relativeTimeInSegment <= 0 || relativeTimeInSegment >= segDuration) return;

        const before = {
            ...clip,
            name: clip.name + ' (Part 1)',
            // keep same source but limit to the first portion
            startOffset: (clip.startOffset || 0),
            duration: relativeTimeInSegment,
        };

        const after = {
            ...clip,
            name: clip.name + ' (Part 2)',
            // start later in the source by the split amount
            startOffset: (clip.startOffset || 0) + relativeTimeInSegment,
            duration: segDuration - relativeTimeInSegment,
        };

        const newClips = [
            ...clips.slice(0, targetIndex),
            before,
            after,
            ...clips.slice(targetIndex + 1),
        ];

        setClips(newClips);

        // select the "after" part to make follow-up deletes easy (optional UX)
        setSelectedClipIndex(targetIndex + 1);
    };

    // Load durations (and populate sourceDuration for video)
    useEffect(() => {
        clips.forEach((clip, i) => {
            if (!clip.source) return;
            const needsSourceDur = !clip.sourceDuration;
            const needsSegDur = !clip.duration;

            if (needsSourceDur || needsSegDur) {
                const vid = document.createElement('video');
                vid.src = clip.source;
                vid.onloadedmetadata = () => {
                    setClips((prev) => {
                        const list = [...prev];
                        const c = { ...list[i] };
                        const srcDur = vid.duration || 0;

                        // set sourceDuration
                        c.sourceDuration = srcDur;

                        // if duration isn't set yet (newly dropped), default to full source minus startOffset
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
            if (!track.source || track.duration) return;
            const audio = document.createElement('audio');
            audio.src = track.source;
            audio.onloadedmetadata = () => {
                setMusicTracks((prev) => {
                    const updated = [...prev];
                    updated[i] = { ...updated[i], duration: audio.duration || 0 };
                    return updated;
                });
            };
        });
    }, [clips, musicTracks]);

    const totalDuration = useMemo(() => {
        const sum = clips.reduce((acc, c) => acc + (c.duration || 0), 0);
        return sum || globalDuration;
    }, [clips, globalDuration]);

    // Clip switching: always start at the segment's startOffset
    useEffect(() => {
        const video = videoRef.current;
        const seg = clips[activeClipIndex];
        if (video && seg) {
            video.src = seg.source;
            const startOffset = seg.startOffset || 0;
            // Seek to the correct point within the source for this segment
            const seek = () => {
                video.currentTime = startOffset;
                video.play().catch(() => {});
                video.removeEventListener('loadedmetadata', seek);
            };
            if (isFinite(video.duration) && video.duration > 0) {
                // metadata probably already loaded (same src)
                video.currentTime = startOffset;
                video.play().catch(() => {});
            } else {
                // wait for metadata before seeking
                video.addEventListener('loadedmetadata', seek);
            }
        }
    }, [activeClipIndex, clips]);

    // Sync video + music + enforce segment ends
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onTimeUpdate = () => {
            const seg = clips[activeClipIndex];
            if (!seg) return;

            const segStartOffset = seg.startOffset || 0;
            const segEnd = segStartOffset + (seg.duration || 0);

            // segment-relative time (0..segment.duration)
            const segRelative = Math.max(0, (video.currentTime || 0) - segStartOffset);

            // compute global time: sum(prev segment durations) + relative in this segment
            const elapsedBefore = clips
                .slice(0, activeClipIndex)
                .reduce((sum, c) => sum + (c.duration || 0), 0);

            const globalTime = elapsedBefore + segRelative;
            setCurrentTime(globalTime);

            // If we've reached beyond the end of this segment, advance
            if ((video.currentTime || 0) >= segEnd - 0.03) {
                // move to next clip if exists, else stop
                if (activeClipIndex < clips.length - 1) {
                    setActiveClipIndex((prev) => prev + 1);
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

            // --- MUSIC SYNC (keep your previous behavior) ---
            musicTracks.forEach((track, i) => {
                const audio = audioRefs.current[i];
                if (!audio) return;

                if (globalTime >= track.startTime && globalTime <= track.startTime + (track.duration || 0)) {
                    const relativeTime = globalTime - track.startTime;
                    if (Math.abs((audio.currentTime || 0) - relativeTime) > 0.2) {
                        audio.currentTime = relativeTime;
                    }
                    if (!video.paused && audio.paused) {
                        audio.play().catch(() => {});
                    }
                    if (video.paused && !audio.paused) {
                        audio.pause();
                    }
                } else if (globalTime < track.startTime) {
                    audio.pause();
                    audio.currentTime = 0;
                }
                // if past the track’s end, let it finish naturally
            });
        };

        const onEnded = () => {
            // We largely enforce segment end in timeupdate; ended is a safety for true file end
            if (activeClipIndex < clips.length - 1) {
                setActiveClipIndex((prev) => prev + 1);
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

        // find which segment and the time within that segment
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
        const segRelative = Math.max(0, newGlobalTime - acc); // seconds into the segment
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

        // sync music to the new global time
        musicTracks.forEach((track, i) => {
            const audio = audioRefs.current[i];
            if (!audio) return;

            if (newGlobalTime >= track.startTime && newGlobalTime <= track.startTime + (track.duration || 0)) {
                audio.currentTime = newGlobalTime - track.startTime;
                if (!videoRef.current.paused) audio.play().catch(() => {});
            } else if (newGlobalTime < track.startTime) {
                audio.pause();
                audio.currentTime = 0;
            }
            // if past end → let it stop naturally
        });
    };

    // Hotkeys (delete still removes items; gaps/black screen behavior can be added if desired)
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
