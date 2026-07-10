const dbName = 'LinksDB';
const storeName = 'links';
const itemsPerPage = 15;
let db, currentPage = 1, totalPages = 1;
let editingId = null;
let selectedTag = null; 

window.onload = async () => {
  await initDB();
  await migrateFromLocalStorage();
  restoreCollapsedState();
  renderLinks();
  setupImageSelectionText();
  setupClickOutside(); // Lắng nghe sự kiện ẩn hộp gợi ý tag khi bấm ra ngoài

  // 🌟 ĐOẠN CODE ĐÃ SỬA: Ấn Enter ở BẤT KỲ ĐÂU cũng CHỈ hạ bàn phím, không tự lưu
  const allInputsOnPage = document.querySelectorAll('input');
  allInputsOnPage.forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // Ngăn hành vi mặc định (tránh tự submit form nếu có)
        input.blur();       // Chỉ hạ bàn phím xuống
      }
    });
  });
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

// Hàm phân tách chuỗi nhập từ ô input thành mảng các tag độc lập
function parseTags(tagString) {
  if (!tagString) return [];
  return tagString.split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t !== '');
}

async function addLink() {
  const title = document.getElementById('linkTitle').value.trim();
  const url = document.getElementById('linkUrl').value.trim();
  const type = document.getElementById('linkType').value;
  const tags = parseTags(document.getElementById('linkTags').value);
  const imgInput = document.getElementById('linkImage');
  let image = '';

  if (editingId) {
    const reader = new FileReader();
    if (imgInput.files.length > 0) {
      reader.onload = async () => {
        image = reader.result;
        await updateDB(editingId, { title, url, type, tags, image });
        resetEditState();
        showStatus("Đã cập nhật link!");
        renderLinks();
      };
      reader.readAsDataURL(imgInput.files[0]);
    } else {
      await updateDB(editingId, { title, url, type, tags });
      resetEditState();
      showStatus("Đã cập nhật link!");
      renderLinks();
    }
  } else {
    if (imgInput.files.length > 0) {
      const reader = new FileReader();
      reader.onload = async () => {
        image = reader.result;
        await addToDB({ title, url, type, tags, image });
        clearInputs();
        showStatus(`${type === 'truyen' ? 'Truyện' : 'Video'} đã được lưu!`);
        renderLinks();
      };
      reader.readAsDataURL(imgInput.files[0]);
    } else {
      await addToDB({ title, url, type, tags, image });
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
    // Hiển thị lại các tag cũ ngăn cách nhau bằng dấu phẩy để chỉnh sửa tiếp
    document.getElementById('linkTags').value = data.tags ? data.tags.join(', ') : '';
    document.getElementById('imageSelectedText').textContent = data.image ? "Đang giữ ảnh cũ" : "";
    editingId = id;
    document.getElementById('addOrUpdateBtn').textContent = "Cập nhật";
    showStatus("Đang sửa link...");
    
    // Tự động cuộn màn hình mượt lên khu vực điền thông tin để dễ thao tác trên điện thoại
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
  document.getElementById('linkTags').value = '';
  document.getElementById('linkImage').value = '';
  document.getElementById('imageSelectedText').textContent = '';
  document.getElementById('tagSuggestionBox').classList.add('hidden');
  
  // Xóa chữ trong thanh tìm kiếm khi thêm/cập nhật xong
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
  }

  // 🌟 ĐOẠN CODE MỚI: Xóa số trong ô nhảy trang và đưa biến currentPage về trang 1
  const jumpPageInput = document.getElementById('jumpToPage');
  if (jumpPageInput) {
    jumpPageInput.value = ''; // Xóa trắng ô nhập số trang
  }
  currentPage = 1; // Đặt lại biến trang hiện tại về trang 1
}

function filterByTag(tag) {
  if (selectedTag === tag) {
    selectedTag = null; 
  } else {
    selectedTag = tag;
  }
  currentPage = 1;
  renderLinks();
}

function toggleTagCloud() {
  const tagContainer = document.getElementById('tagContainer');
  tagContainer.classList.toggle('hidden');
}

// Bật tắt hiển thị toàn bộ tag khi danh sách tag quá dài dưới card truyện
function toggleExpandTags(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.toggle('expanded');
  }
}

// Mở hộp thoại chứa các nút bấm chọn nhanh tag
function showTagSuggestions() {
  const box = document.getElementById('tagSuggestionBox');
  if (box.children.length > 0) {
    box.classList.remove('hidden');
  }
}

// Thêm tag được bấm từ gợi ý vào ô input (Nối chuỗi, không lo đè mất tag cũ)
function selectSuggestTag(tag) {
  const input = document.getElementById('linkTags');
  let currentTags = parseTags(input.value);
  
  if (!currentTags.includes(tag)) {
    currentTags.push(tag);
  }
  
  input.value = currentTags.join(', ');
  input.focus();
}

// Tự động đóng hộp gợi ý tag khi bấm ra khu vực bên ngoài ô nhập
function setupClickOutside() {
  document.addEventListener('click', (e) => {
    const container = document.querySelector('.tag-input-container');
    if (container && !container.contains(e.target)) {
      document.getElementById('tagSuggestionBox').classList.add('hidden');
    }
  });
}

function renderTagCloud(allLinks) {
  const tagContainer = document.getElementById('tagContainer');
  const suggestionBox = document.getElementById('tagSuggestionBox');
  const tagCounts = {};
  
  allLinks.forEach(item => {
    if (item.tags && Array.isArray(item.tags)) {
      item.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });

  const uniqueTags = Object.keys(tagCounts).sort();
  
  // Tạo danh sách các nút bấm tag gợi ý thông minh đổ vào hộp chọn nhanh
  if (uniqueTags.length > 0) {
    suggestionBox.innerHTML = uniqueTags.map(tag => 
      `<button type="button" class="suggest-tag-btn" onclick="selectSuggestTag('${tag}')">+ ${tag}</button>`
    ).join('');
  } else {
    suggestionBox.innerHTML = '<span style="font-size:0.8em;color:#666;padding:5px;">Chưa có tag nào sẵn có</span>';
  }

  if (uniqueTags.length === 0) {
    tagContainer.innerHTML = '';
    return;
  }

  // Tạo các nút tag dùng để lọc danh sách
  tagContainer.innerHTML = `
    <button class="tag-btn ${selectedTag === null ? 'active' : ''}" onclick="filterByTag(null)">
      Tất cả (${allLinks.length})
    </button>
  ` + uniqueTags.map(tag => `
    <button class="tag-btn ${selectedTag === tag ? 'active' : ''}" onclick="filterByTag('${tag}')">
      #${tag} (${tagCounts[tag]})
    </button>
  `).join('');
}

async function renderLinks() {
  const allLinks = await getAllLinks();

  renderTagCloud(allLinks);

  const searchValue = document.getElementById('searchInput').value.trim().toLowerCase();
  let filteredLinks = allLinks.filter(l => l.title.toLowerCase().includes(searchValue));

  if (selectedTag) {
    filteredLinks = filteredLinks.filter(l => l.tags && l.tags.includes(selectedTag));
  }

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

  const createHTML = (items) => items.map(item => {
    let tagsHTML = '';
    
    if (item.tags && item.tags.length > 0) {
      tagsHTML = `
        <div class="item-tags-wrapper" onclick="toggleExpandTags('tags-${item.id}'); event.stopPropagation();">
          <div class="item-tags" id="tags-${item.id}">
            ${item.tags.map(t => `<span class="item-tag">#${t}</span>`).join('')}
          </div>
          ${item.tags.length > 2 ? `<button class="tag-indicator-btn" title="Xem thêm tag">!</button>` : ''}
        </div>
      `;
    }

    return `
      <div class="link-item">
        <div class="link-info">
          <span class="link-title" id="title-${item.id}">${item.title || '(Không tiêu đề)'}</span>
          
          <div class="item-meta-row">
            <span class="link-type">${item.type}</span>
            ${tagsHTML}
          </div>
          
          ${item.image ? `<img src="${item.image}" alt="thumb" class="entry-thumbnail">` : ''}
          
          <button class="view-btn" onclick="markAsViewed(${item.id}); window.open('${item.url}', '_blank')">Xem</button>
        </div>
        <div class="link-actions">
          <button class="edit-btn" onclick="editLink(${item.id})">Sửa</button>
          <button class="delete-btn-custom" onclick="deleteLink(${item.id})">Xóa</button>
        </div>
      </div>
    `;
  }).join('');

  truyenList.innerHTML = pageTruyen.length ? createHTML(pageTruyen) : `<div class="empty-state">Không có truyện phù hợp.</div>`;
  videoList.innerHTML = pageVideo.length ? createHTML(pageVideo) : `<div class="empty-state">Không có video phù hợp.</div>`;

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