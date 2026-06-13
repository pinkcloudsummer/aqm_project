import { useQuery } from '@tanstack/react-query';

const fetcher = url => fetch(url).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });

export const useCurrent   = () => useQuery({ queryKey: ['current'],   queryFn: () => fetcher('/api/current'),   refetchInterval: 30_000 });
export const useDaily     = () => useQuery({ queryKey: ['daily'],     queryFn: () => fetcher('/api/daily'),     refetchInterval: 60_000 });
export const useOvernight = () => useQuery({ queryKey: ['overnight'], queryFn: () => fetcher('/api/overnight'), refetchInterval: 5 * 60_000 });
export const useTrends    = () => useQuery({ queryKey: ['trends'],    queryFn: () => fetcher('/api/trends'),    staleTime: 5 * 60_000 });

export const useTimeSeries   = metric => useQuery({ queryKey: ['timeseries', metric], queryFn: () => fetcher(`/api/timeseries/${metric}`), enabled: !!metric });
export const useMetricDetail = name   => useQuery({ queryKey: ['metric', name],       queryFn: () => fetcher(`/api/metric/${name}`),        enabled: !!name });
export const useCorrelations = ()     => useQuery({ queryKey: ['correlations'],        queryFn: () => fetcher('/api/correlations'),           staleTime: 5 * 60_000 });
