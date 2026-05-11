import { useEffect, useState, useRef } from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import '@/../css/formatchanger.css';

const MAX_MB = 500;

const AUDIO_EXTS = new Set(['mp3','wav','ogg','flac','aac','m4a','webm','opus','wma','aiff','alac']);
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','webm','flv','wmv','m4v','ts','3gp','mpeg','mpg']);
const IMAGE_EXTS = new Set(['jpg','jpeg','gif','bmp','webp','tiff','tif','avif','heic','svg']);

const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content ?? '';

const detectCategory = (file) => {
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.startsWith('image/')) return 'image';
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (VIDEO_EXTS.has(ext)) return 'video';
    if (AUDIO_EXTS.has(ext)) return 'audio';
    if (IMAGE_EXTS.has(ext)) return 'image';
    return null;
};

const targetLabel = (cat) => cat === 'video' ? 'MP4 (H.264 + AAC)' : cat === 'audio' ? 'MP3 (192k)' : 'PNG';
const targetExt   = (cat) => cat === 'video' ? 'mp4' : cat === 'audio' ? 'mp3' : 'png';

export default function FormatChanger() {
    const [selectedFile, setSelectedFile] = useState(null);
    const [category,     setCategory]     = useState(null);
    const [error,        setError]        = useState('');
    const [status,       setStatus]       = useState(null); // null | 'uploading' | 'converting' | 'done'
    const [uploadPct,    setUploadPct]    = useState(0);
    const [history,      setHistory]      = useState([]);
    const [isDragOver,   setIsDragOver]   = useState(false);
    const [toast,        setToast]        = useState('');
    const xhrRef = useRef(null);

    const isActive = status === 'uploading' || status === 'converting';

    const clearFile = () => {
        setSelectedFile(null);
        setCategory(null);
        setError('');
        setStatus(null);
        setUploadPct(0);
    };

    const handleFileSelect = (file) => {
        if (!file) return;
        setError('');
        setStatus(null);
        if (file.size > MAX_MB * 1024 * 1024) {
            setError(`File exceeds the ${MAX_MB} MB limit.`);
            return;
        }
        const cat = detectCategory(file);
        if (!cat) {
            setError('Unsupported file type. Please choose an audio or video file.');
            return;
        }
        setSelectedFile(file);
        setCategory(cat);
        setUploadPct(0);
    };

    const handleCancel = () => {
        xhrRef.current?.abort();
        setStatus(null);
        setUploadPct(0);
    };

    const handleConvert = (e) => {
        e.preventDefault();
        if (!selectedFile || !category || isActive) return;

        const cat         = category;
        const ext         = targetExt(cat);
        const base        = selectedFile.name.includes('.')
            ? selectedFile.name.split('.').slice(0, -1).join('.')
            : selectedFile.name;
        const downloadName = base + '.' + ext;

        const form = new FormData();
        form.append('file',   selectedFile);
        form.append('target', ext);

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.responseType = 'blob';

        xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
                setUploadPct(Math.round((ev.loaded / ev.total) * 100));
            }
        };

        xhr.upload.onload = () => {
            setUploadPct(100);
            setStatus('converting');
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                // Trigger browser download from the blob response
                const blobUrl = URL.createObjectURL(xhr.response);
                const a = document.createElement('a');
                a.href     = blobUrl;
                a.download = downloadName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

                setHistory(prev => [{
                    id:        Date.now(),
                    original:  selectedFile.name,
                    converted: downloadName,
                    category:  cat,
                    ext,
                }].concat(prev).slice(0, 8));

                setStatus('done');
                setToast('Conversion complete — download started');
            } else {
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const data = JSON.parse(reader.result);
                        setError(data.message || 'Conversion failed.');
                    } catch {
                        setError('Conversion failed. Please try again.');
                    }
                    setStatus(null);
                };
                reader.readAsText(xhr.response);
            }
        };

        xhr.onerror = () => {
            setError('Network error. Please check your connection and try again.');
            setStatus(null);
        };

        xhr.onabort = () => {
            setStatus(null);
        };

        xhr.open('POST', route('format.changer.convert'));
        xhr.setRequestHeader('X-CSRF-TOKEN',     csrf());
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        setError('');
        setStatus('uploading');
        setUploadPct(0);
        xhr.send(form);
    };

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(''), 3500);
        return () => clearTimeout(t);
    }, [toast]);

    const fileSizeMB = selectedFile ? (selectedFile.size / 1024 / 1024).toFixed(1) : null;

    return (
        <AuthenticatedLayout>
            <Head title="Convert Media" />
            <div className="formatchanger-page">
                <div className="formatchanger-wrapper">

                    <div className="formatchanger-title fade-in-up">
                        <div className="fc-title-wrap">
                            <span className="fc-title-icon" aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24">
                                    <path d="M6 4h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="rgba(255,255,255,0.2)"/>
                                </svg>
                            </span>
                            <h2>Convert Your Media</h2>
                        </div>
                        <p>Drop a file — QuickCut auto-detects the type and converts it to <strong>MP3</strong>, <strong>MP4</strong>, or <strong>PNG</strong>.</p>
                    </div>

                    <div className="fc-divider" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* ── Converter card ── */}
                        <div className="fc-card">
                            <form onSubmit={handleConvert} className="space-y-6" noValidate>

                                {/* Drop zone */}
                                <div
                                    className={`fc-upload${isDragOver ? ' drag-active' : ''}`}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                    onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDragOver(false);
                                        handleFileSelect(e.dataTransfer.files?.[0]);
                                    }}
                                >
                                    <div className="fc-upload-inner">
                                        <div className="fc-upload-icon" aria-hidden="true">
                                            <svg width="28" height="28" viewBox="0 0 24 24">
                                                <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="url(#gup)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                                <defs>
                                                    <linearGradient id="gup" x1="0" y1="0" x2="24" y2="0">
                                                        <stop stopColor="#248232"/>
                                                        <stop offset="1" stopColor="#2BA84A"/>
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                        </div>

                                        <input
                                            id="fc-file-input"
                                            type="file"
                                            accept="video/*,audio/*,image/*"
                                            className="hidden"
                                            disabled={isActive}
                                            onChange={(e) => handleFileSelect(e.target.files?.[0])}
                                        />
                                        <label
                                            htmlFor="fc-file-input"
                                            className={`fc-browse${isActive ? ' fc-browse--disabled' : ''}`}
                                        >
                                            Click to choose a file
                                        </label>
                                        <p className="fc-upload-sub">or drag &amp; drop · max {MAX_MB} MB</p>

                                        {selectedFile ? (
                                            <div className="fc-selected">
                                                <div className="fc-selected-row">
                                                    <div className="fc-badge">{category}</div>
                                                    <button
                                                        type="button"
                                                        className="fc-clear-btn"
                                                        onClick={clearFile}
                                                        disabled={isActive}
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                                <p className="fc-file-name">{selectedFile.name}</p>
                                                <div className="fc-meta-grid">
                                                    <span>{fileSizeMB} MB</span>
                                                    {category && (
                                                        <span className="fc-arrow-label">
                                                            → {targetLabel(category)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="fc-empty-hint">No file selected yet.</p>
                                        )}

                                        {error && <p className="fc-error">{error}</p>}
                                    </div>
                                </div>

                                {/* Progress */}
                                {isActive && (
                                    <div className="fc-progress-wrap">
                                        <div className="fc-progress-label">
                                            {status === 'uploading'
                                                ? `Uploading… ${uploadPct}%`
                                                : 'Converting with FFmpeg…'}
                                        </div>
                                        <div
                                            className={`fc-progress${status === 'converting' ? ' fc-progress--indeterminate' : ''}`}
                                            role="progressbar"
                                            aria-valuenow={uploadPct}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                        >
                                            <span style={{ width: status === 'converting' ? '100%' : `${uploadPct}%` }} />
                                        </div>
                                    </div>
                                )}

                                {status === 'done' && (
                                    <div className="fc-done-msg">✓ Download started</div>
                                )}

                                {/* Action row */}
                                <div className="fc-actions">
                                    <p className="fc-tip">Audio → MP3 · Video → MP4 · Image → PNG</p>
                                    {isActive ? (
                                        <button
                                            type="button"
                                            className="fc-button fc-button--cancel"
                                            onClick={handleCancel}
                                        >
                                            Cancel
                                        </button>
                                    ) : (
                                        <button
                                            type="submit"
                                            className="fc-button"
                                            disabled={!selectedFile || !!error}
                                        >
                                            Convert &amp; Download
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* ── History card ── */}
                        <div className="fc-card">
                            <h3 className="fc-card-title">Recent Conversions</h3>
                            <ul className="fc-history mt-4 space-y-3 text-sm">
                                {history.length === 0 && (
                                    <li className="fc-history-empty">No conversions this session.</li>
                                )}
                                {history.map((item) => (
                                    <li key={item.id} className="fc-history-item fc-history-item--log">
                                        <div className="fc-history-icon">
                                            {item.category === 'video' ? '🎬' : item.category === 'image' ? '🖼️' : '🎵'}
                                        </div>
                                        <div className="fc-history-main">
                                            <p className="fc-history-name">{item.converted}</p>
                                            <p className="fc-history-sub">from {item.original}</p>
                                        </div>
                                        <div className="fc-history-badge">{item.ext.toUpperCase()}</div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                    </div>
                </div>
            </div>

            {toast && (
                <div className="fc-toast" role="status" aria-live="polite">
                    <span className="fc-dot" aria-hidden="true" />
                    <span>{toast}</span>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
