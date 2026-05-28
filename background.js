const BACKEND_URL = "http://127.0.0.1:8000/analyze";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "CHECK_FRAME") {
    (async () => {
      try {
        const response = await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: request.frame })
        });
        const data = await response.json();
        sendResponse({ ok: true, ...data });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }
});
