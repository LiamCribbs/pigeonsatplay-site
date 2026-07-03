(function () {
  const listEl = document.getElementById('entry-list');
  const titleEl = document.getElementById('reader-title');
  const bodyEl = document.getElementById('reader-body');

  const TYPE_DURATION_MS = 3500; // every entry takes this long to type out, regardless of length

  // The only tags build-lore.ps1 ever emits. Anything else (including a
  // stray "<" or "&" from the prose) is treated as plain text.
  const TAG_ELEMENT = { '<strong>': 'strong', '<em>': 'em' };
  const KNOWN_TAGS = Object.keys(TAG_ELEMENT).concat(['</strong>', '</em>']);

  let typeFrame = null;
  let activeIndex = null;
  let entries = [];

  function tokenizeInlineHtml(html) {
    const tokens = [];
    let i = 0;
    outer: while (i < html.length) {
      for (const tag of KNOWN_TAGS) {
        if (html.startsWith(tag, i)) {
          tokens.push({ type: 'tag', value: tag });
          i += tag.length;
          continue outer;
        }
      }
      tokens.push({ type: 'char', value: html[i] });
      i++;
    }
    return tokens;
  }

  // Renders a title (no typing animation) using the same tag-aware approach
  // as the typewriter, so titles never go through innerHTML either.
  function renderInlineHtml(container, html) {
    container.innerHTML = '';
    let stack = [container];
    tokenizeInlineHtml(html).forEach((token) => {
      const top = stack[stack.length - 1];
      if (token.type === 'tag') {
        if (token.value.startsWith('</')) {
          stack.pop();
        } else {
          const el = document.createElement(TAG_ELEMENT[token.value]);
          top.appendChild(el);
          stack.push(el);
        }
      } else {
        const last = top.lastChild;
        if (last && last.nodeType === Node.TEXT_NODE) {
          last.textContent += token.value;
        } else {
          top.appendChild(document.createTextNode(token.value));
        }
      }
    });
  }

  function loadEntries() {
    if (typeof LORE_ENTRIES === 'undefined') {
      throw new Error('lore-data.js is missing or not loaded — run build-lore.ps1');
    }
    return LORE_ENTRIES;
  }

  function renderList() {
    listEl.innerHTML = '';
    entries.forEach((entry, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'entry-btn';
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');

      const codeSpan = document.createElement('span');
      codeSpan.className = 'code';
      codeSpan.textContent = entry.code;
      btn.appendChild(codeSpan);

      const titleSpan = document.createElement('span');
      renderInlineHtml(titleSpan, entry.title);
      btn.appendChild(titleSpan);

      btn.addEventListener('click', () => selectEntry(i));
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  function selectEntry(index) {
    if (activeIndex === index) return;
    activeIndex = index;

    [...listEl.querySelectorAll('.entry-btn')].forEach((btn, i) => {
      const isActive = i === index;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    const entry = entries[index];
    renderInlineHtml(titleEl, entry.title);
    typeParagraphs(entry.body);
  }

  function typeParagraphs(paragraphs) {
    if (typeFrame !== null) {
      cancelAnimationFrame(typeFrame);
      typeFrame = null;
    }

    bodyEl.innerHTML = '';

    if (!paragraphs.length) {
      bodyEl.innerHTML = '<p class="reader-empty">This entry has no readable text.</p>';
      return;
    }

    const blockTags = paragraphs.map((block) => block.tag);
    const tokenized = paragraphs.map((block) => tokenizeInlineHtml(block.html));
    const totalChars = tokenized.reduce(
      (sum, tokens) => sum + tokens.filter((t) => t.type === 'char').length,
      0
    );

    const cursor = document.createElement('span');
    cursor.className = 'type-cursor';

    // Appends a character right before the cursor. If the node immediately
    // before the cursor is already a text node belonging to `el`, extend it;
    // otherwise start a fresh one. Checking cursor.previousSibling (rather
    // than caching a text-node reference per stack level) keeps this correct
    // even right after popping back out of a closed <em>/<strong> -- the
    // cached-reference version would keep writing into the OLD text node,
    // which sits before the tag in the DOM, silently reordering the text.
    function appendChar(el, ch) {
      const before = cursor.previousSibling;
      if (before && before.nodeType === Node.TEXT_NODE && before.parentNode === el) {
        before.textContent += ch;
      } else {
        el.insertBefore(document.createTextNode(ch), cursor);
      }
    }

    let pIndex = 0;
    let tIndex = 0;
    let shown = 0;

    function startBlock(tag) {
      const el = document.createElement(tag);
      bodyEl.appendChild(el);
      el.appendChild(cursor);
      return [el];
    }

    let stack = startBlock(blockTags[0]);

    let startTime = null;

    function step(timestamp) {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const target = Math.min(totalChars, Math.round((elapsed / TYPE_DURATION_MS) * totalChars));

      while (shown < target) {
        if (pIndex >= tokenized.length) break;
        const tokens = tokenized[pIndex];

        if (tIndex >= tokens.length) {
          pIndex++;
          tIndex = 0;
          if (pIndex >= tokenized.length) break;
          stack = startBlock(blockTags[pIndex]);
          continue;
        }

        const token = tokens[tIndex];
        tIndex++;
        const top = stack[stack.length - 1];

        if (token.type === 'tag') {
          if (token.value.startsWith('</')) {
            if (stack.length > 1) stack.pop();
          } else {
            const el = document.createElement(TAG_ELEMENT[token.value]);
            top.insertBefore(el, cursor);
            stack.push(el);
          }
          stack[stack.length - 1].appendChild(cursor);
        } else {
          appendChar(top, token.value);
          shown++;
        }
      }

      if (shown >= totalChars) {
        cursor.remove();
        typeFrame = null;
        return;
      }

      typeFrame = requestAnimationFrame(step);
    }

    typeFrame = requestAnimationFrame(step);
  }

  function init() {
    try {
      entries = loadEntries();
    } catch (err) {
      bodyEl.innerHTML = `<p class="reader-empty">Failed to load archive: ${err.message}</p>`;
      return;
    }

    renderList();
    if (entries.length) {
      selectEntry(0);
    } else {
      bodyEl.innerHTML = '<p class="reader-empty">No entries in the archive.</p>';
    }
  }

  init();
})();
