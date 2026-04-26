const state = {
  items: [],
  filtered: [],
  activeId: null,
};
const ADMIN_STORAGE_KEY = "museum_items_override_v1";

const itemsList = document.getElementById("itemsList");
const detailsPanel = document.getElementById("detailsPanel");
const searchInput = document.getElementById("searchInput");
const classificationFilter = document.getElementById("classificationFilter");
const timePeriodFilter = document.getElementById("timePeriodFilter");
const resultCount = document.getElementById("resultCount");

function resolveAssetPath(assetPath = "") {
  if (!assetPath) return "";
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  return `./${assetPath.replace(/^\.?\/*/, "")}`;
}

function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function filterItems(query) {
  const selectedClass = (classificationFilter?.value || "").trim().toLowerCase();
  const selectedTimePeriod = (timePeriodFilter?.value || "").trim().toLowerCase();
  const q = query.trim().toLowerCase();
  return state.items.filter((item) => {
    const itemClassValue = getFunctionalClassification(item).toLowerCase();
    if (selectedClass && itemClassValue !== selectedClass) {
      return false;
    }
    const itemTimePeriodValue = getTimePeriod(item).toLowerCase();
    if (selectedTimePeriod && itemTimePeriodValue !== selectedTimePeriod) {
      return false;
    }
    if (!q) {
      return true;
    }
    const haystack = [
      item.title || "",
      item.description || "",
      ...Object.entries(item.fields || {}).flat(),
      ...Object.entries(item.xlsx || {}).flat(),
      ...(item.urls || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function normalizeArabicKey(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[•*]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function getFunctionalClassification(item) {
  const allEntries = [
    ...Object.entries(item.fields || {}),
    ...Object.entries(item.xlsx || {}),
  ];
  for (const [key, value] of allEntries) {
    const normalizedKey = normalizeArabicKey(key);
    if (
      normalizedKey.includes("التصنيفالوظيفي") ||
      normalizedKey === "التصنيف" ||
      normalizedKey.endsWith("التصنيف")
    ) {
      const textValue = String(value || "").trim();
      if (textValue) return textValue;
    }
  }
  return "";
}

function getTimePeriod(item) {
  const allEntries = [
    ...Object.entries(item.fields || {}),
    ...Object.entries(item.xlsx || {}),
  ];
  for (const [key, value] of allEntries) {
    const normalizedKey = normalizeArabicKey(key);
    if (normalizedKey.includes("الفترةالزمنية") || normalizedKey.includes("فترةزمنية")) {
      const textValue = String(value || "").trim();
      if (textValue) return textValue;
    }
  }
  return "";
}

function populateClassificationFilter() {
  const classifications = new Set();
  for (const item of state.items) {
    const value = getFunctionalClassification(item);
    if (value) classifications.add(value);
  }

  const sorted = [...classifications].sort((a, b) => a.localeCompare(b, "ar"));
  classificationFilter.innerHTML =
    `<option value="">الكل</option>` +
    sorted.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function populateTimePeriodFilter() {
  const periods = new Set();
  for (const item of state.items) {
    const value = getTimePeriod(item);
    if (value) periods.add(value);
  }

  const sorted = [...periods].sort((a, b) => a.localeCompare(b, "ar"));
  timePeriodFilter.innerHTML =
    `<option value="">الكل</option>` +
    sorted.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function renderList() {
  if (!state.filtered.length) {
    itemsList.innerHTML =
      "<li class='p-4 text-sm text-slate-500'>لا توجد نتائج مطابقة للفلاتر الحالية.</li>";
    resultCount.textContent = "0 نتيجة";
    detailsPanel.innerHTML = "<p class='text-slate-500'>لا توجد عناصر مطابقة للبحث.</p>";
    return;
  }

  resultCount.textContent = `${state.filtered.length} نتيجة`;
  itemsList.innerHTML = state.filtered
    .map((item) => {
      const thumb = resolveAssetPath(item.primaryImage);
      const activeClass =
        item.id === state.activeId
          ? "bg-indigo-50 border-indigo-200"
          : "bg-white border-transparent hover:bg-slate-50";
      return `
        <li class="cursor-pointer border-b border-slate-100 p-3 transition ${activeClass}" data-item-id="${escapeHtml(item.id)}">
          ${
            thumb
              ? `<img class="mb-2 h-28 w-full rounded-xl border border-slate-200 object-cover" src="${escapeHtml(thumb)}" alt="${escapeHtml(item.title)}" />`
              : `<div class="mb-2 h-28 w-full rounded-xl border border-dashed border-slate-200 bg-slate-50"></div>`
          }
          <div>
            <h3 class="text-sm font-bold leading-6 text-slate-800">${escapeHtml(item.title || "بدون عنوان")}</h3>
            <p class="mt-1 text-xs text-slate-500">${escapeHtml(item.source || "")}</p>
          </div>
        </li>
      `;
    })
    .join("");

  for (const li of itemsList.querySelectorAll("li[data-item-id]")) {
    li.addEventListener("click", () => {
      state.activeId = li.getAttribute("data-item-id");
      renderList();
      renderDetails();
    });
  }
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

function renderRows(fieldsObj = {}) {
  const rows = Object.entries(fieldsObj);
  if (!rows.length) return "";
  return rows
    .map(
      ([key, value]) => `
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div class="mb-1 text-xs font-bold text-slate-700">${escapeHtml(String(key))}</div>
        <div class="text-sm leading-6 text-slate-600">${escapeHtml(String(value))}</div>
      </div>
    `
    )
    .join("");
}

function renderDetails() {
  const item = state.filtered.find((x) => x.id === state.activeId) || state.filtered[0];
  if (!item) {
    detailsPanel.innerHTML = "<p class='text-slate-500'>اختر قطعة من القائمة لعرض التفاصيل.</p>";
    return;
  }
  state.activeId = item.id;

  const mainImage = resolveAssetPath(item.primaryImage);
  const qrImage = resolveAssetPath(item.qr);
  const urls = item.urls || [];

  const description = item.description
    ? `<pre class="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">${escapeHtml(item.description)}</pre>`
    : "<p class='text-sm text-slate-500'>لا يوجد وصف متاح.</p>";

  detailsPanel.innerHTML = `
    <h2 class="mb-4 text-2xl font-extrabold leading-10 text-slate-900">${escapeHtml(item.name || item.title || "بدون عنوان")}</h2>
    ${mainImage ? `<img class="mb-4 max-h-[420px] w-full rounded-2xl border border-slate-200 object-contain bg-slate-50 p-2" src="${escapeHtml(mainImage)}" alt="${escapeHtml(item.title)}" />` : ""}

    <h3 class="mb-2 text-lg font-bold text-slate-800">الوصف</h3>
    ${description}

    ${
      Object.keys(item.fields || {}).length
        ? `<h3 class="mb-2 mt-5 text-lg font-bold text-slate-800">معلومات إضافية</h3><div class="grid grid-cols-1 gap-3 md:grid-cols-2">${renderRows(item.fields)}</div>`
        : ""
    }

    ${
      Object.keys(item.xlsx || {}).length
        ? `<h3 class="mb-2 mt-5 text-lg font-bold text-slate-800">بيانات من ملف Excel</h3><div class="grid grid-cols-1 gap-3 md:grid-cols-2">${renderRows(item.xlsx)}</div>`
        : ""
    }

    <div class="mt-5">
      <h3 class="mb-2 text-lg font-bold text-slate-800">الروابط</h3>
      ${
        urls.length
          ? urls
              .map(
                (url) =>
                  `<p class="mb-2"><a class="break-all text-sm font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-4 hover:text-indigo-700" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></p>`
              )
              .join("")
          : "<p class='text-sm text-slate-500'>لا توجد روابط.</p>"
      }
      ${
        qrImage
          ? `<div class="mt-4 inline-block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
               <p class="mb-2 text-xs font-semibold text-slate-500">QR</p>
               <img class="h-40 w-40 rounded-lg" src="${escapeHtml(qrImage)}" alt="QR ${escapeHtml(item.title)}" />
             </div>`
          : ""
      }
    </div>
  `;
}

async function init() {
  state.items = await loadItems();
  populateClassificationFilter();
  populateTimePeriodFilter();
  state.filtered = [...state.items];
  state.activeId = state.filtered[0]?.id || null;

  renderList();
  renderDetails();

  searchInput.addEventListener("input", () => {
    state.filtered = filterItems(searchInput.value);
    state.activeId = state.filtered[0]?.id || null;
    renderList();
    renderDetails();
  });

  classificationFilter.addEventListener("change", () => {
    state.filtered = filterItems(searchInput.value);
    state.activeId = state.filtered[0]?.id || null;
    renderList();
    renderDetails();
  });

  timePeriodFilter.addEventListener("change", () => {
    state.filtered = filterItems(searchInput.value);
    state.activeId = state.filtered[0]?.id || null;
    renderList();
    renderDetails();
  });
}

init().catch((error) => {
  console.error(error);
  detailsPanel.innerHTML =
    "<p class='text-sm text-red-600'>فشل تحميل البيانات. نفّذ أمر الاستخراج أولاً ثم أعد تحميل الصفحة.</p>";
});
