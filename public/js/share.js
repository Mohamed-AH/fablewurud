/**
 * Social Sharing Module - Duroos Platform
 *
 * Features:
 * - Share modal with multiple platforms (WhatsApp, Telegram, Twitter/X, Facebook)
 * - Copy link with clipboard API and visual feedback
 * - Web Share API support for mobile devices
 * - Fallback for older browsers
 */

(function() {
  'use strict';

  // Platform configurations
  const platforms = {
    whatsapp: {
      name: 'WhatsApp',
      nameAr: 'واتساب',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
      color: '#25D366',
      getUrl: (url, title) => `https://wa.me/?text=${encodeURIComponent(title + '\n' + url)}`
    },
    telegram: {
      name: 'Telegram',
      nameAr: 'تيليجرام',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
      color: '#0088cc',
      getUrl: (url, title) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`
    },
    twitter: {
      name: 'X (Twitter)',
      nameAr: 'إكس',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
      color: '#000000',
      getUrl: (url, title) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`
    },
    facebook: {
      name: 'Facebook',
      nameAr: 'فيسبوك',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
      color: '#1877F2',
      getUrl: (url, title) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
    }
  };

  // Translations
  const translations = {
    ar: {
      shareTitle: 'مشاركة',
      copyLink: 'نسخ الرابط',
      copied: 'تم النسخ!',
      shareVia: 'مشاركة عبر',
      close: 'إغلاق'
    },
    en: {
      shareTitle: 'Share',
      copyLink: 'Copy Link',
      copied: 'Copied!',
      shareVia: 'Share via',
      close: 'Close'
    }
  };

  // Get current locale
  function getLocale() {
    return document.documentElement.lang || 'ar';
  }

  // Get translation
  function t(key) {
    const locale = getLocale();
    return translations[locale]?.[key] || translations['en'][key] || key;
  }

  // Get platform name based on locale
  function getPlatformName(platform) {
    const locale = getLocale();
    return locale === 'ar' ? platform.nameAr : platform.name;
  }

  /**
   * Create share modal HTML
   */
  function createShareModal() {
    // Check if modal already exists
    if (document.getElementById('shareModal')) {
      return;
    }

    const locale = getLocale();
    const isRTL = locale === 'ar';

    const modal = document.createElement('div');
    modal.id = 'shareModal';
    modal.className = 'share-modal';
    // Set inline styles to ensure modal is hidden before CSS loads (prevents flash)
    modal.style.cssText = 'opacity: 0; visibility: hidden; display: none;';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'shareModalTitle');

    modal.innerHTML = `
      <div class="share-modal-backdrop" onclick="window.shareModule.close()"></div>
      <div class="share-modal-content" dir="${isRTL ? 'rtl' : 'ltr'}">
        <div class="share-modal-header">
          <h3 id="shareModalTitle" class="share-modal-title">${t('shareTitle')}</h3>
          <button class="share-modal-close" onclick="window.shareModule.close()" aria-label="${t('close')}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="share-modal-body">
          <div class="share-title-preview" id="shareTitlePreview"></div>
          <div class="share-platforms">
            ${Object.entries(platforms).map(([key, platform]) => `
              <button class="share-platform-btn" data-platform="${key}" style="--platform-color: ${platform.color}" onclick="window.shareModule.shareTo('${key}')">
                <span class="share-platform-icon">${platform.icon}</span>
                <span class="share-platform-name">${getPlatformName(platform)}</span>
              </button>
            `).join('')}
          </div>
          <div class="share-copy-section">
            <div class="share-copy-input-wrapper">
              <input type="text" class="share-copy-input" id="shareUrlInput" readonly />
              <button class="share-copy-btn" onclick="window.shareModule.copyLink()">
                <svg class="copy-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span class="copy-text">${t('copyLink')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * Show share modal or use native share
   */
  function share(url, title, options = {}) {
    const shareUrl = url || window.location.href;
    const shareTitle = title || document.title;
    const shareText = options.text || shareTitle;

    // Try Web Share API first on mobile
    if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
      navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl
      }).catch(err => {
        // User cancelled or error - show modal as fallback
        if (err.name !== 'AbortError') {
          showModal(shareUrl, shareTitle);
        }
      });
    } else {
      showModal(shareUrl, shareTitle);
    }
  }

  /**
   * Ensure URL pathname is properly encoded (for Arabic/Unicode URLs)
   */
  function ensureEncodedUrl(url) {
    try {
      const urlObj = new URL(url);
      // Encode each path segment to handle Arabic/Unicode characters
      const encodedPath = urlObj.pathname
        .split('/')
        .map(segment => encodeURIComponent(decodeURIComponent(segment)))
        .join('/');
      urlObj.pathname = encodedPath;
      return urlObj.href;
    } catch (e) {
      // Fallback: try to encode the whole URL
      return encodeURI(url);
    }
  }

  /**
   * Show the share modal
   */
  function showModal(url, title) {
    createShareModal();

    const modal = document.getElementById('shareModal');
    const urlInput = document.getElementById('shareUrlInput');
    const titlePreview = document.getElementById('shareTitlePreview');

    // Ensure URL is properly encoded for sharing (WhatsApp needs encoded URLs)
    const encodedUrl = ensureEncodedUrl(url);
    modal.dataset.url = encodedUrl;
    modal.dataset.title = title;

    // Update UI - decode URL for display so Arabic text is readable
    try {
      urlInput.value = decodeURIComponent(encodedUrl);
    } catch (e) {
      urlInput.value = encodedUrl; // Fallback if decode fails
    }
    titlePreview.textContent = title;

    // Show modal - reset inline styles and add active class
    modal.style.cssText = '';  // Clear inline styles so CSS takes over
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Focus trap
    urlInput.focus();

    // Handle escape key
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Close the share modal
   */
  function close() {
    const modal = document.getElementById('shareModal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    }
  }

  /**
   * Handle escape key press
   */
  function handleEscape(e) {
    if (e.key === 'Escape') {
      close();
    }
  }

  /**
   * Share to a specific platform
   */
  function shareTo(platformKey) {
    const modal = document.getElementById('shareModal');
    const platform = platforms[platformKey];

    if (!platform || !modal) return;

    // Keep URL encoded so platforms recognize it as a clickable link
    // (Decoded Arabic URLs are not recognized as links by WhatsApp, etc.)
    const url = modal.dataset.url;
    const title = modal.dataset.title;
    const shareUrl = platform.getUrl(url, title);

    // Open in new window
    window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=400');

    // Track share (if analytics available)
    if (typeof gtag === 'function') {
      gtag('event', 'share', {
        method: platformKey,
        content_type: 'lecture',
        item_id: url
      });
    }
  }

  /**
   * Copy link to clipboard
   */
  async function copyLink() {
    const modal = document.getElementById('shareModal');
    const urlInput = document.getElementById('shareUrlInput');
    const copyBtn = modal.querySelector('.share-copy-btn');
    const copyIcon = copyBtn.querySelector('.copy-icon');
    const checkIcon = copyBtn.querySelector('.check-icon');
    const copyText = copyBtn.querySelector('.copy-text');

    try {
      // Try modern clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(urlInput.value);
      } else {
        // Fallback for older browsers
        urlInput.select();
        urlInput.setSelectionRange(0, 99999);
        document.execCommand('copy');
      }

      // Visual feedback
      copyBtn.classList.add('copied');
      copyIcon.style.display = 'none';
      checkIcon.style.display = 'block';
      copyText.textContent = t('copied');

      // Reset after 2 seconds
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyIcon.style.display = 'block';
        checkIcon.style.display = 'none';
        copyText.textContent = t('copyLink');
      }, 2000);

      // Track copy (if analytics available)
      if (typeof gtag === 'function') {
        gtag('event', 'share', {
          method: 'copy_link',
          content_type: 'lecture',
          item_id: urlInput.value
        });
      }

    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  /**
   * Quick share button - tries native share first, then shows modal
   */
  function quickShare(url, title) {
    share(url, title);
  }

  // Expose public API
  window.shareModule = {
    share,
    close,
    shareTo,
    copyLink,
    quickShare
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createShareModal);
  } else {
    createShareModal();
  }

})();
