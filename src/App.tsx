// Author: Zack Lu
import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Search } from 'lucide-react';

// =============================================================================
// CONFIG: The only setting you need to edit
// =============================================================================
const SEARCH_URL =
  'https://script.google.com/macros/s/AKfycbzCpdzhxnmb_4PzYijTFq5aDj5xjzG94xLeEKrN89hNlIii_5dUCAgMHq31_o5u_Tn_/exec';

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const SLOW_SEARCH_NOTICE_MS = 8 * 1000;

interface SearchResultItem {
  name: string;
  url: string;
  type: string;
  modified: string;
  folder: string;
}

interface SearchApiReply {
  status: 'success' | 'error';
  message?: string;
  total?: number;
  results?: SearchResultItem[];
  indexedFiles?: number;
  incomplete?: boolean;
}

interface SearchViewData {
  total: number;
  results: SearchResultItem[];
  indexedFiles?: number;
  incomplete: boolean;
}

interface RefreshViewData {
  indexedFiles: number;
  incomplete: boolean;
}

function mapFileTypeLabel(rawType: string): string {
  const type = (rawType || '').toLowerCase().trim();
  if (type === 'folder') return 'Folder';
  if (type === 'application/pdf') return 'PDF';
  if (type.startsWith('image/')) return 'Image';
  if (type.startsWith('video/')) return 'Video';
  if (type.includes('spreadsheet') || type.includes('excel')) return 'Sheet';
  if (type.includes('document') || type.includes('word')) return 'Doc';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'Slides';
  return 'File';
}

function getSafeExternalUrl(rawUrl: string): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  return null;
}

export default function App() {
  const isConfigMissing = !SEARCH_URL || SEARCH_URL.includes('PASTE_');

  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<RefreshViewData | null>(null);
  const [searchData, setSearchData] = useState<SearchViewData | null>(null);

  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  async function sendRequest(payload: { query: string; refresh: boolean }) {
    if (isConfigMissing) return;

    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setShowSlowNotice(false);
    setValidationMessage(null);
    setErrorMessage(null);
    setRefreshStatus(null);

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const slowTimerId = window.setTimeout(() => {
      if (requestIdRef.current === currentRequestId) {
        setShowSlowNotice(true);
      }
    }, SLOW_SEARCH_NOTICE_MS);

    try {
      const response = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (requestIdRef.current !== currentRequestId) return;

      const rawText = await response.text();

      if (requestIdRef.current !== currentRequestId) return;

      let parsed: SearchApiReply;
      try {
        parsed = JSON.parse(rawText) as SearchApiReply;
      } catch {
        if (!response.ok) {
          setErrorMessage(
            'Could not reach the search service. Check your internet and try again.'
          );
        } else {
          setErrorMessage('Unexpected reply from the search service.');
        }
        return;
      }

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (parsed.status !== 'success' && parsed.status !== 'error')
      ) {
        setErrorMessage('Unexpected reply from the search service.');
        return;
      }

      if (parsed.status === 'error') {
        const replyMsg =
          typeof parsed.message === 'string' && parsed.message.trim().length > 0
            ? parsed.message.trim()
            : 'Unexpected reply from the search service.';
        setErrorMessage(replyMsg);
        return;
      }

      if (payload.refresh) {
        setRefreshStatus({
          indexedFiles: typeof parsed.indexedFiles === 'number' ? parsed.indexedFiles : 0,
          incomplete: Boolean(parsed.incomplete),
        });
      } else {
        const results = Array.isArray(parsed.results) ? parsed.results : [];
        const total =
          typeof parsed.total === 'number' ? parsed.total : results.length;
        setSearchData({
          total,
          results,
          indexedFiles:
            typeof parsed.indexedFiles === 'number'
              ? parsed.indexedFiles
              : undefined,
          incomplete: Boolean(parsed.incomplete),
        });
      }
    } catch {
      if (requestIdRef.current !== currentRequestId) return;
      setErrorMessage(
        'Could not reach the search service. Check your internet and try again.'
      );
    } finally {
      window.clearTimeout(timeoutId);
      window.clearTimeout(slowTimerId);
      if (requestIdRef.current === currentRequestId) {
        setIsLoading(false);
        setShowSlowNotice(false);
      }
    }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isConfigMissing || isLoading) return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setValidationMessage('Type at least 2 characters.');
      setErrorMessage(null);
      setRefreshStatus(null);
      return;
    }

    void sendRequest({ query: trimmed, refresh: false });
  }

  function handleRefreshClick() {
    if (isConfigMissing || isLoading) return;
    void sendRequest({ query: '', refresh: true });
  }

  const controlsDisabled = isConfigMissing || isLoading;

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] flex flex-col liquid-app-shell">
      <div className="liquid-glass-bg" aria-hidden="true" />
      <main className="w-full max-w-[720px] mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-8 flex-1 flex flex-col">
        <header className="mb-6">
          <h1 className="text-[28px] sm:text-[32px] font-bold leading-tight tracking-[-0.01em] text-[#1d1d1f]">
            Product Data Sheet (PDS) Look-up
          </h1>
          <p className="mt-1.5 text-[15px] text-[#86868b] glass-text-secondary">
            Type part of a file name.
          </p>
        </header>

        <section
          aria-label="Search controls"
          className="bg-white rounded-[24px] p-4 sm:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-black/[0.06] glass-panel"
        >
          {isConfigMissing && (
            <p
              role="alert"
              className="mb-4 rounded-[16px] bg-[#ff3b30]/8 border border-[#ff3b30]/20 px-4 py-3 text-sm font-medium text-[#ff3b30] glass-notice-error-inline"
            >
              Search link is not set yet
            </p>
          )}

          <form onSubmit={handleSearchSubmit} noValidate>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b] glass-text-secondary"
                  aria-hidden="true"
                />
                <input
                  id="folder-search-input"
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (validationMessage) setValidationMessage(null);
                  }}
                  placeholder="File name..."
                  aria-label="File name"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="search"
                  className="w-full min-h-[44px] rounded-[12px] bg-[#f5f5f7] border border-black/[0.04] pl-10 pr-3.5 py-2.5 text-[16px] sm:text-[15px] text-[#1d1d1f] placeholder:text-[#86868b] outline-none transition-colors duration-150 focus:border-[#0071e3] focus:bg-white glass-input"
                />
              </div>

              <button
                type="submit"
                disabled={controlsDisabled}
                className="min-h-[44px] px-6 py-2.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none text-white text-[15px] font-medium shadow-[0_2px_8px_rgba(0,113,227,0.22)] transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3] glass-primary-btn"
              >
                Search
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={controlsDisabled}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-4 py-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#ebebf0] active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none border border-black/[0.08] text-[13px] font-medium text-[#1d1d1f] transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3] glass-pill"
            >
              <RefreshCw
                className={
                  isLoading
                    ? 'h-3.5 w-3.5 text-[#86868b] glass-text-secondary animate-spin'
                    : 'h-3.5 w-3.5 text-[#86868b] glass-text-secondary'
                }
                aria-hidden="true"
              />
              Refresh file list
            </button>

            {refreshStatus && !isLoading && (
              <p className="text-[13px] font-medium text-[#34c759]">
                File list updated:{' '}
                <span className="font-mono tabular-nums">
                  {refreshStatus.indexedFiles}
                </span>{' '}
                items
              </p>
            )}
          </div>

          {validationMessage && (
            <p className="mt-3 text-[14px] font-medium text-[#ff3b30]">
              {validationMessage}
            </p>
          )}
        </section>

        <section aria-live="polite" aria-label="Search results" className="mt-5 flex-1">
          {isLoading && (
            <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-black/[0.06] flex flex-col items-center text-center glass-card">
              <div
                className="h-6 w-6 rounded-full border-2 border-[#0071e3]/25 border-t-[#0071e3] animate-spin"
                role="status"
                aria-label="Searching"
              />
              <p className="mt-3 text-[15px] font-medium text-[#1d1d1f]">
                Searching...
              </p>
              {showSlowNotice && (
                <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#86868b] glass-text-secondary">
                  The first search builds the file list and can take up to 1 minute.
                  Please wait.
                </p>
              )}
            </div>
          )}

          {!isLoading && errorMessage && (
            <div
              role="alert"
              className="bg-white rounded-[24px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-[#ff3b30]/20 glass-notice-error"
            >
              <p className="text-[15px] font-medium text-[#ff3b30]">
                {errorMessage}
              </p>
            </div>
          )}

          {!isLoading && !errorMessage && refreshStatus?.incomplete && (
            <div className="mb-4 rounded-[16px] bg-[#ff9500]/10 border border-[#ff9500]/25 px-4 py-3 text-[13px] font-medium text-[#b25e00] glass-notice-warning">
              The folder is very large. Some files may be missing from the list.
            </div>
          )}

          {!isLoading && !errorMessage && searchData && (
            <div>
              {searchData.incomplete && (
                <div className="mb-4 rounded-[16px] bg-[#ff9500]/10 border border-[#ff9500]/25 px-4 py-3 text-[13px] font-medium text-[#b25e00] glass-notice-warning">
                  The folder is very large. Some files may be missing from the list.
                </div>
              )}

              <div className="mb-3 px-1">
                {searchData.total === 0 ? (
                  <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-black/[0.06] glass-card">
                    <p className="text-[15px] text-[#1d1d1f]">
                      No file name contains this text. Try fewer words or check the
                      spelling.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[14px] font-medium text-[#1d1d1f]">
                      <span className="font-mono tabular-nums">
                        {searchData.total}
                      </span>{' '}
                      results
                    </p>
                    {searchData.total > searchData.results.length && (
                      <p className="text-[13px] text-[#86868b] glass-text-secondary">
                        Showing the newest{' '}
                        <span className="font-mono tabular-nums">
                          {searchData.results.length}
                        </span>
                        . Add more words to narrow down.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {searchData.results.length > 0 && (
                <ul className="space-y-3">
                  {searchData.results.map((item, idx) => {
                    const typeLabel = mapFileTypeLabel(item.type);
                    const safeUrl = getSafeExternalUrl(item.url);

                    return (
                      <li
                        key={`${item.url || item.name}-${idx}`}
                        className="bg-white rounded-[24px] p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-black/[0.06] glass-card"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
                          <div className="min-w-0 flex-1">
                            <h2 className="text-[16px] font-semibold leading-snug text-[#1d1d1f] break-words [overflow-wrap:anywhere]">
                              {item.name}
                            </h2>

                            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3]/10 px-2.5 py-0.5 text-[12px] font-medium text-[#0071e3] whitespace-nowrap shrink-0 glass-pill">
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-[#0071e3]"
                                  aria-hidden="true"
                                />
                                {typeLabel}
                              </span>

                              {item.folder && (
                                <span className="text-[13px] text-[#86868b] glass-text-secondary break-words [overflow-wrap:anywhere]">
                                  {item.folder}
                                </span>
                              )}

                              {item.modified && (
                                <span className="font-mono tabular-nums text-[12px] text-[#86868b] glass-text-secondary whitespace-nowrap">
                                  {item.modified}
                                </span>
                              )}
                            </div>
                          </div>

                          {safeUrl && (
                            <div className="shrink-0 flex sm:justify-end">
                              <a
                                href={safeUrl}
                                target="_blank"
                                rel="noopener"
                                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] w-full sm:w-auto px-5 py-2 rounded-full bg-[#f5f5f7] hover:bg-[#ebebf0] active:scale-[0.97] border border-black/[0.08] text-[14px] font-medium text-[#0071e3] transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3] glass-pill"
                              >
                                Open
                                <ExternalLink
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </a>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {typeof searchData.indexedFiles === 'number' && (
                <p className="mt-4 px-1 text-[13px] text-[#86868b] glass-text-footer">
                  Searched{' '}
                  <span className="font-mono tabular-nums">
                    {searchData.indexedFiles}
                  </span>{' '}
                  items
                </p>
              )}
            </div>
          )}
        </section>

        <footer className="mt-10 pt-4 text-center">
          <p className="text-[12px] text-[#86868b] glass-text-footer">Developed by Zack Lu</p>
        </footer>
      </main>
    </div>
  );
}
