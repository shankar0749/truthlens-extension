console.log("TruthLens v2.0 - 5 Second Analysis");

const BACKEND_URL = "http://127.0.0.1:8000/analyze";
const ANALYZE_DELAY = 5000;

const LABELS = {
  analyzing: "⏳ Analyzing...",
  real: "✔ Real-Likely",
  ai: "⚡ AI-Likely",
  mixed: "📊 Mixed",
  error: "✖ Error",
};

async function isEnabled() {
  return new Promise(r => chrome.storage.local.get("enabled", d => r(d.enabled !== false)));
}

function incrementStat(key) {
  chrome.storage.local.get(key, d => chrome.storage.local.set({[key]: (d[key] || 0) + 1}));
}

function findBadgeParent(video) {
  let el = video.parentElement;
  for (let i = 0; i < 6; i++) {
    if (!el) break;
    if (el.getBoundingClientRect().width >= video.offsetWidth * 0.8) return el;
    el = el.parentElement;
  }
  return video.parentElement;
}

function getOrCreateBadge(parent) {
  let badge = parent.querySelector(".truthlens-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "truthlens-badge";
    parent.appendChild(badge);
  }
  return badge;
}

function setBadgeState(badge, state, extra = "") {
  badge.dataset.state = state;
  badge.innerText = extra ? `${LABELS[state]} ${extra}` : LABELS[state];
}

function captureFrame(video) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, 640, 360);
      const sample = ctx.getImageData(0, 0, 10, 10).data;
      const isBlank = sample.every((v, i) => i % 4 === 3 || v < 5);
      if (isBlank) reject(new Error("Blank"));
      else resolve(canvas.toDataURL("image/jpeg", 0.7));
    } catch (err) {
      reject(err);
    }
  });
}

async function analyzeVideo(video) {
  if (video.dataset.truthlensAnalyzing || !(await isEnabled())) return;
  if (video.offsetWidth < 100 || video.offsetHeight < 100) return;

  video.dataset.truthlensAnalyzing = "true";
  const parent = findBadgeParent(video);
  if (!parent) return;

  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  const badge = getOrCreateBadge(parent);
  setBadgeState(badge, "analyzing");

  try {
    const imageData = await captureFrame(video);
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({image: imageData}),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const prediction = (result.prediction || "").toLowerCase();
    const confidence = result.confidence ? `${Math.round(result.confidence * 100)}%` : "";

    if (prediction.includes("real")) {
      setBadgeState(badge, "real", confidence);
      incrementStat("countReal");
    } else if (prediction.includes("ai")) {
      setBadgeState(badge, "ai", confidence);
      incrementStat("countAI");
    } else {
      setBadgeState(badge, "mixed", confidence);
      incrementStat("countMixed");
    }
  } catch (err) {
    console.error("[TruthLens]", err.message);
    setBadgeState(badge, "error");
  }
}

function setupVideoListener(video) {
  if (video.dataset.truthlensListener) return;
  video.dataset.truthlensListener = "true";

  let timeout = null;

  const onPlay = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => analyzeVideo(video), ANALYZE_DELAY);
  };

  const onStop = () => {
    if (timeout) clearTimeout(timeout);
  };

  video.addEventListener("play", onPlay);
  video.addEventListener("pause", onStop);
  video.addEventListener("ended", onStop);
  
  if (!video.paused) onPlay();
}

document.querySelectorAll("video").forEach(setupVideoListener);

const observer = new MutationObserver(mutations => {
  if (mutations.some(m => m.addedNodes.length > 0)) {
    document.querySelectorAll("video").forEach(setupVideoListener);
  }
});

observer.observe(document.body, {childList: true, subtree: true});
setTimeout(() => document.querySelectorAll("video").forEach(setupVideoListener), 2000);
