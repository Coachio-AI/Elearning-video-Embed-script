/*!
 * Vibe Player — Bunny Stream self-host (hls.js) qua custom CDN domain
 * Dùng: <div class="vibe-player" data-video-id="..." data-poster="..."></div>
 * Tác giả: vibecreators.vn
 */
(function () {
  "use strict";

  // ---- Cấu hình mặc định (có thể override bằng data-* trên từng player) ----
  var DEFAULTS = {
    cdn: "https://cdn.vibecreators.vn", // custom CDN hostname của pull zone
    autoplay: false,
    loop: false,
    muted: false,
    controls: true,
    aspect: "56.25%", // 16:9. Dùng "75%" cho 4:3, "42.85%" cho 21:9
    poster: "",       // tên file thumbnail (vd: thumbnail_xxxx.jpg). Để trống = không poster
    token: "",        // nếu library bật Token Auth: chuỗi "?token=...&expires=..."
    selector: ".vibe-player"
  };

  var HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1";
  var hlsLoading = null;

  // ---- Nạp hls.js một lần, dùng chung cho mọi player ----
  function loadHls() {
    if (window.Hls) return Promise.resolve();
    if (hlsLoading) return hlsLoading;
    hlsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = HLS_CDN;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Không tải được hls.js")); };
      document.head.appendChild(s);
    });
    return hlsLoading;
  }

  // ---- Đọc data-* từ element, fallback về DEFAULTS ----
  function readConfig(el) {
    var d = el.dataset;
    function bool(v, def) { return v == null ? def : (v === "true" || v === "1" || v === ""); }
    return {
      videoId: d.videoId,
      cdn: (d.cdn || DEFAULTS.cdn).replace(/\/+$/, ""),
      autoplay: bool(d.autoplay, DEFAULTS.autoplay),
      loop: bool(d.loop, DEFAULTS.loop),
      muted: bool(d.muted, DEFAULTS.muted),
      controls: bool(d.controls, DEFAULTS.controls),
      aspect: d.aspect || DEFAULTS.aspect,
      poster: d.poster || DEFAULTS.poster,
      token: d.token || DEFAULTS.token
    };
  }

  function buildUrl(cdn, videoId, file, token) {
    return cdn + "/" + videoId + "/" + file + (token || "");
  }

  // ---- Khởi tạo 1 player ----
  function initPlayer(el) {
    if (el.dataset.vibeInit === "1") return; // tránh init 2 lần
    var cfg = readConfig(el);

    if (!cfg.videoId) {
      console.error("[VibePlayer] thiếu data-video-id", el);
      return;
    }
    el.dataset.vibeInit = "1";

    var src = buildUrl(cfg.cdn, cfg.videoId, "playlist.m3u8", cfg.token);

    // wrapper responsive
    var wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;padding-top:" + cfg.aspect +
      ";background:#000;overflow:hidden;border-radius:8px;";

    var video = document.createElement("video");
    video.playsInline = true;
    video.controls = cfg.controls;
    video.loop = cfg.loop;
    video.muted = cfg.muted;
    if (cfg.autoplay) { video.muted = true; } // autoplay buộc muted để qua chính sách trình duyệt
    video.preload = "auto";
    if (cfg.poster) video.poster = buildUrl(cfg.cdn, cfg.videoId, cfg.poster, cfg.token);
    video.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;border:0;";

    wrap.appendChild(video);
    el.innerHTML = "";
    el.appendChild(wrap);

    function attachNative() {
      video.src = src;
      if (cfg.autoplay) video.play().catch(function () {});
    }

    // Safari/iOS hỗ trợ HLS native → ưu tiên, đỡ phải tải hls.js
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      attachNative();
      return;
    }

    loadHls().then(function () {
      if (window.Hls && Hls.isSupported()) {
        var hls = new Hls({
          enableWorker: true,
          capLevelToPlayerSize: true,
          startLevel: -1
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          if (cfg.autoplay) video.play().catch(function () {});
        });
        hls.on(Hls.Events.ERROR, function (_, data) {
          if (data.fatal) {
            console.error("[VibePlayer] HLS fatal:", data.type, data.details, src);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;     // thử lại network
              case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break; // phục hồi media
              default: hls.destroy(); break;
            }
          }
        });
        el._vibeHls = hls; // tham chiếu để destroy nếu cần
      } else {
        console.error("[VibePlayer] trình duyệt không hỗ trợ HLS");
      }
    }).catch(function (e) { console.error("[VibePlayer]", e.message); });
  }

  // ---- Tự quét & khởi tạo tất cả player trên trang ----
  function initAll() {
    document.querySelectorAll(DEFAULTS.selector).forEach(initPlayer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }

  // ---- Expose API để khởi tạo player thêm động (SPA, chèn sau khi load) ----
  window.VibePlayer = {
    init: initAll,
    initOne: initPlayer,
    defaults: DEFAULTS
  };
})();
