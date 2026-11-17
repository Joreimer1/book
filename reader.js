/* ==========================================================================
   Bokläsare — Reader Logic & Markdown Parser
   ========================================================================== */

(() => {
  'use strict';

  const STORAGE_KEY = 'bokreader_state_v1';
  const WORDS_PER_MINUTE = 220;

  const state = {
    bookTitle: 'Koden',
    bookSubtitle: '',
    chapters: [],
    currentView: 'cover', // 'cover' | 'chapter'
    currentChapterIndex: 0,
    settings: {
      theme: 'paper',
      font: 'serif',
      fontSize: 19,
      width: 'normal',
    },
    scrollPositions: {},
    bookmark: null, // { chapterIndex, scrollY, title }
  };

  // DOM Elements
  const el = {
    html: document.documentElement,
    progressFill: document.getElementById('progressFill'),
    topbar: document.getElementById('topbar'),
    topbarBookTitle: document.getElementById('topbarBookTitle'),
    topbarChapterIndicator: document.getElementById('topbarChapterIndicator'),
    coverBtn: document.getElementById('coverBtn'),
    tocToggleBtn: document.getElementById('tocToggleBtn'),
    tocCloseBtn: document.getElementById('tocCloseBtn'),
    tocDrawer: document.getElementById('tocDrawer'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    drawerBookTitle: document.getElementById('drawerBookTitle'),
    drawerStats: document.getElementById('drawerStats'),
    tocList: document.getElementById('tocList'),
    bookmarkBanner: document.getElementById('bookmarkBanner'),
    bookmarkBannerLoc: document.getElementById('bookmarkBannerLoc'),
    jumpToBookmarkBtn: document.getElementById('jumpToBookmarkBtn'),
    removeBookmarkBtn: document.getElementById('removeBookmarkBtn'),
    bookmarkBtn: document.getElementById('bookmarkBtn'),
    searchToggleBtn: document.getElementById('searchToggleBtn'),
    searchModal: document.getElementById('searchModal'),
    searchCloseBtn: document.getElementById('searchCloseBtn'),
    searchInput: document.getElementById('searchInput'),
    searchMeta: document.getElementById('searchMeta'),
    searchResults: document.getElementById('searchResults'),
    settingsToggleBtn: document.getElementById('settingsToggleBtn'),
    settingsPopover: document.getElementById('settingsPopover'),
    fontSizeSlider: document.getElementById('fontSizeSlider'),
    fontSizeValue: document.getElementById('fontSizeValue'),
    fontDecreaseBtn: document.getElementById('fontDecreaseBtn'),
    fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
    statusView: document.getElementById('statusView'),
    coverView: document.getElementById('coverView'),
    coverTitle: document.getElementById('coverTitle'),
    coverSubtitle: document.getElementById('coverSubtitle'),
    coverMeta: document.getElementById('coverMeta'),
    startReadingBtn: document.getElementById('startReadingBtn'),
    continueReadingBtn: document.getElementById('continueReadingBtn'),
    coverToc: document.getElementById('coverToc'),
    chapterArticle: document.getElementById('chapterArticle'),
    chapterNumberLabel: document.getElementById('chapterNumberLabel'),
    chapterReadTimeLabel: document.getElementById('chapterReadTimeLabel'),
    chapterTitle: document.getElementById('chapterTitle'),
    chapterBody: document.getElementById('chapterBody'),
    prevChapterBtn: document.getElementById('prevChapterBtn'),
    nextChapterBtn: document.getElementById('nextChapterBtn'),
    prevChapterTitle: document.getElementById('prevChapterTitle'),
    nextChapterTitle: document.getElementById('nextChapterTitle'),
    toast: document.getElementById('toast'),
  };

  /* ------------------------------------------------------------------------
     Persistence
     ------------------------------------------------------------------------ */
  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.settings) {
        Object.assign(state.settings, saved.settings);
      }
      if (typeof saved.currentChapterIndex === 'number') {
        state.currentChapterIndex = saved.currentChapterIndex;
      }
      if (saved.currentView === 'chapter' || saved.currentView === 'cover') {
        state.currentView = saved.currentView;
      }
      if (saved.scrollPositions && typeof saved.scrollPositions === 'object') {
        state.scrollPositions = saved.scrollPositions;
      }
      if (saved.bookmark && typeof saved.bookmark.chapterIndex === 'number') {
        state.bookmark = saved.bookmark;
      }
    } catch {
      // Ignore corrupted localStorage
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          currentView: state.currentView,
          currentChapterIndex: state.currentChapterIndex,
          settings: state.settings,
          scrollPositions: state.scrollPositions,
          bookmark: state.bookmark,
        })
      );
    } catch {
      // Ignore quota errors
    }
  }

  /* ------------------------------------------------------------------------
     Markdown Loading & Parsing
     ------------------------------------------------------------------------ */
  async function loadManuscriptText() {
    try {
      const response = await fetch('./manuskript.md', { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (err) {
      if (typeof window.MANUSKRIPT_FALLBACK === 'string' && window.MANUSKRIPT_FALLBACK.length > 0) {
        return window.MANUSKRIPT_FALLBACK;
      }
      throw err;
    }
  }

  function countWords(text) {
    const cleaned = text.replace(/```[\s\S]*?```/g, ' ').trim();
    if (!cleaned) return 0;
    return cleaned.split(/\s+/).length;
  }

  function parseBook(markdown) {
    const normalized = markdown.replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');

    let bookTitle = 'Koden';
    let bookSubtitle = '';
    const chapters = [];

    let currentTitle = null;
    let currentLines = [];
    let inFence = false;

    const flushChapter = () => {
      const rawBody = currentLines.join('\n').trim();
      // Skip empty or divider-only preamble before first ## chapter
      const meaningful = rawBody.replace(/^[-*\s]+$/gm, '').trim();
      if (!currentTitle && !meaningful) {
        currentLines = [];
        return;
      }
      const title = currentTitle || 'Inledning';
      const words = countWords(rawBody);
      const readMinutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
      chapters.push({
        index: chapters.length,
        title,
        rawBody,
        words,
        readMinutes,
      });
      currentLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line.trim())) {
        inFence = !inFence;
        currentLines.push(line);
        continue;
      }

      if (!inFence && currentTitle === null && /^#\s+(.+)$/.test(line)) {
        bookTitle = line.replace(/^#\s+/, '').trim();
        continue;
      }

      if (!inFence && /^##\s+(.+)$/.test(line)) {
        flushChapter();
        currentTitle = line.replace(/^##\s+/, '').trim();
        continue;
      }

      currentLines.push(line);
    }

    flushChapter();

    // Fallback if no ## headings were found
    if (chapters.length === 0 && normalized.trim().length > 0) {
      const words = countWords(normalized);
      chapters.push({
        index: 0,
        title: bookTitle,
        rawBody: normalized.trim(),
        words,
        readMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
      });
    }

    state.bookTitle = bookTitle;
    state.bookSubtitle = bookSubtitle;
    state.chapters = chapters;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderInline(text) {
    const codeTokens = [];
    const withPlaceholders = text.replace(/`([^`]+)`/g, (_, code) => {
      const idx = codeTokens.length;
      codeTokens.push(`<code>${escapeHtml(code)}</code>`);
      return `\u0000CODE${idx}\u0000`;
    });

    let html = escapeHtml(withPlaceholders);

    // Links [text](https://...)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Bold **text** or __text__
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Italic *text*
    html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    // Italic _text_ only on word boundaries
    html = html.replace(/(^|[\s(])_([^_\n]+)_([\s.,;:!?)]|$)/g, '$1<em>$2</em>$3');

    return html.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)]);
  }

  function renderMarkdownBlocks(raw) {
    const lines = raw.split('\n');
    const out = [];
    let i = 0;
    let blockIdx = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      // Fenced code block
      const fenceMatch = trimmed.match(/^```([\w-]*)\s*$/);
      if (fenceMatch) {
        const lang = fenceMatch[1] || '';
        const codeLines = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing fence
        const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
        out.push(`<pre class="code-block"${langAttr} data-block="${blockIdx++}"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        continue;
      }

      // Scene break
      if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
        out.push(`<hr class="scene-break" data-block="${blockIdx++}">`);
        i++;
        continue;
      }

      // Subheadings (### or ####)
      const hMatch = trimmed.match(/^(#{3,4})\s+(.+)$/);
      if (hMatch) {
        const level = hMatch[1].length;
        out.push(`<h${level} data-block="${blockIdx++}">${renderInline(hMatch[2])}</h${level}>`);
        i++;
        continue;
      }

      // Blockquote
      if (/^>\s?/.test(trimmed)) {
        const quoteLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        out.push(`<blockquote data-block="${blockIdx++}">${renderInline(quoteLines.join(' '))}</blockquote>`);
        continue;
      }

      // Unordered list
      if (/^[-*+]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
          items.push(`<li>${renderInline(lines[i].trim().replace(/^[-*+]\s+/, ''))}</li>`);
          i++;
        }
        out.push(`<ul data-block="${blockIdx++}">${items.join('')}</ul>`);
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          items.push(`<li>${renderInline(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`);
          i++;
        }
        out.push(`<ol data-block="${blockIdx++}">${items.join('')}</ol>`);
        continue;
      }

      // Paragraph (collect consecutive plain lines)
      const paraLines = [];
      while (i < lines.length) {
        const cur = lines[i];
        const curTrim = cur.trim();
        if (
          !curTrim ||
          /^```/.test(curTrim) ||
          /^(---|\*\*\*|___)\s*$/.test(curTrim) ||
          /^#{2,4}\s+/.test(curTrim) ||
          /^>\s?/.test(curTrim) ||
          /^[-*+]\s+/.test(curTrim) ||
          /^\d+\.\s+/.test(curTrim)
        ) {
          break;
        }
        paraLines.push(curTrim);
        i++;
      }
      out.push(`<p data-block="${blockIdx++}">${renderInline(paraLines.join(' '))}</p>`);
    }

    return out.join('\n');
  }

  /* ------------------------------------------------------------------------
     UI Rendering & Navigation
     ------------------------------------------------------------------------ */
  function applySettings() {
    el.html.setAttribute('data-theme', state.settings.theme);
    el.html.setAttribute('data-font', state.settings.font);
    el.html.setAttribute('data-width', state.settings.width);
    el.html.style.setProperty('--reader-size', `${state.settings.fontSize}px`);

    el.fontSizeSlider.value = String(state.settings.fontSize);
    el.fontSizeValue.textContent = `${state.settings.fontSize} px`;

    document.querySelectorAll('.theme-chip').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.themeVal === state.settings.theme));
    });
    document.querySelectorAll('[data-font-val]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.fontVal === state.settings.font));
    });
    document.querySelectorAll('[data-width-val]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.widthVal === state.settings.width));
    });
  }

  function renderToc() {
    const totalWords = state.chapters.reduce((sum, ch) => sum + ch.words, 0);
    const totalMinutes = state.chapters.reduce((sum, ch) => sum + ch.readMinutes, 0);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const durationText = hours > 0 ? `${hours} tim ${mins} min` : `${mins} min`;

    el.drawerBookTitle.textContent = state.bookTitle;
    el.drawerStats.textContent = `${state.chapters.length} kapitel · ${totalWords.toLocaleString('sv-SE')} ord · ca ${durationText} lästid`;

    el.tocList.innerHTML = '';
    el.coverToc.innerHTML = '';

    state.chapters.forEach((ch, idx) => {
      // Drawer TOC item
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'toc-item-btn';
      if (state.currentView === 'chapter' && idx === state.currentChapterIndex) {
        btn.classList.add('is-current');
      }
      btn.innerHTML = `
        <span class="toc-item-title">${escapeHtml(ch.title)}</span>
        <span class="toc-item-meta">${ch.words.toLocaleString('sv-SE')} ord · ca ${ch.readMinutes} min</span>
      `;
      btn.addEventListener('click', () => {
        closeToc();
        openChapter(idx, { restoreScroll: false });
      });
      li.appendChild(btn);
      el.tocList.appendChild(li);

      // Cover TOC item
      const coverLi = document.createElement('li');
      const coverLink = document.createElement('button');
      coverLink.textContent = ch.title;
      coverLink.addEventListener('click', () => openChapter(idx, { restoreScroll: false }));
      coverLi.appendChild(coverLink);
      el.coverToc.appendChild(coverLi);
    });

    updateBookmarkUI();
  }

  function updateBookmarkUI() {
    if (state.bookmark && state.chapters[state.bookmark.chapterIndex]) {
      const bmChapter = state.chapters[state.bookmark.chapterIndex];
      el.bookmarkBanner.hidden = false;
      el.bookmarkBannerLoc.textContent = bmChapter.title;
    } else {
      el.bookmarkBanner.hidden = true;
    }

    const isBookmarkedHere =
      state.currentView === 'chapter' &&
      state.bookmark &&
      state.bookmark.chapterIndex === state.currentChapterIndex;
    el.bookmarkBtn.classList.toggle('is-active', Boolean(isBookmarkedHere));
    el.bookmarkBtn.title = isBookmarkedHere ? 'Ta bort bokmärke (klicka för att ta bort)' : 'Spara bokmärke';
    el.bookmarkBtn.setAttribute(
      'aria-label',
      isBookmarkedHere ? 'Ta bort bokmärke' : 'Spara bokmärke'
    );
  }

  function showCover() {
    state.currentView = 'cover';
    el.statusView.hidden = true;
    el.chapterArticle.hidden = true;
    el.coverView.hidden = false;

    const totalWords = state.chapters.reduce((sum, ch) => sum + ch.words, 0);
    const totalMinutes = state.chapters.reduce((sum, ch) => sum + ch.readMinutes, 0);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const durationText = hours > 0 ? `${hours} tim ${mins} min` : `${mins} min`;

    el.coverTitle.textContent = state.bookTitle;
    el.coverSubtitle.textContent = state.bookSubtitle;
    el.coverMeta.textContent = `${state.chapters.length} kapitel · ${totalWords.toLocaleString('sv-SE')} ord · ca ${durationText} lästid`;

    el.topbarBookTitle.textContent = state.bookTitle;
    el.topbarChapterIndicator.textContent = 'Framsida';

    const hasProgress =
      state.currentChapterIndex > 0 || (state.scrollPositions[0] && state.scrollPositions[0] > 100);
    el.continueReadingBtn.hidden = !hasProgress;

    el.progressFill.style.width = '0%';
    document.title = `${state.bookTitle} — Bokläsare`;
    window.scrollTo({ top: 0, behavior: 'instant' });
    renderToc();
    saveState();
  }

  function openChapter(index, options = {}) {
    const { restoreScroll = true, highlightQuery = '', scrollToBlock = null } = options;
    if (index < 0 || index >= state.chapters.length) return;

    state.currentView = 'chapter';
    state.currentChapterIndex = index;
    const ch = state.chapters[index];

    el.statusView.hidden = true;
    el.coverView.hidden = true;
    el.chapterArticle.hidden = false;

    el.chapterNumberLabel.textContent = `Kapitel ${index + 1} av ${state.chapters.length}`;
    el.chapterReadTimeLabel.textContent = `Ca ${ch.readMinutes} min lästid`;
    el.chapterTitle.textContent = ch.title;
    el.chapterBody.innerHTML = renderMarkdownBlocks(ch.rawBody);

    el.topbarBookTitle.textContent = state.bookTitle;
    el.topbarChapterIndicator.textContent = ch.title;
    document.title = `${ch.title} — ${state.bookTitle}`;

    // Prev / Next buttons
    const prev = state.chapters[index - 1];
    const next = state.chapters[index + 1];

    el.prevChapterBtn.disabled = !prev;
    el.prevChapterTitle.textContent = prev ? prev.title : 'Första kapitlet';

    el.nextChapterBtn.disabled = !next;
    el.nextChapterTitle.textContent = next ? next.title : 'Slutet av boken';

    renderToc();
    saveState();

    requestAnimationFrame(() => {
      if (scrollToBlock !== null) {
        const target = el.chapterBody.querySelector(`[data-block="${scrollToBlock}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('is-flash');
          setTimeout(() => target.classList.remove('is-flash'), 2300);
        }
      } else if (restoreScroll && state.scrollPositions[index]) {
        window.scrollTo({ top: state.scrollPositions[index], behavior: 'instant' });
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
      updateScrollProgress();
    });
  }

  /* ------------------------------------------------------------------------
     Scroll Progress & Auto-hiding Topbar
     ------------------------------------------------------------------------ */
  let lastScrollY = 0;
  let scrollSaveTimer = null;

  function updateScrollProgress() {
    if (state.currentView !== 'chapter') {
      el.progressFill.style.width = '0%';
      return;
    }

    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const chapterFraction = docHeight > 0 ? Math.min(1, Math.max(0, window.scrollY / docHeight)) : 1;

    // Overall book progress weighted by chapter count
    const total = state.chapters.length || 1;
    const overall = ((state.currentChapterIndex + chapterFraction) / total) * 100;
    el.progressFill.style.width = `${overall.toFixed(1)}%`;
  }

  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      updateScrollProgress();

      // Auto-hide topbar on downward scroll when reading
      if (state.currentView === 'chapter' && y > 120) {
        if (y > lastScrollY + 12) {
          el.topbar.classList.add('topbar-hidden');
          closeSettings();
        } else if (y < lastScrollY - 12) {
          el.topbar.classList.remove('topbar-hidden');
        }
      } else {
        el.topbar.classList.remove('topbar-hidden');
      }
      lastScrollY = y;

      if (state.currentView === 'chapter') {
        clearTimeout(scrollSaveTimer);
        scrollSaveTimer = setTimeout(() => {
          state.scrollPositions[state.currentChapterIndex] = window.scrollY;
          saveState();
        }, 250);
      }
    },
    { passive: true }
  );

  /* ------------------------------------------------------------------------
     Drawers, Modals, Bookmarks, Search
     ------------------------------------------------------------------------ */
  function openToc() {
    closeSettings();
    el.tocDrawer.hidden = false;
    el.drawerBackdrop.hidden = false;
  }

  function closeToc() {
    el.tocDrawer.hidden = true;
    el.drawerBackdrop.hidden = true;
  }

  function toggleSettings() {
    const isHidden = el.settingsPopover.hidden;
    el.settingsPopover.hidden = !isHidden;
    el.settingsToggleBtn.classList.toggle('is-active', isHidden);
  }

  function closeSettings() {
    el.settingsPopover.hidden = true;
    el.settingsToggleBtn.classList.remove('is-active');
  }

  function openSearch() {
    closeSettings();
    closeToc();
    el.searchModal.hidden = false;
    el.searchInput.focus();
    el.searchInput.select();
  }

  function closeSearch() {
    el.searchModal.hidden = true;
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      el.toast.hidden = true;
    }, 2400);
  }

  function toggleBookmark() {
    if (state.currentView !== 'chapter') {
      showToast('Öppna ett kapitel för att spara ett bokmärke.');
      return;
    }
    const isBookmarkedHere =
      state.bookmark &&
      state.bookmark.chapterIndex === state.currentChapterIndex;

    if (isBookmarkedHere) {
      removeBookmark();
      return;
    }

    const ch = state.chapters[state.currentChapterIndex];
    state.bookmark = {
      chapterIndex: state.currentChapterIndex,
      scrollY: window.scrollY,
      title: ch.title,
    };
    saveState();
    updateBookmarkUI();
    showToast(`Bokmärke sparat i ${ch.title}`);
  }

  function removeBookmark() {
    state.bookmark = null;
    saveState();
    updateBookmarkUI();
    showToast('Bokmärke borttaget.');
  }

  function performSearch(query) {
    const q = query.trim();
    el.searchResults.innerHTML = '';

    if (q.length < 2) {
      el.searchMeta.textContent = 'Skriv minst 2 tecken för att söka.';
      return;
    }

    const lowerQ = q.toLowerCase();
    const matches = [];
    const MAX_RESULTS = 60;

    for (const ch of state.chapters) {
      // Split into rough blocks matching renderMarkdownBlocks order by inspecting paragraphs
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = renderMarkdownBlocks(ch.rawBody);
      const blocks = tempDiv.querySelectorAll('[data-block]');

      for (const block of blocks) {
        const text = block.textContent || '';
        const idx = text.toLowerCase().indexOf(lowerQ);
        if (idx !== -1) {
          const start = Math.max(0, idx - 55);
          const end = Math.min(text.length, idx + q.length + 75);
          const prefix = start > 0 ? '…' : '';
          const suffix = end < text.length ? '…' : '';
          const before = escapeHtml(text.slice(start, idx));
          const hit = escapeHtml(text.slice(idx, idx + q.length));
          const after = escapeHtml(text.slice(idx + q.length, end));

          matches.push({
            chapterIndex: ch.index,
            chapterTitle: ch.title,
            blockIdx: Number(block.getAttribute('data-block')),
            snippetHtml: `${prefix}${before}<mark>${hit}</mark>${after}${suffix}`,
          });

          if (matches.length >= MAX_RESULTS) break;
        }
      }
      if (matches.length >= MAX_RESULTS) break;
    }

    if (matches.length === 0) {
      el.searchMeta.textContent = `Inga träffar för "${q}".`;
      return;
    }

    el.searchMeta.textContent =
      matches.length >= MAX_RESULTS
        ? `Visar de första ${MAX_RESULTS} träffarna för "${q}".`
        : `${matches.length} träff${matches.length === 1 ? '' : 'ar'} för "${q}".`;

    for (const m of matches) {
      const btn = document.createElement('button');
      btn.className = 'search-result-btn';
      btn.innerHTML = `
        <span class="search-result-chapter">${escapeHtml(m.chapterTitle)}</span>
        <span class="search-result-snippet">${m.snippetHtml}</span>
      `;
      btn.addEventListener('click', () => {
        closeSearch();
        openChapter(m.chapterIndex, { restoreScroll: false, scrollToBlock: m.blockIdx });
      });
      el.searchResults.appendChild(btn);
    }
  }

  /* ------------------------------------------------------------------------
     Event Listeners
     ------------------------------------------------------------------------ */
  function bindEvents() {
    el.coverBtn.addEventListener('click', showCover);
    el.startReadingBtn.addEventListener('click', () => openChapter(0, { restoreScroll: false }));
    el.continueReadingBtn.addEventListener('click', () =>
      openChapter(state.currentChapterIndex, { restoreScroll: true })
    );

    el.tocToggleBtn.addEventListener('click', openToc);
    el.tocCloseBtn.addEventListener('click', closeToc);
    el.drawerBackdrop.addEventListener('click', closeToc);

    el.settingsToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSettings();
    });

    document.addEventListener('click', (e) => {
      if (!el.settingsPopover.hidden && !el.settingsPopover.contains(e.target) && e.target !== el.settingsToggleBtn) {
        closeSettings();
      }
    });

    document.querySelectorAll('.theme-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.settings.theme = btn.dataset.themeVal;
        applySettings();
        saveState();
      });
    });

    document.querySelectorAll('[data-font-val]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.settings.font = btn.dataset.fontVal;
        applySettings();
        saveState();
      });
    });

    document.querySelectorAll('[data-width-val]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.settings.width = btn.dataset.widthVal;
        applySettings();
        saveState();
      });
    });

    el.fontSizeSlider.addEventListener('input', () => {
      state.settings.fontSize = Number(el.fontSizeSlider.value);
      applySettings();
      saveState();
    });

    el.fontDecreaseBtn.addEventListener('click', () => {
      state.settings.fontSize = Math.max(15, state.settings.fontSize - 1);
      applySettings();
      saveState();
    });

    el.fontIncreaseBtn.addEventListener('click', () => {
      state.settings.fontSize = Math.min(25, state.settings.fontSize + 1);
      applySettings();
      saveState();
    });

    el.prevChapterBtn.addEventListener('click', () => {
      if (state.currentChapterIndex > 0) {
        openChapter(state.currentChapterIndex - 1, { restoreScroll: false });
      }
    });

    el.nextChapterBtn.addEventListener('click', () => {
      if (state.currentChapterIndex < state.chapters.length - 1) {
        openChapter(state.currentChapterIndex + 1, { restoreScroll: false });
      }
    });

    el.bookmarkBtn.addEventListener('click', toggleBookmark);
    el.jumpToBookmarkBtn.addEventListener('click', () => {
      if (!state.bookmark) return;
      closeToc();
      openChapter(state.bookmark.chapterIndex, { restoreScroll: false });
      setTimeout(() => {
        window.scrollTo({ top: state.bookmark.scrollY || 0, behavior: 'smooth' });
      }, 60);
    });
    if (el.removeBookmarkBtn) {
      el.removeBookmarkBtn.addEventListener('click', removeBookmark);
    }

    el.searchToggleBtn.addEventListener('click', openSearch);
    el.searchCloseBtn.addEventListener('click', closeSearch);
    el.searchModal.addEventListener('click', (e) => {
      if (e.target === el.searchModal) closeSearch();
    });

    let searchTimer = null;
    el.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => performSearch(el.searchInput.value), 140);
    });

    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') {
        closeSearch();
        closeToc();
        closeSettings();
        return;
      }

      if (isTyping) return;

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        if (el.tocDrawer.hidden) openToc();
        else closeToc();
      } else if (e.key === 's' || e.key === 'S' || e.key === '/') {
        e.preventDefault();
        openSearch();
      } else if (state.currentView === 'chapter' && e.key === 'ArrowLeft') {
        if (state.currentChapterIndex > 0) {
          openChapter(state.currentChapterIndex - 1, { restoreScroll: false });
        }
      } else if (state.currentView === 'chapter' && e.key === 'ArrowRight') {
        if (state.currentChapterIndex < state.chapters.length - 1) {
          openChapter(state.currentChapterIndex + 1, { restoreScroll: false });
        }
      }
    });
  }

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */
  async function init() {
    loadSavedState();
    applySettings();
    bindEvents();

    try {
      const markdown = await loadManuscriptText();
      parseBook(markdown);
      renderToc();

      if (state.currentView === 'chapter' && state.chapters[state.currentChapterIndex]) {
        openChapter(state.currentChapterIndex, { restoreScroll: true });
      } else {
        showCover();
      }
    } catch (err) {
      el.statusView.innerHTML = `
        <p><strong>Kunde inte läsa in manuskript.md</strong></p>
        <p>Om du öppnar filen lokalt via <code>file://</code>, kontrollera att <code>manuskript-fallback.js</code> finns i samma mapp eller kör en lokal webbserver (t.ex. GitHub Pages).</p>
      `;
      console.error(err);
    }
  }

  init();
})();
