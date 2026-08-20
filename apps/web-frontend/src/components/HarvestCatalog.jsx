import React, { useCallback, useEffect, useState } from 'react';
import {
  Layers, Search, CheckSquare, Square, Play, RefreshCw,
  AlertCircle, CheckCircle, Clock, Archive, FileText, Sparkles, Filter,
} from 'lucide-react';
import { ADMIN_API_BASE_URL } from '../config';

export default function HarvestCatalog({ getIdToken, onHarvestQueued }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCodes, setSelectedCodes] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);

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

  const toggleSelect = (code) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
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
        body: JSON.stringify({ archives: Array.from(selectedCodes) }),
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
    <div className="bg-card border border-border rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-primary">Dutch Archival Catalog & Harvester Queue</h2>
        </div>
        <button
          type="button"
          onClick={fetchCatalog}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-border text-secondary hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Reload Catalog
        </button>
      </div>

      <p className="text-xs text-secondary mb-6 leading-relaxed">
        Browse all 83 regional Dutch archives (~375 bulk export datasets). Queue archives for background ingestion into Meilisearch without starting them immediately.
      </p>

      {/* Summary Cards */}
      {catalog?.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-muted/40 border border-border/60 rounded-md p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Total Archives</div>
            <div className="font-serif text-xl font-semibold text-primary">{catalog.summary.total_archives} archives</div>
            <div className="text-[11px] text-secondary mt-0.5">{catalog.summary.total_export_files} export files</div>
          </div>
          <div className="bg-muted/40 border border-border/60 rounded-md p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Indexed In Engine</div>
            <div className="font-serif text-xl font-semibold text-green-600">{catalog.summary.indexed_archives} archives</div>
            <div className="text-[11px] text-secondary mt-0.5">Sub-10ms searchable</div>
          </div>
          <div className="bg-muted/40 border border-border/60 rounded-md p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Awaiting Ingest</div>
            <div className="font-serif text-xl font-semibold text-amber-500">
              {catalog.summary.total_archives - catalog.summary.indexed_archives} archives
            </div>
            <div className="text-[11px] text-secondary mt-0.5">Ready to queue</div>
          </div>
        </div>
      )}

      {/* Submission Feedback */}
      {submitMessage && (
        <div
          className={`flex items-start gap-2.5 p-3 rounded-md mb-5 text-xs ${
            submitMessage.type === 'success'
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
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                statusFilter === st
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
            const isSelected = selectedCodes.has(archive.code);
            return (
              <div
                key={archive.code}
                onClick={() => toggleSelect(archive.code)}
                className={`flex items-start justify-between gap-3 p-3 rounded-md border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-accent/5 border-accent/40 shadow-xs'
                    : 'bg-muted/20 border-border/60 hover:bg-muted/40'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    tabIndex={-1}
                    className="mt-0.5 text-secondary hover:text-accent focus:outline-none"
                  >
                    {isSelected ? (
                      <CheckSquare size={16} className="text-accent fill-accent/20" />
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20">
                          <CheckCircle size={10} />
                          Indexed ({archive.indexed_records.toLocaleString()} recs)
                        </span>
                      ) : archive.status === 'queued' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <Clock size={10} />
                          Queued in plan
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary/10 text-secondary">
                          Available for Harvest
                        </span>
                      )}
                    </div>

                    {/* Kinds */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[11px] text-secondary">Types:</span>
                      {archive.kinds.map((k) => (
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

                <div className="text-right text-[11px] text-secondary shrink-0">
                  {archive.files.length} {archive.files.length === 1 ? 'export file' : 'export files'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action / Queuing Bar */}
      {selectedCodes.size > 0 && (
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-4 flex-wrap bg-card">
          <div className="text-xs text-primary font-medium flex items-center gap-2">
            <Sparkles size={14} className="text-accent" />
            <span>Selected {selectedCodes.size} archive datasets for queue</span>
          </div>

          <button
            type="button"
            onClick={handleQueueHarvest}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent text-accent-foreground font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Play size={13} className="fill-current" />
            )}
            {submitting ? 'Queueing...' : `Queue Ingestion for ${selectedCodes.size} Archives`}
          </button>
        </div>
      )}
    </div>
  );
}
