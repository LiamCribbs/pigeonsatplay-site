(function () {
  const listEl = document.getElementById('entry-list');
  const titleEl = document.getElementById('reader-title');
  const bodyEl = document.getElementById('reader-body');

  let typeTimer = null;
  let activeIndex = null;

  function renderList() {
    listEl.innerHTML = '';
    LORE_ENTRIES.forEach((entry, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'entry-btn';
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `<span class="code">${entry.code}</span>${entry.title}`;
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

    const entry = LORE_ENTRIES[index];
    titleEl.textContent = entry.title;
    typeParagraphs(entry.body);
  }

  function typeParagraphs(paragraphs) {
    if (typeTimer) {
      clearInterval(typeTimer);
      typeTimer = null;
    }

    bodyEl.innerHTML = '';
    const flat = paragraphs.map((p) => ({ text: p }));
    let pIndex = 0;
    let cIndex = 0;
    let currentP = document.createElement('p');
    const cursor = document.createElement('span');
    cursor.className = 'type-cursor';
    bodyEl.appendChild(currentP);
    bodyEl.appendChild(cursor);

    typeTimer = setInterval(() => {
      if (pIndex >= flat.length) {
        clearInterval(typeTimer);
        typeTimer = null;
        cursor.remove();
        return;
      }
      const text = flat[pIndex].text;
      currentP.textContent += text[cIndex];
      cIndex++;
      if (cIndex >= text.length) {
        pIndex++;
        cIndex = 0;
        if (pIndex < flat.length) {
          currentP = document.createElement('p');
          bodyEl.insertBefore(currentP, cursor);
        }
      }
    }, 12);
  }

  renderList();
  if (LORE_ENTRIES.length) {
    selectEntry(0);
  } else {
    bodyEl.innerHTML = '<p class="reader-empty">No entries in the archive.</p>';
  }
})();
