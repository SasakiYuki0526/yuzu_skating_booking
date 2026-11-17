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

// 1. Firebase 初始化
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
    const productListContainer = document.getElementById('product-list-container');
    const multiProductList = document.getElementById('trans-multi-product-list');
    const addTransactionForm = document.getElementById('add-transaction-form');
    const transactionTableBody = document.getElementById('transaction-table-body');
    const transactionTableFoot = document.getElementById('transaction-table-foot');
    const calcSellTotalEl = document.getElementById('calc-sell-total');
    const calcCoachTotalEl = document.getElementById('calc-coach-total');

    let productsMap = {};

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // 即時計算目前勾選的商品總金額
    function updateLiveCalculation() {
        let totalSell = 0;
        let totalCoach = 0;

        document.querySelectorAll('.prod-select-chk:checked').forEach(chk => {
            const pId = chk.getAttribute('data-id');
            const qtyInput = document.querySelector(`.qty-input[data-id="${pId}"]`);
            const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
            const prod = productsMap[pId];

            if (prod) {
                totalSell += prod.sellPrice * qty;
                totalCoach += prod.coachPrice * qty;
            }
        });

        if (calcSellTotalEl) calcSellTotalEl.textContent = `$${totalSell.toLocaleString()}`;
        if (calcCoachTotalEl) calcCoachTotalEl.textContent = `$${totalCoach.toLocaleString()}`;
    }

    // 1. 新增商品（圖片選填）
    if (addProductForm) {
        addProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('prod-name').value.trim();
            const fileInput = document.getElementById('prod-image-file');
            const coachPrice = Number(document.getElementById('prod-coach-price').value);
            const sellPrice = Number(document.getElementById('prod-sell-price').value);

            async function saveProductToFirestore(imageUrl) {
                try {
                    await addDoc(collection(db, "products"), {
                        name,
                        imageUrl: imageUrl || "",
                        coachPrice,
                        sellPrice,
                        createdAt: new Date().toISOString()
                    });
                    alert("商品新增成功！");
                    addProductForm.reset();
                } catch (err) {
                    console.error("新增商品失敗：", err);
                    alert("新增失敗，請檢查主控台。");
                }
            }

            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                if (file.size > 1024 * 1024) {
                    alert("圖片檔案過大！請選擇小於 1MB 的圖片。");
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(event) {
                    saveProductToFirestore(event.target.result);
                };
                reader.readAsDataURL(file);
            } else {
                saveProductToFirestore("");
            }
        });
    }

    // 2. 新增交易紀錄（支援多項商品）
    if (addTransactionForm) {
        addTransactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const buyerName = document.getElementById('trans-buyer-name').value.trim();
            const checkedBoxes = document.querySelectorAll('.prod-select-chk:checked');

            if (checkedBoxes.length === 0) {
                alert("請至少勾選一項商品！");
                return;
            }

            const items = [];
            let totalSellPrice = 0;
            let totalCoachPrice = 0;

            checkedBoxes.forEach(chk => {
                const pId = chk.getAttribute('data-id');
                const qtyInput = document.querySelector(`.qty-input[data-id="${pId}"]`);
                const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
                const prod = productsMap[pId];

                if (prod) {
                    items.push({
                        productId: pId,
                        productName: prod.name,
                        productImage: prod.imageUrl || "",
                        sellPrice: prod.sellPrice,
                        coachPrice: prod.coachPrice,
                        quantity: qty
                    });
                    totalSellPrice += prod.sellPrice * qty;
                    totalCoachPrice += prod.coachPrice * qty;
                }
            });

            const todayStr = new Date().toISOString().split('T')[0];

            try {
                await addDoc(collection(db, "transactions"), {
                    date: todayStr,
                    buyerName: buyerName,
                    items: items,                   // 儲存多項商品陣列
                    totalSellPrice: totalSellPrice, // 該筆交易總售價
                    totalCoachPrice: totalCoachPrice, // 該筆交易總教練價
                    isPaid: false,
                    isPaidSupplier: false
                });
                alert("交易紀錄新增成功！");
                addTransactionForm.reset();
                // 重置數量框與試算金額
                document.querySelectorAll('.qty-input').forEach(inp => {
                    inp.value = 1;
                    inp.disabled = true;
                });
                updateLiveCalculation();
            } catch (err) {
                console.error("新增交易紀錄失敗：", err);
                alert("新增交易失敗。");
            }
        });
    }

    // 3. 即時監聽商品資料
    onSnapshot(query(collection(db, "products"), orderBy("createdAt", "desc")), (snapshot) => {
        productsMap = {};
        productListContainer.innerHTML = '';
        multiProductList.innerHTML = '';

        if (snapshot.empty) {
            productListContainer.innerHTML = `<p style="font-size:0.8rem; color:#718096; grid-column:1/-1;">尚無商品</p>`;
            multiProductList.innerHTML = `<p style="font-size:0.8rem; color:#718096; margin:4px;">請先於左側新增商品</p>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const pId = docSnap.id;
            productsMap[pId] = p;

            // 渲染左側商品小卡
            const card = document.createElement('div');
            card.className = 'product-mini-card';
            card.innerHTML = `
                <img src="${p.imageUrl || ''}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/60?text=No+Img'">
                <h5>${p.name}</h5>
                <p>售:$${p.sellPrice} | 教:$${p.coachPrice}</p>
                <button class="del-prod-btn" data-id="${pId}">刪除</button>
            `;
            productListContainer.appendChild(card);

            // 渲染右側多選商品項目
            const itemRow = document.createElement('div');
            itemRow.className = 'multi-prod-item';
            itemRow.innerHTML = `
                <label class="multi-prod-left">
                    <input type="checkbox" class="prod-select-chk" data-id="${pId}">
                    <img src="${p.imageUrl || ''}" alt="" onerror="this.src='https://via.placeholder.com/32?text=Img'">
                    <span><strong>${p.name}</strong> (售$${p.sellPrice} / 教$${p.coachPrice})</span>
                </label>
                <div>
                    <span style="font-size:0.75rem; color:#718096;">數量：</span>
                    <input type="number" class="qty-input" data-id="${pId}" value="1" min="1" disabled>
                </div>
            `;
            multiProductList.appendChild(itemRow);
        });

        // 綁定勾選與數量連動試算
        document.querySelectorAll('.prod-select-chk').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const pId = e.target.getAttribute('data-id');
                const qtyInput = document.querySelector(`.qty-input[data-id="${pId}"]`);
                if (qtyInput) {
                    qtyInput.disabled = !e.target.checked;
                }
                updateLiveCalculation();
            });
        });

        document.querySelectorAll('.qty-input').forEach(inp => {
            inp.addEventListener('input', updateLiveCalculation);
        });

        // 綁定刪除商品
        document.querySelectorAll('.del-prod-btn').forEach(btn => {
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

    // 4. 即時監聽交易紀錄資料（顯示詳細多商品與總加總）
    onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snapshot) => {
        transactionTableBody.innerHTML = '';
        transactionTableFoot.innerHTML = '';

        if (snapshot.empty) {
            transactionTableBody.innerHTML = `<tr><td colspan="8" style="color: #718096;">尚無交易紀錄</td></tr>`;
            return;
        }

        let grandTotalSell = 0;
        let grandTotalCoach = 0;

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const tId = docSnap.id;

            // 相容舊版單一商品格式與新版多項商品格式
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

            // 組合多項商品詳細 HTML
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
                <td><input type="checkbox" class="table-checkbox toggle-paid" data-id="${tId}" ${t.isPaid ? 'checked' : ''}></td>
                <td><input type="checkbox" class="table-checkbox toggle-supplier" data-id="${tId}" ${t.isPaidSupplier ? 'checked' : ''}></td>
                <td><button class="del-prod-btn del-trans-btn" data-id="${tId}">刪除</button></td>
            `;
            transactionTableBody.appendChild(row);
        });

        // 渲染最下方所有交易總加總列
        transactionTableFoot.innerHTML = `
            <tr class="total-summary-row">
                <td colspan="3" style="text-align: right;">全部交易總計：</td>
                <td style="color: #2b6cb0;">$${grandTotalSell.toLocaleString()}</td>
                <td style="color: #38a169;">$${grandTotalCoach.toLocaleString()}</td>
                <td colspan="3"></td>
            </tr>
        `;

        // 綁定收款勾選
        document.querySelectorAll('.toggle-paid').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                try {
                    await updateDoc(doc(db, "transactions", id), { isPaid: e.target.checked });
                } catch (err) {
                    console.error("更新收款狀態失敗：", err);
                }
            });
        });

        // 綁定付廠商勾選
        document.querySelectorAll('.toggle-supplier').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                try {
                    await updateDoc(doc(db, "transactions", id), { isPaidSupplier: e.target.checked });
                } catch (err) {
                    console.error("更新付廠商狀態失敗：", err);
                }
            });
        });

        // 綁定刪除交易
        document.querySelectorAll('.del-trans-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm("確定要刪除這筆交易紀錄嗎？")) {
                    try {
                        await deleteDoc(doc(db, "transactions", id));
                    } catch (err) {
                        console.error("刪除交易失敗：", err);
                    }
                }
            });
        });
    });
});
