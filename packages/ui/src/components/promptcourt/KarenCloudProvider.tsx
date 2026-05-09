import React from 'react';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { karenClerkPublishableKey, karenConvexUrl } from '@/lib/karenCloudConfig';

const client = karenConvexUrl ? new ConvexReactClient(karenConvexUrl) : null;

export const KarenCloudProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!client) {
    return <>{children}</>;
  }

  if (!karenClerkPublishableKey) {
    return <ConvexProvider client={client}>{children}</ConvexProvider>;
  }

  return (
    <ClerkProvider publishableKey={karenClerkPublishableKey} signInFallbackRedirectUrl="/promptcourt" signUpFallbackRedirectUrl="/promptcourt">
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
};
