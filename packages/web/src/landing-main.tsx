import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';

import '@openchamber/ui/index.css';
import '@openchamber/ui/styles/fonts';
import { KarenLandingPage } from '@openchamber/ui/components/promptcourt/KarenLandingPage';
import {
  karenClerkPublishableKey,
  karenConvexUrl,
} from '@openchamber/ui/lib/karenCloudConfig';

const convexClient = karenConvexUrl ? new ConvexReactClient(karenConvexUrl) : null;

const renderTree = () => {
  const tree = <KarenLandingPage />;

  if (!convexClient) {
    return tree;
  }

  if (!karenClerkPublishableKey) {
    return <ConvexProvider client={convexClient}>{tree}</ConvexProvider>;
  }

  return (
    <ClerkProvider
      publishableKey={karenClerkPublishableKey}
      signInFallbackRedirectUrl="/promptcourt"
      signUpFallbackRedirectUrl="/promptcourt"
      afterSignOutUrl="/"
    >
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        {tree}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
};

const removeInitialLoading = () => {
  const node = document.getElementById('initial-loading');
  if (node) node.remove();
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Karen landing: #root element not found');
}

createRoot(rootElement).render(<StrictMode>{renderTree()}</StrictMode>);

removeInitialLoading();
