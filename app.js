// app.js - 完整最終整合版（含預約取消通知與管理者編輯姓名功能）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot, 
    writeBatch,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. Firebase 初始化 (請替換為您的 Firebase 專案設定)
// ==========================================
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

// ==========================================
// 2. 全域狀態管理
// ==========================================
let allScheduleData = {};   // 一般時段快取
let fullBookingDates = new Set(); // 全包場日期集合
let selectedDate = new Date().toISOString().split('T')[0]; // 當前選取日期 YYYY-MM-DD
let isAdmin = false;       // 管理者登入狀態
let currentBookingSlotId = null; // 當前正在預約或檢視的時段 ID

// ==========================================
// 3. DOM 載入與初始化
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const calendarEl = document.getElementById('mini-calendar');
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    const adminPanel = document.getElementById('admin-panel');
    const addSlotForm = document.getElementById('add-slot-form');
    const inputDate = document.getElementById('input-date');
    const startTimeInput = document.getElementById('input-start-time');
    const endTimeInput = document.getElementById('input-end-time');
    const repeatWeeklyBtn = document.getElementById('batch-repeat-weekly-btn');
    const setFullBookingBtn = document.getElementById('set-full-booking-btn');

    // 訪客預約彈窗 DOM
    const bookingModal = document.getElementById('booking-modal');
    const bookingForm = document.getElementById('booking-form');
    const modalSlotInfo = document.getElementById('modal-slot-info');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const studentNameInput = document.getElementById('booking-student-name');

    // 管理者檢視預約浮動頁面 DOM
    const adminBookingModal = document.getElementById('admin-booking-modal');
    const adminModalSlotInfo = document.getElementById('admin-modal-slot-info');
    const adminBookingList = document.getElementById('admin-booking-list');
    const adminModalCloseBtn = document.getElementById('admin-modal-close-btn');

    if (inputDate) {
        inputDate.value = selectedDate;
    }

    function timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    function minutesToTimeString(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // 初始化 FullCalendar 迷你月曆
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev',
            center: 'title',
            right: 'next'
        },
        height: 'auto',
        selectable: true,
        dateClick: function(info) {
            selectedDate = info.dateStr;
            if (inputDate) inputDate.value = selectedDate;
            renderRightSlots(selectedDate);
        },
        dayCellDidMount: function(info) {
            const dateStr = info.date.toISOString().split('T')[0];
            renderCellDots(info.el, dateStr);
        }
    });

    calendar.render();

    function renderCellDots(cellEl, dateStr) {
        const frameEl = cellEl.querySelector('.fc-daygrid-day-frame');
        if (!frameEl) return;

        const oldContainer = frameEl.querySelector('.dots-container');
        if (oldContainer) oldContainer.remove();

        const isFullBooked = fullBookingDates.has(dateStr);
        const daySlots = allScheduleData[dateStr] || [];

        if (!isFullBooked && daySlots.length === 0) return;

        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'dots-container';

        const dot = document.createElement('span');
        if (isFullBooked) {
            dot.className = 'dot-full-booked';
            dot.title = '全天包場';
        } else {
            const hasAvailable = daySlots.some(s => s.isAvailable);
            dot.className = hasAvailable ? 'dot-available' : 'dot-booked';
            dot.title = hasAvailable ? '有可預約時段' : '已額滿';
        }

        dotsContainer.appendChild(dot);
        frameEl.appendChild(dotsContainer);
    }

    function refreshAllDots() {
        const dayCells = document.querySelectorAll('.fc-daygrid-day');
        dayCells.forEach(cell => {
            const dateStr = cell.getAttribute('data-date');
            if (dateStr) renderCellDots(cell, dateStr);
        });
    }

    // ==========================================
    // 右側時段狀況渲染
    // ==========================================
    function renderRightSlots(dateStr) {
        const titleEl = document.getElementById('selected-date-title');
        const container = document.getElementById('slots-container');
        
        if (titleEl) titleEl.textContent = `${dateStr} 時段狀況`;
        if (!container) return;
        container.innerHTML = '';

        if (fullBookingDates.has(dateStr)) {
            container.innerHTML = `
                <div class="full-booking-notice">
                    <p style="color: #e53e3e; font-weight: bold; font-size: 1.1rem; margin-bottom: 8px;">🔒 當天為【全天包場】</p>
                    <p style="color: #718096; font-size: 0.85rem;">暫不開放單時段預約。</p>
                    ${isAdmin ? `<button id="cancel-full-booking-btn" class="submit-btn" style="background:#e53e3e; margin-top:12px;">取消此日全包場</button>` : ''}
                </div>
            `;

            if (isAdmin) {
                const cancelBtn = document.getElementById('cancel-full-booking-btn');
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', async () => {
                        if (confirm(`確定要取消 ${dateStr} 的全包場設定嗎？`)) {
                            try {
                                const q = query(collection(db, "fullBookings"), where("date", "==", dateStr));
                                const querySnapshot = await getDocs(q);
                                querySnapshot.forEach(async (d) => {
                                    await deleteDoc(doc(db, "fullBookings", d.id));
                                });
                                alert("已成功取消全包場！");
                            } catch (err) {
                                console.error("取消全包場失敗：", err);
                            }
                        }
                    });
                }
            }
            return;
        }

        const slots = [...(allScheduleData[dateStr] || [])];

        if (slots.length === 0) {
            container.innerHTML = `<p class="placeholder-text">當天未排定任何時段</p>`;
            return;
        }

        slots.sort((a, b) => a.time.localeCompare(b.time));

        if (isAdmin) {
            const batchToolbar = document.createElement('div');
            batchToolbar.className = 'batch-toolbar';
            batchToolbar.style.cssText = 'grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; background: #edf2f7; padding: 10px 14px; border-radius: 8px; margin-bottom: 8px; font-size: 0.9rem;';
            batchToolbar.innerHTML = `
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                    <input type="checkbox" id="select-all-checkbox"> 全選當日時段
                </label>
                <button id="batch-delete-btn" class="submit-btn" style="background: #e53e3e; padding: 6px 12px; font-size: 0.85rem;" disabled>刪除所選時段</button>
            `;
            container.appendChild(batchToolbar);
        }

        slots.forEach((slot) => {
            const card = document.createElement('div');
            const isAvail = slot.isAvailable;
            card.className = `slot-card ${isAvail ? 'available' : 'booked'} clickable`;
            
            const statusText = isAvail ? '可預約' : (isAdmin && slot.studentName ? `已預約 (${slot.studentName})` : '已預約');

            card.innerHTML = `
                ${isAdmin ? `<input type="checkbox" class="slot-select-checkbox" data-id="${slot.id}" style="margin-right: 6px;" onclick="event.stopPropagation()">` : ''}
                <span>${slot.time}</span>
                <span class="status-subtext">${statusText}</span>
                ${isAdmin ? `
                    <div class="admin-actions">
                        <button class="edit-btn" title="編輯時段">✏️</button>
                        <button class="delete-btn" title="刪除時段">✕</button>
                    </div>
                ` : ''}
            `;

            // 卡片點擊事件
            card.addEventListener('click', async (e) => {
                if (e.target.closest('.admin-actions') || e.target.tagName === 'INPUT') return;

                if (!isAdmin) {
                    if (!isAvail) {
                        alert("此時段已被預約！");
                        return;
                    }
                    currentBookingSlotId = slot.id;
                    modalSlotInfo.textContent = `日期：${dateStr} ｜ 時段：${slot.time}`;
                    studentNameInput.value = "";
                    bookingModal.classList.remove('hidden');
                } else {
                    if (isAvail) {
                        alert("此時段目前為可預約狀態（尚無預約）。");
                        return;
                    }
                    currentBookingSlotId = slot.id;
                    adminModalSlotInfo.textContent = `日期：${dateStr} ｜ 時段：${slot.time}`;
                    
                    // 💡 管理者浮動頁面：支援直接修改預約姓名與勾選確認消除
                    adminBookingList.innerHTML = `
                        <div style="display: flex; flex-direction: column; gap: 10px; padding: 12px; background: #f7fafc; border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label style="font-size: 0.85rem; font-weight: bold; color: #4a5568; min-width: 60px;">預約姓名:</label>
                                <input type="text" id="admin-edit-student-name" value="${slot.studentName || ''}" style="flex: 1; padding: 6px 8px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 0.9rem;">
                                <button type="button" id="save-student-name-btn" class="submit-btn" style="padding: 6px 12px; font-size: 0.85rem; width: auto;">更新姓名</button>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
                                <span style="font-size: 0.85rem; color: #718096;">確認無誤後可釋出時段：</span>
                                <label style="cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 0.85rem; color: #e53e3e; font-weight: bold;">
                                    <input type="checkbox" id="confirm-clear-booking" style="width: 16px; height: 16px; cursor: pointer;"> 確認並消除 (釋出)
                                </label>
                            </div>
                        </div>
                    `;
                    adminBookingModal.classList.remove('hidden');

                    // 綁定「更新姓名」按鈕事件
                    const saveNameBtn = document.getElementById('save-student-name-btn');
                    const nameInputEl = document.getElementById('admin-edit-student-name');
                    if (saveNameBtn && nameInputEl) {
                        saveNameBtn.addEventListener('click', async () => {
                            const newName = nameInputEl.value.trim();
                            if (!newName) {
                                alert("學生姓名不能為空白！");
                                return;
                            }
                            try {
                                await updateDoc(doc(db, "schedule", currentBookingSlotId), {
                                    studentName: newName
                                });
                                alert("學員姓名已成功更新！");
                            } catch (err) {
                                console.error("更新姓名失敗：", err);
                                alert("更新失敗，請檢查主控台。");
                            }
                        });
                    }

                    // 綁定勾選「確認並消除（釋出時段並發送 Discord 取消通知）」事件
                    const clearCheckbox = document.getElementById('confirm-clear-booking');
                    if (clearCheckbox) {
                        clearCheckbox.addEventListener('change', async (ev) => {
                            if (ev.target.checked) {
                                if (confirm(`確定要取消此預約並將時段釋出嗎？（將自動發送取消通知到 Discord）`)) {
                                    try {
                                        const oldStudentName = slot.studentName || "未知學員";

                                        // 1. 更新資料庫：釋出時段並清空姓名
                                        await updateDoc(doc(db, "schedule", currentBookingSlotId), {
                                            isAvailable: true,
                                            studentName: ""
                                        });

                                        // 2. 🚀 發送 Discord 取消通知
                                        const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1570461741995917352/gdHO5nE9_leWt1viBpDxAKE1lAzg67I7UiosB9uQ5d_T7g2588qYNc6F3_CNw7-CRyM2";
                                        const cancelMessage = `❌ **【預約取消通知】**\n👤 **取消學員**：${oldStudentName}\n⏰ **日期：${dateStr} ｜ 時段：${slot.time}**\n*(時段已重新釋出為可預約)*`;
                                        
                                        await fetch(DISCORD_WEBHOOK_URL, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ content: cancelMessage })
                                        });

                                        adminBookingModal.classList.add('hidden');
                                        alert("已成功取消預約並將時段釋出！");
                                    } catch (err) {
                                        console.error("取消預約或發送通知失敗：", err);
                                        alert("時段已釋出，但 Discord 通知發送可能有些狀況。");
                                    }
                                } else {
                                    ev.target.checked = false;
                                }
                            }
                        });
                    }
                }
            });

            if (isAdmin) {
                const editBtn = card.querySelector('.edit-btn');
                if (editBtn) {
                    editBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const newTime = prompt(`請輸入修改後的時段 (格式範例: 10:00 - 10:40)：`, slot.time);
                        if (newTime && newTime.trim() !== "" && newTime !== slot.time) {
                            try {
                                await updateDoc(doc(db, "schedule", slot.id), { time: newTime.trim() });
                                alert("時段修改成功！");
                            } catch (err) {
                                console.error("修改失敗：", err);
                            }
                        }
                    });
                }

                const delBtn = card.querySelector('.delete-btn');
                if (delBtn) {
                    delBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm(`確定要刪除 ${slot.time} 時段嗎？`)) {
                            try { await deleteDoc(doc(db, "schedule", slot.id)); } 
                            catch (err) { console.error(err); }
                        }
                    });
                }
            }
            container.appendChild(card);
        });

        if (isAdmin) {
            const selectAllCheckbox = document.getElementById('select-all-checkbox');
            const batchDeleteBtn = document.getElementById('batch-delete-btn');
            const itemCheckboxes = container.querySelectorAll('.slot-select-checkbox');

            function updateBatchButtonState() {
                const checkedCount = container.querySelectorAll('.slot-select-checkbox:checked').length;
                if (batchDeleteBtn) {
                    batchDeleteBtn.disabled = checkedCount === 0;
                    batchDeleteBtn.textContent = checkedCount > 0 ? `刪除所選時段 (${checkedCount})` : `刪除所選時段`;
                }
            }

            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    itemCheckboxes.forEach(cb => cb.checked = isChecked);
                    updateBatchButtonState();
                });
            }

            itemCheckboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    updateBatchButtonState();
                    if (selectAllCheckbox) {
                        selectAllCheckbox.checked = Array.from(itemCheckboxes).every(item => item.checked);
                    }
                });
            });

            if (batchDeleteBtn) {
                batchDeleteBtn.addEventListener('click', async () => {
                    const checkedBoxes = container.querySelectorAll('.slot-select-checkbox:checked');
                    if (checkedBoxes.length === 0) return;

                    if (confirm(`確定要刪除選取的 ${checkedBoxes.length} 個時段嗎？`)) {
                        try {
                            const batch = writeBatch(db);
                            checkedBoxes.forEach(cb => {
                                const id = cb.getAttribute('data-id');
                                batch.delete(doc(db, "schedule", id));
                            });
                            await batch.commit();
                            alert("所選時段已成功批量刪除！");
                        } catch (err) {
                            console.error("批量刪除失敗：", err);
                        }
                    }
                });
            }
        }
    }

    // ==========================================
    // 彈窗事件監聽與 Discord 新預約通知
    // ==========================================
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', () => {
            bookingModal.classList.add('hidden');
        });
    }

    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentName = studentNameInput.value.trim();
            if (!studentName || !currentBookingSlotId) return;

            let targetSlotInfo = "未知時段";
            for (const date in allScheduleData) {
                const found = allScheduleData[date].find(s => s.id === currentBookingSlotId);
                if (found) {
                    targetSlotInfo = `日期：${date} ｜ 時段：${found.time}`;
                    break;
                }
            }

            try {
                // 1. 更新 Firebase 資料庫
                await updateDoc(doc(db, "schedule", currentBookingSlotId), {
                    isAvailable: false,
                    studentName: studentName
                });

                // 2. 發送 Discord 新預約通知
                const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1570461741995917352/gdHO5nE9_leWt1viBpDxAKE1lAzg67I7UiosB9uQ5d_T7g2588qYNc6F3_CNw7-CRyM2";
                const message = `🔔 **【新預約通知】**\n👤 **學員姓名**：${studentName}\n⏰ **${targetSlotInfo}**`;
                
                await fetch(DISCORD_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: message })
                });

                bookingModal.classList.add('hidden');
                alert(`預約成功！`);
            } catch (err) {
                console.error("預約或發送通知失敗：", err);
                alert("預約成功！");
            }
        });
    }

    if (adminModalCloseBtn) {
        adminModalCloseBtn.addEventListener('click', () => {
            adminBookingModal.classList.add('hidden');
        });
    }

        // 管理者面板登入切換
    if (adminToggleBtn) {
        adminToggleBtn.addEventListener('click', () => {
            if (!isAdmin) {
                const pwd = prompt("請輸入管理者密碼：");
                if (pwd === "1234") {
                    isAdmin = true;
                    adminToggleBtn.textContent = "🔓 管理者已登入";
                    adminToggleBtn.classList.add('unlocked');
                    adminPanel.classList.remove('hidden');
                    
                    // 💡 關鍵：登入成功時，在 body 加上 admin-mode 類別讓卡片變大
                    document.body.classList.add('admin-mode');
                    
                    renderRightSlots(selectedDate);
                } else if (pwd !== null) {
                    alert("密碼錯誤！");
                }
            } else {
                isAdmin = false;
                adminToggleBtn.textContent = "🔒 管理員登入";
                adminToggleBtn.classList.remove('unlocked');
                adminPanel.classList.add('hidden');
                
                // 💡 關鍵：登出時，移除 admin-mode 類別恢復原狀
                document.body.classList.remove('admin-mode');
                
                renderRightSlots(selectedDate);
            }
        });
    }

    // 長時段自動切片批次新增
    if (addSlotForm) {
        addSlotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const dateVal = inputDate.value;
            const startVal = startTimeInput.value;
            const endVal = endTimeInput.value;

            if (!dateVal || !startVal || !endVal) {
                alert("請完整選擇日期與總開始/結束時間！");
                return;
            }

            const totalStartMin = timeToMinutes(startVal);
            const totalEndMin = timeToMinutes(endVal);

            if (totalStartMin >= totalEndMin) {
                alert("結束時間必須大於開始時間！");
                return;
            }

            const [year, month, day] = dateVal.split('-').map(Number);
            const dayOfWeek = new Date(year, month - 1, day).getDay();
            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            let iceBreaks = [];
            if (isWeekday) {
                iceBreaks.push({ start: 880, end: 900 });
            } else if (isWeekend) {
                iceBreaks.push({ start: 830, end: 860 });
                iceBreaks.push({ start: 1010, end: 1040 });
            }

            let currentStart = totalStartMin;
            const slotsToCreate = [];

            while (currentStart + 40 <= totalEndMin) {
                let currentEnd = currentStart + 40;
                let hitIceBreak = false;

                for (let ice of iceBreaks) {
                    if (currentStart < ice.end && currentEnd > ice.start) {
                        currentStart = ice.end;
                        hitIceBreak = true;
                        break;
                    }
                }

                if (hitIceBreak) continue;

                slotsToCreate.push(`${minutesToTimeString(currentStart)} - ${minutesToTimeString(currentEnd)}`);
                currentStart = currentEnd;
            }

            if (slotsToCreate.length === 0) {
                alert("在您選取的區間內沒有產生任何有效時段。");
                return;
            }

            const previewText = slotsToCreate.join('\n');
            if (!confirm(`系統將為您自動切片並新增以下 ${slotsToCreate.length} 個時段：\n\n${previewText}\n\n確定要寫入資料庫嗎？`)) {
                return;
            }

            try {
                const batch = writeBatch(db);
                const scheduleRef = collection(db, "schedule");
                const existingSlots = allScheduleData[dateVal] || [];
                let addedCount = 0;

                for (const timeStr of slotsToCreate) {
                    const isDuplicate = existingSlots.some(slot => slot.time === timeStr);
                    if (!isDuplicate) {
                        const newDocRef = doc(scheduleRef);
                        batch.set(newDocRef, {
                            date: dateVal,
                            time: timeStr,
                            isAvailable: true,
                            studentName: ""
                        });
                        addedCount++;
                    }
                }

                if (addedCount > 0) await batch.commit();
                alert(`批次自動切片完成！\n成功新增：${addedCount} 個時段`);

            } catch (error) {
                console.error("批次新增失敗：", error);
            }
        });
    }

    // 每週反覆新增
    if (repeatWeeklyBtn) {
        repeatWeeklyBtn.addEventListener('click', async () => {
            const baseDateStr = inputDate.value;
            const startVal = startTimeInput.value;
            const endVal = endTimeInput.value;
            const weeks = parseInt(document.getElementById('repeat-weeks').value, 10);

            if (!baseDateStr || !startVal || !endVal) {
                alert("請先選擇起始日期與總起訖時間！");
                return;
            }

            if (!confirm(`確定要從 ${baseDateStr} 開始，自動切片並連續重複新增未來 ${weeks} 週嗎？`)) {
                return;
            }

            try {
                const batch = writeBatch(db);
                const scheduleRef = collection(db, "schedule");

                const [year, month, day] = baseDateStr.split('-').map(Number);
                let currentDate = new Date(year, month - 1, day);
                let totalAdded = 0;

                for (let i = 0; i < weeks; i++) {
                    const y = currentDate.getFullYear();
                    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
                    const d = String(currentDate.getDate()).padStart(2, '0');
                    const targetDateStr = `${y}-${m}-${d}`;

                    const dayOfWeek = currentDate.getDay();
                    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                    let iceBreaks = [];
                    if (isWeekday) iceBreaks.push({ start: 880, end: 900 });
                    else if (isWeekend) {
                        iceBreaks.push({ start: 830, end: 860 });
                        iceBreaks.push({ start: 1010, end: 1040 });
                    }

                    let curStart = timeToMinutes(startVal);
                    const tEnd = timeToMinutes(endVal);
                    const daySlotsToCreate = [];

                    while (curStart + 40 <= tEnd) {
                        let curEnd = curStart + 40;
                        let hit = false;
                        for (let ice of iceBreaks) {
                            if (curStart < ice.end && curEnd > ice.start) {
                                curStart = ice.end;
                                hit = true;
                                break;
                            }
                        }
                        if (hit) continue;
                        daySlotsToCreate.push(`${minutesToTimeString(curStart)} - ${minutesToTimeString(curEnd)}`);
                        curStart = curEnd;
                    }

                    const existingSlots = allScheduleData[targetDateStr] || [];
                    for (const timeStr of daySlotsToCreate) {
                        if (!existingSlots.some(s => s.time === timeStr)) {
                            const newDocRef = doc(scheduleRef);
                            batch.set(newDocRef, {
                                date: targetDateStr,
                                time: timeStr,
                                isAvailable: true,
                                studentName: ""
                            });
                            totalAdded++;
                        }
                    }

                    currentDate.setDate(currentDate.getDate() + 7);
                }

                if (totalAdded > 0) await batch.commit();
                alert(`批次每週反覆新增完成！\n總共成功新增：${totalAdded} 個時段`);

            } catch (error) {
                console.error("每週批次新增失敗：", error);
            }
        });
    }

    // 一鍵設定全包場
    if (setFullBookingBtn) {
        setFullBookingBtn.addEventListener('click', async () => {
            const dateVal = inputDate.value;
            if (!dateVal) {
                alert("請先選擇要設為全包場的日期！");
                return;
            }

            if (confirm(`確定要將 ${dateVal} 設定為「全天包場」嗎？`)) {
                try {
                    await addDoc(collection(db, "fullBookings"), {
                        date: dateVal,
                        createdAt: new Date()
                    });
                    alert(`${dateVal} 已成功設定為全包場！`);
                } catch (err) {
                    console.error("設定全包場失敗：", err);
                }
            }
        });
    }

    // Firebase 即時連動
    onSnapshot(collection(db, "schedule"), (snapshot) => {
        allScheduleData = {};
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!allScheduleData[data.date]) allScheduleData[data.date] = [];
            allScheduleData[data.date].push({ id: doc.id, ...data });
        });
        refreshAllDots();
        renderRightSlots(selectedDate);
    });

    onSnapshot(collection(db, "fullBookings"), (snapshot) => {
        fullBookingDates.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.date) fullBookingDates.add(data.date);
        });
        refreshAllDots();
        renderRightSlots(selectedDate);
    });
});
