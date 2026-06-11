'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClientApiError, requestJson } from '@/lib/apiClient';
import {
  type GalleryResponse,
  type GenerateResponse,
  type LogoBrief,
  type LogoConcept,
  type RefineResponse,
} from '@/lib/types';
import ErrorBanner from './ErrorBanner';
import Gallery, { type GalleryStatus } from './Gallery';
import GeneratingCard from './GeneratingCard';
import RefineToolbar, { type Refinement } from './RefineToolbar';
import Wizard from './Wizard';

/** The last action attempted, stored as data so retry replays it. */
type LastAction =
  | { kind: 'generate'; brief: LogoBrief }
  | { kind: 'refine'; conceptId: string; refinement: Refinement };

/**
 * Host component (architecture.md §3): owns the gallery + generating state so
 * the wizard, the 10–30s loading state, and the persistent gallery coexist.
 * Generated concepts are prepended to the gallery; a failed generation leaves
 * the gallery and prior results untouched (C5), surfacing a retryable
 * {@link ErrorBanner} keyed on the typed error code (C5 / FR-6).
 */
export default function LogoStudio() {
  const [concepts, setConcepts] = useState<LogoConcept[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [status, setStatus] = useState<GalleryStatus>('loading');
  const [galleryError, setGalleryError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  // One busy flag covers both generate and refine — both fan out image calls and
  // both render the same GeneratingCard, so the UI treats them identically.
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState<ClientApiError | null>(null);
  // The last action attempted (as data, not a closure), so the error banner can
  // retry the same request without the callback referencing itself.
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  // The selected concept (feeds download highlighting + the refine toolbar).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch the first gallery page. No synchronous setState, so it is safe to call
  // straight from the mount effect; the initial `status` is already 'loading'.
  const loadInitial = useCallback(() => {
    requestJson<GalleryResponse>('/api/gallery?offset=0')
      .then((data) => {
        setConcepts(data.concepts);
        setTotal(data.total);
        setNextOffset(data.nextOffset);
        setStatus('ready');
      })
      .catch((err: ClientApiError) => {
        setGalleryError(err.message);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const retryGallery = useCallback(() => {
    setStatus('loading');
    setGalleryError('');
    loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    const offset = nextOffset ?? concepts.length;
    requestJson<GalleryResponse>(`/api/gallery?offset=${offset}`)
      .then((data) => {
        setConcepts((prev) => [...prev, ...data.concepts]);
        setTotal(data.total);
        setNextOffset(data.nextOffset);
      })
      .catch(() => {
        // Pagination failure is non-fatal; the existing grid stays intact.
      })
      .finally(() => setLoadingMore(false));
  }, [nextOffset, concepts.length]);

  // Newest first: prepend new concepts and grow the count.
  const prependConcepts = useCallback((fresh: LogoConcept[]) => {
    setConcepts((prev) => [...fresh, ...prev]);
    setTotal((prev) => prev + fresh.length);
  }, []);

  // Run a generation for a brief, preserving the typed error code on failure.
  const runGenerate = useCallback(
    (brief: LogoBrief) => {
      setGenerating(true);
      setActionError(null);
      setLastAction({ kind: 'generate', brief });
      requestJson<GenerateResponse>(
        '/api/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brief }),
        },
        'UPSTREAM_ERROR',
      )
        .then((data) => prependConcepts(data.concepts))
        .catch((err: ClientApiError) => setActionError(err))
        .finally(() => setGenerating(false));
    },
    [prependConcepts],
  );

  // Re-generate variations from a saved concept (FR-5 / TC-004). The original
  // stays; new variations prepend. Same busy flag + error model as generate.
  const runRefine = useCallback(
    (conceptId: string, refinement: Refinement) => {
      setGenerating(true);
      setActionError(null);
      setLastAction({ kind: 'refine', conceptId, refinement });
      requestJson<RefineResponse>(
        '/api/refine',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conceptId, ...refinement }),
        },
        'UPSTREAM_ERROR',
      )
        .then((data) => prependConcepts(data.concepts))
        .catch((err: ClientApiError) => setActionError(err))
        .finally(() => setGenerating(false));
    },
    [prependConcepts],
  );

  // Retry whichever action last failed, replaying it from stored data.
  const retryLastAction = useCallback(() => {
    if (!lastAction) return;
    if (lastAction.kind === 'generate') runGenerate(lastAction.brief);
    else runRefine(lastAction.conceptId, lastAction.refinement);
  }, [lastAction, runGenerate, runRefine]);

  const handleSubmit = useCallback((brief: LogoBrief) => runGenerate(brief), [runGenerate]);

  // Toggle selection: clicking the selected concept again clears it.
  const handleSelect = useCallback((id: string) => {
    setSelectedId((current) => (current === id ? null : id));
  }, []);

  const selectedConcept = selectedId
    ? (concepts.find((c) => c.id === selectedId) ?? null)
    : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,28rem)_1fr] lg:gap-8">
      <div className="flex flex-col gap-4">
        <Wizard onSubmit={handleSubmit} submitting={generating} />
        {selectedConcept ? (
          <RefineToolbar
            concept={selectedConcept}
            refining={generating}
            onRefine={(refinement) => runRefine(selectedConcept.id, refinement)}
            onClear={() => setSelectedId(null)}
          />
        ) : null}
        {actionError ? (
          <ErrorBanner
            code={actionError.code}
            message={actionError.message}
            onRetry={lastAction ? retryLastAction : undefined}
            onDismiss={() => setActionError(null)}
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        {generating ? <GeneratingCard /> : null}
        <Gallery
          concepts={concepts}
          total={total}
          status={status}
          errorMessage={galleryError}
          loadingMore={loadingMore}
          nextOffset={nextOffset}
          onRetry={retryGallery}
          onLoadMore={loadMore}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
