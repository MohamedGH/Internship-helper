import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { AppError } from '../types/domain';
import { getSeverityLabel } from '../managers/errorManager';

interface ErrorBannerProps {
  readonly errors: readonly AppError[];
  readonly onDismiss: (id: string) => void;
  readonly onRetry?: (error: AppError) => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  errors,
  onDismiss,
  onRetry,
}) => {
  if (errors.length === 0) {
    return null;
  }

  return (
    <section
      aria-live="polite"
      aria-label="Application notifications and errors"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 space-y-2"
    >
      {errors.map((err) => (
        <div
          key={err.id}
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50/80 text-slate-900"
        >
          <div className="flex items-start gap-3 min-w-0">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-red-700 font-semibold">
                <span>{getSeverityLabel(err.severity)}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{err.code}</span>
              </div>
              <p className="text-sm font-medium text-slate-900 mt-0.5">{err.message}</p>
              {err.detail && (
                <p className="text-xs text-slate-600 mt-0.5 break-words">{err.detail}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {err.retryable && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(err)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(err.id)}
              aria-label={`Dismiss error: ${err.message}`}
              className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] text-slate-500 hover:text-slate-900 rounded-lg hover:bg-red-100/60 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </section>
  );
};
