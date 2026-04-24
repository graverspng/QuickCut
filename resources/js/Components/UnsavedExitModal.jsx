export default function UnsavedExitModal({ onSaveExit, onKeepEditing }) {
    return (
        <div className="uem-backdrop">
            <div className="uem-card">
                <span className="uem-icon">💾</span>
                <h3 className="uem-title">Unsaved changes</h3>
                <p className="uem-body">
                    You have unsaved changes that will be lost if you leave now.
                </p>
                <div className="uem-actions">
                    <button className="uem-btn uem-btn--back" onClick={onKeepEditing}>
                        ← Keep editing
                    </button>
                    <button className="uem-btn uem-btn--save" onClick={onSaveExit}>
                        Save &amp; Exit
                    </button>
                </div>
            </div>
        </div>
    );
}
