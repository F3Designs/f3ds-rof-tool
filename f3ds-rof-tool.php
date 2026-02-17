<?php
/**
 * Plugin Name: F3DS ROF Tool
 * Description: Rate-of-Fire audio analyzer. Use [f3ds_rof] to embed on a page.
 * Version: 1.0.0
 * Author: F3DS
 * Text Domain: f3ds-rof-tool
 */

namespace F3DS\Plugins\ROFTool;

if (!defined('ABSPATH')) {
    exit;
}

class F3DS_ROF_Tool
{
    private static $instance = null;
    private $page_has_shortcode = false;

    public static function get_instance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct()
    {
        $this->define_constants();

        add_shortcode('f3ds_rof', array($this, 'render_shortcode'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));

        // Add type="module" to the main script tag (Vite outputs ESM).
        add_filter('script_loader_tag', array($this, 'set_module_type'), 10, 3);

        // COOP/COEP headers for SharedArrayBuffer (required by FFmpeg.wasm).
        // Hooked to 'template_redirect' so the global $post is fully resolved,
        // but output has not started yet — safe to call header().
        add_action('template_redirect', array($this, 'send_isolation_headers'), 1);

        // COI service-worker fallback script (runs before any other JS).
        add_action('wp_head', array($this, 'inject_coi_serviceworker'), 1);
    }

    private function define_constants()
    {
        define('F3DS_ROF_PLUGIN_URL', plugin_dir_url(__FILE__));
        define('F3DS_ROF_PLUGIN_PATH', plugin_dir_path(__FILE__));
    }

    // ── Shortcode Detection ────────────────────────────────────

    /**
     * Check whether the current singular page/post contains [f3ds_rof].
     * Memoised per request so the check only runs once.
     */
    private function current_page_has_shortcode()
    {
        if ($this->page_has_shortcode) {
            return true;
        }

        if (!is_singular()) {
            return false;
        }

        global $post;
        if (is_a($post, 'WP_Post') && has_shortcode($post->post_content, 'f3ds_rof')) {
            $this->page_has_shortcode = true;
            return true;
        }

        return false;
    }

    // ── COOP / COEP Headers ────────────────────────────────────

    /**
     * Send Cross-Origin isolation headers so SharedArrayBuffer is available.
     *
     * These are ONLY sent on pages that contain the [f3ds_rof] shortcode
     * to avoid breaking third-party embeds (YouTube, Google Maps, etc.)
     * on the rest of the site.
     *
     * Hooked to 'template_redirect' at priority 1 (before output).
     */
    public function send_isolation_headers()
    {
        if (!$this->current_page_has_shortcode()) {
            return;
        }

        // Guard against headers already sent (e.g. by a caching plugin).
        if (headers_sent()) {
            return;
        }

        header('Cross-Origin-Opener-Policy: same-origin');
        // 'credentialless' is more permissive than 'require-corp':
        // it still enables SharedArrayBuffer but does not block
        // cross-origin resources that lack explicit CORS headers
        // (e.g. fonts, analytics scripts, embedded iframes).
        header('Cross-Origin-Embedder-Policy: credentialless');
    }

    // ── COI Service-Worker Fallback ────────────────────────────

    /**
     * Inject the coi-serviceworker script tag into <head>.
     *
     * This acts as a fallback for environments where the PHP headers
     * can't be sent (aggressive page cache, reverse proxy, etc.).
     * The service worker self-registers and reloads the page with the
     * required COOP/COEP headers injected from the SW layer.
     *
     * Intentionally output as a raw <script> tag (not wp_enqueue_script)
     * because it must execute synchronously BEFORE any module scripts.
     */
    public function inject_coi_serviceworker()
    {
        if (!$this->current_page_has_shortcode()) {
            return;
        }

        $sw_url = esc_url(F3DS_ROF_PLUGIN_URL . 'assets/coi-serviceworker.js');
        echo '<script src="' . $sw_url . '"></script>' . "\n";
    }

    // ── Script type="module" Filter ─────────────────────────────

    /**
     * Add type="module" to the main bundle script tag.
     * Vite outputs ESM (uses import.meta, top-level await, etc.)
     * which requires the module type on the <script> element.
     */
    public function set_module_type($tag, $handle, $src)
    {
        if ($handle !== 'f3ds-rof-main') {
            return $tag;
        }

        // Replace the default type with type="module" and add crossorigin
        $tag = str_replace(
            array(' type=\'text/javascript\'', ' type="text/javascript"'),
            '',
            $tag
        );
        $tag = str_replace('<script ', '<script type="module" crossorigin ', $tag);

        return $tag;
    }

    // ── Asset Enqueue ──────────────────────────────────────────

    public function enqueue_assets()
    {
        if (!$this->current_page_has_shortcode()) {
            return;
        }

        // Plugin CSS (namespaced under .f3ds-rof-container)
        wp_enqueue_style(
            'f3ds-rof-style',
            F3DS_ROF_PLUGIN_URL . 'assets/css/style.css',
            array(),
            '1.1.1'
        );

        // Main JS bundle (Vite ESM output — loaded with type="module")
        wp_enqueue_script(
            'f3ds-rof-main',
            F3DS_ROF_PLUGIN_URL . 'assets/js/app.bundle.js',
            array(),
            '1.1.1',
            true
        );

        // Pass config to JS (matches window.F3DS_ROF_CONFIG in main.js)
        wp_localize_script('f3ds-rof-main', 'F3DS_ROF_CONFIG', array(
            'pluginUrl' => F3DS_ROF_PLUGIN_URL,
            'wasmUrl' => F3DS_ROF_PLUGIN_URL . 'assets/wasm/',
        ));
    }

    // ── Shortcode Render ───────────────────────────────────────

    public function render_shortcode($atts)
    {
        ob_start();
        include F3DS_ROF_PLUGIN_PATH . 'templates/view.php';
        return ob_get_clean();
    }
}

F3DS_ROF_Tool::get_instance();
