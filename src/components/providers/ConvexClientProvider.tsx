'use client';

import { ReactNode, useCallback, useMemo } from 'react';
import { ClerkProvider, useAuth } from '@clerk/nextjs';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Hook adaptador para conectar Clerk con Convex
function useClerkConvexAuth() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        return await getToken({ template: 'convex', skipCache: forceRefreshToken });
      } catch (error) {
        console.error('Error fetching Convex token from Clerk:', error);
        return null;
      }
    },
    [getToken]
  );

  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: !!isSignedIn,
      fetchAccessToken,
    }),
    [isLoaded, isSignedIn, fetchAccessToken]
  );
}

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useClerkConvexAuth}>
        {children}
      </ConvexProviderWithAuth>
    </ClerkProvider>
  );
}
