import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Confirmation for an action that cannot be undone.
 *
 * Cancel takes focus on open, not Confirm: the dialog exists because the action
 * is destructive, so a stray Enter should dismiss it rather than carry it out.
 */
const ConfirmDialog = ({
  title,
  message,
  detail,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[3500] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="card w-full max-w-[420px] animate-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 id="confirm-title" className="mb-1">{title}</h3>
            <p className="text-sm text-secondary break-words">{message}</p>
            {detail && <p className="text-xs text-secondary/70 mt-2">{detail}</p>}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border border-border-strong text-xs font-semibold text-secondary hover:text-primary hover:border-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
