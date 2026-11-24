/* NO HABAL — Instagram adapter
 * - منشورات الصفحة الرئيسية: <article> واسم الحساب من روابط /username/
 * - الريلز (/reels/ و /reel/): الفيديو الأقرب لمنتصف الشاشة → صاحب الريل → ArrowDown
 */
(() => {
  'use strict';
  // Firefox: واجهة browser تعيد Promises؛ Chrome/Edge: chrome
  const chrome = globalThis.browser ?? globalThis.chrome;

  // مسارات ليست حسابات
  const RESERVED = new Set([
    'explore', 'reels', 'reel', 'p', 'tv', 'stories', 'direct', 'accounts', 'about',
    'legal', 'developer', 'developers', 'challenge', 'emails', 'privacy', 'session',
    'web', 'api', 'graphql', 'static', 'ar', 'locations', 'nametag', 'directory',
    'your_activity', 'notifications', 'lite', 'download', 'help', 'press', 'blog',
  ]);
  const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

  function parseProfile(href) {
    let url;
    try { url = new URL(href, location.origin); } catch { return null; }
    if (!/(^|\.)instagram\.com$/.test(url.hostname)) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0 || parts.length > 2) return null;
    if (parts.length === 2 && !['reels', 'tagged', 'reel'].includes(parts[1])) return null;

    const u = decodeURIComponent(parts[0]).toLowerCase();
    if (RESERVED.has(u) || !USERNAME_RE.test(u)) return null;
    return u;
  }

  // نفضّل الرابط النصي (اسم الحساب) على رابط الصورة الرمزية
  function authorOf(root) {
    let fallback = null;
    for (const a of root.querySelectorAll('header a[href], a[href]')) {
      const u = parseProfile(a.getAttribute('href'));
      if (!u) continue;
      if (!a.querySelector('img') && a.textContent.trim()) return { anchor: a, username: u };
      if (!fallback) fallback = { anchor: null, username: u };
    }
    return fallback;
  }

  const isReelsPage = () => /^\/(reels?|stories)\//.test(location.pathname);

  const adapter = {
    platform: 'instagram',

    scanPosts() {
      const items = [];
      for (const article of document.querySelectorAll('article')) {
        const author = authorOf(article);
        if (author) items.push({ container: article, ...author });
      }
      return items;
    },

    currentReel() {
      if (!isReelsPage() || location.pathname.startsWith('/stories/')) return null;
      const video = NoHabal.utils.centeredVideo();
      if (!video) return null;
      const found = NoHabal.utils.findProfileNear(video, (h) => parseProfile(h));
      if (!found) return null;
      this._video = video;
      // مسار الصفحة يتغير مع كل ريل (/reels/<id>/) فيصلح مفتاحاً
      return { key: location.pathname, video, ...found };
    },

    // صفحة الملف الشخصي: /username/ أو /username/reels/ أو /username/tagged/
    profile() {
      const username = parseProfile(location.pathname);
      if (!username) return null;
      for (const h of document.querySelectorAll('header h2, header h1')) {
        if (h.textContent.trim().toLowerCase() === username) return { username, anchor: h };
      }
      return null;
    },

    skipReel() {
      NoHabal.utils.pressArrowDown(this._video);
    },
  };

  NoHabal.register(adapter);

  // =========================================================================
  //  الحظر الفعلي التدريجي (اختياري)
  //  - التبويب النشط يرسل blockTick كل 20 ثانية؛ الـ service worker يقرر
  //  - تبويب المهمة (يفتحه الـ worker في الخلفية) ينفّذ: الخيارات → حظر → تأكيد
  // =========================================================================
  const OPTIONS_LABELS = ['الخيارات', 'Options'];
  const BLOCK_WORDS = ['حظر', 'Block'];
  const UNBLOCK_WORDS = ['إلغاء الحظر', 'Unblock'];
  const NOT_FOUND_WORDS = ['غير متاحة', "isn't available", 'not available'];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, timeout = 15000, step = 300) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  const textIs = (el, words) => words.includes(el.textContent.trim());
  const lastDialog = () => [...document.querySelectorAll('div[role="dialog"]')].pop();

  function hasUnblockButton() {
    return [...document.querySelectorAll('header button, header [role="button"]')]
      .some((b) => textIs(b, UNBLOCK_WORDS));
  }

  function findOptionsButton() {
    for (const el of document.querySelectorAll('header [aria-label]')) {
      if (OPTIONS_LABELS.includes(el.getAttribute('aria-label'))) {
        return el.closest('button, [role="button"]') || el;
      }
    }
    return null;
  }

  async function runBlock(username) {
    const send = (result, error) =>
      chrome.runtime.sendMessage({ type: 'blockResult', result, error }).catch(() => {});

    // انتظار تحميل صفحة الحساب
    const ready = await waitFor(() => {
      const body = document.body?.innerText || '';
      if (NOT_FOUND_WORDS.some((w) => body.includes(w)) && !document.querySelector('header h2')) {
        return 'not_found';
      }
      if (hasUnblockButton()) return 'already';
      return findOptionsButton() ? 'ok' : null;
    }, 20000);

    if (ready === 'not_found') return send('not_found');
    if (ready === 'already') return send('already');
    if (!ready) return send('error', 'options_button_not_found');
    if (parseProfile(location.pathname) !== username) return send('error', 'wrong_profile');

    await sleep(800 + Math.random() * 1200); // تصرّف بشري بسيط
    findOptionsButton().click();

    const blockItem = await waitFor(() => {
      const d = lastDialog();
      return d && [...d.querySelectorAll('[role="button"], button')].find((b) => textIs(b, BLOCK_WORDS));
    }, 8000);
    if (!blockItem) return send('error', 'block_menu_item_not_found');

    await sleep(500 + Math.random() * 800);
    blockItem.click();

    const confirm = await waitFor(() => {
      const d = lastDialog();
      return d && [...d.querySelectorAll('button')].find((b) => textIs(b, BLOCK_WORDS));
    }, 8000);
    if (!confirm) return send('error', 'confirm_button_not_found');

    await sleep(500 + Math.random() * 800);
    confirm.click();

    // نتأكد من النجاح بظهور زر "إلغاء الحظر"
    const done = await waitFor(hasUnblockButton, 10000);
    return done ? send('blocked') : send('error', 'unblock_button_not_seen');
  }

  (async () => {
    let job = null;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'blockJob' });
      job = res?.ok ? res.data : null;
    } catch { /* الإضافة أُعيد تحميلها */ }

    if (job?.username) {
      runBlock(job.username);
      return;
    }

    // تبويب عادي: يحرّك الطابور فقط حين يكون نشطاً ومرئياً
    setInterval(() => {
      if (!chrome.runtime?.id) return;
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      chrome.runtime.sendMessage({ type: 'blockTick' }).catch(() => {});
    }, 20000);
  })();
})();
