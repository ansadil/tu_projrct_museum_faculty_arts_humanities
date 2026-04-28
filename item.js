const ADMIN_STORAGE_KEY = "museum_items_override_v1";
const detailsContainer = document.getElementById("itemDetailsPage");

function resolveAssetPath(assetPath = "") {
  if (!assetPath) return "";
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  return `./${assetPath.replace(/^\.?\/*/, "")}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRows(fieldsObj = {}) {
  const rows = Object.entries(fieldsObj).filter(([key]) => {
    const normalizedKey = String(key).toLowerCase();
    return (
      normalizedKey !== "url" &&
      !normalizedKey.includes("http") &&
      !normalizedKey.includes("رابط")
    );
  });

  if (!rows.length) return "";
  return rows
    .map(
      ([key, value]) => `
      <div class="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-fuchsia-50 p-3 text-wrap">
        <div class="mb-1 text-xs font-extrabold text-indigo-700 text-wrap">${escapeHtml(String(key))}</div>
        <div class="text-sm leading-6 text-slate-600 text-wrap text-pretty">${escapeHtml(String(value))}</div>
      </div>
    `
    )
    .join("");
}

async function loadItems() {
  const overrideRaw = localStorage.getItem(ADMIN_STORAGE_KEY);
  if (overrideRaw) {
    try {
      const overridePayload = JSON.parse(overrideRaw);
      if (overridePayload && Array.isArray(overridePayload.items)) {
        return overridePayload.items;
      }
    } catch (error) {
      console.warn("Invalid admin override data in localStorage.", error);
    }
  }

  if (window.__MUSEUM_DB__ && Array.isArray(window.__MUSEUM_DB__.items)) {
    return window.__MUSEUM_DB__.items;
  }

  const response = await fetch("./db/items.json");
  if (!response.ok) {
    throw new Error("Unable to load database JSON.");
  }
  const payload = await response.json();
  return payload.items || [];
}

function getItemIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function renderNotFound() {
  detailsContainer.innerHTML = `
    <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
      <h2 class="text-lg font-extrabold">لم يتم العثور على القطعة</h2>
      <p class="mt-2 text-sm">تأكد من صحة الرابط، ثم حاول مرة أخرى.</p>
      <a href="./index.html" class="mt-3 inline-block text-sm font-bold text-indigo-700 underline">العودة إلى الصفحة الرئيسية</a>
    </div>
  `;
}

function renderItem(item) {
  const mainImage = resolveAssetPath(item.primaryImage);
  const qrImage = resolveAssetPath(item.qr);
  const urls = item.urls || [];
  const title = item.name || item.title || "بدون عنوان";
  const description = item.description
    ? `<pre class="whitespace-pre-wrap rounded-xl sm:rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-indigo-50 p-3 sm:p-4 text-sm leading-6 sm:leading-7 text-slate-700">${escapeHtml(item.description)}</pre>`
    : "<p class='text-sm text-slate-500'>لا يوجد وصف متاح.</p>";

  detailsContainer.innerHTML = `
    <h2 class="mb-3 sm:mb-4 bg-gradient-to-r from-fuchsia-600 to-indigo-600 bg-clip-text text-xl sm:text-2xl font-extrabold leading-8 sm:leading-10 text-transparent">${escapeHtml(title)}</h2>
    ${mainImage ? `<img class="mb-3 sm:mb-4 max-h-[300px] sm:max-h-[420px] w-full rounded-2xl sm:rounded-3xl border border-fuchsia-200 object-contain bg-gradient-to-br from-fuchsia-50 to-indigo-50 p-2 shadow-sm" src="${escapeHtml(mainImage)}" alt="${escapeHtml(title)}" />` : ""}

    <h3 class="mb-2 text-lg font-extrabold text-fuchsia-700">الوصف</h3>
    ${description}

    ${
      Object.keys(item.fields || {}).length
        ? `<h3 class="mb-2 mt-5 text-lg font-extrabold text-indigo-700">معلومات إضافية</h3><div class="grid grid-cols-1 gap-2.5 sm:gap-3 md:grid-cols-2">${renderRows(item.fields)}</div>`
        : ""
    }

    ${
      Object.keys(item.xlsx || {}).length
        ? `<h3 class="mb-2 mt-5 text-lg font-extrabold text-cyan-700">بيانات من ملف Excel</h3><div class="grid grid-cols-1 gap-2.5 sm:gap-3 md:grid-cols-2">${renderRows(item.xlsx)}</div>`
        : ""
    }

    <div class="mt-5">
      <h3 class="mb-2 text-lg font-extrabold text-emerald-700">الروابط</h3>
      ${
        urls.length
          ? urls
              .map(
                (url) =>
                  `<p class="mb-2"><a class="break-all text-sm font-bold text-indigo-600 underline decoration-indigo-300 underline-offset-4 hover:text-fuchsia-600" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></p>`
              )
              .join("")
          : "<p class='text-sm text-slate-500'>لا توجد روابط.</p>"
      }
      ${
        qrImage
          ? `<div class="mt-4 inline-block rounded-xl sm:rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-2.5 sm:p-3 shadow-sm">
               <p class="mb-2 text-xs font-bold text-emerald-700">QR</p>
               <img class="h-32 w-32 sm:h-40 sm:w-40 rounded-lg" src="${escapeHtml(qrImage)}" alt="QR ${escapeHtml(title)}" />
             </div>`
          : ""
      }
    </div>
  `;
}

async function init() {
  const itemId = getItemIdFromQuery();
  if (!itemId) {
    renderNotFound();
    return;
  }

  const items = await loadItems();
  const item = items.find((x) => String(x.id) === String(itemId));

  if (!item) {
    renderNotFound();
    return;
  }

  renderItem(item);
}

init().catch((error) => {
  console.error(error);
  detailsContainer.innerHTML =
    "<p class='text-sm text-red-600'>فشل تحميل البيانات. نفّذ أمر الاستخراج أولاً ثم أعد تحميل الصفحة.</p>";
});
