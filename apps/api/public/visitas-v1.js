(() => {
  "use strict";
  const link = document.querySelector(".registration-link");
  if (!link || typeof fetch !== "function") return;
  function record(event) {
    const width = window.innerWidth;
    const screen = width <= 767 ? "SMALL" : width <= 1023 ? "MEDIUM" : "LARGE";
    try {
      void fetch("/api/v1/public/site-visits", {
        method: "POST",
        credentials: "omit",
        keepalive: true,
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, screen }),
      }).catch(() => {});
    } catch {
      /* The registration link keeps its native behavior. */
    }
  }
  let viewed = false;
  function visible() {
    if (
      document.visibilityState !== "visible" ||
      document.prerendering ||
      viewed
    )
      return;
    viewed = true;
    record("view");
  }
  document.addEventListener("visibilitychange", visible);
  document.addEventListener("prerenderingchange", visible);
  link.addEventListener("click", () => record("registration_click"));
  visible();
})();
