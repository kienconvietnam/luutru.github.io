const dbName = 'LinksDB';
const storeName = 'links';
const itemsPerPage = 10; 

let db;
let currentTruyenPage = 1;
let currentVideoPage = 1;
let totalTruyenPages = 1;
let totalVideoPages = 1;

let editingId = null;
let selectedTag = null; 

window.onload = async () => {
  await initDB();
  await migrateFromLocalStorage();
  restoreCollapsedState();
  renderLinks();
  setupImageSelectionText();
  setupClickOutside(); 

  const allInputsOnPage = document.querySelectorAll('input');
  allInputsOnPage.forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); 
        input.blur();       
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
    document.getElementById('linkTags').value = data.tags ? data.tags.join(', ') : '';
    document.getElementById('imageSelectedText').textContent = data.image ? "Đang giữ ảnh cũ" : "";
    editingId = id;
    document.getElementById('addOrUpdateBtn').textContent = "Cập nhật";
    showStatus("Đang sửa link...");
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
  
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
  }

  const jumpPageInput = document.getElementById('jumpToPage');
  if (jumpPageInput) {
    jumpPageInput.value = ''; 
  }
  currentTruyenPage = 1; 
  currentVideoPage = 1; 
}

function filterByTag(tag) {
  if (selectedTag === tag) {
    selectedTag = null; 
  } else {
    selectedTag = tag;
  }
  currentTruyenPage = 1;
  currentVideoPage = 1;
  renderLinks();
}

function toggleTagCloud() {
  const tagContainer = document.getElementById('tagContainer');
  tagContainer.classList.toggle('hidden');
}

function toggleExpandTags(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.toggle('expanded');
  }
}

function showTagSuggestions() {
  const box = document.getElementById('tagSuggestionBox');
  if (box.children.length > 0) {
    box.classList.remove('hidden');
  }
}

function selectSuggestTag(tag) {
  const input = document.getElementById('linkTags');
  let currentTags = parseTags(input.value);
  
  if (!currentTags.includes(tag)) {
    currentTags.push(tag);
  }
  
  input.value = currentTags.join(', ');
  input.focus();
}

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

  // Tính toán tổng số trang chuẩn xác cho từng danh mục riêng biệt
  totalTruyenPages = Math.ceil(truyenLinks.length / itemsPerPage) || 1;
  totalVideoPages = Math.ceil(videoLinks.length / itemsPerPage) || 1;

  // Giữ số trang hiện tại không vượt quá tổng số trang thật
  currentTruyenPage = Math.min(currentTruyenPage, totalTruyenPages);
  currentVideoPage = Math.min(currentVideoPage, totalVideoPages);

  const startTruyen = (currentTruyenPage - 1) * itemsPerPage;
  const startVideo = (currentVideoPage - 1) * itemsPerPage;

  const pageTruyen = truyenLinks.slice(startTruyen, startTruyen + itemsPerPage);
  const pageVideo = videoLinks.slice(startVideo, startVideo + itemsPerPage);

  const truyenList = document.getElementById('truyenList');
  const videoList = document.getElementById('videoList');
  truyenList.innerHTML = '';
  videoList.innerHTML = '';

  const createHTML = (items) => {
    let wrapperHTML = '<div class="links-list-wrapper">';
    wrapperHTML += items.map(item => {
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

      const defaultImg = item.image ? item.image : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="%23eaeef3"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12" fill="%237f8c8d">No Cover</text></svg>';

      return `
        <div class="link-item">
          <div class="link-info">
            <img src="${defaultImg}" alt="thumb" class="entry-thumbnail">
            <span class="link-type">${item.type === 'truyen' ? 'Truyện' : 'Video'}</span>
            <span class="link-title" id="title-${item.id}">${item.title || '(Không tiêu đề)'}</span>
            <div class="item-meta-row">
              ${tagsHTML}
            </div>
            <button class="view-btn" onclick="markAsViewed(${item.id}); window.open('${item.url}', '_blank')">Xem</button>
          </div>
          <div class="link-actions">
            <button class="edit-btn" onclick="editLink(${item.id})">Sửa</button>
            <button class="delete-btn-custom" onclick="deleteLink(${item.id})">Xóa</button>
          </div>
        </div>
      `;
    }).join('');
    wrapperHTML += '</div>';
    return wrapperHTML;
  };

  truyenList.innerHTML = pageTruyen.length ? createHTML(pageTruyen) : `<div class="empty-state">Không có truyện phù hợp.</div>`;
  videoList.innerHTML = pageVideo.length ? createHTML(pageVideo) : `<div class="empty-state">Không có video phù hợp.</div>`;

  // 🌟 SỬA TẠI ĐÂY: Hiển thị thông tin phân trang dựa trên danh mục có nhiều trang nhất một cách tường minh
  // Tuy nhiên, số trang hiện tại hiển thị sẽ dựa trên trạng thái thực tế của danh mục đó, không gán chung chung làm sinh ra trang trống.
  const maxTotalPages = Math.max(totalTruyenPages, totalVideoPages);
  
  // Nếu danh mục truyện đang hiển thị nhiều trang hơn hoặc bằng thì lấy mốc truyen, ngược lại lấy mốc video
  let displayPage = currentTruyenPage;
  if (totalVideoPages > totalTruyenPages) {
    displayPage = currentVideoPage;
  }
  
  document.getElementById('currentPageDisplay').innerText = displayPage;
  document.getElementById('totalPagesDisplay').innerText = maxTotalPages;
}

// 🌟 SỬA TẠI ĐÂY: Chuyển trang thông minh, kiểm tra giới hạn độc lập cho từng cột dữ liệu
function changePage(action) {
  let targetTruyenPage = currentTruyenPage;
  let targetVideoPage = currentVideoPage;

  if (action === 'prev') {
    targetTruyenPage = currentTruyenPage - 1;
    targetVideoPage = currentVideoPage - 1;
  } else if (action === 'next') {
    targetTruyenPage = currentTruyenPage + 1;
    targetVideoPage = currentVideoPage + 1;
  }

  // Kiểm tra và ràng buộc điều kiện trang cho Truyện độc lập
  if (targetTruyenPage >= 1 && targetTruyenPage <= totalTruyenPages) {
    currentTruyenPage = targetTruyenPage;
  }
  
  // Kiểm tra và ràng buộc điều kiện trang cho Video độc lập
  if (targetVideoPage >= 1 && targetVideoPage <= totalVideoPages) {
    currentVideoPage = targetVideoPage;
  }

  renderLinks();
}

// 🌟 ĐÃ CẬP NHẬT: Xử lý tăng/giảm trang chính xác theo chu kỳ độc lập
function changePage(action) {
  const maxTotalPages = Math.max(totalTruyenPages, totalVideoPages);
  const displayPage = Math.max(currentTruyenPage, currentVideoPage);
  
  let newPage = displayPage;
  if (action === 'prev') {
    newPage = displayPage - 1;
  } else if (action === 'next') {
    newPage = displayPage + 1;
  }

  if (newPage < 1 || newPage > maxTotalPages) return;

  // Cập nhật số trang cho từng danh mục dựa trên giới hạn riêng của nó
  currentTruyenPage = Math.min(newPage, totalTruyenPages);
  currentVideoPage = Math.min(newPage, totalVideoPages);

  renderLinks();
}

// 🌟 ĐÃ CẬP NHẬT: Nhảy trang chính xác và xóa giá trị ô nhập sau khi hoàn tất
function jumpToPage() {
  const input = document.getElementById('jumpToPage');
  const value = parseInt(input.value);
  const maxTotalPages = Math.max(totalTruyenPages, totalVideoPages);

  if (value >= 1 && value <= maxTotalPages) {
    currentTruyenPage = Math.min(value, totalTruyenPages);
    currentVideoPage = Math.min(value, totalVideoPages);
    renderLinks();
    
    // Đưa tiêu điểm ra ngoài và xóa trống ô nhập cho đẹp
    input.blur(); 
    input.value = ''; 
  } else if (!isNaN(value)) {
    showStatus("Số trang không hợp lệ!");
    input.value = '';
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