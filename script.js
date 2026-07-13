const dbName = 'LinksDB';
const storeName = 'links';

let db;
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

async function isUrlDuplicate(url, currentEditingId = null) {
  const allLinks = await getAllLinks();
  return allLinks.some(link => {
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
    const reader = new FileReader();
    if (imgInput.files.length > 0) {
      reader.onload = async () => {
        image = reader.result;
        await updateDB(editingId, { title, url, type, tags, image });
        resetEditState();
        showStatus("Đã cập nhật link!");
        toggleSidebar();
        renderLinks();
      };
      reader.readAsDataURL(imgInput.files[0]);
    } else {
      await updateDB(editingId, { title, url, type, tags });
      resetEditState();
      showStatus("Đã cập nhật link!");
      toggleSidebar();
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
        toggleSidebar();
        renderLinks();
      };
      reader.readAsDataURL(imgInput.files[0]);
    } else {
      await addToDB({ title, url, type, tags, image });
      clearInputs();
      showStatus(`${type === 'truyen' ? 'Truyện' : 'Video'} đã được lưu!`);
      toggleSidebar();
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
    
    const sidebar = document.getElementById('sidebarForm');
    sidebar.classList.remove('hidden-sidebar');
    
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
  renderLinks();
}

/* Bật/Tắt bảng chọn tag */
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
    // 1. Xử lý click ra ngoài để ẩn gợi ý tag (giữ nguyên logic cũ)
    const container = document.querySelector('.tag-input-container');
    if (container && !container.contains(e.target)) {
      document.getElementById('tagSuggestionBox').classList.add('hidden');
    }

    // 2. XỬ LÝ MỚI: Click ra ngoài để đóng Sidebar Nhập Thông Tin
    const sidebar = document.getElementById('sidebarForm');
    const menuToggleBtn = document.querySelector('.menu-toggle-btn');
    
    // Nếu Sidebar ĐANG MỞ (không chứa class hidden-sidebar)
    if (sidebar && !sidebar.classList.contains('hidden-sidebar')) {
      // Kiểm tra xem vị trí click có nằm NGOÀI sidebar và NGOÀI nút mở rộng không
      if (!sidebar.contains(e.target) && !menuToggleBtn.contains(e.target)) {
        sidebar.classList.add('hidden-sidebar'); // Đóng sidebar lại
      }
    }
  });
}

// Thêm một biến cờ để tránh render Tag Cloud không cần thiết
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
  
  // TỐI ƯU: Nếu danh sách tag không đổi, KHÔNG dựng lại HTML để tránh lag mobile
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

async function renderLinks() {
  const allLinks = await getAllLinks();
  
  // Render đám mây thẻ (Đã được tối ưu ở trên)
  renderTagCloud(allLinks);

  const searchValue = document.getElementById('searchInput').value.trim().toLowerCase();
  let filteredLinks = allLinks.filter(l => l.title.toLowerCase().includes(searchValue));

  if (selectedTag) {
    filteredLinks = filteredLinks.filter(l => l.tags && l.tags.includes(selectedTag));
  }

  const truyenLinks = filteredLinks.filter(l => l.type === 'truyen');
  const videoLinks = filteredLinks.filter(l => l.type === 'video');

  const truyenList = document.getElementById('truyenList');
  const videoList = document.getElementById('videoList');

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

  truyenList.innerHTML = truyenLinks.length ? createHTML(truyenLinks) : `<div class="empty-state">Không có truyện phù hợp.</div>`;
  videoList.innerHTML = videoLinks.length ? createHTML(videoLinks) : `<div class="empty-state">Không có video phù hợp.</div>`;

 // TÌM ĐOẠN NÀY Ở CUỐI HÀM renderLinks() VÀ THAY THẾ
  const activeTagTruyenEl = document.getElementById('activeTag-truyen');
  const activeTagVideoEl = document.getElementById('activeTag-video');

  if (selectedTag) {
    // Tạo cấu trúc thẻ hỗ trợ cả click (cho PC) và vuốt (cho Mobile)
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
// Biến lưu vị trí ngón tay khi bắt đầu chạm
let touchStartY = 0;
let touchStartX = 0;

function handleTagTouchStart(e) {
  // Lưu vị trí chạm ban đầu
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  e.currentTarget.style.transition = 'none'; // Tắt hiệu ứng mượt tạm thời khi đang vuốt
}

function handleTagTouchMove(e) {
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - touchStartY;

  // Chỉ xử lý nếu người dùng đang vuốt LÊN (deltaY số âm)
  if (deltaY < 0) {
    // Ngăn cuộn trang web khi đang vuốt tag
    e.preventDefault(); 
    
    // Di chuyển cái tag đi lên theo ngón tay một chút để tạo cảm giác thực tế
    e.currentTarget.style.transform = `translate3d(0, ${deltaY}px, 0)`;
    // Làm mờ dần tag khi vuốt lên cao
    e.currentTarget.style.opacity = Math.max(0, 1 + deltaY / 60); 
  }
}

function handleTagTouchEnd(e, tag) {
  const touchEndY = e.changedTouches[0].clientY;
  const deltaY = touchEndY - touchStartY;
  const targetEl = e.currentTarget;

  // Nếu vuốt lên một khoảng hơn 35px thì kích hoạt xóa tag
  if (deltaY < -35) {
    targetEl.style.transition = 'all 0.2s ease';
    targetEl.style.transform = 'translate3d(0, -80px, 0)'; // Bay lên hẳn
    targetEl.style.opacity = '0';
    
    // Đợi hiệu ứng bay lên hoàn thành rồi thực hiện xóa lọc
    setTimeout(() => {
      filterByTag(tag);
    }, 200020 - 200000); // ~200ms
  } else {
    // Nếu vuốt chưa đủ độ cao, trả tag về vị trí cũ mượt mà
    targetEl.style.transition = 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    targetEl.style.transform = 'translate3d(0, 0, 0)';
    targetEl.style.opacity = '1';
  }
}
// Hàm xuất file sao lưu kích hoạt trực tiếp trình quản lý tệp trên Mobile
async function exportBackupData() {
  const allLinks = await getAllLinks();
  if (allLinks.length === 0) {
    showStatus("Không có dữ liệu để xuất!");
    return;
  }
  
  // 1. Chuyển dữ liệu JSON thành chuỗi văn bản định dạng đẹp
  const jsonString = JSON.stringify(allLinks, null, 2);

  try {
    // 2. Khởi tạo một đối tượng File thực tế (không chỉ là Blob)
    // Đặt tên file mặc định có đuôi .txt để dễ quản lý trên điện thoại
    const file = new File([jsonString], "quan_ly_links_backup.txt", {
      type: "text/plain",
    });

    // 3. Kiểm tra xem trình duyệt di động có hỗ trợ chia sẻ tệp trực tiếp không
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Sao lưu dữ liệu",
        text: "Tệp sao lưu ứng dụng Quản lý Truyện & Video",
      });
      showStatus("Đã mở bảng chọn nơi lưu!");
    } else {
      // Phương thức dự phòng (Fallback) nếu trình duyệt cũ không hỗ trợ Web Share API
      const blob = new Blob([jsonString], { type: "text/plain;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = blobUrl;
      downloadAnchor.download = "quan_ly_links_backup.txt";
      
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      
      setTimeout(() => {
        document.body.removeChild(downloadAnchor);
        URL.revokeObjectURL(blobUrl);
      }, 100);
      showStatus("Trình duyệt không hỗ trợ chia sẻ, tự động tải xuống!");
    }
  } catch (err) {
    // Không hiện thông báo lỗi nếu người dùng chủ động tắt bảng chia sẻ (AbortError)
    if (err.name !== 'AbortError') {
      console.error(err);
      showStatus("Lỗi khi xuất dữ liệu!");
    }
  }
}

// Hàm xuất file sao lưu kết hợp tự sao chép dữ liệu để chống lỗi trình duyệt Zalo
async function exportBackupData() {
  const allLinks = await getAllLinks();
  if (allLinks.length === 0) {
    showStatus("Không có dữ liệu để xuất!");
    return;
  }
  
  const jsonString = JSON.stringify(allLinks, null, 2);

  // Tự động sao chép dữ liệu vào Clipboard trước để dự phòng
  try {
    await navigator.clipboard.writeText(jsonString);
    showStatus("Đã sao chép dữ liệu sao lưu vào bộ nhớ tạm!");
  } catch (err) {
    console.log("Không thể tự động sao chép");
  }

  try {
    const file = new File([jsonString], "quan_ly_links_backup.txt", {
      type: "text/plain",
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Sao lưu dữ liệu",
        text: "Tệp sao lưu ứng dụng Quản lý Truyện & Video",
      });
    } else {
      const blob = new Blob([jsonString], { type: "text/plain;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = blobUrl;
      downloadAnchor.download = "quan_ly_links_backup.txt";
      
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      
      setTimeout(() => {
        document.body.removeChild(downloadAnchor);
        URL.revokeObjectURL(blobUrl);
      }, 100);
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
      // Nếu các phương pháp tải file đều thất bại (như trên Zalo), báo cho người dùng dán dữ liệu ra ghi chú
      alert("Trình duyệt hạn chế tải file! Dữ liệu khôi phục ĐÃ ĐƯỢC SAO CHÉP, vui lòng mở ứng dụng Ghi chú hoặc tin nhắn và nhấn 'Dán' (Paste) để lưu lại nhé!");
    }
  }
}