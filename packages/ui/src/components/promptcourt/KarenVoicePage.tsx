import React from 'react';
import { Toaster } from 'sonner';

import { KarenLogo } from './KarenLogo';
import { KarenMascot } from './KarenMascot';
import { GrandmaVoicePanel } from './GrandmaVoicePanel';

// Dedicated route for the GUI's voice / ElevenLabs settings panel.
// Mounted from App.tsx when the URL is /karen/voice. The panel itself talks
// to the local Express server's /api/karen/elevenlabs/* routes, so this page
// only renders inside the locally-served Karen GUI (not on Vercel landing).

export const KarenVoicePage: React.FC = () => {
  React.useEffect(() => {
    document.title = 'Karen voice settings';
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <KarenLogo className="size-12" mood="mad" />
            <div>
              <div className="typography-ui-label text-muted-foreground">Karen voice</div>
              <h1 className="typography-title-display mt-1 text-foreground">
                Tune the granny.
              </h1>
              <p className="typography-body mt-2 max-w-xl text-muted-foreground">
                Settings live in your browser. ElevenLabs cues go through the local
                Karen server, cached on disk, capped daily. Use the preview button
                to sanity-check the voice before letting it loose on a real verdict.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/karen"
              className="typography-ui-label rounded-sm border border-border bg-card px-3 py-2 hover:bg-muted"
            >
              ← Back to scoreboard
            </a>
            <a
              href="/"
              className="typography-ui-label rounded-sm border border-border bg-card px-3 py-2 hover:bg-muted"
            >
              Workspace
            </a>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_240px] lg:items-start">
          <GrandmaVoicePanel />
          <div className="hidden lg:block">
            <KarenMascot className="w-full" />
            <p className="typography-micro mt-3 text-muted-foreground">
              Karen judges your voice settings too. Choose wisely.
            </p>
          </div>
        </div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
};

export default KarenVoicePage;
