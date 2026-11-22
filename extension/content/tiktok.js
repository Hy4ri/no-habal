/* NO HABAL — TikTok adapter
 * - For You / Following: كل فيديو article[data-e2e="recommend-list-item-container"]
 *   يُعامل كريل: المحظور يُغطّى ويُكتم ثم نتخطاه (زر "التالي" أو ArrowDown)
 * - صفحة فيديو /@user/video/id: تغطية الفيديو
 * - الملف الشخصي /@user والبث المباشر /@user/live: زر بجانب الاسم
 */
(() => {
  'use strict';

  const USERNAME_RE = /^[a-z0-9._]{2,24}$/;

  // /@user أو /@user/video/123 أو /@user/live
  function parseProfile(href) {
    let url;
    try { url = new URL(href, location.origin); } catch { return null; }
    if (!/(^|\.)tiktok\.com$/.test(url.hostname)) return null;
    const first = url.pathname.split('/').filter(Boolean)[0] || '';
    if (!first.startsWith('@')) return null;
    const u = decodeURIComponent(first.slice(1)).toLowerCase();
    return USERNAME_RE.test(u) ? u : null;
  }

  // صاحب الفيديو: في التغذية الحالية لا يظهر اسم نصي، فقط الصورة الرمزية
  // a[data-e2e="video-author-avatar"] — نضع الزر تحتها.
  // (روابط /@ الأخرى داخل الوصف هي إشارات لأشخاص آخرين، لا نعتمد عليها)
  function authorOf(root) {
    const a = root.querySelector(
      'a[data-e2e="video-author-avatar"], a[data-e2e="video-author-uniqueid"]',
    ) || root.querySelector('[data-e2e="video-author-uniqueid"]')?.closest('a[href]');
    if (!a) return null;
    const u = parseProfile(a.getAttribute('href'));
    return u ? { anchor: a, username: u } : null;
  }

  const feedItems = () => document.querySelectorAll(
    'article[data-e2e="recommend-list-item-container"], [data-e2e="recommend-list-item-container"]',
  );

  const adapter = {
    platform: 'tiktok',

    // أزرار فقط؛ الإخفاء في التغذية يتم بآلية الريلز (التخطي) لأن التمرير فيها بالصفحة الكاملة
    scanPosts() {
      const items = [];
      for (const item of feedItems()) {
        const author = authorOf(item);
        if (!author) continue;
        // زر المتابعة (+) مثبّت أسفل غلاف الصورة الرمزية؛ نضع زرنا بعد الغلاف كاملاً حتى لا يتداخلا
        const wrap = author.anchor.parentElement?.tagName === 'DIV' ? author.anchor.parentElement : author.anchor;
        items.push({ container: null, username: author.username, anchor: wrap, btnClass: 'nh-tt' });
      }
      return items;
    },

    currentReel() {
      const video = NoHabal.utils.centeredVideo();
      if (!video) return null;

      // صفحة فيديو مستقلة: الكاتب من المسار
      if (/^\/@[^/]+\/video\//.test(location.pathname)) {
        const username = parseProfile(location.pathname);
        return username ? { key: location.pathname, video, username, anchor: null } : null;
      }

      const item = video.closest('[data-e2e="recommend-list-item-container"]');
      const found = item ? authorOf(item) : NoHabal.utils.findProfileNear(video, parseProfile);
      if (!found) return null;
      this._video = video;
      // anchor: null — الزر يضيفه scanPosts في المكان الصحيح؛ لا نضيف زراً ثانياً هنا
      return { key: video.currentSrc || video.src || found.username, video, username: found.username, anchor: null };
    },

    skipReel() {
      const next = document.querySelector('[data-e2e="feed-navigation-next"]');
      if (next && !next.disabled) next.click();
      else NoHabal.utils.pressArrowDown(this._video);
    },

    // الملف الشخصي /@user والبث /@user/live
    profile() {
      const parts = location.pathname.split('/').filter(Boolean);
      if (parts.length === 0 || parts.length > 2) return null;
      if (parts.length === 2 && parts[1] !== 'live') return null;
      const username = parseProfile(location.pathname);
      if (!username) return null;

      const anchor = document.querySelector('[data-e2e="user-title"], h1[data-e2e="user-title"]')
        || [...document.querySelectorAll('h1, h2')].find((h) =>
          h.textContent.trim().toLowerCase().replace(/^@/, '') === username)
        || [...document.querySelectorAll(`a[href*="/@${username}"]`)].find((a) =>
          a.textContent.trim() && !a.querySelector('img'));
      return anchor ? { username, anchor } : null;
    },
  };

  NoHabal.register(adapter);
})();
