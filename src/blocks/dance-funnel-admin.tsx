import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { tDynamic } from '@/core/i18n/dynamic';
import { apiGet } from '@/lib/api-client';
import type { FunnelJourney, FunnelReport } from '@/lib/dance-funnel-contract';
import { formatDateTime } from '@/lib/time';
import { m } from '@/paraglide/messages.js';
import { DanceConversionSummary } from '@/blocks/dance-conversion-summary';
import { DataTable, type Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';

const label = (kind: string, value: string) =>
  tDynamic(`admin.funnel.${kind}.${value}`);
export function DanceFunnelAdmin() {
  const [days, setDays] = useState(7);
  const [includeTests, setIncludeTests] = useState(false);
  const [page, setPage] = useState(1);
  const [flowId, setFlowId] = useState<string>();
  const query = useQuery({
    queryKey: ['admin-dance-funnel', days, includeTests, page, flowId],
    queryFn: () =>
      apiGet<FunnelReport>(
        `/api/admin/dance-funnel?${new URLSearchParams({
          days: String(days),
          page: String(page),
          includeTests: includeTests ? '1' : '0',
          ...(flowId ? { flowId } : {}),
        })}`
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
    staleTime: 60_000,
    retry: false,
  });
  const columns: Column<FunnelJourney>[] = [
    {
      header: m['admin.funnel.visit'](),
      cell: (row) => (
        <Button variant="link" onClick={() => setFlowId(row.flowId)}>
          {row.flowId.slice(0, 12)}
        </Button>
      ),
    },
    {
      header: m['admin.funnel.account'](),
      cell: (row) => row.userRef || m['admin.funnel.anonymous'](),
    },
    {
      header: m['admin.funnel.outcome'](),
      cell: (row) => label('outcome', row.outcome),
    },
    {
      header: m['admin.funnel.last_event'](),
      cell: (row) => label('event', row.lastEvent),
    },
    {
      header: m['admin.funnel.language_device'](),
      cell: (row) => `${row.locale} · ${label('device', row.device)}`,
    },
    {
      header: m['admin.funnel.last_time'](),
      cell: (row) => formatDateTime(row.lastAt),
    },
  ];
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{m['admin.funnel.title']()}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {m['admin.funnel.description']()}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          {m['admin.funnel.period']()}
          <select
            className="bg-background rounded border p-2"
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setPage(1);
              setFlowId(undefined);
            }}
          >
            {[1, 7, 14, 31].map((n) => (
              <option key={n} value={n}>
                {n} {m['admin.funnel.days']()}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeTests}
            onChange={(e) => {
              setIncludeTests(e.target.checked);
              setPage(1);
              setFlowId(undefined);
            }}
          />
          {m['admin.funnel.include_tests']()}
        </label>
      </div>
      {query.isError && (
        <p role="alert" className="text-destructive">
          {m['admin.funnel.unavailable']()}
        </p>
      )}
      {query.isPending || query.isPlaceholderData ? (
        <p role="status">{m['admin.metrics.loading']()}</p>
      ) : null}
      {query.data && !query.isPlaceholderData && (
        <>
          <DanceConversionSummary days={query.data.daily} />
          <h2 className="text-lg font-semibold">
            {m['admin.metrics.event_counts']()}
          </h2>
          <p className="text-muted-foreground text-sm">
            {m['admin.funnel.totals']({
              visits: query.data.totalFlows,
              events: query.data.totalEvents,
            })}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {query.data.stages.map((stage) => (
              <div key={stage.key} className="bg-card rounded-lg border p-4">
                <p className="text-muted-foreground text-sm">
                  {label('stage', stage.key)}
                </p>
                <p className="mt-1 text-2xl font-semibold">{stage.flows}</p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            {m['admin.funnel.count_note']()}
          </p>
          <DataTable
            columns={columns}
            data={query.data.journeys}
            total={query.data.totalFlows}
            page={page}
            pageSize={20}
            onPageChange={setPage}
            rowKey={(row) => row.flowId}
            loading={query.isFetching}
            emptyText={m['admin.funnel.empty']()}
            onRefresh={() => query.refetch()}
          />
          {flowId && (
            <section className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {m['admin.funnel.timeline']()} · {flowId.slice(0, 12)}
                </h2>
                <Button variant="outline" onClick={() => setFlowId(undefined)}>
                  {m['admin.funnel.close']()}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                {m['admin.funnel.source_note']()}
              </p>
              {query.data.timeline.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap gap-x-4 gap-y-1 border-t py-2 text-sm"
                >
                  <time className="text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </time>
                  <span>{label('event', row.event)}</span>
                  <span className="text-muted-foreground">
                    {label('source', row.source)}
                  </span>
                  {row.params.reason && (
                    <span className="text-destructive">
                      {label('reason', row.params.reason)}
                    </span>
                  )}
                  {row.params.role && (
                    <span>{label('role', row.params.role)}</span>
                  )}
                </div>
              ))}
              {!query.data.timeline.length && (
                <p>{m['admin.funnel.empty']()}</p>
              )}
            </section>
          )}
          <section className="space-y-3">
            <h2 className="font-semibold">{m['admin.funnel.errors']()}</h2>
            {query.data.errors.map((row, i) => {
              const p = JSON.parse(row.params);
              return (
                <div
                  key={i}
                  className="flex flex-wrap gap-3 rounded border p-3 text-sm"
                >
                  <span>{label('event', row.event)}</span>
                  {p.reason && <span>{label('reason', p.reason)}</span>}
                  <span>{label('source', row.source)}</span>
                  <strong>{row.total}</strong>
                </div>
              );
            })}
            {!query.data.errors.length && (
              <p className="text-muted-foreground text-sm">
                {m['admin.funnel.no_errors']()}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
