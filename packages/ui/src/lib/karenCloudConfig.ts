export const karenConvexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const karenClerkPublishableKey = (
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  || import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
) as string | undefined;

export const isKarenCloudConfigured = Boolean(karenConvexUrl);
export const isKarenAuthConfigured = Boolean(karenConvexUrl && karenClerkPublishableKey);
