import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, usePage, router } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import '@/../css/admin.css';

export default function Index() {
  const { auth, reports } = usePage().props;

  const [modalOpen,    setModalOpen]    = useState(false);
  const [modalReport,  setModalReport]  = useState(null);
  const [selected,     setSelected]     = useState(new Set());

  const openModal  = (r)  => { setModalReport(r); setModalOpen(true); };
  const closeModal = ()   => setModalOpen(false);

  const hasReports = useMemo(() => reports?.data?.length > 0, [reports]);

  const perPage   = reports?.per_page ?? reports?.meta?.per_page ?? 10;
  const total     = reports?.total    ?? reports?.meta?.total    ?? 0;
  const curPage   = reports?.current_page ?? reports?.meta?.current_page ?? 1;
  const lastPage  = reports?.last_page    ?? reports?.meta?.last_page    ?? 1;
  const showPager = total > perPage;

  const findLink = (label) =>
    reports?.links?.find((l) => String(l.label).toLowerCase().includes(label))?.url;

  const prevUrl = reports?.prev_page_url ?? findLink('previous') ?? null;
  const nextUrl = reports?.next_page_url ?? findLink('next')     ?? null;

  const currentIds        = useMemo(() => (reports?.data ?? []).map((r) => r.id), [reports]);
  const allOnPageSelected = useMemo(
    () => currentIds.length > 0 && currentIds.every((id) => selected.has(id)),
    [currentIds, selected]
  );
  const anySelected = selected.size > 0;

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) currentIds.forEach((id) => next.delete(id));
      else currentIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const bulkDelete = () => {
    if (!anySelected) return;
    if (!window.confirm('Delete selected report(s)? This cannot be undone.')) return;
    router.delete(route('admin.reports.bulkDelete'), {
      data: { ids: Array.from(selected) },
      preserveScroll: true,
      onSuccess: () => setSelected(new Set()),
    });
  };

  const fmtDate = (str) => new Date(str).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <AuthenticatedLayout user={auth.user}>
      <Head title="Admin Panel" />

      <div className="adm-page">
        <div className="adm-wrapper">

          {/* Hero */}
          <div className="adm-hero">
            <div className="adm-eyebrow">
              <span className="adm-eyebrow-dot" aria-hidden="true" />
              QuickCut Admin
            </div>
            <h1 className="adm-hero-title">Admin Panel</h1>
            <p className="adm-hero-sub">Review and manage user-submitted reports.</p>
          </div>

          {/* Stat chips */}
          <div className="adm-stats">
            <div className="adm-stat">
              <div className="adm-stat-val">{total}</div>
              <div className="adm-stat-label">Total reports</div>
            </div>
            <div className="adm-stat">
              <div className="adm-stat-val">{curPage}/{lastPage}</div>
              <div className="adm-stat-label">Page</div>
            </div>
            {anySelected && (
              <div className="adm-stat">
                <div className="adm-stat-val" style={{ color: '#f87171' }}>{selected.size}</div>
                <div className="adm-stat-label">Selected</div>
              </div>
            )}
          </div>

          {/* Section */}
          <div className="adm-section-head">
            <span className="adm-section-title">User Reports</span>
            <button
              type="button"
              onClick={bulkDelete}
              disabled={!anySelected}
              className="adm-del-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Delete selected
            </button>
          </div>

          <div className="adm-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        className="adm-check"
                        checked={allOnPageSelected}
                        onChange={toggleAllOnPage}
                        aria-label="Select all on page"
                      />
                    </th>
                    <th>ID</th>
                    <th>Reporter</th>
                    <th>Email</th>
                    <th>Project</th>
                    <th>Issue</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {hasReports ? (
                    reports.data.map((r) => (
                      <tr key={r.id} className={selected.has(r.id) ? 'adm-row--selected' : ''}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            className="adm-check"
                            checked={selected.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                            aria-label={`Select report ${r.id}`}
                          />
                        </td>
                        <td className="adm-td-id">#{r.id}</td>
                        <td className="adm-td-name">{r.user?.name ?? 'Unknown'}</td>
                        <td className="adm-td-email">{r.user?.email ?? '—'}</td>
                        <td className="adm-td-project">{r.project ?? '—'}</td>
                        <td>
                          <div
                            className="adm-td-issue"
                            title="Click to read full report"
                            onClick={() => openModal(r)}
                          >
                            {r.issue || '—'}
                          </div>
                        </td>
                        <td className="adm-td-date">{fmtDate(r.created_at)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7">
                        <div className="adm-empty">
                          <span className="adm-empty-icon">📭</span>
                          No reports found.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {showPager && (
            <div className="adm-pager">
              <Link
                href={prevUrl || '#'}
                preserveScroll
                className={`adm-pager-btn${!prevUrl ? ' adm-pager-btn--off' : ''}`}
              >
                ← Previous
              </Link>
              <Link
                href={nextUrl || '#'}
                preserveScroll
                className={`adm-pager-btn${!nextUrl ? ' adm-pager-btn--off' : ''}`}
              >
                Next →
              </Link>
              <div className="adm-pager-info">
                Page {curPage} of {lastPage} &nbsp;·&nbsp; {total} total
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="adm-modal-bg"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="adm-modal">
            <div className="adm-modal-title">
              {modalReport?.user?.name ?? 'Unknown'} &mdash; Full Report
            </div>
            {modalReport?.project && (
              <div className="adm-modal-project">📌 {modalReport.project}</div>
            )}
            <div className="adm-modal-divider" />
            <div className="adm-modal-body">
              {modalReport?.issue || '—'}
            </div>
            <div className="adm-modal-foot">
              <button type="button" className="adm-modal-close" onClick={closeModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthenticatedLayout>
  );
}
