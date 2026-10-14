const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, (s) => {
  $("enabled").checked = s.enabled;
  $("keyword").value = s.keyword;
  $("url").value = s.url;
});

$("save").addEventListener("click", () => {
  const settings = {
    enabled: $("enabled").checked,
    keyword: $("keyword").value.trim(),
    url: $("url").value.trim(),
  };
  chrome.storage.sync.set(settings, () => {
    $("status").textContent = "Saved";
    setTimeout(() => ($("status").textContent = ""), 1200);
  });
});
