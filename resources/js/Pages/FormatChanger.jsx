import { useEffect, useMemo, useState } from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import '@/../css/formatchanger.css';

const formatOptions = {
  video: [
    { value: 'mp4', label: 'MP4 (H.264)' },
    { value: 'mov', label: 'MOV (Apple QuickTime)' },
    { value: 'webm', label: 'WEBM (Web Ready)' },
    { value: 'gif', label: 'GIF (Animated)' }
  ],
  audio: [
    { value: 'mp3', label: 'MP3 (Compressed)' },
    { value: 'wav', label: 'WAV (Lossless)' },
    { value: 'aac', label: 'AAC (Apple)' },
    { value: 'flac', label: 'FLAC (Hi-Res)' }
  ],
  image: [
    { value: 'jpg', label: 'JPG (Compressed)' },
    { value: 'png', label: 'PNG (Transparent)' },
    { value: 'webp', label: 'WEBP (Modern Web)' },
    { value: 'tiff', label: 'TIFF (Lossless)' }
  ]
};

export default function FormatChanger() {
  const [category, setCategory] = useState(null);
  const [targetFormat, setTargetFormat] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);

  const MAX_MB = 500;

  const availableFormats = useMemo(() => (category ? formatOptions[category] : []), [category]);

  const detectCategory = (file) => {
    if (!file) return null;
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.startsWith('image/')) return 'image';
    return null;
  };

  const clearFile = () => {
    setSelectedFile(null);
    setCategory(null);
    setTargetFormat('');
    setPreviewUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return null;
    });
    setError('');
    setProgress(0);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_MB}MB limit`);
      return;
    }
    const detected = detectCategory(file);
    if (!detected) {
      setError('Unsupported file type');
      return;
    }
    setCategory(detected);
    setTargetFormat(formatOptions[detected][0].value);
    setSelectedFile(file);
    setPreviewUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return URL.createObjectURL(file);
    });
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    handleFileSelect(file);
  };

  const handleConvert = (e) => {
    e.preventDefault();
    if (!selectedFile || !targetFormat || loading || error) return;
    setLoading(true);
    setProgress(0);
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(99, Math.round((elapsed / 1800) * 100));
      setProgress(pct);
      if (pct < 99) {
        req = requestAnimationFrame(tick);
      }
    };
    let req = requestAnimationFrame(tick);
    setTimeout(() => {
      cancelAnimationFrame(req);
      setProgress(100);
      const originalName = selectedFile.name;
      const convertedName = originalName.includes('.')
        ? `${originalName.split('.').slice(0, -1).join('.')}.${targetFormat}`
        : `${originalName}.${targetFormat}`;
      const blob = new Blob([`Converted content of ${originalName}`], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      setHistory((prev) => [
        { id: Date.now(), original: originalName, converted: convertedName, format: targetFormat, category, url },
        ...prev
      ].slice(0, 5));
      setToastMsg('Conversion complete');
      clearFile();
      setLoading(false);
    }, 2000);
  };

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const fileSizeMB = selectedFile ? (selectedFile.size / 1024 / 1024).toFixed(2) : null;

  return (
    <AuthenticatedLayout>
      <Head title="Convert Media" />
      {loading && (
        <div className="loader-overlay" aria-live="polite">
          <div className="loader" />
        </div>
      )}
      <div className="formatchanger-page">
        <div className="formatchanger-wrapper">
          <div className="formatchanger-title fade-in-up">
            <div className="fc-title-wrap">
              <span className="fc-title-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M6 4h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="rgba(255,255,255,0.2)"/></svg>
              </span>
              <h2>Convert Your Media</h2>
            </div>
            <p>Drop your file, QuickCut will auto-detect the type and let you choose an output format.</p>
          </div>
          <div className="fc-divider" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="fc-card">
              <form onSubmit={handleConvert} className="space-y-6" noValidate>
                <div
                  className={`fc-upload ${isDragging ? 'drag-active' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
                  }}
                  aria-describedby="upload-hint"
                >
                  <div className="fc-upload-inner">
                    <div className="fc-upload-icon" aria-hidden="true">
                      <svg width="28" height="28" viewBox="0 0 24 24"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="url(#gup)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/><defs><linearGradient id="gup" x1="0" y1="0" x2="24" y2="0"><stop stopColor="#248232"/><stop offset="1" stopColor="#2BA84A"/></linearGradient></defs></svg>
                    </div>
                    <input
                      id="format-changer-input"
                      type="file"
                      onChange={handleInputChange}
                      className="hidden"
                      accept="video/*,audio/*,image/*"
                    />
                    <label htmlFor="format-changer-input" className="fc-browse">Click to choose a file</label>
                    <p id="upload-hint" className="fc-upload-sub">or drag & drop it here</p>
                    {selectedFile ? (
                      <div className="fc-selected">
                        <div className="fc-selected-row">
                          <div className="fc-badge">{category}</div>
                          <button type="button" className="fc-clear-btn" onClick={clearFile}>Clear</button>
                        </div>
                        <p className="fc-file-name">{selectedFile.name}</p>
                        <div className="fc-meta-grid">
                          <span>{fileSizeMB} MB</span>
                          <span>{selectedFile.type || 'Unknown type'}</span>
                        </div>
                        {previewUrl && category === 'image' && (
                          <div className="fc-preview">
                            <img src={previewUrl} alt="" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="fc-empty-hint">No file selected yet.</p>
                    )}
                    {!!error && <p className="fc-error">{error}</p>}
                  </div>
                </div>
                {category && (
                  <div>
                    <label className="fc-label">
                      <span>Target format</span>
                      <select
                        value={targetFormat}
                        onChange={(e) => setTargetFormat(e.target.value)}
                        className="fc-input"
                      >
                        {availableFormats.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {loading && (
                  <div className="fc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-live="polite">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                )}
                <div className="fc-actions">
                  <p className="fc-tip">Tip: keep video exports under 500MB.</p>
                  <button type="submit" className="fc-button" disabled={!selectedFile || !targetFormat || !!error || loading} aria-disabled={!selectedFile || !targetFormat || !!error || loading}>
                    {loading ? 'Converting…' : 'Convert file'}
                  </button>
                </div>
              </form>
            </div>
            <div className="fc-card">
              <h3 className="fc-card-title">Recent Conversions</h3>
              <ul className="fc-history mt-4 space-y-3 text-sm">
                {history.length === 0 && <li className="fc-history-empty">No conversions yet.</li>}
                {history.map((item) => (
                  <li key={item.id} className="fc-history-item">
                    <div className="fc-history-main">
                      <p className="fc-history-name">{item.converted}</p>
                      <p className="fc-history-sub">from {item.original} · {item.category.toUpperCase()} → {item.format.toUpperCase()}</p>
                    </div>
                    <a href={item.url} download={item.converted} className="fc-button fc-button-small">Download</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      {toastMsg && (
        <div className="fc-toast" role="status" aria-live="polite">
          <span className="fc-dot" aria-hidden="true" />
          <span>{toastMsg}</span>
        </div>
      )}
    </AuthenticatedLayout>
  );
}
