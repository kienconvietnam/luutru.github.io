const dbName = 'LinksDB';
const storeName = 'links';

let db;
let editingId = null;
let selectedTag = null; 

// Biến lưu cache danh sách để không phải đọc lại IndexedDB liên tục
let cachedLinks = []; 

// CẤP THỊ CHO LAZY RENDER (Giúp tải trang và xóa tag siêu nhanh)
let itemsToShow = 14; // Số lượng hiển thị mặc định ban đầu
let filteredTruyenGlobal = [];
let filteredVideoGlobal = [];

window.onload = async () => {
  await initDB();
  await migrateFromLocalStorage();
  restoreCollapsedState();
  
  // Tải dữ liệu lần đầu tiên và lưu vào bộ nhớ đệm cache
  cachedLinks = await getAllLinksFromDB();
  renderLinks(true); // reset phân trang khi tải trang lần đầu
  
  setupImageSelectionText();
  setupClickOutside(); 
  setupInfiniteScroll(); // Kích hoạt tính năng cuộn đến đâu load đến đó

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
    store.add(data).onsuccess = () => resolve();
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
      store.put(updated).onsuccess = () => resolve();
    };
  });
}

// Đọc dữ liệu gốc từ DB
function getAllLinksFromDB() {
  return new Promise(resolve => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.reverse());
  });
}

// Hàm làm mới bộ nhớ đệm nhanh khi dữ liệu thay đổi
async function refreshCache() {
  cachedLinks = await getAllLinksFromDB();
}

async function deleteLink(id) {
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(id).onsuccess = async () => {
    showStatus("Xóa thành công!");
    await refreshCache(); // Làm mới cache
    renderLinks(false);
  };
}

function parseTags(tagString) {
  if (!tagString) return [];
  return tagString.split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t !== '');
}

async function isUrlDuplicate(url, currentEditingId = null) {
  return cachedLinks.some(link => {
    const formatUrl = (u) => u.replace(/\/$/, "").toLowerCase();
    if (currentEditingId && link.id === currentEditingId) {
      return false;
    }
    return formatUrl(link.url) === formatUrl(url);
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebarForm');
  sidebar.classList.toggle('hidden-sidebar');
}

document.getElementById('addOrUpdateBtn');

function compressImage(file, maxWidth = 800, maxHeight = 1000) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Tính toán giữ nguyên tỷ lệ khung hình
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Bật chế độ làm nét ảnh khi vẽ lại trên Canvas
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Xuất ảnh chất lượng cao 0.9 (90%)
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function addLink() {
  const title = document.getElementById('linkTitle').value.trim();
  const url = document.getElementById('linkUrl').value.trim();
  const type = document.getElementById('linkType').value;
  const tags = parseTags(document.getElementById('linkTags').value);
  const imgInput = document.getElementById('linkImage');
  let image = '';

  if (!title || !url) {
    showStatus("Vui lòng nhập đầy đủ Tiêu đề và URL!");
    return;
  }

  const isDuplicate = await isUrlDuplicate(url, editingId);
  if (isDuplicate) {
    showStatus("Lỗi: URL này đã tồn tại trong danh sách!");
    return;
  }

  if (editingId) {
    if (imgInput.files.length > 0) {
      image = await compressImage(imgInput.files[0]);
      await updateDB(editingId, { title, url, type, tags, image });
    } else {
      await updateDB(editingId, { title, url, type, tags });
    }
    resetEditState();
    showStatus("Đã cập nhật link!");
    toggleSidebar();
    await refreshCache(); // Làm mới cache
    renderLinks(false);
  } else {
    if (imgInput.files.length > 0) {
      image = await compressImage(imgInput.files[0]);
    }
    await addToDB({ title, url, type, tags, image });
    clearInputs();
    showStatus(`${type === 'truyen' ? 'Truyện' : 'Video'} đã được lưu!`);
    toggleSidebar();
    await refreshCache(); // Làm mới cache
    renderLinks(true); // Thêm mới thì cuộn lên đầu và reset phân trang
  }
}

function editLink(id) {
  const target = cachedLinks.find(l => l.id === id);
  if (!target) return;
  
  document.getElementById('linkTitle').value = target.title;
  document.getElementById('linkUrl').value = target.url;
  document.getElementById('linkType').value = target.type;
  document.getElementById('linkTags').value = target.tags ? target.tags.join(', ') : '';
  document.getElementById('imageSelectedText').textContent = target.image ? "Đang giữ ảnh cũ" : "";
  editingId = id;
  document.getElementById('addOrUpdateBtn').textContent = "Cập nhật";
  
  // Dùng setTimeout xử lý bất đồng bộ để tránh bị hàm click outside đóng lại ngay lập tức
  setTimeout(() => {
    const sidebar = document.getElementById('sidebarForm');
    if (sidebar) {
      sidebar.classList.remove('hidden-sidebar');
    }
  }, 0);

  showStatus("Đang sửa link...");
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
}

function filterByTag(tag) {
  if (selectedTag === tag) {
    selectedTag = null; 
  } else {
    selectedTag = tag;
    const tagContainer = document.getElementById('tagContainer');
    if (tagContainer) tagContainer.classList.add('hidden');
  }
  renderLinks(true); // Reset phân trang khi đổi tag để lên mượt nhất
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

    const sidebar = document.getElementById('sidebarForm');
    const menuToggleBtn = document.querySelector('.menu-toggle-btn');
    
    // KIỂM TRA SIDEBAR ĐANG MỞ
    if (sidebar && !sidebar.classList.contains('hidden-sidebar')) {
      // Nếu click ra ngoài sidebar VÀ ngoài nút Menu VÀ ngoài nút Sửa thì mới đóng
      if (!sidebar.contains(e.target) && 
          !menuToggleBtn.contains(e.target) && 
          !e.target.classList.contains('edit-btn')) {
        sidebar.classList.add('hidden-sidebar'); 
      }
    }
  });
}

let lastUniqueTagsStr = "";

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
  const currentTagsStr = uniqueTags.join(',') + `-${selectedTag}-${allLinks.length}`;
  
  if (currentTagsStr === lastUniqueTagsStr) return;
  lastUniqueTagsStr = currentTagsStr;

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

// BỘ LỌC TỐI ƯU TOÀN DIỆN BẰNG BỘ NHỚ ĐỆM DOM ẢO VÀ ĐỒNG BỘ KHÔNG ĐỒNG BỘ CHIA NHỎ LUỒNG RENDER
async function renderLinks(resetPagination = false) {
  if (resetPagination) {
    itemsToShow = 14; 
  }

  const allLinks = cachedLinks; 
  renderTagCloud(allLinks);

  const searchValue = document.getElementById('searchInput').value.trim().toLowerCase();
  
  let filteredLinks = allLinks;
  if (searchValue) {
    filteredLinks = filteredLinks.filter(l => l.title.toLowerCase().includes(searchValue));
  }
  if (selectedTag) {
    filteredLinks = filteredLinks.filter(l => l.tags && l.tags.includes(selectedTag));
  }

  filteredTruyenGlobal = filteredLinks.filter(l => l.type === 'truyen');
  filteredVideoGlobal = filteredLinks.filter(l => l.type === 'video');

  const truyenLinks = filteredTruyenGlobal.slice(0, itemsToShow);
  const videoLinks = filteredVideoGlobal.slice(0, itemsToShow);

  const truyenList = document.getElementById('truyenList');
  const videoList = document.getElementById('videoList');

  const createHTML = (items) => {
    if (!items.length) return '';
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
            <img src="${defaultImg}" alt="thumb" class="entry-thumbnail" loading="lazy">
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

  // GIẢI PHÁP TỐI ƯU CỐT LÕI: Chia nhỏ xử lý ghi đè DOM để không đơ máy
  // 1. Dựng danh mục Truyện trước ngay lập tức bằng DocumentFragment ngầm định
  const truyenHTML = truyenLinks.length ? createHTML(truyenLinks) : `<div class="empty-state">Không có truyện phù hợp.</div>`;
  truyenList.innerHTML = truyenHTML;

  // 2. Trì hoãn nhẹ danh mục Video sang khung hình tiếp theo (Vừa mắt người, máy không tốn tài nguyên gánh 2 việc)
  requestAnimationFrame(() => {
    const videoHTML = videoLinks.length ? createHTML(videoLinks) : `<div class="empty-state">Không có video phù hợp.</div>`;
    videoList.innerHTML = videoHTML;
  });

  // Cập nhật các badge tag hiển thị
  const activeTagTruyenEl = document.getElementById('activeTag-truyen');
  const activeTagVideoEl = document.getElementById('activeTag-video');

  if (selectedTag) {
    const tagBadgeHTML = `
      <span class="selected-badge-tag active-swipe-tag" 
            onclick="filterByTag('${selectedTag}')"
            ontouchstart="handleTagTouchStart(event)" 
            ontouchmove="handleTagTouchMove(event)" 
            ontouchend="handleTagTouchEnd(event, '${selectedTag}')">
        #${selectedTag} <b>✕</b>
      </span>
    `;
    activeTagTruyenEl.innerHTML = truyenLinks.length > 0 ? tagBadgeHTML : '';
    activeTagVideoEl.innerHTML = videoLinks.length > 0 ? tagBadgeHTML : '';
  } else {
    activeTagTruyenEl.innerHTML = '';
    activeTagVideoEl.innerHTML = '';
  }
}

// HÀM THEO DÕI CUỘN MÀN HÌNH ĐỂ TỰ ĐỘNG LOAD THÊM TRUYỆN/VIDEO KHÔNG GÂY ĐƠ MÁY
let isScrolling = false;
function setupInfiniteScroll() {
  window.addEventListener('scroll', () => {
    if (isScrolling) return;

    isScrolling = true;
    requestAnimationFrame(() => {
      if ((window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 150) {
        if (itemsToShow < filteredTruyenGlobal.length || itemsToShow < filteredVideoGlobal.length) {
          itemsToShow += 14; 
          renderLinks(false); 
        }
      }
      isScrolling = false;
    });
  });
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
  imgInput.addEventListener('change', async () => {
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
  
  if(message.includes("Lỗi") || message.includes("Vui lòng")) {
    status.style.backgroundColor = "rgba(244, 67, 54, 0.95)";
  } else {
    status.style.backgroundColor = "rgba(76, 175, 80, 0.95)";
  }

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

let touchStartY = 0;
let touchStartX = 0;

function handleTagTouchStart(e) {
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  e.currentTarget.style.transition = 'none'; 
}

function handleTagTouchMove(e) {
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - touchStartY;

  if (deltaY < 0) {
    e.preventDefault(); 
    e.currentTarget.style.transform = `translate3d(0, ${deltaY}px, 0)`;
    e.currentTarget.style.opacity = Math.max(0, 1 + deltaY / 60); 
  }
}

function handleTagTouchEnd(e, tag) {
  const touchEndY = e.changedTouches[0].clientY;
  const deltaY = touchEndY - touchStartY;
  const targetEl = e.currentTarget;

  if (deltaY < -35) {
    targetEl.style.transition = 'all 0.2s ease';
    targetEl.style.transform = 'translate3d(0, -80px, 0)'; 
    targetEl.style.opacity = '0';
    
    setTimeout(() => {
      filterByTag(tag);
    }, 20); 
  } else {
    targetEl.style.transition = 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    targetEl.style.transform = 'translate3d(0, 0, 0)';
    targetEl.style.opacity = '1';
  }
}