(() => {
  const TICK_MS = 500;
  const MIN_PLAYTIME = 60; // ignore the first minute so a lingering button from the last episode can't re-trigger
  // Any of these appearing means the outro has started
  const TRIGGER_ELEMENTS = [
    '[data-uia="watch-credits-seamless-button"]',
    '[data-uia="player-skip-credits"]',
    '[data-uia="postplay-background-play-trailer"]',
    '[data-uia="promoted-video"]', // the "other series" promo shown after the last episode
  ].join(", ");

  const $ = (sel) => document.querySelector(sel);
  const allVideos = () => document.querySelectorAll("video");
  // The episode itself. During the trailer promo a second <video> (the trailer) exists
  // and can come first in the DOM, so look inside the player element first.
  const mainVideo = () => $('[data-uia="player"] video') || $("video");
  const setMuted = (muted) => allVideos().forEach((v) => (v.muted = muted));

  // ---------- settings ----------
  let settings = { ...DEFAULTS };
  chrome.storage.sync.get(DEFAULTS, (s) => (settings = s));
  chrome.storage.onChanged.addListener((changes) => {
    for (const k in changes) settings[k] = changes[k].newValue;
  });

  // ---------- show title lookup (Netflix metadata API, works with controls hidden) ----------
  const titleCache = {};
  let buildId = null;

  function getBuildId() {
    if (buildId) return buildId;
    for (const script of document.scripts) {
      const m = script.textContent.match(/BUILD_IDENTIFIER\\?"\s*:\s*\\?"([\w.-]+)/);
      if (m) return (buildId = m[1]);
    }
    return null;
  }

  async function lookupTitle(id) {
    if (id in titleCache) return titleCache[id];
    titleCache[id] = null; // also marks "in flight / failed" so we never spam the API
    try {
      const build = getBuildId();
      if (!build) return null;
      const res = await fetch(`/api/shakti/${build}/metadata?movieid=${id}`, { credentials: "include" });
      const json = await res.json();
      const title = json.video?.title ?? json.value?.videos?.[id]?.title;
      if (typeof title === "string") titleCache[id] = title;
    } catch {}
    return titleCache[id];
  }

  function matchesShow(title) {
    const keyword = settings.keyword.trim().toLowerCase();
    return keyword !== "" && title.toLowerCase().includes(keyword);
  }

  // ---------- music ----------
  // youtube.com / music.youtube.com / youtu.be link -> embeddable player URL
  function toEmbedUrl(link) {
    try {
      const u = new URL(link);
      const list = u.searchParams.get("list");
      const v = u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
      const base = "https://www.youtube.com/embed/";
      const common = "autoplay=1&controls=0&playsinline=1";
      if (v && list) return `${base}${v}?list=${list}&${common}`;
      if (v) return `${base}${v}?${common}&loop=1&playlist=${v}`;
      if (list) return `${base}videoseries?list=${list}&${common}`;
    } catch {}
    return null;
  }

  function createHiddenPlayer(src) {
    const frame = document.createElement("iframe");
    frame.src = src;
    frame.allow = "autoplay; encrypted-media";
    frame.style.cssText =
      "position:fixed;left:-9999px;bottom:0;width:200px;height:200px;border:0;opacity:0;pointer-events:none;";
    document.body.append(frame);
    return frame;
  }

  // ---------- session: "we muted Netflix and started music" ----------
  let session = null; // { wasMuted, startTime, frame }

  function startSession(video) {
    const src = toEmbedUrl(settings.url);
    if (!src) return;
    session = { wasMuted: video.muted, startTime: video.currentTime, frame: createHiddenPlayer(src) };
    setMuted(true);
  }

  function endSession() {
    if (!session) return;
    const { wasMuted, frame } = session;
    session = null;
    frame.remove();
    // Netflix may swap <video> elements between episodes, so restore whatever exists
    // now and again shortly after.
    const restore = () => setMuted(wasMuted);
    restore();
    setTimeout(restore, 500);
    setTimeout(restore, 1500);
  }

  // ---------- episode tracking ----------
  let episodeId = null;
  let episodeTitle = null;
  let lastHref = location.href;
  let lastWake = 0;

  function checkUrl() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    endSession(); // any URL change (new episode, leaving the player) undoes our mute
  }
  window.navigation?.addEventListener("navigatesuccess", checkUrl);
  window.addEventListener("popstate", checkUrl);
  window.addEventListener("pagehide", endSession);
  // A trailer's <video> can start playing between ticks; mute it the moment it does
  document.addEventListener("play", (e) => {
    if (session && e.target.tagName === "VIDEO") e.target.muted = true;
  }, true);

  function trackEpisode(urlId) {
    const id = $('[data-uia="player"]')?.dataset.videoid || urlId;
    if (id !== episodeId) {
      episodeId = id;
      episodeTitle = null;
      endSession();
      lookupTitle(id).then((t) => {
        if (t && episodeId === id && !episodeTitle) episodeTitle = t;
      });
    }
    // Fallback: an on-screen title (player controls, or the post-play rating row)
    const shown = $('[data-uia="video-title"], [data-uia="postplay-rating-title"]')?.textContent.trim();
    if (shown) episodeTitle = shown;
  }

  // Nudge the controls awake so the title element renders (fallback only)
  function wakeControls() {
    if (Date.now() - lastWake < 1500) return;
    lastWake = Date.now();
    ($(".watch-video--player-view") || document.body).dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 200, clientY: 200 })
    );
  }

  // ---------- main loop ----------
  function tick() {
    checkUrl();

    const urlMatch = location.pathname.match(/^\/watch\/(\d+)/);
    if (!urlMatch) { episodeId = episodeTitle = null; endSession(); return; }
    if (!settings.enabled) { endSession(); return; }

    trackEpisode(urlMatch[1]);

    const video = mainVideo();
    if (!video) return;

    if (session) {
      setMuted(true); // keep every Netflix video muted while the music plays
      if (video.currentTime < session.startTime - 5) endSession(); // user scrubbed back
      return;
    }

    if (video.currentTime < MIN_PLAYTIME || !$(TRIGGER_ELEMENTS)) return;
    if (!episodeTitle) return wakeControls();
    if (matchesShow(episodeTitle)) startSession(video);
  }

  setInterval(tick, TICK_MS);
})();
