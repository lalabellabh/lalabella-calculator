/* LALABELLA — Snip & paste a picture (web, Nov 2026).
 * LBPastePic.attach(boxElement, onFile): the box says "click here, then Ctrl+V". Pasting an image anywhere on the page
 * (Snipping Tool / screenshot / copied picture) calls onFile(file). Text pastes are left alone. Box is hidden on phones.
 */
(function () {
  'use strict';
  var css = document.createElement('style');
  css.textContent = '.lbpaste{display:none;margin-top:8px;border:1.5px dashed #d9c3cb;border-radius:10px;padding:9px 8px;text-align:center;font-size:12px;color:#8a7680;cursor:pointer;outline:none;user-select:none}' +
    '.lbpaste:focus{border-color:#c0577a;color:#a8405e;background:#fbeef2}@media (hover:hover) and (pointer:fine){.lbpaste{display:block}}';
  document.head.appendChild(css);
  function attach(box, onFile) {
    if (!box || box.__lbp) return; box.__lbp = 1;
    box.classList.add('lbpaste'); box.tabIndex = 0;
    if (!box.textContent.trim()) box.innerHTML = '📋 Or click here, then <b>Ctrl+V</b> to paste a snip / screenshot';
    box.addEventListener('click', function () { box.focus(); });
    document.addEventListener('paste', function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
          var f = items[i].getAsFile(); if (!f) continue;
          e.preventDefault(); onFile(f);
          box.innerHTML = '✅ Picture pasted — Ctrl+V again to replace it'; return;
        }
      }
    });
  }
  window.LBPastePic = { attach: attach };
})();
