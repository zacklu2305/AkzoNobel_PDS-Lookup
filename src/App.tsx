// Author: Zack Lu
import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Search } from 'lucide-react';

// =============================================================================
// CONFIG: The only setting you need to edit
// =============================================================================
const SEARCH_URL =
  'https://script.google.com/macros/s/AKfycbzCpdzhxnmb_4PzYijTFq5aDj5xjzG94xLeEKrN89hNlIii_5dUCAgMHq31_o5u_Tn_/exec';
const MSDS_SEARCH_URL =
  'https://script.google.com/macros/s/AKfycbyB0rcIdrw4FGr_TyHu6JBZmekxJiRyyf04JxQolhDanPEgVuIUDm8TUYAw7oHhjzoAzg/exec';

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const SLOW_SEARCH_NOTICE_MS = 8 * 1000;

const SHOW_LOGO = true;
const LOGO_SIDE: 'left' | 'right' = 'right';
const TABS_BELOW_HEADER = true;
const LOGO_URL =
  'https://res.cloudinary.com/dorqvdstv/image/upload/v1785116299/AN_Logo_Color_xzz9l2.png';

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
  const isMsdsEnabled = Boolean(
    MSDS_SEARCH_URL &&
      MSDS_SEARCH_URL.trim() &&
      !MSDS_SEARCH_URL.includes('PASTE_')
  );
  const [activeTab, setActiveTab] = useState<'pds' | 'msds'>('pds');
  const [logoFailed, setLogoFailed] = useState(false);

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
    <div className="relative min-h-screen flex flex-col text-[#1d1d1f] overflow-x-clip">
      <div className="liquid-bg-canvas" aria-hidden="true">
        <div className="liquid-blob-navy" />
        <div className="liquid-blob-cobalt" />
        <div className="liquid-blob-sky" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="glass-nav mx-auto w-[calc(100%-2rem)] sm:w-[calc(100%-3rem)] max-w-[720px] mt-3 px-4 sm:px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {SHOW_LOGO && LOGO_SIDE === 'left' && !logoFailed && (
              <img
                src={LOGO_URL}
                alt="AkzoNobel"
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="h-[32px] md:h-[40px] w-auto object-contain shrink-0"
              />
            )}

            <div className="min-w-0">
              <h1 className="text-[16px] sm:text-[17px] font-semibold leading-tight tracking-[-0.01em] text-[#1d1d1f]">
                PDS/ MSDS Look-up
              </h1>
              <p className="mt-0.5 text-[12px] text-[#525257]">
                Type part of a file name.
              </p>
            </div>

            {!TABS_BELOW_HEADER && isMsdsEnabled && (
              <div
                role="tablist"
                aria-label="Search category"
                className="flex items-center gap-1.5 py-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'pds'}
                  onClick={() => setActiveTab('pds')}
                  className={
                    activeTab === 'pds'
                      ? 'glass-pill-active px-4 py-1.5 text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]'
                      : 'glass-pill px-4 py-1.5 text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]'
                  }
                >
                  PDS
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'msds'}
                  onClick={() => setActiveTab('msds')}
                  className={
                    activeTab === 'msds'
                      ? 'glass-pill-active px-4 py-1.5 text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]'
                      : 'glass-pill px-4 py-1.5 text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]'
                  }
                >
                  MSDS
                </button>
              </div>
            )}

            {SHOW_LOGO && LOGO_SIDE === 'right' && !logoFailed && (
              <img
                src={LOGO_URL}
                alt="AkzoNobel"
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="h-[32px] md:h-[40px] w-auto object-contain shrink-0"
              />
            )}
          </div>
        </header>

        {TABS_BELOW_HEADER && isMsdsEnabled && (
          <div className="w-full max-w-[720px] mx-auto px-4 sm:px-6 my-3 flex justify-center">
            <div
              role="tablist"
              aria-label="Search category"
              className="w-full md:w-auto flex items-center gap-1.5 py-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'pds'}
                onClick={() => setActiveTab('pds')}
                className={
                  activeTab === 'pds'
                    ? 'glass-pill-active flex-1 md:flex-initial text-center px-4 py-1.5 text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]'
                    : 'glass-pill flex-1 md:flex-initial text-center px-4 py-1.5 text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]'
                }
              >
                PDS
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'msds'}
                onClick={() => setActiveTab('msds')}
                className={
                  activeTab === 'msds'
                    ? 'glass-pill-active flex-1 md:flex-initial text-center px-4 py-1.5 text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]'
                    : 'glass-pill flex-1 md:flex-initial text-center px-4 py-1.5 text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]'
                }
              >
                MSDS
              </button>
            </div>
          </div>
        )}

        <main
          className={
            TABS_BELOW_HEADER && isMsdsEnabled
              ? 'w-full max-w-[720px] mx-auto px-4 sm:px-6 pt-0 pb-8 flex-1 flex flex-col'
              : 'w-full max-w-[720px] mx-auto px-4 sm:px-6 pt-6 pb-8 flex-1 flex flex-col'
          }
        >
          <div className={activeTab === 'pds' ? 'flex-1 flex flex-col' : 'hidden'}>
          <section
            aria-label="Search controls"
            className="glass-panel p-5 sm:p-6"
          >
            {isConfigMissing && (
              <p
                role="alert"
                className="mb-4 rounded-[14px] bg-[#ff3b30]/[0.09] border border-[#ff3b30]/25 px-3.5 py-2.5 text-[13px] font-medium text-[#ff3b30]"
              >
                Search link is not set yet
              </p>
            )}

            <form onSubmit={handleSearchSubmit} noValidate>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]"
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
                    className="glass-input h-10 w-full pl-9 pr-3 text-[16px] sm:text-[13px] placeholder:text-[#86868b]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={controlsDisabled}
                  className="glass-btn-primary h-10 px-5 text-[13px] font-medium disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]"
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
                className="glass-btn-secondary inline-flex items-center justify-center gap-1.5 h-9 px-4 text-[13px] font-medium disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]"
              >
                <RefreshCw
                  className={
                    isLoading
                      ? 'h-3.5 w-3.5 text-[#00227A] animate-spin'
                      : 'h-3.5 w-3.5 text-[#525257]'
                  }
                  aria-hidden="true"
                />
                Refresh file list
              </button>

              {refreshStatus && !isLoading && (
                <p className="text-[13px] font-medium text-[#248a3d]">
                  File list updated:{' '}
                  <span className="font-mono-num">
                    {refreshStatus.indexedFiles}
                  </span>{' '}
                  items
                </p>
              )}
            </div>

            {validationMessage && (
              <p className="mt-3 text-[13px] leading-relaxed font-medium text-[#ff3b30]">
                {validationMessage}
              </p>
            )}
          </section>

          <section aria-live="polite" aria-label="Search results" className="mt-6 flex-1">
            {isLoading && (
              <div className="glass-panel p-8 flex flex-col items-center text-center">
                <div
                  className="h-8 w-8 rounded-full border-2 border-[#00227A]/25 border-t-[#00227A] animate-spin"
                  role="status"
                  aria-label="Searching"
                />
                <p className="mt-4 text-[15px] font-semibold text-[#1d1d1f]">
                  Searching...
                </p>
                {showSlowNotice && (
                  <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#86868b]">
                    The first search builds the file list and can take up to 1 minute.
                    Please wait.
                  </p>
                )}
              </div>
            )}

            {!isLoading && errorMessage && (
              <div
                role="alert"
                className="glass-panel p-5"
              >
                <div className="rounded-[14px] bg-[#ff3b30]/[0.09] border border-[#ff3b30]/25 px-3.5 py-2.5">
                  <p className="text-[13px] leading-relaxed font-medium text-[#ff3b30]">
                    {errorMessage}
                  </p>
                </div>
              </div>
            )}

            {!isLoading && !errorMessage && refreshStatus?.incomplete && (
              <div className="mb-4 rounded-[16px] bg-[#ff9500]/10 border border-[#ff9500]/25 px-4 py-3 text-[13px] font-medium text-[#9a5000]">
                The folder is very large. Some files may be missing from the list.
              </div>
            )}

            {!isLoading && !errorMessage && searchData && (
              <div>
                {searchData.incomplete && (
                  <div className="mb-4 rounded-[16px] bg-[#ff9500]/10 border border-[#ff9500]/25 px-4 py-3 text-[13px] font-medium text-[#9a5000]">
                    The folder is very large. Some files may be missing from the list.
                  </div>
                )}

                <div className="mb-3 px-1">
                  {searchData.total === 0 ? (
                    <div className="glass-panel p-6">
                      <p className="text-[14px] text-[#525257]">
                        No file name contains this text. Try fewer words or check the
                        spelling.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[13px] font-semibold text-[#1d1d1f]">
                        <span className="font-mono-num">
                          {searchData.total}
                        </span>{' '}
                        results
                      </p>
                      {searchData.total > searchData.results.length && (
                        <p className="text-[12px] text-[#525257]">
                          Showing the newest{' '}
                          <span className="font-mono-num">
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
                          className="glass-panel p-5"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
                            <div className="min-w-0 flex-1">
                              <h2 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[#1d1d1f] break-words [overflow-wrap:anywhere]">
                                {item.name}
                              </h2>

                              <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                                <span className="glass-type-badge inline-flex items-center gap-1.5 px-3 py-0.5 text-[12px] font-medium whitespace-nowrap shrink-0">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full bg-[#00227A]"
                                    aria-hidden="true"
                                  />
                                  {typeLabel}
                                </span>

                                {item.folder && (
                                  <span className="text-[12px] text-[#525257] break-words [overflow-wrap:anywhere]">
                                    {item.folder}
                                  </span>
                                )}

                                {item.modified && (
                                  <span className="font-mono-num text-[12px] text-[#86868b] whitespace-nowrap">
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
                                  className="glass-translate-btn gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]"
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
                  <p className="mt-4 px-1 text-[12px] text-[#86868b]">
                    Searched{' '}
                    <span className="font-mono-num">
                      {searchData.indexedFiles}
                    </span>{' '}
                    items
                  </p>
                )}
              </div>
            )}
          </section>
          </div>

          {isMsdsEnabled && <MsdsSearchTab isActive={activeTab === 'msds'} />}
        </main>

        <footer className="mt-auto px-4 sm:px-6 py-4 text-center text-[12px] text-[#86868b]">
          <div className="mx-auto max-w-[720px]">
            <div>Developed by Zack Lu</div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function MsdsSearchTab({ isActive }: { isActive: boolean }) {
  const isConfigMissing = !MSDS_SEARCH_URL || MSDS_SEARCH_URL.includes('PASTE_');

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
      const response = await fetch(MSDS_SEARCH_URL, {
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
    <div className={isActive ? 'flex-1 flex flex-col' : 'hidden'}>
      <section
        aria-label="Search controls"
        className="glass-panel p-5 sm:p-6"
      >
        {isConfigMissing && (
          <p
            role="alert"
            className="mb-4 rounded-[14px] bg-[#ff3b30]/[0.09] border border-[#ff3b30]/25 px-3.5 py-2.5 text-[13px] font-medium text-[#ff3b30]"
          >
            Search link is not set yet
          </p>
        )}

        <form onSubmit={handleSearchSubmit} noValidate>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]"
                aria-hidden="true"
              />
              <input
                id="msds-search-input"
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
                className="glass-input h-10 w-full pl-9 pr-3 text-[16px] sm:text-[13px] placeholder:text-[#86868b]"
              />
            </div>

            <button
              type="submit"
              disabled={controlsDisabled}
              className="glass-btn-primary h-10 px-5 text-[13px] font-medium disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]"
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
            className="glass-btn-secondary inline-flex items-center justify-center gap-1.5 h-9 px-4 text-[13px] font-medium disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]"
          >
            <RefreshCw
              className={
                isLoading
                  ? 'h-3.5 w-3.5 text-[#00227A] animate-spin'
                  : 'h-3.5 w-3.5 text-[#525257]'
              }
              aria-hidden="true"
            />
            Refresh file list
          </button>

          {refreshStatus && !isLoading && (
            <p className="text-[13px] font-medium text-[#248a3d]">
              File list updated:{' '}
              <span className="font-mono-num">
                {refreshStatus.indexedFiles}
              </span>{' '}
              items
            </p>
          )}
        </div>

        {validationMessage && (
          <p className="mt-3 text-[13px] leading-relaxed font-medium text-[#ff3b30]">
            {validationMessage}
          </p>
        )}
      </section>

      <section aria-live="polite" aria-label="Search results" className="mt-6 flex-1">
        {isLoading && (
          <div className="glass-panel p-8 flex flex-col items-center text-center">
            <div
              className="h-8 w-8 rounded-full border-2 border-[#00227A]/25 border-t-[#00227A] animate-spin"
              role="status"
              aria-label="Searching"
            />
            <p className="mt-4 text-[15px] font-semibold text-[#1d1d1f]">
              Searching...
            </p>
            {showSlowNotice && (
              <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#86868b]">
                The first search builds the file list and can take up to 1 minute.
                Please wait.
              </p>
            )}
          </div>
        )}

        {!isLoading && errorMessage && (
          <div
            role="alert"
            className="glass-panel p-5"
          >
            <div className="rounded-[14px] bg-[#ff3b30]/[0.09] border border-[#ff3b30]/25 px-3.5 py-2.5">
              <p className="text-[13px] leading-relaxed font-medium text-[#ff3b30]">
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        {!isLoading && !errorMessage && refreshStatus?.incomplete && (
          <div className="mb-4 rounded-[16px] bg-[#ff9500]/10 border border-[#ff9500]/25 px-4 py-3 text-[13px] font-medium text-[#9a5000]">
            The folder is very large. Some files may be missing from the list.
          </div>
        )}

        {!isLoading && !errorMessage && searchData && (
          <div>
            {searchData.incomplete && (
              <div className="mb-4 rounded-[16px] bg-[#ff9500]/10 border border-[#ff9500]/25 px-4 py-3 text-[13px] font-medium text-[#9a5000]">
                The folder is very large. Some files may be missing from the list.
              </div>
            )}

            <div className="mb-3 px-1">
              {searchData.total === 0 ? (
                <div className="glass-panel p-6">
                  <p className="text-[14px] text-[#525257]">
                    No file name contains this text. Try fewer words or check the
                    spelling.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <p className="text-[13px] font-semibold text-[#1d1d1f]">
                    <span className="font-mono-num">
                      {searchData.total}
                    </span>{' '}
                    results
                  </p>
                  {searchData.total > searchData.results.length && (
                    <p className="text-[12px] text-[#525257]">
                      Showing the newest{' '}
                      <span className="font-mono-num">
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
                      className="glass-panel p-5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
                        <div className="min-w-0 flex-1">
                          <h2 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[#1d1d1f] break-words [overflow-wrap:anywhere]">
                            {item.name}
                          </h2>

                          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                            <span className="glass-type-badge inline-flex items-center gap-1.5 px-3 py-0.5 text-[12px] font-medium whitespace-nowrap shrink-0">
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-[#00227A]"
                                aria-hidden="true"
                              />
                              {typeLabel}
                            </span>

                            {item.folder && (
                              <span className="text-[12px] text-[#525257] break-words [overflow-wrap:anywhere]">
                                {item.folder}
                              </span>
                            )}

                            {item.modified && (
                              <span className="font-mono-num text-[12px] text-[#86868b] whitespace-nowrap">
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
                              className="glass-translate-btn gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00227A]"
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
              <p className="mt-4 px-1 text-[12px] text-[#86868b]">
                Searched{' '}
                <span className="font-mono-num">
                  {searchData.indexedFiles}
                </span>{' '}
                items
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
