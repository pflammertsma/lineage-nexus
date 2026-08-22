import React, { useCallback, useEffect, useState } from 'react';
import {
  Layers, Search, CheckSquare, Square, MinusSquare, Play, RefreshCw,
  AlertCircle, CheckCircle, Clock, Archive, FileText, Sparkles, Filter,
  ChevronRight, ChevronDown,
} from 'lucide-react';
import { ADMIN_API_BASE_URL, ADMIN_HARVEST_STATUS_FILTER_STORAGE, getKindLabel } from '../config';
import Button from './Button';

// A file that has never been harvested, or was harvested before provenance
// tracking existed, carries no manifest entry — shown the same way rather
// than as an error, since it is the expected state for most of the catalog.
function formatHarvestedAt(isoString) {
  if (!isoString) return null;
  try {
    return new Date(isoString).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export default function HarvestCatalog({ getIdToken, onHarvestQueued }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_HARVEST_STATUS_FILTER_STORAGE) || 'all';
    } catch {
      return 'all';
    }
  });
  // Entries are either a whole archive code ("bhi") or a single export label
  // ("bhi.dtb_d"). A code and its own file labels are kept mutually exclusive
  // per archive so a selection always means one unambiguous thing.
  const [selectedCodes, setSelectedCodes] = useState(new Set());
  const [expandedCodes, setExpandedCodes] = useState(new Set());
  // Off by default: delta mode is what the harvester runs unless told
  // otherwise, since re-submitting records already in the index is the
  // expensive case, not the safe one.
  const [fullHarvest, setFullHarvest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);

  const handleStatusFilterChange = (st) => {
    setStatusFilter(st);
    try {
      localStorage.setItem(ADMIN_HARVEST_STATUS_FILTER_STORAGE, st);
    } catch {
      // Ignore storage error
    }
  };

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError('Authentication token missing. Please sign in again.');
        setLoading(false);
        return;
      }
      const res = await fetch(`${ADMIN_API_BASE_URL}/api/v1/admin/harvest/exports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load catalog (${res.status})`);
      }
      const data = await res.json();
      if (data.status === 'success') {
        setCatalog(data);
      } else {
        setError(data.error_message || 'Could not fetch catalog');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // Selecting the archive as a whole clears any of its individual files, and
  // vice versa, so a selection never means two things at once.
  const toggleArchive = (archive) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(archive.code)) {
        next.delete(archive.code);
      } else {
        next.add(archive.code);
        (archive.files || []).forEach((f) => next.delete(f.label));
      }
      return next;
    });
  };

  const toggleFile = (label, code) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
        next.delete(code);
      }
      return next;
    });
  };

  const toggleExpand = (code) => {
    setExpandedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const filteredArchives = (catalog?.archives || []).filter((item) => {
    const matchesSearch =
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.kinds.some((k) => k.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'indexed' && item.indexed_records > 0) ||
      (statusFilter === 'available' && item.indexed_records === 0 && item.status !== 'queued') ||
      (statusFilter === 'queued' && item.status === 'queued');

    return matchesSearch && matchesStatus;
  });

  const selectAllFiltered = () => {
    const next = new Set(selectedCodes);
    filteredArchives.forEach((a) => next.add(a.code));
    setSelectedCodes(next);
  };

  const clearSelection = () => {
    setSelectedCodes(new Set());
  };

  const handleQueueHarvest = async () => {
    if (selectedCodes.size === 0) return;
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`${ADMIN_API_BASE_URL}/api/v1/admin/harvest/queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ archives: Array.from(selectedCodes), delta: !fullHarvest }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSubmitMessage({ type: 'success', text: data.message });
        setSelectedCodes(new Set());
        fetchCatalog();
        if (onHarvestQueued) onHarvestQueued();
      } else {
        setSubmitMessage({ type: 'error', text: data.error_message || 'Failed to queue harvest' });
      }
    } catch (err) {
      setSubmitMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="admin-card-header mb-0">
          <Layers size={14} className="text-secondary shrink-0" />
          <span className="admin-card-title">
            Dutch Archival Catalog & Harvester Queue
          </span>
        </div>
        <Button
          onClick={fetchCatalog}
          loading={loading}
          icon={RefreshCw}
          className="py-1.5 px-3"
        >
          Reload Catalog
        </Button>
      </div>

      <p className="text-xs text-secondary mb-6 leading-relaxed">
        Browse all 83 regional Dutch archives (~375 bulk export datasets). Queue archives for background ingestion into Meilisearch without starting them immediately.
      </p>

      {/* Summary Cards */}
      {catalog?.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="admin-summary-box">
            <div className="admin-summary-label">Total Archives</div>
            <div className="admin-summary-value text-primary">{catalog.summary.total_archives} archives</div>
            <div className="admin-summary-subtext">{catalog.summary.total_export_files} export files</div>
          </div>
          <div className="admin-summary-box">
            <div className="admin-summary-label">Indexed In Engine</div>
            <div className="admin-summary-value text-green-600">{catalog.summary.indexed_archives} archives</div>
            <div className="admin-summary-subtext">Sub-10ms searchable</div>
          </div>
          <div className="admin-summary-box">
            <div className="admin-summary-label">Awaiting Ingest</div>
            <div className="admin-summary-value text-amber-500">
              {catalog.summary.total_archives - catalog.summary.indexed_archives} archives
            </div>
            <div className="admin-summary-subtext">Ready to queue</div>
          </div>
        </div>
      )}

      {/* Submission Feedback */}
      {submitMessage && (
        <div
          className={`flex items-start gap-2.5 p-3 rounded-md mb-5 text-xs ${submitMessage.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400'
            }`}
        >
          {submitMessage.type === 'success' ? (
            <CheckCircle size={14} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
          )}
          <span>{submitMessage.text}</span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search archive name, code (e.g. utr, zld), or type (bsg, not)..."
            className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-1.5 text-xs text-primary placeholder:text-secondary focus:outline-none focus:border-accent"
          />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-md text-xs self-start sm:self-auto">
          {['all', 'indexed', 'available', 'queued'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => handleStatusFilterChange(st)}
              className={`admin-pill-filter ${statusFilter === st
                  ? 'bg-card text-primary shadow-xs'
                  : 'text-secondary hover:text-primary'
                }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Selection Actions */}
      <div className="flex items-center justify-between gap-2 mb-3 text-xs text-secondary">
        <div>
          Showing <span className="font-semibold text-primary">{filteredArchives.length}</span> of{' '}
          {catalog?.archives?.length || 0} archives
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={selectAllFiltered}
            className="hover:text-primary transition-colors cursor-pointer"
          >
            Select All Filtered
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={clearSelection}
            className="hover:text-primary transition-colors cursor-pointer"
          >
            Clear Selection
          </button>
        </div>
      </div>

      {/* Catalog Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs text-secondary flex items-center justify-center gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Fetching archive export catalog...
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-500">
          {error}
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {filteredArchives.map((archive) => {
            const files = archive.files || [];
            const selectedFileCount = files.filter((f) => selectedCodes.has(f.label)).length;
            const isWholeSelected = selectedCodes.has(archive.code);
            const isPartialSelected = !isWholeSelected && selectedFileCount > 0;
            const isExpanded = expandedCodes.has(archive.code);
            return (
              <div
                key={archive.code}
                className={`admin-list-item flex-col items-stretch gap-0 ${isWholeSelected || isPartialSelected ? 'admin-list-item-selected' : 'admin-list-item-default'
                  }`}
              >
                <div
                  onClick={() => toggleArchive(archive)}
                  className="flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      tabIndex={-1}
                      className="mt-0.5 text-secondary hover:text-accent focus:outline-none"
                    >
                      {isWholeSelected ? (
                        <CheckSquare size={16} className="text-accent fill-accent/20" />
                      ) : isPartialSelected ? (
                        <MinusSquare size={16} className="text-accent" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-primary">{archive.name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-secondary uppercase font-bold">
                          {archive.code}
                        </span>

                        {/* Status Badges */}
                        {archive.indexed_records > 0 ? (
                          <span className="admin-badge-success">
                            <CheckCircle size={10} />
                            Indexed ({archive.indexed_records.toLocaleString()} recs)
                          </span>
                        ) : archive.status === 'queued' ? (
                          <span className="admin-badge-warning">
                            <Clock size={10} />
                            Queued
                          </span>
                        ) : (
                          <span className="admin-badge-neutral">
                            Available
                          </span>
                        )}
                        {isPartialSelected && (
                          <span className="admin-badge-neutral">
                            {selectedFileCount} file{selectedFileCount === 1 ? '' : 's'} selected
                          </span>
                        )}
                      </div>

                      {/* Kinds */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[11px] text-secondary">Types:</span>
                        {(archive.kinds || []).map((k) => (
                          <span
                            key={k}
                            className="px-1.5 py-0.2 text-[10px] rounded bg-card border border-border text-secondary font-mono"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleExpand(archive.code); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface hover:bg-muted border border-border text-xs text-secondary hover:text-primary transition-colors cursor-pointer focus:outline-none shadow-2xs"
                      title="Select or view individual export files"
                    >
                      <span>{files.length} {files.length === 1 ? 'export file' : 'export files'}</span>
                      {isExpanded ? <ChevronDown size={16} className="text-accent shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
                    </button>
                  </div>
                </div>

                {/* Per-file selection */}
                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-border space-y-1">
                    {files.map((f) => {
                      const fileSelected = selectedCodes.has(f.label);
                      const harvestedAt = formatHarvestedAt(f.harvested_iso);
                      return (
                        <div
                          key={f.label}
                          onClick={() => toggleFile(f.label, archive.code)}
                          className="flex items-center justify-between gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted/60"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {fileSelected || isWholeSelected ? (
                              <CheckSquare size={13} className="text-accent fill-accent/20 shrink-0" />
                            ) : (
                              <Square size={13} className="text-secondary shrink-0" />
                            )}
                            <span className="text-[11px] font-mono text-primary">{f.label}</span>
                            <span className="text-[10px] text-secondary truncate">{getKindLabel(f.kind)}</span>
                          </div>
                          <div className="text-[10px] text-secondary shrink-0 flex items-center gap-1.5">
                            {harvestedAt ? (
                              <>
                                <span>{f.mode === 'delta' ? 'delta' : 'full'} harvest {harvestedAt}</span>
                                {f.complete === false && (
                                  <span className="admin-badge-warning">incomplete</span>
                                )}
                              </>
                            ) : (
                              <span>not yet harvested</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action / Queuing Bar */}
      {selectedCodes.size > 0 && (
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-4 flex-wrap bg-card">
          <div className="text-xs text-primary font-medium flex items-center gap-3">
            <span className="flex items-center gap-2">
              <Sparkles size={14} className="text-accent" />
              Selected {selectedCodes.size} dataset{selectedCodes.size === 1 ? '' : 's'} for queue
            </span>
            <label className="flex items-center gap-1.5 text-[11px] text-secondary font-normal cursor-pointer select-none">
              <input
                type="checkbox"
                checked={fullHarvest}
                onChange={(e) => setFullHarvest(e.target.checked)}
                className="accent-accent"
              />
              Full harvest (ignore previous progress)
            </label>
          </div>

          <button
            type="button"
            onClick={handleQueueHarvest}
            disabled={submitting}
            className="admin-btn-action"
          >
            {submitting ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Play size={13} className="fill-current" />
            )}
            {submitting ? 'Queueing...' : `Queue Ingestion for ${selectedCodes.size} Dataset${selectedCodes.size === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  );
}
