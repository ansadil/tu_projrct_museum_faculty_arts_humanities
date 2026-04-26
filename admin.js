const ADMIN_STORAGE_KEY = "museum_items_override_v1";

const state = {
  items: [],
  filtered: [],
  selectedId: null,
};

const el = {
  adminSearch: document.getElementById("adminSearch"),
  adminItemsList: document.getElementById("adminItemsList"),
  adminStatus: document.getElementById("adminStatus"),
  itemId: document.getElementById("itemId"),
  itemTitle: document.getElementById("itemTitle"),
  itemPrimaryImage: document.getElementById("itemPrimaryImage"),
  itemPrimaryUrl: document.getElementById("itemPrimaryUrl"),
  itemDescription: document.getElementById("itemDescription"),
  itemUrls: document.getElementById("itemUrls"),
  itemImages: document.getElementById("itemImages"),
  itemFunctionalTags: document.getElementById("itemFunctionalTags"),
  itemFields: document.getElementById("itemFields"),
  itemXlsx: document.getElementById("itemXlsx"),
  newItemBtn: document.getElementById("newItemBtn"),
  deleteItemBtn: document.getElementById("deleteItemBtn"),
  saveItemBtn: document.getElementById("saveItemBtn"),
  saveAllBtn: document.getElementById("saveAllBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importInput: document.getElementById("importInput"),
  resetBtn: document.getElementById("resetBtn"),
};

function setStatus(message, isError = false) {
  el.adminStatus.textContent = message;
  el.adminStatus.className = `mt-3 text-sm ${isError ? "text-rose-600" : "text-slate-600"}`;
}

function safeParseObject(text, fieldName) {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(`${fieldName} must be a JSON object.`);
    }
    return parsed;
  } catch (error) {
    throw new Error(`تنسيق ${fieldName} غير صحيح: ${error.message}`);
  }
}

function loadForm(item) {
  if (!item) return;
  el.itemId.value = item.id || "";
  el.itemTitle.value = item.title || "";
  el.itemPrimaryImage.value = item.primaryImage || "";
  el.itemPrimaryUrl.value = item.primaryUrl || "";
  el.itemDescription.value = item.description || "";
  el.itemUrls.value = (item.urls || []).join("\n");
  el.itemImages.value = (item.images || []).join("\n");
  el.itemFunctionalTags.value = (item.functionalTags || []).join("\n");
  el.itemFields.value = JSON.stringify(item.fields || {}, null, 2);
  el.itemXlsx.value = JSON.stringify(item.xlsx || {}, null, 2);
}

function getSelectedItem() {
  return state.items.find((item) => item.id === state.selectedId) || null;
}

function renderList() {
  if (!state.filtered.length) {
    el.adminItemsList.innerHTML = "<li class='p-3 text-sm text-slate-500'>لا توجد عناصر.</li>";
    return;
  }

  el.adminItemsList.innerHTML = state.filtered
    .map((item) => {
      const active = item.id === state.selectedId ? "bg-indigo-50" : "hover:bg-slate-50";
      return `<li data-item-id="${item.id}" class="cursor-pointer border-b border-slate-100 p-3 ${active}">
          <p class="text-sm font-bold text-slate-800">${item.title || "بدون عنوان"}</p>
          <p class="text-xs text-slate-500">${item.id || ""}</p>
        </li>`;
    })
    .join("");

  for (const li of el.adminItemsList.querySelectorAll("li[data-item-id]")) {
    li.addEventListener("click", () => {
      state.selectedId = li.getAttribute("data-item-id");
      renderList();
      loadForm(getSelectedItem());
    });
  }
}

function applySearch() {
  const q = el.adminSearch.value.trim().toLowerCase();
  if (!q) {
    state.filtered = [...state.items];
  } else {
    state.filtered = state.items.filter((item) =>
      [item.title || "", item.id || "", item.description || ""].join(" ").toLowerCase().includes(q)
    );
  }
  if (!state.filtered.find((i) => i.id === state.selectedId)) {
    state.selectedId = state.filtered[0]?.id || null;
  }
  renderList();
  loadForm(getSelectedItem());
}

function collectFormData() {
  const id = el.itemId.value.trim();
  if (!id) throw new Error("المعرف ID مطلوب.");
  const title = el.itemTitle.value.trim();
  const urls = el.itemUrls.value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const images = el.itemImages.value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const functionalTags = el.itemFunctionalTags.value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  return {
    id,
    title: title || "بدون عنوان",
    description: el.itemDescription.value.trim(),
    primaryImage: el.itemPrimaryImage.value.trim(),
    primaryUrl: el.itemPrimaryUrl.value.trim(),
    urls,
    images,
    functionalTags,
    fields: safeParseObject(el.itemFields.value, "الحقول"),
    xlsx: safeParseObject(el.itemXlsx.value, "بيانات Excel"),
    source: "admin",
    qr: "",
  };
}

function saveItem() {
  try {
    const updated = collectFormData();
    const idx = state.items.findIndex((x) => x.id === state.selectedId);
    if (idx === -1) {
      state.items.push(updated);
    } else {
      state.items[idx] = { ...state.items[idx], ...updated };
    }
    state.selectedId = updated.id;
    applySearch();
    setStatus("تم حفظ تعديل العنصر.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function saveAll() {
  localStorage.setItem(
    ADMIN_STORAGE_KEY,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      count: state.items.length,
      items: state.items,
    })
  );
  setStatus("تم حفظ كل التعديلات محلياً. افتح الصفحة الرئيسية لرؤية التغييرات.");
}

function createNewItem() {
  const id = `item-admin-${Date.now()}`;
  const fresh = {
    id,
    title: "عنصر جديد",
    description: "",
    fields: {},
    urls: [],
    images: [],
    functionalTags: [],
    source: "admin",
    primaryUrl: "",
    primaryImage: "",
    xlsx: {},
    qr: "",
  };
  state.items.unshift(fresh);
  state.selectedId = id;
  applySearch();
  setStatus("تم إنشاء عنصر جديد.");
}

function deleteItem() {
  if (!state.selectedId) {
    setStatus("اختر عنصراً أولاً للحذف.", true);
    return;
  }
  state.items = state.items.filter((item) => item.id !== state.selectedId);
  state.selectedId = state.items[0]?.id || null;
  applySearch();
  setStatus("تم حذف العنصر.");
}

function exportJson() {
  const payload = {
    generatedAt: new Date().toISOString(),
    count: state.items.length,
    items: state.items,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "museum-items-admin-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("تم تصدير ملف JSON.");
}

async function importJson(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.items)) {
      throw new Error("الملف لا يحتوي على مصفوفة items.");
    }
    state.items = parsed.items;
    state.selectedId = state.items[0]?.id || null;
    applySearch();
    setStatus("تم استيراد البيانات بنجاح.");
  } catch (error) {
    setStatus(`فشل الاستيراد: ${error.message}`, true);
  }
}

async function loadInitialData() {
  const overrideRaw = localStorage.getItem(ADMIN_STORAGE_KEY);
  if (overrideRaw) {
    try {
      const payload = JSON.parse(overrideRaw);
      if (payload && Array.isArray(payload.items)) {
        state.items = payload.items;
      }
    } catch (_error) {
      // Ignore invalid override and fallback to static JSON.
    }
  }

  if (!state.items.length) {
    if (window.__MUSEUM_DB__ && Array.isArray(window.__MUSEUM_DB__.items)) {
      state.items = window.__MUSEUM_DB__.items;
    }
  }

  if (!state.items.length) {
    const response = await fetch("./db/items.json");
    if (!response.ok) throw new Error("تعذر تحميل db/items.json");
    const payload = await response.json();
    state.items = payload.items || [];
  }

  state.filtered = [...state.items];
  state.selectedId = state.items[0]?.id || null;
  renderList();
  loadForm(getSelectedItem());
}

function attachEvents() {
  el.adminSearch.addEventListener("input", applySearch);
  el.newItemBtn.addEventListener("click", createNewItem);
  el.deleteItemBtn.addEventListener("click", deleteItem);
  el.saveItemBtn.addEventListener("click", saveItem);
  el.saveAllBtn.addEventListener("click", saveAll);
  el.exportBtn.addEventListener("click", exportJson);
  el.importInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await importJson(file);
    event.target.value = "";
  });
  el.resetBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    setStatus("تم حذف النسخة المحلية. أعد تحميل الصفحة لإعادة قراءة db/items.json");
  });
}

loadInitialData()
  .then(() => {
    attachEvents();
    setStatus("جاهز للإدارة.");
  })
  .catch((error) => {
    setStatus(error.message, true);
  });
