const dbName = 'LinksDB';
const storeName = 'links';
const itemsPerPage = 15;
let db, currentPage = 1, totalPages = 1;
let editingId = null;

window.onload = async () => {
  await initDB();
  await migrateFromLocalStorage();
  restoreCollapsedState();
  renderLinks();
  setupImageSelectionText();
};

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onerror = () => reject('Không thể mở IndexedDB');
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    request.onupgradeneeded = e => {
      db = e.target.result;
      db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
    };
  });
}

async function migrateFromLocalStorage() {
  const oldData = JSON.parse(localStorage.getItem('links') || '[]');
  if (oldData.length === 0) return;
  for (const item of oldData) {
    await addToDB(item);
  }
  localStorage.removeItem('links');
}

function addToDB(data) {
  return new Promise(resolve => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.add(data).onsuccess = resolve;
  });
}

function updateDB(id, newData) {
  return new Promise(resolve => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result;
      const updated = { ...record, ...newData };
      store.put(updated).onsuccess = resolve;
    };
  });
}

function getAllLinks() {
  return new Promise(resolve => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.reverse());
  });
}

function deleteLink(id) {
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(id).onsuccess = () => {
    showStatus("Xóa thành công!");
    renderLinks();
  };
}

async function addLink() {
  const title = document.getElementById('linkTitle').value.trim();
  const url = document.getElementById('linkUrl').value.trim();
  const type = document.getElementById('linkType').value;
  const imgInput = document.getElementById('linkImage');
  let image = '';

  if (editingId) {
    const reader = new FileReader();
    if (imgInput.files.length > 0) {
      reader.onload = async () => {
        image = reader.result;
        await updateDB(editingId, { title, url, type, image });
        resetEditState();
        showStatus("Đã cập nhật link!");
        renderLinks();
      };
      reader.readAsDataURL(imgInput.files[0]);
    } else {
      await updateDB(editingId, { title, url, type });
      resetEditState();
      showStatus("Đã cập nhật link!");
      renderLinks();
    }
  } else {
    if (imgInput.files.length > 0) {
      const reader = new FileReader();
      reader.onload = async () => {
        image = reader.result;
        await addToDB({ title, url, type, image });
        clearInputs();
        showStatus(`${type === 'truyen' ? 'Truyện' : 'Video'} đã được lưu!`);
        renderLinks();
      };
      reader.readAsDataURL(imgInput.files[0]);
    } else {
      await addToDB({ title, url, type, image });
      clearInputs();
      showStatus(`${type === 'truyen' ? 'Truyện' : 'Video'} đã được lưu!`);
      renderLinks();
    }
  }
}

function editLink(id) {
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  store.get(id).onsuccess = e => {
    const data = e.target.result;
    document.getElementById('linkTitle').value = data.title;
    document.getElementById('linkUrl').value = data.url;
    document.getElementById('linkType').value = data.type;
    document.getElementById('imageSelectedText').textContent = data.image ? "Đang giữ ảnh cũ" : "";
    editingId = id;
    document.getElementById('addOrUpdateBtn').textContent = "Cập nhật";
    showStatus("Đang sửa link...");
  };
}

function resetEditState() {
  editingId = null;
  clearInputs();
  document.getElementById('addOrUpdateBtn').textContent = "Thêm Link";
}

function clearInputs() {
  document.getElementById('linkTitle').value = '';
  document.getElementById('linkUrl').value = '';
  document.getElementById('linkImage').value = '';
  document.getElementById('imageSelectedText').textContent = '';
}

async function renderLinks() {
  const allLinks = await getAllLinks();

  // 🔍 Lọc theo từ khóa
  const searchValue = document.getElementById('searchInput').value.trim().toLowerCase();
  const filteredLinks = allLinks.filter(l => l.title.toLowerCase().includes(searchValue));

  const truyenLinks = filteredLinks.filter(l => l.type === 'truyen');
  const videoLinks = filteredLinks.filter(l => l.type === 'video');

  totalPages = Math.ceil(filteredLinks.length / itemsPerPage);
  currentPage = Math.min(currentPage, totalPages || 1);
  const start = (currentPage - 1) * itemsPerPage;

  const pageTruyen = truyenLinks.slice(start, start + itemsPerPage);
  const pageVideo = videoLinks.slice(start, start + itemsPerPage);

  const truyenList = document.getElementById('truyenList');
  const videoList = document.getElementById('videoList');
  truyenList.innerHTML = '';
  videoList.innerHTML = '';

  const createHTML = (items) => items.map(item => `
    <div class="link-item">
      <div class="link-info">
        <span class="link-title" id="title-${item.id}">${item.title || '(Không tiêu đề)'}</span>
        <span class="link-type">${item.type}</span>
        ${item.image ? `<img src="${item.image}" alt="thumb" width="100" style="margin-top:10px;border-radius:6px;">` : ''}
        <br>
        <button class="view-btn" onclick="markAsViewed(${item.id}); window.open('${item.url}', '_blank')">Xem</button>
      </div>
      <div class="link-actions">
        <button class="edit-btn" onclick="editLink(${item.id})">Sửa</button>
        <button onclick="deleteLink(${item.id})">Xóa</button>
      </div>
    </div>
  `).join('');

  truyenList.innerHTML = pageTruyen.length ? createHTML(pageTruyen) : `<div class="empty-state">Không có truyện.</div>`;
  videoList.innerHTML = pageVideo.length ? createHTML(pageVideo) : `<div class="empty-state">Không có video.</div>`;

  document.getElementById('currentPageDisplay').innerText = currentPage;
  document.getElementById('totalPagesDisplay').innerText = totalPages || 1;
}

function changePage(newPage) {
  if (newPage < 1 || newPage > totalPages) return;
  currentPage = newPage;
  renderLinks();
}

function jumpToPage() {
  const input = document.getElementById('jumpToPage');
  const value = parseInt(input.value);
  if (value >= 1 && value <= totalPages) {
    currentPage = value;
    renderLinks();
  }
}

function toggleSection(type) {
  const list = document.getElementById(type + 'List');
  const btn = document.getElementById('toggle-' + type);
  const key = `collapsed-${type}`;
  const isCollapsed = list.style.display === 'none';

  if (isCollapsed) {
    list.style.display = '';
    btn.textContent = '−';
    localStorage.setItem(key, 'false');
  } else {
    list.style.display = 'none';
    btn.textContent = '+';
    localStorage.setItem(key, 'true');
  }
}

function restoreCollapsedState() {
  ['truyen', 'video'].forEach(type => {
    const list = document.getElementById(type + 'List');
    const btn = document.getElementById('toggle-' + type);
    const isCollapsed = localStorage.getItem(`collapsed-${type}`) === 'true';
    if (isCollapsed) {
      list.style.display = 'none';
      btn.textContent = '+';
    } else {
      list.style.display = '';
      btn.textContent = '−';
    }
  });
}

function setupImageSelectionText() {
  const imgInput = document.getElementById('linkImage');
  const text = document.getElementById('imageSelectedText');
  imgInput.addEventListener('change', () => {
    if (imgInput.files.length > 0) {
      text.textContent = 'Đã chọn ảnh thành công!';
    } else {
      text.textContent = '';
    }
  });
}

function showStatus(message) {
  const status = document.getElementById('statusMessage');
  status.textContent = message;
  status.style.display = 'block';
  setTimeout(() => {
    status.style.display = 'none';
  }, 2000);
}

function markAsViewed(id) {
  const titleEl = document.getElementById(`title-${id}`);
  if (titleEl) {
    titleEl.style.color = '#bbb';
  }
}