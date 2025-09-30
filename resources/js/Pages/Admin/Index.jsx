import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, usePage, router } from '@inertiajs/react';
import { useMemo, useState } from 'react';

export default function Index() {
  const { auth, reports } = usePage().props;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalText, setModalText] = useState('');
  const [selected, setSelected] = useState(new Set());

  const openModal = (text) => {
    setModalText(text || '');
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);

  const hasReports = useMemo(() => reports?.data?.length > 0, [reports]);

  const perPage = reports?.per_page ?? reports?.meta?.per_page ?? 10;
  const total = reports?.total ?? reports?.meta?.total ?? 0;
  const showPager = total > perPage;

  const findLink = (label) =>
    reports?.links?.find((l) => String(l.label).toLowerCase().includes(label))?.url;

  const prevUrl = reports?.prev_page_url ?? findLink('previous') ?? null;
  const nextUrl = reports?.next_page_url ?? findLink('next') ?? null;

  const currentIds = useMemo(() => (reports?.data ?? []).map((r) => r.id), [reports]);
  const allOnPageSelected = useMemo(
    () => currentIds.length > 0 && currentIds.every((id) => selected.has(id)),
    [currentIds, selected]
  );
  const anySelected = selected.size > 0;

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        currentIds.forEach((id) => next.delete(id));
      } else {
        currentIds.forEach((id) => next.add(id));
      }
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

  return (
    <AuthenticatedLayout user={auth.user}>
      <Head title="Admin Panel" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-semibold" style={{ color: '#2BA84A' }}>
          Admin Panel
        </h1>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[#FCFFFC]">User Reports</h3>

            <button
              type="button"
              onClick={bulkDelete}
              disabled={!anySelected}
              className={[
                'rounded-md px-4 py-2 text-sm font-medium border',
                anySelected
                  ? 'bg-red-500 border-red-500 text-black hover:opacity-90'
                  : 'bg-transparent border-gray-800 text-gray-500 cursor-not-allowed opacity-60',
              ].join(' ')}
              title={anySelected ? 'Delete selected' : 'Select reports to delete'}
            >
              Delete selected
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-700 bg-[#121212] shadow">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-[#0d0d0d]">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      aria-label="Select all on page"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Reporter</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Issue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Created</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-800">
                {hasReports ? (
                  reports.data.map((r) => {
                    const reporter = r.user?.name ?? 'Unknown';
                    const email = r.user?.email ?? '—';
                    const isChecked = selected.has(r.id);

                    return (
                      <tr key={r.id} className="hover:bg-[#181818] align-top">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOne(r.id)}
                            aria-label={`Select report ${r.id}`}
                          />
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-300">{r.id}</td>
                        <td className="px-4 py-3 text-sm text-gray-200">{reporter}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{email}</td>

                        {/* Compact, single-line preview with ellipsis; click to open modal */}
                        <td className="px-4 py-3 text-sm">
                          <div
                            className="max-w-[36ch] whitespace-nowrap overflow-hidden text-ellipsis break-words cursor-pointer text-gray-300 transition-colors hover:text-[#2BA84A]"
                            title="Click to view full issue"
                            onClick={() => openModal(r.issue)}
                            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                          >
                            {r.issue || '—'}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-400">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="px-4 py-6 text-center text-sm text-gray-400">
                      No reports found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {showPager && (
            <div className="mt-4 flex items-center gap-3">
              <Link
                href={prevUrl || '#'}
                preserveScroll
                className={[
                  'px-3 py-1.5 rounded-md border text-sm',
                  prevUrl
                    ? 'bg-transparent border-gray-700 text-gray-300 hover:border-gray-500'
                    : 'bg-transparent border-gray-800 text-gray-500 cursor-not-allowed opacity-60',
                ].join(' ')}
              >
                Previous
              </Link>

              <Link
                href={nextUrl || '#'}
                preserveScroll
                className={[
                  'px-3 py-1.5 rounded-md border text-sm',
                  nextUrl
                    ? 'bg-[#2BA84A] border-[#2BA84A] text-black hover:opacity-90'
                    : 'bg-transparent border-gray-800 text-gray-500 cursor-not-allowed opacity-60',
                ].join(' ')}
              >
                Next
              </Link>

              <div className="ml-auto text-xs text-gray-400">
                Page {(reports?.current_page ?? reports?.meta?.current_page ?? 1)} of {(reports?.last_page ?? reports?.meta?.last_page ?? 1)}
              </div>
            </div>
          )}
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-gray-700 bg-[#121212] p-6 shadow-2xl">
            <div className="mb-4 text-lg font-semibold text-[#FCFFFC]">Full Issue</div>
            <div
              className="max-h-[80vh] min-h-[30vh] overflow-y-auto whitespace-pre-wrap text-sm text-gray-200"
              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            >
              {modalText}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md bg-[#2BA84A] px-4 py-2 text-sm font-medium text-black hover:opacity-90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthenticatedLayout>
  );
}
