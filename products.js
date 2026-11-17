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
    let currentSelectedItems = []; // 暫存本次交易加入的商品陣列 [{productId, name, image, sellPrice, coachPrice, quantity}]

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
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

        // 綁定移除按鈕
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

            // 檢查是否已在清單中，若有則累加數量
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

    // 1. 新增或更新商品
    if (addProductForm) {
        addProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = editProdIdInput.value;
            const name = document.getElementById('prod-name').value.trim();
            const note = document.getElementById('prod-note').value.trim(); // 💡 取得商品備註
            const fileInput = document.getElementById('prod-image-file');
            const coachPrice = Number(document.getElementById('prod-coach-price').value);
            const sellPrice = Number(document.getElementById('prod-sell-price').value);

            async function saveProduct(imageUrl) {
                try {
                    if (editId) {
                        // 更新商品（包含備註）
                        const updateData = { name, note, coachPrice, sellPrice };
                        if (imageUrl !== null) updateData.imageUrl = imageUrl;
                        await updateDoc(doc(db, "products", editId), updateData);
                        alert("商品修改成功！");
                        resetProductForm();
                    } else {
                        // 新增商品（包含備註）
                        await addDoc(collection(db, "products"), {
                            name,
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

    // 2. 送出交易紀錄（加入 note 欄位）
    if (addTransactionForm) {
        addTransactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const buyerName = document.getElementById('trans-buyer-name').value.trim();
            const note = document.getElementById('trans-note').value.trim(); // 取得備註

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
                    note: note, // 儲存備註
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

    // 3. 即時監聽商品資料（條列式清單與下拉選單更新）
    onSnapshot(query(collection(db, "products"), orderBy("createdAt", "desc")), (snapshot) => {
        productsMap = {};
        productListContainer.innerHTML = '';
        transProductSelect.innerHTML = '<option value="">-- 請選擇商品 --</option>';

        if (snapshot.empty) {
            productListContainer.innerHTML = `<p style="font-size:0.85rem; color:#718096; padding:4px;">尚無商品紀錄</p>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const pId = docSnap.id;
            productsMap[pId] = p;

            // 渲染左側條列式商品
            const rowItem = document.createElement('div');
            rowItem.className = 'product-row-item';
            rowItem.innerHTML = `
                <div class="product-row-info">
                    <img src="${p.imageUrl || ''}" alt="" onerror="this.src='https://via.placeholder.com/45?text=Img'">
                    <div class="product-row-details">
                        <h5>${p.name}</h5>
                        <p>售價: $${p.sellPrice} ｜ 教練價: $${p.coachPrice}</p>
                    </div>
                </div>
                <div class="product-row-actions">
                    <button class="action-btn edit-prod-row-btn" data-id="${pId}">編輯</button>
                    <button class="action-btn del-prod-row-btn" data-id="${pId}">刪除</button>
                </div>
            `;
            productListContainer.appendChild(rowItem);

            // 渲染交易表單下拉選單
            const opt = document.createElement('option');
            opt.value = pId;
            opt.textContent = `${p.name} (售價: $${p.sellPrice})`;
            transProductSelect.appendChild(opt);
        });

        // 綁定編輯商品按鈕
        document.querySelectorAll('.edit-prod-row-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const p = productsMap[id];
                if (p) {
                    editProdIdInput.value = id;
                    document.getElementById('prod-name').value = p.name;
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
    });

    // 4. 即時監聽交易紀錄明細（加入備註欄位與即時更新）
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

        // 綁定備註即時修改儲存（當使用者離開輸入框時自動更新到 Firebase）
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

        // 綁定收款與付廠商勾選狀態更新
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

        // 刪除交易紀錄
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
