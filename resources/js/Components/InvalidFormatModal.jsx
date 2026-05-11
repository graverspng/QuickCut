export default function InvalidFormatModal({ onClose, onGoToFormatChanger }) {
    return (
        <div className="uem-backdrop">
            <div className="uem-card">
                <span className="uem-icon">⚠️</span>
                <h3 className="uem-title">Invalid file format</h3>
                <p className="uem-body">
                    This editor only accepts <strong style={{ color: '#FCFFFC' }}>MP4</strong> (video), <strong style={{ color: '#FCFFFC' }}>MP3</strong> (audio), and <strong style={{ color: '#FCFFFC' }}>PNG</strong> (image) files.
                    Use the Format Changer to convert your file first.
                </p>
                <div className="uem-actions">
                    <button className="uem-btn uem-btn--back" onClick={onClose}>
                        Close
                    </button>
                    <button className="uem-btn uem-btn--save" onClick={onGoToFormatChanger}>
                        Open Format Changer
                    </button>
                </div>
            </div>
        </div>
    );
}
