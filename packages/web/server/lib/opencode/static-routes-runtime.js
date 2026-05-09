import { registerPwaManifestRoute } from './pwa-manifest-routes.js';

export const createStaticRoutesRuntime = (dependencies) => {
  const {
    fs,
    path,
    process,
    __dirname,
    express,
    resolveProjectDirectory,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    readSettingsFromDiskMigrated,
    normalizePwaAppName,
    normalizePwaOrientation,
  } = dependencies;

  const resolveDistPath = () => {
    const env = typeof process.env.OPENCHAMBER_DIST_DIR === 'string' ? process.env.OPENCHAMBER_DIST_DIR.trim() : '';
    if (env) {
      return path.resolve(env);
    }
    return path.join(__dirname, '..', 'dist');
  };

  const registerStaticRoutes = (app) => {
    const distPath = resolveDistPath();

    if (fs.existsSync(distPath)) console.log(`Serving static files from ${distPath}`);
    else console.warn(`Warning: ${distPath} not found yet, static files will be served after the web build finishes`);

    app.use(express.static(distPath, {
      setHeaders(res, filePath) {
        // Service workers should never be long-cached; iOS is especially sensitive.
        if (typeof filePath === 'string' && filePath.endsWith(`${path.sep}sw.js`)) {
          res.setHeader('Cache-Control', 'no-store');
        }
      },
    }));

    registerPwaManifestRoute(app, {
      process,
      resolveProjectDirectory,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      readSettingsFromDiskMigrated,
      normalizePwaAppName,
      normalizePwaOrientation,
    });

    app.get(/^(?!\/api|.*\.(js|css|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map)).*$/, (_req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
        return;
      }
      res.status(503).send('Static files not found. Please build the application first.');
    });
  };

  return {
    registerStaticRoutes,
  };
};
