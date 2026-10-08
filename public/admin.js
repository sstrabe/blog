// Live Markdown preview in the post editor. Rendered by the Worker with the
// same renderer as the public page, so what you see is what readers get.
const editor = document.querySelector("textarea[data-preview]");
if (editor) {
  const target = document.getElementById(editor.dataset.preview);
  let timer;
  let last = "";
  const render = async () => {
    if (editor.value === last) return;
    last = editor.value;
    const res = await fetch("/admin/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": editor.dataset.csrf },
      body: JSON.stringify({ body: editor.value }),
    });
    if (res.ok) target.innerHTML = await res.text();
  };
  editor.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(render, 300);
  });
  render();
}

// Close the mobile drawer before navigating, so iOS Safari doesn't keep the tint.
const toggle = document.getElementById("nav-toggle");
if (toggle) {
  document.querySelectorAll(".sidebar a").forEach((a) => a.addEventListener("click", () => (toggle.checked = false)));
}
