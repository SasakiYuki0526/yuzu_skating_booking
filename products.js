import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    deleteDoc,
    doc,
    onSnapshot,
    updateDoc,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBCqdRd1sbSY7o44d_PhvYQUfGZVZg9Tkw",
    authDomain: "skating-class.firebaseapp.com",
    projectId: "skating-class",
    storageBucket: "skating-class.firebasestorage.app",
    messagingSenderId: "215138000944",
    appId: "1:215138000944:web:39a961b1d217e5d2afcdf5",
    measurementId: "G-2TZTT70B6C"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    const backBtn = document.getElementById('back-to-admin-btn');
    const addProductForm = document.getElementById('add-product-form');
    const prodFormTitle = document.getElementById('prod-form-title');
    const prodSubmitBtn = document.getElementById('prod-submit-btn');
    const prodCancelEditBtn = document.getElementById('prod-cancel-edit-btn');
    const editProdIdInput = document.getElementById('edit-prod-id');
    const productListContainer = document.getElementById('product-list-container');
    const filterTagSelect = document.getElementById('filter-tag-select');
    const tagSuggestions = document.getElementById('tag-suggestions');

    const transProductSelect = document.getElementById('trans-product-select');
    const transItemQtyInput = document.getElementById('trans-item-qty');
    const addTransItemBtn = document.getElementById('add-trans-item-btn');
    const currentTransItemsBox = document.getElementById('current-trans-items');
    const addTransactionForm = document.getElementById('add-transaction-form');

    const transactionTableBody = document.getElementById('transaction-table-body');
    const transactionTableFoot = document.getElementById('transaction-table-foot');
    const calcSellTotalEl = document.getElementById('calc-sell-total');
    const calcCoachTotalEl = document.getElementById('calc-coach-total');

    let productsMap = {};
    let allProductsList = []; // 暫存完整商品陣列供標籤篩選
    let currentSelectedItems = [];

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // 渲染商品列表（支援標籤篩選）
    function renderProductList() {
        const selectedTag = filterTagSelect ? filterTagSelect.value : 'ALL';
        productListContainer.innerHTML = '';

        const filtered = selectedTag === 'ALL'
            ? allProductsList
            : allProductsList.filter(p => (p.tag || '未分類') === selectedTag);

        if (filtered.length === 0) {
            productListContainer.innerHTML = `<p style="font-size:0.85rem; color:#718096; padding:4px;">尚無符合條件的商品</p>`;
            return;
        }

        filtered.forEach((p) => {
            const tagBadge = p.tag ? `<span class="product-tag-badge">${p.tag}</span>` : '';
            const noteBadge = p.note ? `<span class="product-row-note">📝 ${p.note}</span>` : '';

            const rowItem = document.createElement('div');
            rowItem.className = 'product-row-item';
            rowItem.innerHTML = `
                <div class="product-row-info">
                    <img src="${p.imageUrl || ''}" alt="" onerror="this.src='https://via.placeholder.com/45?text=Img'">
                    <div class="product-row-details">
                        <h5>${p.name}${tagBadge}</h5>
                        <p>售價: $${p.sellPrice} ｜ 教練價: $${p.coachPrice}</p>
                        ${noteBadge}
                    </div>
                </div>
                <div class="product-row-actions">
                    <button class="action-btn edit-prod-row-btn" data-id="${p.id}">編輯</button>
                    <button class="action-btn del-prod-row-btn" data-id="${p.id}">刪除</button>
                </div>
            `;
            productListContainer.appendChild(rowItem);
        });

        // 綁定編輯商品按鈕
        document.querySelectorAll('.edit-prod-row-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const p = productsMap[id];
                if (p) {
                    editProdIdInput.value = id;
                    document.getElementById('prod-name').value = p.name;
                    document.getElementById('prod-tag').value = p.tag || '';
                    document.getElementById('prod-note').value = p.note || '';
                    document.getElementById('prod-coach-price').value = p.coachPrice;
                    document.getElementById('prod-sell-price').value = p.sellPrice;
                    prodFormTitle.textContent = "✏️ 編輯商品";
                    prodSubmitBtn.textContent = "儲存修改";
                    prodCancelEditBtn.classList.remove('hidden');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });

        // 綁定刪除商品按鈕
        document.querySelectorAll('.del-prod-row-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm("確定要刪除這個商品嗎？")) {
                    try {
                        await deleteDoc(doc(db, "products", id));
                    } catch (err) {
                        console.error("刪除商品失敗：", err);
                    }
                }
            });
        });
    }

    if (filterTagSelect) {
        filterTagSelect.addEventListener('change', renderProductList);
    }

    // 更新本次交易的試算金額與清單畫面
    function renderCurrentTransactionItems() {
        if (currentSelectedItems.length === 0) {
            currentTransItemsBox.innerHTML = `<span style="color: #a0aec0; font-size: 0.85rem; padding: 4px;">尚未加入商品</span>`;
            if (calcSellTotalEl) calcSellTotalEl.textContent = `$0`;
            if (calcCoachTotalEl) calcCoachTotalEl.textContent = `$0`;
            return;
        }

        let totalSell = 0;
        let totalCoach = 0;
        let html = '';

        currentSelectedItems.forEach((item, index) => {
            totalSell += item.sellPrice * item.quantity;
            totalCoach += item.coachPrice * item.quantity;

            html += `
                <div class="current-item-row">
                    <span>${item.name} (售$${item.sellPrice} / 教$${item.coachPrice}) × <strong>${item.quantity}</strong></span>
                    <button type="button" class="remove-item-btn" data-index="${index}" title="移除">×</button>
                </div>
            `;
        });

        currentTransItemsBox.innerHTML = html;
        if (calcSellTotalEl) calcSellTotalEl.textContent = `$${totalSell.toLocaleString()}`;
        if (calcCoachTotalEl) calcCoachTotalEl.textContent = `$${totalCoach.toLocaleString()}`;

        document.querySelectorAll('.remove-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'), 10);
                currentSelectedItems.splice(idx, 1);
                renderCurrentTransactionItems();
            });
        });
    }

    // 點擊「加入」按鈕將下拉選單商品加入本次交易
    if (addTransItemBtn) {
        addTransItemBtn.addEventListener('click', () => {
            const pId = transProductSelect.value;
            const qty = parseInt(transItemQtyInput.value, 10) || 1;

            if (!pId || !productsMap[pId]) {
                alert("請先從下拉選單選擇商品！");
                return;
            }

            const prod = productsMap[pId];
            const existing = currentSelectedItems.find(i => i.productId === pId);
            if (existing) {
                existing.quantity += qty;
            } else {
                currentSelectedItems.push({
                    productId: pId,
                    name: prod.name,
                    image: prod.imageUrl || "",
                    sellPrice: prod.sellPrice,
                    coachPrice: prod.coachPrice,
                    quantity: qty
                });
            }

            transItemQtyInput.value = 1;
            renderCurrentTransactionItems();
        });
    }

    // 1. 新增或更新商品（含標籤與備註）
    if (addProductForm) {
        addProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = editProdIdInput.value;
            const name = document.getElementById('prod-name').value.trim();
            const tag = document.getElementById('prod-tag').value.trim();
            const note = document.getElementById('prod-note').value.trim();
            const fileInput = document.getElementById('prod-image-file');
            const coachPrice = Number(document.getElementById('prod-coach-price').value);
            const sellPrice = Number(document.getElementById('prod-sell-price').value);

            async function saveProduct(imageUrl) {
                try {
                    if (editId) {
                        const updateData = { name, tag, note, coachPrice, sellPrice };
                        if (imageUrl !== null) updateData.imageUrl = imageUrl;
                        await updateDoc(doc(db, "products", editId), updateData);
                        alert("商品修改成功！");
                        resetProductForm();
                    } else {
                        await addDoc(collection(db, "products"), {
                            name,
                            tag,
                            note,
                            imageUrl: imageUrl || "",
                            coachPrice,
                            sellPrice,
                            createdAt: new Date().toISOString()
                        });
                        alert("商品新增成功！");
                        addProductForm.reset();
                    }
                } catch (err) {
                    console.error("儲存商品失敗：", err);
                    alert("操作失敗，請檢查主控台。");
                }
            }

            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                if (file.size > 1024 * 1024) {
                    alert("圖片檔案過大！請選擇小於 1MB 的圖片。");
                    return;
                }
                const reader = new FileReader();
                reader.onload = function (event) {
                    saveProduct(event.target.result);
                };
                reader.readAsDataURL(file);
            } else {
                saveProduct(editId ? null : "");
            }
        });
    }

    function resetProductForm() {
        addProductForm.reset();
        editProdIdInput.value = "";
        prodFormTitle.textContent = "🛍️ 新增商品";
        prodSubmitBtn.textContent = "新增商品";
        prodCancelEditBtn.classList.add('hidden');
    }

    if (prodCancelEditBtn) {
        prodCancelEditBtn.addEventListener('click', resetProductForm);
    }

    // 2. 送出交易紀錄
    if (addTransactionForm) {
        addTransactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const buyerName = document.getElementById('trans-buyer-name').value.trim();
            const note = document.getElementById('trans-note').value.trim();

            if (currentSelectedItems.length === 0) {
                alert("請至少加入一項商品到本次交易清單！");
                return;
            }

            let totalSellPrice = 0;
            let totalCoachPrice = 0;
            const items = currentSelectedItems.map(item => {
                totalSellPrice += item.sellPrice * item.quantity;
                totalCoachPrice += item.coachPrice * item.quantity;
                return {
                    productId: item.productId,
                    productName: item.name,
                    productImage: item.image,
                    sellPrice: item.sellPrice,
                    coachPrice: item.coachPrice,
                    quantity: item.quantity
                };
            });

            const todayStr = new Date().toISOString().split('T')[0];

            try {
                await addDoc(collection(db, "transactions"), {
                    date: todayStr,
                    buyerName: buyerName,
                    items: items,
                    totalSellPrice: totalSellPrice,
                    totalCoachPrice: totalCoachPrice,
                    note: note,
                    isPaid: false,
                    isPaidSupplier: false
                });
                alert("交易紀錄新增成功！");
                addTransactionForm.reset();
                currentSelectedItems = [];
                renderCurrentTransactionItems();
            } catch (err) {
                console.error("新增交易紀錄失敗：", err);
                alert("新增交易失敗。");
            }
        });
    }

    // 3. 即時監聽商品資料（支援下拉選單依「標籤」分組並依「名稱」排序）
    onSnapshot(query(collection(db, "products"), orderBy("createdAt", "desc")), (snapshot) => {
        productsMap = {};
        allProductsList = [];
        const uniqueTags = new Set();
        const currentFilter = filterTagSelect ? filterTagSelect.value : 'ALL';

        snapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const pId = docSnap.id;
            const prodObj = { id: pId, ...p };
            productsMap[pId] = prodObj;
            allProductsList.push(prodObj);

            uniqueTags.add(p.tag || '未分類');
        });

        // 💡 針對交易紀錄的商品下拉選單進行雙重排序：先比對標籤，同標籤再比對名稱
        const sortedForSelect = [...allProductsList].sort((a, b) => {
            const tagA = a.tag || '未分類';
            const tagB = b.tag || '未分類';

            // 讓「未分類」排在最後面，其餘標籤依中文筆畫/字母排序
            if (tagA !== tagB) {
                if (tagA === '未分類') return 1;
                if (tagB === '未分類') return -1;
                return tagA.localeCompare(tagB, 'zh-Hant');
            }
            // 同標籤底下，依商品名稱排序
            return a.name.localeCompare(b.name, 'zh-Hant');
        });

        // 重新渲染交易商品下拉選單（搭配 <optgroup> 標籤分組）
        transProductSelect.innerHTML = '<option value="">-- 請選擇商品 --</option>';
        const groupedByTag = {};
        sortedForSelect.forEach(p => {
            const t = p.tag || '未分類';
            if (!groupedByTag[t]) groupedByTag[t] = [];
            groupedByTag[t].push(p);
        });

        Object.keys(groupedByTag).forEach(tag => {
            const optGroup = document.createElement('optgroup');
            optGroup.label = `📁 ${tag}`;

            groupedByTag[tag].forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                const noteText = p.note ? ` [${p.note}]` : '';
                opt.textContent = `${p.name}${noteText} (售價: $${p.sellPrice})`;
                optGroup.appendChild(opt);
            });

            transProductSelect.appendChild(optGroup);
        });

        // 動態更新左側列表的篩選選單與輸入建議
        if (filterTagSelect) {
            filterTagSelect.innerHTML = '<option value="ALL">全部標籤</option>';
            Array.from(uniqueTags).sort((a, b) => a.localeCompare(b, 'zh-Hant')).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                filterTagSelect.appendChild(opt);
            });
            if (Array.from(uniqueTags).includes(currentFilter)) {
                filterTagSelect.value = currentFilter;
            }
        }

        if (tagSuggestions) {
            const defaultTags = ['滑冰服裝', '護具配件', '冰刀/冰鞋', '其他週邊'];
            uniqueTags.forEach(t => {
                if (t !== '未分類') defaultTags.push(t);
            });
            const mergedTags = Array.from(new Set(defaultTags));
            tagSuggestions.innerHTML = mergedTags.map(t => `<option value="${t}">`).join('');
        }

        renderProductList();
    });

    // 4. 即時監聽交易紀錄明細
    onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snapshot) => {
        transactionTableBody.innerHTML = '';
        transactionTableFoot.innerHTML = '';

        if (snapshot.empty) {
            transactionTableBody.innerHTML = `<tr><td colspan="9" style="color: #718096;">尚無交易紀錄</td></tr>`;
            return;
        }

        let grandTotalSell = 0;
        let grandTotalCoach = 0;

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const tId = docSnap.id;

            const itemsList = t.items || [{
                productName: t.productName,
                productImage: t.productImage,
                sellPrice: t.sellPrice,
                coachPrice: t.coachPrice || 0,
                quantity: 1
            }];

            const rowSellTotal = t.totalSellPrice !== undefined ? t.totalSellPrice : (t.sellPrice || 0);
            const rowCoachTotal = t.totalCoachPrice !== undefined ? t.totalCoachPrice : (t.coachPrice || 0);

            grandTotalSell += rowSellTotal;
            grandTotalCoach += rowCoachTotal;

            const itemsHtml = itemsList.map(item => `
                <div class="trans-item-row">
                    <img src="${item.productImage || ''}" alt="" onerror="this.src='https://via.placeholder.com/32?text=Img'">
                    <span>${item.productName} × ${item.quantity} <span style="color:#718096;">(售$${item.sellPrice}/教$${item.coachPrice})</span></span>
                </div>
            `).join('');

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${t.date}</td>
                <td style="font-weight: 500;">${t.buyerName}</td>
                <td><div class="trans-items-list">${itemsHtml}</div></td>
                <td style="font-weight: 600; color: #2b6cb0;">$${rowSellTotal.toLocaleString()}</td>
                <td style="font-weight: 600; color: #38a169;">$${rowCoachTotal.toLocaleString()}</td>
                <td><input type="text" class="table-note-input update-note" data-id="${tId}" value="${t.note || ''}" placeholder="點擊填寫備註..."></td>
                <td><input type="checkbox" class="table-checkbox toggle-paid" data-id="${tId}" ${t.isPaid ? 'checked' : ''}></td>
                <td><input type="checkbox" class="table-checkbox toggle-supplier" data-id="${tId}" ${t.isPaidSupplier ? 'checked' : ''}></td>
                <td><button class="action-btn del-prod-row-btn del-trans-btn" data-id="${tId}">刪除</button></td>
            `;
            transactionTableBody.appendChild(row);
        });

        transactionTableFoot.innerHTML = `
            <tr class="total-summary-row">
                <td colspan="3" style="text-align: right;">全部交易總計：</td>
                <td style="color: #2b6cb0;">$${grandTotalSell.toLocaleString()}</td>
                <td style="color: #38a169;">$${grandTotalCoach.toLocaleString()}</td>
                <td colspan="4"></td>
            </tr>
        `;

        document.querySelectorAll('.update-note').forEach(input => {
            input.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                const newNote = e.target.value.trim();
                try {
                    await updateDoc(doc(db, "transactions", id), { note: newNote });
                } catch (err) {
                    console.error("更新備註失敗：", err);
                }
            });
        });

        document.querySelectorAll('.toggle-paid').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                try {
                    await updateDoc(doc(db, "transactions", id), { isPaid: e.target.checked });
                } catch (err) {
                    console.error("更新收款失敗：", err);
                }
            });
        });

        document.querySelectorAll('.toggle-supplier').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                try {
                    await updateDoc(doc(db, "transactions", id), { isPaidSupplier: e.target.checked });
                } catch (err) {
                    console.error("更新付廠商失敗：", err);
                }
            });
        });

        document.querySelectorAll('.del-trans-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm("確定要刪除這筆交易紀錄嗎？")) {
                    try {
                        await deleteDoc(doc(db, "transactions", id));
                    } catch (err) {
                        console.error("刪除失敗：", err);
                    }
                }
            });
        });
    });
});