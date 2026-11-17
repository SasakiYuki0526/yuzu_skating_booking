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

// 1. Firebase 初始化 (共用主專案的設定)
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
    const transProductSelect = document.getElementById('trans-product-select');
    const addTransactionForm = document.getElementById('add-transaction-form');
    const transactionTableBody = document.getElementById('transaction-table-body');

    let productsMap = {}; // 暫存商品資料供交易對應

    // 返回按鈕
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // 1. 新增商品
    if (addProductForm) {
        addProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('prod-name').value.trim();
            const fileInput = document.getElementById('prod-image-file');
            const coachPrice = Number(document.getElementById('prod-coach-price').value);
            const sellPrice = Number(document.getElementById('prod-sell-price').value);

            // 內部函式：實際寫入 Firestore
            async function saveProductToFirestore(imageUrl) {
                try {
                    await addDoc(collection(db, "products"), {
                        name,
                        imageUrl: imageUrl || "", // 如果沒有圖片則存空字串
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

            // 如果有選擇圖片，轉成 Base64；若沒選圖片，直接儲存
            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                if (file.size > 1024 * 1024) {
                    alert("圖片檔案過大！請選擇小於 1MB 的圖片。");
                    return;
                }

                const reader = new FileReader();
                reader.onload = function (event) {
                    saveProductToFirestore(event.target.result);
                };
                reader.readAsDataURL(file);
            } else {
                // 沒有上傳圖片，直接儲存空字串
                saveProductToFirestore("");
            }
        });
    }

    // 2. 新增交易紀錄（調整：加入 coachPrice）
    if (addTransactionForm) {
        addTransactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const productId = transProductSelect.value;
            const buyerName = document.getElementById('trans-buyer-name').value.trim();

            if (!productId || !productsMap[productId]) {
                alert("請選擇有效的商品！");
                return;
            }

            const selectedProduct = productsMap[productId];
            const todayStr = new Date().toISOString().split('T')[0];

            try {
                await addDoc(collection(db, "transactions"), {
                    date: todayStr,
                    productId: productId,
                    productName: selectedProduct.name,
                    productImage: selectedProduct.imageUrl,
                    sellPrice: selectedProduct.sellPrice,
                    coachPrice: selectedProduct.coachPrice, // 💡 新增：記錄當時的教練價格
                    buyerName: buyerName,
                    isPaid: false,
                    isPaidSupplier: false
                });
                alert("交易紀錄新增成功！");
                addTransactionForm.reset();
            } catch (err) {
                console.error("新增交易紀錄失敗：", err);
                alert("新增交易失敗。");
            }
        });
    }

    // 3. 即時監聽商品資料 (更新列表與下拉選單)
    onSnapshot(query(collection(db, "products"), orderBy("createdAt", "desc")), (snapshot) => {
        productsMap = {};
        productListContainer.innerHTML = '';
        transProductSelect.innerHTML = '<option value="">-- 請選擇商品 --</option>';

        if (snapshot.empty) {
            productListContainer.innerHTML = `<p style="font-size:0.8rem; color:#718096; grid-column:1/-1;">尚無商品</p>`;
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
                <img src="${p.imageUrl}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/60?text=No+Img'">
                <h5>${p.name}</h5>
                <p>售:$${p.sellPrice} | 教:$${p.coachPrice}</p>
                <button class="del-prod-btn" data-id="${pId}">刪除</button>
            `;
            productListContainer.appendChild(card);

            // 渲染交易表單下拉選單
            const opt = document.createElement('option');
            opt.value = pId;
            opt.textContent = `${p.name} (售價: $${p.sellPrice})`;
            transProductSelect.appendChild(opt);
        });

        // 綁定刪除商品事件
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

    // 4. 即時監聽交易紀錄資料（調整：渲染教練價格欄位）
    onSnapshot(query(collection(db, "transactions"), orderBy("date", "desc")), (snapshot) => {
        transactionTableBody.innerHTML = '';

        if (snapshot.empty) {
            transactionTableBody.innerHTML = `<tr><td colspan="9" style="color: #718096;">尚無交易紀錄</td></tr>`; // 欄位數改為 9
            return;
        }

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const tId = docSnap.id;

            const row = document.createElement('tr');
            row.innerHTML = `
            <td>${t.date}</td>
            <td><img src="${t.productImage || ''}" alt="" onerror="this.src='https://via.placeholder.com/40?text=Img'"></td>
            <td style="font-weight: 500;">${t.productName}</td>
            <td>${t.buyerName}</td>
            <td>$${t.sellPrice}</td>
            <td>$${t.coachPrice || 0}</td> <!-- 💡 新增：顯示教練價格 -->
            <td><input type="checkbox" class="table-checkbox toggle-paid" data-id="${tId}" ${t.isPaid ? 'checked' : ''}></td>
            <td><input type="checkbox" class="table-checkbox toggle-supplier" data-id="${tId}" ${t.isPaidSupplier ? 'checked' : ''}></td>
            <td><button class="del-prod-btn del-trans-btn" data-id="${tId}">刪除</button></td>
        `;
            transactionTableBody.appendChild(row);
        });

        // 綁定「是否收款」勾選即時更新
        document.querySelectorAll('.toggle-paid').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                const val = e.target.checked;
                try {
                    await updateDoc(doc(db, "transactions", id), { isPaid: val });
                } catch (err) {
                    console.error("更新收款狀態失敗：", err);
                }
            });
        });

        // 綁定「是否付款給廠商」勾選即時更新
        document.querySelectorAll('.toggle-supplier').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                const val = e.target.checked;
                try {
                    await updateDoc(doc(db, "transactions", id), { isPaidSupplier: val });
                } catch (err) {
                    console.error("更新付廠商狀態失敗：", err);
                }
            });
        });

        // 綁定刪除交易紀錄
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