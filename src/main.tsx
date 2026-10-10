import "@/index.css";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app";
import { ConfigErrorScreen } from "@/components/status-screens";
import { APP_NAME } from "@/lib/brand";
import { convex, convexUrl } from "@/lib/convex";
import { pruneDrafts } from "@/lib/drafts";
import { startLeaveGuard } from "@/lib/leaving";
import { startPwa } from "@/lib/pwa";
import { startStaleBuildReload } from "@/lib/stale-build";
import { startTheme } from "@/lib/theme";
import { startUpdates } from "@/lib/updates";

startTheme();
startLeaveGuard();
startStaleBuildReload();
startPwa();
startUpdates();
pruneDrafts();
document.title = APP_NAME;

const root = document.querySelector("#root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      {convexUrl ? (
        <ConvexAuthProvider client={convex}>
          <App />
        </ConvexAuthProvider>
      ) : (
        <ConfigErrorScreen message="Set VITE_CONVEX_URL to your Convex deployment. Running `npx convex dev` writes it to .env.local." />
      )}
    </StrictMode>
  );
}
