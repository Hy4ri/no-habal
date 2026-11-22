/* NO HABAL — Facebook adapter
 * - منشورات الصفحة الرئيسية والمجموعات: عناصر [role=feed] و [aria-posinset]
 * - اسم الحساب: الرابط الأول في عنوان المنشور (h2/h3/h4/strong)
 *     facebook.com/vanity            → vanity
 *     facebook.com/profile.php?id=N  → N
 *     facebook.com/groups/G/user/N/  → N
 * - الريلز (/reel/): الفيديو الأقرب لمنتصف الشاشة → ArrowDown
 */
(() => {
  'use strict';

  const RESERVED = new Set([
    'groups', 'watch', 'reel', 'reels', 'events', 'marketplace', 'gaming', 'photo', 'photos',
    'photo.php', 'permalink.php', 'story.php', 'hashtag', 'pages', 'share', 'stories', 'login',
    'help', 'notifications', 'friends', 'messages', 'bookmarks', 'saved', 'ads', 'business',
    'privacy', 'policies', 'settings', 'search', 'home.php', 'videos', 'video.php', 'live',
    'fundraisers', 'memories', 'feeds', 'l.php', 'media', 'posts', 'checkpoint', 'recover',
    'me', 'composer', 'sharer', 'dialog', 'plugins', 'games', 'apps', 'profile.php',
  ]);
  const VANITY_RE = /^[a-z0-9.]{1,100}$/;
  const ID_RE = /^\d{5,25}$/;

  function parseProfile(href) {
    let url;
    try { url = new URL(href, location.origin); } catch { return null; }
    if (!/(^|\.)facebook\.com$/.test(url.hostname)) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;

    if (parts[0] === 'profile.php') {
      const id = url.searchParams.get('id');
      return id && ID_RE.test(id) ? id : null;
    }
    // منشورات المجموعات: /groups/<gid>/user/<uid>/
    if (parts[0] === 'groups' && parts[2] === 'user' && ID_RE.test(parts[3] || '')) {
      return parts[3];
    }
    if (parts[0] === 'people' && ID_RE.test(parts[2] || '')) return parts[2];

    if (parts.length > 2) return null;
    if (parts.length === 2 && !['posts', 'videos', 'photos', 'reels'].includes(parts[1])) return null;

    const u = decodeURIComponent(parts[0]).toLowerCase();
    if (RESERVED.has(u) || !VANITY_RE.test(u) || /\.php$/.test(u)) return null;
    return u;
  }

  function authorOf(post) {
    for (const a of post.querySelectorAll('h2 a[href], h3 a[href], h4 a[href], strong a[href]')) {
      const u = parseProfile(a.getAttribute('href'));
      if (u) return { anchor: a, username: u };
    }
    return null;
  }

  const adapter = {
    platform: 'facebook',

    scanPosts() {
      const items = [];
      // منشورات الصفحة الرئيسية والمجموعات والملفات الشخصية
      // (لا نستخدم [role=feed] > div لأنه قد يكون غلافاً يضم كل المنشورات)
      for (const post of document.querySelectorAll('[aria-posinset]')) {
        if (post.closest('.nh-hidden')) continue;
        const author = authorOf(post);
        if (author) items.push({ container: post, ...author });
      }
      // منشور مفتوح في نافذة منبثقة أو صفحة منشور مستقلة: الزر فقط
      for (const scope of document.querySelectorAll('[role="dialog"], [role="main"]')) {
        for (const a of scope.querySelectorAll('h2 a[href], h3 a[href], h4 a[href]')) {
          if (a.closest('[aria-posinset]')) continue;
          const u = parseProfile(a.getAttribute('href'));
          if (u) items.push({ container: null, anchor: a, username: u });
        }
      }
      return items;
    },

    currentReel() {
      if (!location.pathname.startsWith('/reel/')) return null;
      const video = NoHabal.utils.centeredVideo();
      if (!video) return null;
      const found = NoHabal.utils.findProfileNear(video, (h) => parseProfile(h));
      if (!found) return null;
      this._video = video;
      return { key: location.pathname, video, ...found };
    },

    // صفحة الملف الشخصي:
    // - الحسابات الشخصية: الاسم غالباً في h1 ظاهر
    // - الصفحات (مثل Fajer TV): لا يوجد h1؛ الاسم span عريض بخط ≥ 24px داخل role=main
    profile() {
      const username = parseProfile(location.href);
      if (!username) return null;

      // الزر داخل عنصر الاسم (inside) حتى يبقى في نفس السطر ولا يتداخل مع سطر المتابعين
      const h1 = [...document.querySelectorAll('[role="main"] h1, h1')].find((h) =>
        h.textContent.trim() && h.getBoundingClientRect().height > 16);
      if (h1) return { username, anchor: h1, inside: true };

      const main = document.querySelector('[role="main"]');
      if (!main) return null;
      for (const el of main.querySelectorAll('h2, span')) {
        if (el.closest('[aria-posinset], [role="dialog"]')) continue;
        if (!el.textContent.trim() || el.getBoundingClientRect().height === 0) continue;
        const cs = getComputedStyle(el);
        if (parseFloat(cs.fontSize) >= 24 && Number(cs.fontWeight) >= 600) {
          return { username, anchor: el, inside: true };
        }
      }
      return null;
    },

    skipReel() {
      NoHabal.utils.pressArrowDown(this._video);
    },
  };

  NoHabal.register(adapter);
})();
