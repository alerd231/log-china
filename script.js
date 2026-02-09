// script.js
(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Lightweight analytics (dataLayer + localStorage counters)
  const DEBUG = new URLSearchParams(window.location.search).has("debug");
  const METRICS_KEY = "lc_metrics_v1";

  const track = (event, payload = {}) => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...payload });

    try {
      const raw = localStorage.getItem(METRICS_KEY);
      const metrics = raw ? JSON.parse(raw) : { counts: {}, last: {} };
      metrics.counts[event] = (metrics.counts[event] || 0) + 1;
      metrics.last[event] = Date.now();
      localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
    } catch {
      // ignore
    }

    if (DEBUG) console.log("[track]", event, payload);
  };

  track("page_view", { path: window.location.pathname });

  // Telegram lead delivery (client-side)
  // IMPORTANT: Do not publish your bot token in public repos.
  const TG_BOT_TOKEN = "8372473816:AAEDvG7RKIP5JYw1jGGjmScRWvS_p8tSKX0";
  const TG_CHAT_ID = "7861566974";
  const TG_TIMEOUT_MS = 12000;

  const fetchWithTimeout = (url, options, timeoutMs) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => {
      window.clearTimeout(timer);
    });
  };

  const getUtm = () => {
    const params = new URLSearchParams(window.location.search);
    const pick = (key) => (params.get(key) || "").trim();
    const utm = {
      utm_source: pick("utm_source"),
      utm_medium: pick("utm_medium"),
      utm_campaign: pick("utm_campaign"),
      utm_content: pick("utm_content"),
      utm_term: pick("utm_term"),
    };
    return Object.fromEntries(Object.entries(utm).filter(([, v]) => v));
  };

  const formatLeadMessage = (lead) => {
    const calc = lead.calc || null;
    const lines = [
      "Новая заявка с лендинга",
      "",
      `Имя: ${lead.name || "—"}`,
      `Телефон: ${lead.phone || "—"}`,
      `Комментарий: ${lead.comment || "—"}`,
      calc
        ? [
            "",
            "Данные расчёта:",
            calc.mode ? `• Вид: ${calc.mode}` : null,
            calc.weight ? `• Вес: ${calc.weight} кг` : null,
            calc.volume ? `• Объём: ${calc.volume} м³` : null,
            calc.route ? `• Маршрут: ${calc.route}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        : null,
      "",
      `Страница: ${lead.page || "—"}`,
      lead.referrer ? `Referrer: ${lead.referrer}` : null,
      lead.source ? `Источник: ${lead.source}` : null,
      lead.timestamp ? `Время: ${lead.timestamp}` : null,
      Object.keys(lead.utm || {}).length ? `UTM: ${JSON.stringify(lead.utm)}` : null,
    ].filter(Boolean);

    return lines.join("\n");
  };

  const sendLeadToTelegram = async (lead) => {
    const token = (TG_BOT_TOKEN || "").trim();
    const chatId = (TG_CHAT_ID || "").trim();

    if (!token || !chatId) {
      const err = new Error("Telegram is not configured (TG_BOT_TOKEN / TG_CHAT_ID).");
      err.code = "TG_NOT_CONFIGURED";
      throw err;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = new URLSearchParams({
      chat_id: chatId,
      text: formatLeadMessage(lead),
      disable_web_page_preview: "true",
    });

    const res = await fetchWithTimeout(url, { method: "POST", body }, TG_TIMEOUT_MS);
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      const err = new Error(data?.description || "Telegram API error.");
      err.code = "TG_SEND_FAILED";
      throw err;
    }

    return data;
  };

  // Persist "calc" inputs (scenario) between CTA clicks
  const CALC_STORAGE_KEY = "lc_calc_v1";

  const compactCalc = (calc) => {
    if (!calc) return null;
    const cleaned = {
      mode: String(calc.mode || "").trim(),
      weight: String(calc.weight || "").trim(),
      volume: String(calc.volume || "").trim(),
      route: String(calc.route || "").trim(),
    };
    const hasAny = Object.values(cleaned).some((v) => v);
    return hasAny ? cleaned : null;
  };

  const readCalcFromForm = (form) => {
    const fd = new FormData(form);
    return compactCalc({
      mode: fd.get("mode"),
      weight: fd.get("weight"),
      volume: fd.get("volume"),
      route: fd.get("route"),
    });
  };

  const saveCalcToSession = (calc) => {
    try {
      if (!calc) {
        sessionStorage.removeItem(CALC_STORAGE_KEY);
        return;
      }
      sessionStorage.setItem(CALC_STORAGE_KEY, JSON.stringify(calc));
    } catch {
      // ignore
    }
  };

  const loadCalcFromSession = () => {
    try {
      const raw = sessionStorage.getItem(CALC_STORAGE_KEY);
      if (!raw) return null;
      return compactCalc(JSON.parse(raw));
    } catch {
      return null;
    }
  };

  const calcFormRoot = document.querySelector("#calc form") || document.querySelector(".calc__card");
  if (calcFormRoot) {
    const syncCalc = () => saveCalcToSession(readCalcFromForm(calcFormRoot));
    calcFormRoot.addEventListener("input", syncCalc);
    calcFormRoot.addEventListener("change", syncCalc);
    syncCalc();
  }

  // Fixed header: "scrolled" state + mobile burger drawer
  const html = document.documentElement;
  const header = document.querySelector("[data-site-header]") || document.querySelector(".site-header");

  const navToggle = document.querySelector("[data-nav-toggle]");
  const navDrawer = document.querySelector("[data-nav-drawer]");
  let navCloseTimer = null;
  let navOpen = false;

  const closeNav = ({ restoreFocus = false } = {}) => {
    if (!navDrawer) return;
    if (!navOpen && navDrawer.hidden) return;

    navOpen = false;
    navDrawer.classList.remove("is-open");
    navToggle?.setAttribute("aria-expanded", "false");
    html.classList.remove("is-nav-open");

    window.clearTimeout(navCloseTimer);
    navCloseTimer = window.setTimeout(() => {
      if (!navDrawer.classList.contains("is-open")) navDrawer.hidden = true;
    }, 180);

    if (restoreFocus) navToggle?.focus?.();
  };

  const openNav = () => {
    if (!navDrawer) return;

    window.clearTimeout(navCloseTimer);
    navDrawer.hidden = false;
    navOpen = true;
    navToggle?.setAttribute("aria-expanded", "true");
    html.classList.add("is-nav-open");

    window.requestAnimationFrame(() => {
      navDrawer.classList.add("is-open");
    });

    const first = navDrawer.querySelector("a, button");
    window.setTimeout(() => first?.focus?.(), 0);
  };

  navToggle?.addEventListener("click", (e) => {
    e.preventDefault();
    if (navOpen) closeNav({ restoreFocus: true });
    else openNav();
  });

  navDrawer?.addEventListener("click", (e) => {
    const closeEl = e.target.closest("[data-nav-close]");
    if (closeEl) {
      e.preventDefault();
      closeNav({ restoreFocus: true });
      return;
    }

    const link = e.target.closest('a[href^="#"]');
    if (link) closeNav();
  });

  document.addEventListener("keydown", (e) => {
    if (!navOpen) return;
    if (e.key !== "Escape") return;
    if (html.classList.contains("is-modal-open")) return;
    e.preventDefault();
    closeNav({ restoreFocus: true });
  });

  window.addEventListener("resize", () => {
    if (!navOpen) return;
    if (window.matchMedia("(max-width: 760px)").matches) return;
    closeNav();
  });

  const updateHeader = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 18);
  };

  let headerTick = false;
  const onScroll = () => {
    if (headerTick) return;
    headerTick = true;
    window.requestAnimationFrame(() => {
      headerTick = false;
      updateHeader();
    });
  };

  updateHeader();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Sticky CTA (conversion)
  const stickyCta = document.querySelector("[data-sticky-cta]");
  if (stickyCta) {
    let stickyTimer = null;
    let stickyVisible = false;
    let heroVisible = true;
    let footerVisible = false;
    let nearBottom = false;
    let stickyTick = false;

    const computeNearBottom = () => {
      const doc = document.documentElement;
      const scrollBottom = window.scrollY + window.innerHeight;
      nearBottom = scrollBottom >= doc.scrollHeight - 220;
    };

    const setSticky = (show) => {
      if (show === stickyVisible) return;
      stickyVisible = show;

      window.clearTimeout(stickyTimer);

      if (show) {
        stickyCta.hidden = false;
        window.requestAnimationFrame(() => stickyCta.classList.add("is-show"));
        track("sticky_show");
      } else {
        stickyCta.classList.remove("is-show");
        stickyTimer = window.setTimeout(() => {
          if (!stickyCta.classList.contains("is-show")) stickyCta.hidden = true;
        }, 200);
      }
    };

    const updateSticky = () => {
      computeNearBottom();
      setSticky(!heroVisible && !footerVisible && !nearBottom);
    };

    if ("IntersectionObserver" in window) {
      const hero = document.querySelector(".hero");
      const footer = document.querySelector(".footer");

      if (hero) {
        const heroObs = new IntersectionObserver(
          (entries) => {
            heroVisible = entries.some((e) => e.isIntersecting);
            updateSticky();
          },
          { threshold: 0.01, rootMargin: "0px 0px -70% 0px" }
        );
        heroObs.observe(hero);
      }

      if (footer) {
        const footerObs = new IntersectionObserver(
          (entries) => {
            footerVisible = entries.some((e) => e.isIntersecting);
            updateSticky();
          },
          { threshold: 0.01, rootMargin: "0px 0px 20% 0px" }
        );
        footerObs.observe(footer);
      }

      updateSticky();

      const onStickyScroll = () => {
        if (stickyTick) return;
        stickyTick = true;
        window.requestAnimationFrame(() => {
          stickyTick = false;
          updateSticky();
        });
      };

      window.addEventListener("scroll", onStickyScroll, { passive: true });
      window.addEventListener("resize", updateSticky);
    } else {
      const stickyFallback = () => {
        heroVisible = window.scrollY < 520;
        updateSticky();
      };
      window.addEventListener("scroll", stickyFallback, { passive: true });
      window.addEventListener("resize", stickyFallback);
      stickyFallback();
    }
  }

  // Smooth scroll (JS) for anchor links
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute("href");
    if (!hash || hash === "#") return;

    const target = document.querySelector(hash);
    if (!target) return;

    e.preventDefault();
    if (link.classList.contains("nav__link")) track("nav_click", { href: hash });
    if (navOpen) closeNav();
    target.scrollIntoView({ behavior: "smooth", block: "start" });

    if (history.pushState) history.pushState(null, "", hash);
  });

  // Active nav link on scroll
  const navLinks = Array.from(document.querySelectorAll(".nav__link[href^=\"#\"]"));
  const sections = Array.from(document.querySelectorAll("main section[id]"));
  const linksById = new Map();
  const hero = document.querySelector(".hero");

  navLinks.forEach((a) => {
    const id = a.getAttribute("href")?.slice(1);
    if (!id) return;
    if (!linksById.has(id)) linksById.set(id, []);
    linksById.get(id).push(a);
  });

  if ("IntersectionObserver" in window && sections.length && navLinks.length) {
    let activeId = "";
    const heroStartSection = document.getElementById("services") || sections[0];
    let isInHero = false;

    const clearActive = () => {
      activeId = "";
      navLinks.forEach((a) => a.classList.remove("is-active"));
    };

    const detectSectionByProbe = () => {
      const probeY = window.innerHeight * 0.42;
      let best = null;
      let bestDist = Infinity;

      sections.forEach((s) => {
        const rect = s.getBoundingClientRect();
        const covers = rect.top <= probeY && rect.bottom >= probeY;
        const dist = covers ? 0 : Math.min(Math.abs(rect.top - probeY), Math.abs(rect.bottom - probeY));

        if (!best || dist < bestDist) {
          best = s;
          bestDist = dist;
        }
      });

      return best?.id || "";
    };

    const computeHeroState = () => {
      if (!hero || !heroStartSection) return false;
      const anchorOffset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const servicesTop = heroStartSection.getBoundingClientRect().top + window.scrollY;
      return window.scrollY < servicesTop - anchorOffset - 6;
    };

    const setActive = (id) => {
      if (isInHero) return;
      if (!id || id === activeId) return;
      activeId = id;
      navLinks.forEach((a) => a.classList.remove("is-active"));
      (linksById.get(id) || []).forEach((a) => a.classList.add("is-active"));
    };

    const updateHeroNavState = () => {
      const next = computeHeroState();
      if (next === isInHero) return;

      isInHero = next;
      if (isInHero) {
        clearActive();
        return;
      }

      const id = detectSectionByProbe();
      if (id) setActive(id);
    };

    isInHero = computeHeroState();
    if (isInHero) {
      clearActive();
    } else {
      const id = detectSectionByProbe();
      if (id) setActive(id);
    }

    let navTick = false;
    const onNavScroll = () => {
      if (navTick) return;
      navTick = true;
      window.requestAnimationFrame(() => {
        navTick = false;
        updateHeroNavState();
      });
    };

    window.addEventListener("scroll", onNavScroll, { passive: true });
    window.addEventListener("resize", updateHeroNavState);

    const navObserver = new IntersectionObserver(
      (entries) => {
        if (isInHero) return;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          setActive(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0.01 }
    );

    sections.forEach((s) => navObserver.observe(s));
  }

  // Drag-to-scroll for Services track (desktop mouse)
  const servicesTrack = document.querySelector("[data-services-track]");
  if (servicesTrack) {
    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let pointerId = null;
    let didDrag = false;

    const DRAG_THRESHOLD = 6;

    const isInteractiveTarget = (target) =>
      !!target.closest("a, button, input, textarea, select, label");

    servicesTrack.addEventListener(
      "click",
      (e) => {
        if (didDrag) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    servicesTrack.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      if (e.button !== 0) return;
      if (isInteractiveTarget(e.target)) return;

      isDown = true;
      didDrag = false;
      pointerId = e.pointerId;

      servicesTrack.classList.add("is-dragging");
      servicesTrack.setPointerCapture(pointerId);

      startX = e.clientX;
      startScrollLeft = servicesTrack.scrollLeft;
    });

    servicesTrack.addEventListener("pointermove", (e) => {
      if (!isDown) return;
      if (pointerId !== e.pointerId) return;

      const dx = e.clientX - startX;
      if (Math.abs(dx) > DRAG_THRESHOLD) didDrag = true;

      servicesTrack.scrollLeft = startScrollLeft - dx;
    });

    const end = () => {
      if (!isDown) return;

      isDown = false;
      pointerId = null;
      servicesTrack.classList.remove("is-dragging");

      window.setTimeout(() => {
        didDrag = false;
      }, 0);
    };

    servicesTrack.addEventListener("pointerup", end);
    servicesTrack.addEventListener("pointercancel", end);
    servicesTrack.addEventListener("lostpointercapture", end);
  }

  // Toast
  const toast = document.querySelector("[data-toast]");
  const toastText = toast?.querySelector("[data-toast-text]");
  const toastClose = toast?.querySelector("[data-toast-close]");
  let toastTimer = null;

  const hideToast = () => {
    if (!toast) return;
    toast.classList.remove("is-show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 180);
  };

  const showToast = (message) => {
    if (!toast || !toastText) return;

    toastText.textContent = message;
    toast.hidden = false;

    window.requestAnimationFrame(() => {
      toast.classList.add("is-show");
    });

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, 3200);
  };

  toastClose?.addEventListener("click", hideToast);

  // Modal
  const modal = document.querySelector("[data-modal]");
  const dialog = modal?.querySelector("[data-modal-dialog]");

  if (modal && dialog) {
    const openers = document.querySelectorAll("[data-open-modal]");
    const closers = modal.querySelectorAll("[data-close-modal]");
    const form = modal.querySelector("[data-modal-form]");
    const viewForm = modal.querySelector('[data-modal-view="form"]');
    const viewSuccess = modal.querySelector('[data-modal-view="success"]');

    let lastActive = null;
    let leadContext = {};
    const getLeadSource = (el) =>
      (el?.getAttribute?.("data-lead-source") ||
        el?.getAttribute?.("aria-label") ||
        el?.textContent ||
        "")
        .replace(/\s+/g, " ")
        .trim();

    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    const getFocusable = () =>
      Array.from(dialog.querySelectorAll(focusableSelector)).filter((el) => {
        if (el.hasAttribute("disabled")) return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        if (el.closest("[hidden]")) return false;
        return true;
      });

    const openModal = (opener) => {
      lastActive = opener || document.activeElement;
      leadContext = {};

      const calcForm = opener?.closest?.("#calc form") || opener?.closest?.(".calc__card");
      if (calcForm) {
        leadContext.calc = readCalcFromForm(calcForm);
        saveCalcToSession(leadContext.calc);
      } else {
        leadContext.calc = loadCalcFromSession();
      }

      if (form) form.reset();
      if (viewForm) viewForm.hidden = false;
      if (viewSuccess) viewSuccess.hidden = true;

      modal.hidden = false;
      document.documentElement.classList.add("is-modal-open");

      const focusables = getFocusable();
      const first = focusables[0] || dialog;
      window.setTimeout(() => first.focus?.(), 0);
    };

    const closeModal = () => {
      modal.hidden = true;
      document.documentElement.classList.remove("is-modal-open");
      lastActive?.focus?.();
    };

    openers.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (navOpen) closeNav();
        track("lead_open", { source: getLeadSource(btn) });
        openModal(btn);
      });
    });

    closers.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        closeModal();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (modal.hidden) return;

      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
      }

      if (e.key !== "Tab") return;

      const focusables = getFocusable();
      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    form?.addEventListener("submit", (e) => {
      e.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      const initialText = submitBtn?.textContent;

      const fd = new FormData(form);
      const name = String(fd.get("name") || "").trim();
      const phone = String(fd.get("phone") || "").trim();
      const comment = String(fd.get("comment") || "").trim();

      const lead = {
        name,
        phone,
        comment,
        calc: leadContext.calc || null,
        page: window.location.href,
        referrer: document.referrer || "",
        utm: getUtm(),
        source: getLeadSource(lastActive),
        timestamp: new Date().toLocaleString("ru-RU"),
      };

      const setSubmitting = (busy) => {
        if (!submitBtn) return;
        submitBtn.disabled = busy;
        submitBtn.setAttribute("aria-busy", String(busy));
        if (busy) submitBtn.textContent = "Отправляем…";
        else submitBtn.textContent = initialText || "Отправить заявку";
      };

      setSubmitting(true);
      track("lead_submit_attempt", { source: lead.source });

      sendLeadToTelegram(lead)
        .then(() => {
          if (viewForm) viewForm.hidden = true;
          if (viewSuccess) viewSuccess.hidden = false;
          showToast("Заявка отправлена");
          track("lead_submit_success", { source: lead.source });

          const ok = modal.querySelector("[data-modal-ok]");
          window.setTimeout(() => ok?.focus?.(), 0);
        })
        .catch((err) => {
          console.error(err);
          track("lead_submit_error", { code: err?.code || "unknown", source: lead.source });

          if (err?.code === "TG_NOT_CONFIGURED") {
            showToast("Telegram не настроен (токен/чат).");
            return;
          }

          showToast("Не удалось отправить. Повторите позже.");
        })
        .finally(() => {
          setSubmitting(false);
        });
    });
  }

  // Reveal on scroll
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const addReveal = (elements, staggerMs = 0) => {
    elements.forEach((el, idx) => {
      if (el.classList.contains("reveal")) return;
      el.classList.add("reveal");
      if (staggerMs) el.style.setProperty("--d", `${Math.min(idx * staggerMs, 260)}ms`);
    });
  };

  addReveal(Array.from(document.querySelectorAll(".section__head")), 0);
  addReveal(Array.from(document.querySelectorAll(".services__track .service-card")), 80);
  addReveal(Array.from(document.querySelectorAll(".advantages .kpi")), 90);
  addReveal(Array.from(document.querySelectorAll(".advantages__media")), 0);
  addReveal(Array.from(document.querySelectorAll(".examples .example")), 70);
  addReveal(Array.from(document.querySelectorAll(".info-grid .info")), 70);
  addReveal(Array.from(document.querySelectorAll(".calc__card")), 0);
  addReveal(Array.from(document.querySelectorAll(".contacts__card, .contacts__map")), 0);
  addReveal(Array.from(document.querySelectorAll(".company__card")), 0);
  addReveal(Array.from(document.querySelectorAll(".company__gallery .thumb")), 60);
  addReveal(Array.from(document.querySelectorAll(".faq .faq__item")), 55);
  addReveal(Array.from(document.querySelectorAll(".cta")), 0);

  const revealTargets = Array.from(document.querySelectorAll(".reveal"));
  const canObserve = !prefersReducedMotion && "IntersectionObserver" in window;

  if (!canObserve) {
    revealTargets.forEach((el) => el.classList.add("is-visible"));
  } else {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -10% 0px" }
    );

    revealTargets.forEach((el) => io.observe(el));
  }
})();
