(function () {
  const listEl = document.getElementById('entry-list');
  const titleEl = document.getElementById('reader-title');
  const bodyEl = document.getElementById('reader-body');

  const TYPE_DURATION_MS = 3500; // every entry takes this long to type out, regardless of length

  // Elements that sit on their own line. A whitespace-only text node next to
  // one of these is just kramdown's source formatting (newlines between
  // blocks) and gets dropped -- .reader-body uses white-space: pre-wrap, so
  // keeping it would show up as stray blank lines.
  const BLOCK_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD',
    'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
    'DIV', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY',
  ]);
  const HEADING = /^H[1-6]$/;

  let typeFrame = null;
  let activeIndex = null;
  let entries = [];

  function isBlock(node) {
    return node !== null && node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName);
  }

  // Collapses runs of whitespace to a single space (except inside <pre>,
  // where it matters), drops whitespace-only text between blocks, and
  // removes HTML comments.
  function normalizeWhitespace(parent) {
    [...parent.childNodes].forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const between =
          !node.previousSibling || !node.nextSibling ||
          isBlock(node.previousSibling) || isBlock(node.nextSibling);
        if (/^\s*$/.test(node.textContent) && between) {
          node.remove();
        } else {
          node.textContent = node.textContent.replace(/\s+/g, ' ');
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName !== 'PRE') normalizeWhitespace(node);
      } else {
        node.remove();
      }
    });
  }

  // Turns one lore-data.js entry (Jekyll's HTML for a _lore/ file) into
  // { code, title, body }, where title and body are DOM fragments. The code
  // comes from the filename's leading number, and a heading at the very top
  // of the file becomes the title.
  function parseEntry(entry) {
    const template = document.createElement('template');
    template.innerHTML = entry.html;
    const body = template.content;
    normalizeWhitespace(body);

    const title = document.createDocumentFragment();
    const first = body.firstChild;
    if (first && first.nodeType === Node.ELEMENT_NODE && HEADING.test(first.tagName)) {
      title.append(...first.childNodes);
      first.remove();
    } else {
      title.append(entry.slug);
    }

    const number = entry.slug.match(/^0*(\d+)/);
    const code = number ? `ENTRY-${number[1].padStart(3, '0')}` : 'ENTRY-???';

    return { code, title, body };
  }

  function loadEntries() {
    if (typeof LORE_ENTRIES === 'undefined') {
      throw new Error('lore-data.js is missing or not loaded — preview the site with Jekyll');
    }
    return LORE_ENTRIES.map(parseEntry);
  }

  function renderTitle(container, title) {
    container.replaceChildren(title.cloneNode(true));
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
      renderTitle(titleSpan, entry.title);
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
    renderTitle(titleEl, entry.title);
    typeBody(entry.body);
  }

  // Flattens an entry body into the sequence the typewriter plays back: an
  // 'open'/'close' pair around each element and one 'char' per character.
  function tokenize(parent, tokens = []) {
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        for (const ch of node.textContent) tokens.push({ type: 'char', value: ch });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        tokens.push({ type: 'open', source: node });
        tokenize(node, tokens);
        tokens.push({ type: 'close' });
      }
    });
    return tokens;
  }

  function typeBody(body) {
    if (typeFrame !== null) {
      cancelAnimationFrame(typeFrame);
      typeFrame = null;
    }

    bodyEl.innerHTML = '';

    const tokens = tokenize(body);
    if (!tokens.length) {
      bodyEl.innerHTML = '<p class="reader-empty">This entry has no readable text.</p>';
      return;
    }

    const totalChars = tokens.filter((t) => t.type === 'char').length;

    const cursor = document.createElement('span');
    cursor.className = 'type-cursor';
    bodyEl.appendChild(cursor);

    // Appends a character right before the cursor. If the node immediately
    // before the cursor is already a text node belonging to `el`, extend it;
    // otherwise start a fresh one. Checking cursor.previousSibling (rather
    // than caching a text-node reference per stack level) keeps this correct
    // even right after popping back out of a closed element -- the
    // cached-reference version would keep writing into the OLD text node,
    // which sits before the element in the DOM, silently reordering the text.
    function appendChar(el, ch) {
      const before = cursor.previousSibling;
      if (before && before.nodeType === Node.TEXT_NODE && before.parentNode === el) {
        before.textContent += ch;
      } else {
        el.insertBefore(document.createTextNode(ch), cursor);
      }
    }

    const stack = [bodyEl];
    let index = 0;
    let shown = 0;
    let startTime = null;

    function step(timestamp) {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const target = Math.min(totalChars, Math.round((elapsed / TYPE_DURATION_MS) * totalChars));

      // Elements open and close as soon as they're reached (so an image or
      // rule at the very end still appears); only characters wait their turn.
      while (index < tokens.length && (shown < target || tokens[index].type !== 'char')) {
        const token = tokens[index];
        index++;
        const top = stack[stack.length - 1];

        if (token.type === 'open') {
          const el = token.source.cloneNode(false);
          top.insertBefore(el, cursor);
          stack.push(el);
          el.appendChild(cursor);
        } else if (token.type === 'close') {
          stack.pop();
          stack[stack.length - 1].appendChild(cursor);
        } else {
          appendChar(top, token.value);
          shown++;
        }
      }

      if (index >= tokens.length) {
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
