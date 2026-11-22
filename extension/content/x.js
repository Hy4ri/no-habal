/* NO HABAL — X (Twitter) adapter
 * - التغريدات: article[data-testid="tweet"]، الكاتب من [data-testid="User-Name"]
 * - الإخفاء: خلية الخط الزمني كاملة [data-testid="cellInnerDiv"]
 * - الملف الشخصي: [data-testid="UserName"]
 */
(() => {
  'use strict';

  const RESERVED = new Set([
    'home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'compose',
    'login', 'logout', 'signup', 'tos', 'privacy', 'jobs', 'communities', 'lists',
    'bookmarks', 'premium', 'premium_sign_up', 'verified-choose', 'hashtag', 'intent',
    'share', 'account', 'about', 'help', 'download', 'grok', 'jf', 'following', 'followers',
  ]);
  const USERNAME_RE = /^[a-z0-9_]{1,15}$/;
  const PROFILE_TABS = new Set([
    'with_replies', 'media', 'likes', 'highlights', 'articles', 'superfollows',
    'verified_followers', 'followers', 'following', 'followers_you_follow',
  ]);

  function parseProfile(href, { allowTabs = false } = {}) {
    let url;
    try { url = new URL(href, location.origin); } catch { return null; }
    if (!/(^|\.)(x|twitter)\.com$/.test(url.hostname)) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0 || parts.length > 2) return null;
    if (parts.length === 2 && !(allowTabs && PROFILE_TABS.has(parts[1]))) return null;

    const u = decodeURIComponent(parts[0]).toLowerCase();
    if (RESERVED.has(u) || !USERNAME_RE.test(u)) return null;
    return u;
  }

  const adapter = {
    platform: 'x',

    scanPosts() {
      const items = [];
      for (const tweet of document.querySelectorAll('article[data-testid="tweet"]')) {
        const nameBox = tweet.querySelector('[data-testid="User-Name"]');
        if (!nameBox) continue;
        for (const a of nameBox.querySelectorAll('a[href]')) {
          const u = parseProfile(a.getAttribute('href'));
          if (!u) continue;
          items.push({
            container: tweet.closest('[data-testid="cellInnerDiv"]') || tweet,
            anchor: a,
            username: u,
          });
          break;
        }
      }
      return items;
    },

    profile() {
      const username = parseProfile(location.pathname, { allowTabs: true });
      if (!username) return null;
      const box = document.querySelector('[data-testid="UserName"]');
      // نضع الزر بجانب الاسم الظاهر (أول سطر) لا تحت المعرّف
      const anchor = box?.querySelector('div[dir] span')?.closest('div[dir]') || box;
      return anchor ? { username, anchor } : null;
    },
  };

  NoHabal.register(adapter);
})();
