import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
    // ── Dev Server ────────────────────────────────────────────────
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'credentialless',
        },
    },

    // ── Dependency optimisation ──────────────────────────────────
    // FFmpeg must NOT be pre-bundled — it uses ?url imports for WASM
    optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },

    // ── Worker ───────────────────────────────────────────────────
    worker: {
        format: 'es',
        rollupOptions: {
            output: {
                // Ensure worker file has no hash so we can reference it manually
                entryFileNames: 'js/[name].js',
            },
        },
    },

    // ── Build ────────────────────────────────────────────────────
    build: {
        // Preserve import.meta and modern syntax
        target: 'esnext',

        // Use relative paths for dynamic imports (v.important for WP plugins)
        base: './',

        // Output directories that match the PHP enqueue paths
        outDir: resolve(__dirname, 'assets'),
        assetsDir: 'js', // Put chunks/workers in assets/js so they are siblings to app.bundle.js
        emptyOutDir: false, // Don't nuke the index.php guard files

        rollupOptions: {
            input: resolve(__dirname, 'src/main.js'),

            output: {
                // ESM format — loaded by WordPress with type="module"
                format: 'es',

                // Force flat, hash-free filenames so the PHP enqueue is stable
                entryFileNames: 'js/app.bundle.js',
                chunkFileNames: 'js/[name].js', // Remove hash
                assetFileNames: (assetInfo) => {
                    // Route CSS into assets/css/
                    if (assetInfo.name && assetInfo.name.endsWith('.css')) {
                        return 'css/style.css';
                    }
                    // WASM and other assets go into assets/wasm/
                    if (assetInfo.name && assetInfo.name.endsWith('.wasm')) {
                        return 'wasm/[name][extname]';
                    }
                    // Everything else (fonts, images, etc.)
                    return 'js/[name][extname]';
                },
            },
        },
    },

    // ── Plugins ──────────────────────────────────────────────────
    plugins: [
        {
            name: 'copy-coi-serviceworker',
            // Dev mode: serve coi-serviceworker.js from node_modules
            configureServer(server) {
                server.middlewares.use((req, res, next) => {
                    if (req.url === '/coi-serviceworker.js') {
                        const filePath = resolve(
                            __dirname,
                            'node_modules/coi-serviceworker/coi-serviceworker.min.js'
                        );
                        res.setHeader('Content-Type', 'application/javascript');
                        res.end(readFileSync(filePath));
                        return;
                    }
                    next();
                });
            },
            // Production: copy into the assets root so WP can serve it
            writeBundle() {
                const src = resolve(
                    __dirname,
                    'node_modules/coi-serviceworker/coi-serviceworker.min.js'
                );
                const dest = resolve(__dirname, 'assets/coi-serviceworker.js');
                copyFileSync(src, dest);
            },
        },
        {
            name: 'copy-ffmpeg-wasm',
            // After build, ensure the core WASM files are in assets/wasm/
            // so they can be served by WordPress at a known URL.
            writeBundle() {
                const wasmDir = resolve(__dirname, 'assets/wasm');
                mkdirSync(wasmDir, { recursive: true });

                const coreDir = resolve(__dirname, 'node_modules/@ffmpeg/core/dist/esm');
                const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];
                for (const file of files) {
                    try {
                        copyFileSync(resolve(coreDir, file), resolve(wasmDir, file));
                    } catch (e) {
                        console.warn(`[copy-ffmpeg-wasm] Could not copy ${file}:`, e.message);
                    }
                }
            },
        },
    ],
});
