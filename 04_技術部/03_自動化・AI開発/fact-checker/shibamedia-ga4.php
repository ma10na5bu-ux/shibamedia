<?php
/**
 * Plugin Name: Shibamedia GA4
 * Plugin URI: https://shiba-with.com
 * Description: Google Analytics 4 tracking with scroll depth and outbound link events. Configurable via REST API.
 * Version: 1.0.0
 * Author: Shibamedia株式会社
 * License: MIT
 */

if (!defined('ABSPATH')) exit;

define('SHIBAMEDIA_GA4_OPTION', 'shibamedia_ga4_measurement_id');

// ── REST API エンドポイント ───────────────────────────────────────
add_action('rest_api_init', function () {
    register_rest_route('shibamedia/v1', '/ga4', [
        'methods'             => 'POST',
        'callback'            => 'shibamedia_ga4_set_id',
        'permission_callback' => function () {
            return current_user_can('manage_options');
        },
        'args' => [
            'measurement_id' => [
                'required'          => true,
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
                'validate_callback' => function ($v) {
                    return (bool) preg_match('/^G-[A-Z0-9]+$/', $v);
                },
            ],
        ],
    ]);

    register_rest_route('shibamedia/v1', '/ga4', [
        'methods'             => 'GET',
        'callback'            => 'shibamedia_ga4_get_id',
        'permission_callback' => function () {
            return current_user_can('manage_options');
        },
    ]);
});

function shibamedia_ga4_set_id(WP_REST_Request $request): WP_REST_Response {
    $id = $request->get_param('measurement_id');
    update_option(SHIBAMEDIA_GA4_OPTION, $id);
    return new WP_REST_Response(['status' => 'ok', 'measurement_id' => $id], 200);
}

function shibamedia_ga4_get_id(): WP_REST_Response {
    $id = get_option(SHIBAMEDIA_GA4_OPTION, '');
    return new WP_REST_Response(['measurement_id' => $id], 200);
}

// ── gtag スニペット出力 ───────────────────────────────────────────
add_action('wp_head', function () {
    $id = get_option(SHIBAMEDIA_GA4_OPTION, '');
    if (empty($id)) return;
    ?>
<!-- Shibamedia GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=<?php echo esc_attr($id); ?>"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '<?php echo esc_js($id); ?>', {
  send_page_view: true
});

// ── スクロール深度トラッキング ────────────────────────────
(function() {
  var milestones = [25, 50, 75, 100];
  var reached = {};

  function getScrollPercent() {
    var doc = document.documentElement;
    var scrollTop = window.pageYOffset || doc.scrollTop;
    var scrollHeight = doc.scrollHeight - doc.clientHeight;
    if (scrollHeight <= 0) return 100;
    return Math.round((scrollTop / scrollHeight) * 100);
  }

  function onScroll() {
    var pct = getScrollPercent();
    milestones.forEach(function(m) {
      if (!reached[m] && pct >= m) {
        reached[m] = true;
        gtag('event', 'scroll_depth', {
          event_category: 'Engagement',
          event_label: m + '%',
          value: m
        });
      }
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
})();

// ── 外部リンク（アウトバウンド）トラッキング ─────────────
document.addEventListener('DOMContentLoaded', function() {
  var host = window.location.hostname;
  document.querySelectorAll('a[href]').forEach(function(a) {
    try {
      var url = new URL(a.href);
      if (url.hostname && url.hostname !== host) {
        a.addEventListener('click', function() {
          gtag('event', 'outbound_click', {
            event_category: 'Outbound',
            event_label: url.href,
            transport_type: 'beacon'
          });
        });
      }
    } catch(e) {}
  });
});
</script>
    <?php
}, 1);
