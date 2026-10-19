import { useBrandingGet } from '@sim/api-client';

/** The installation identity (public; the same on every page). */
export function useIdentity() {
  const { data } = useBrandingGet({ query: { staleTime: 5 * 60_000 } });
  return data?.data;
}
