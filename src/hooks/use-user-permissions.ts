import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api-client';
import { enableDanceDiagnostics } from '@/lib/dance-funnel-client';

export interface UserPermissions {
  isAdmin: boolean;
  permissions?: string[];
}

// Current user's permission summary — shared by site-user-menu and
// app-layout (single network call, react-query dedupes).
export function useUserPermissions(enabled = true) {
  const query = useQuery({
    queryKey: ['user-permissions'],
    queryFn: () => apiGet<UserPermissions>('/api/user/permissions'),
    staleTime: 5 * 60_000,
    enabled,
  });
  useEffect(() => {
    if (query.data?.isAdmin) enableDanceDiagnostics();
  }, [query.data?.isAdmin]);
  return query;
}
