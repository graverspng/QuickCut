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
                duration: 0,
                type: isAudio ? 'audio' : 'video',
                startTime: 0,
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
            setClips((prev) => [...prev, { ...file }]);
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
        let acc = 0;
        let targetIndex = null;
        let relativeTime = 0;

        for (let i = 0; i < clips.length; i++) {
            if (currentTime < acc + clips[i].duration) {
                targetIndex = i;
                relativeTime = currentTime - acc;
                break;
            }
            acc += clips[i].duration;
        }

        if (targetIndex === null) return;

        const clip = clips[targetIndex];

        // only cut if inside the clip, not at start or end
        if (relativeTime <= 0 || relativeTime >= clip.duration) return;

        const before = {
            ...clip,
            name: clip.name + ' (Part 1)',
            duration: relativeTime,
        };
        const after = {
            ...clip,
            name: clip.name + ' (Part 2)',
            duration: clip.duration - relativeTime,
        };

        const newClips = [
            ...clips.slice(0, targetIndex),
            before,
            after,
            ...clips.slice(targetIndex + 1),
        ];

        setClips(newClips);
    };

    // load durations
    useEffect(() => {
        clips.forEach((clip, i) => {
            if (!clip.duration) {
                const vid = document.createElement('video');
                vid.src = clip.source;
                vid.onloadedmetadata = () => {
                    setClips((prev) => {
                        const newClips = [...prev];
                        newClips[i].duration = vid.duration;
                        return newClips;
                    });
                };
            }
        });

        musicTracks.forEach((track, i) => {
            if (!track.duration) {
                const audio = document.createElement('audio');
                audio.src = track.source;
                audio.onloadedmetadata = () => {
                    setMusicTracks((prev) => {
                        const updated = [...prev];
                        updated[i].duration = audio.duration;
                        return updated;
                    });
                };
            }
        });
    }, [clips, musicTracks]);

    const totalDuration = useMemo(() => {
        return clips.reduce((sum, c) => sum + (c.duration || 0), 0) || globalDuration;
    }, [clips, globalDuration]);

    // clip switching
    useEffect(() => {
        if (videoRef.current && clips[activeClipIndex]) {
            videoRef.current.src = clips[activeClipIndex].source;
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
        }
    }, [activeClipIndex, clips]);

    // sync video + music
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onTimeUpdate = () => {
            const elapsedBefore = clips
                .slice(0, activeClipIndex)
                .reduce((sum, c) => sum + (c.duration || 0), 0);
            const globalTime = elapsedBefore + video.currentTime;
            setCurrentTime(globalTime);

            musicTracks.forEach((track, i) => {
                const audio = audioRefs.current[i];
                if (!audio) return;
                if (globalTime >= track.startTime && globalTime <= track.startTime + track.duration) {
                    const relativeTime = globalTime - track.startTime;
                    if (Math.abs(audio.currentTime - relativeTime) > 0.2) {
                        audio.currentTime = relativeTime;
                    }
                    if (video.paused) {
                        audio.pause();
                    } else {
                        audio.play().catch(() => {});
                    }
                } else {
                    audio.pause();
                    audio.currentTime = 0;
                }
            });
        };

        const onEnded = () => {
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

        let acc = 0;
        let newIndex = 0;
        for (let i = 0; i < clips.length; i++) {
            if (newGlobalTime < acc + clips[i].duration) {
                newIndex = i;
                break;
            }
            acc += clips[i].duration;
        }

        setActiveClipIndex(newIndex);
        if (videoRef.current) {
            videoRef.current.src = clips[newIndex].source;
            videoRef.current.currentTime = newGlobalTime - acc;
            videoRef.current.play().catch(() => {});
        }

        musicTracks.forEach((track, i) => {
            const audio = audioRefs.current[i];
            if (!audio) return;
            if (newGlobalTime >= track.startTime && newGlobalTime <= track.startTime + track.duration) {
                audio.currentTime = newGlobalTime - track.startTime;
                if (!videoRef.current.paused) audio.play().catch(() => {});
            } else {
                audio.pause();
                audio.currentTime = 0;
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
                                                setSelectedClipIndex(
                                                    isSelected ? null : index
                                                );
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
                                                setSelectedMusicIndex(
                                                    isSelected ? null : index
                                                );
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
