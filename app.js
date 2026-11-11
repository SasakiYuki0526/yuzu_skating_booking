// app.js - 完整整合版
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
let allScheduleData = {};   // 儲存一般時段：{ '2026-11-15': [{id, time, isAvailable}, ...] }
let fullBookingDates = new Set(); // 儲存全包場日期字串集合 Set(['2026-11-20'])
let selectedDate = new Date().toISOString().split('T')[0]; // 當前選取日期 YYYY-MM-DD
let isAdmin = false;       // 管理者狀態

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

    // 預設日期填入今天
    if (inputDate) {
        inputDate.value = selectedDate;
    }

    // ------------------------------------------
    // A. 40 分鐘自動換算邏輯
    // ------------------------------------------
    if (startTimeInput && endTimeInput) {
        startTimeInput.addEventListener('change', () => {
            const val = startTimeInput.value;
            if (!val) {
                endTimeInput.value = "";
                return;
            }

            const [hours, minutes] = val.split(':').map(Number);
            const date = new Date();
            date.setHours(hours, minutes + 40, 0, 0);

            const endHours = String(date.getHours()).padStart(2, '0');
            const endMinutes = String(date.getMinutes()).padStart(2, '0');

            endTimeInput.value = `${endHours}:${endMinutes}`;
        });
    }

    // ------------------------------------------
    // B. 輔助函式：時間與特定提醒判斷
    // ------------------------------------------
    function getTimeRangeString() {
        if (!startTimeInput || !endTimeInput) return null;
        const start = startTimeInput.value;
        const end = endTimeInput.value;
        if (!start || !end) return null;
        return `${start} - ${end}`;
    }

    function timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    // 檢查時間是否落入特定警示時段 (平日 14:40~15:00 / 假日 13:50~14:20, 16:50~17:20)
    function checkSpecialTimeNotice(dateStr, timeStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const dayOfWeek = new Date(year, month - 1, day).getDay();

        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const [startStr, endStr] = timeStr.split(' - ').map(s => s.trim());
        const inputStart = timeToMinutes(startStr);
        const inputEnd = timeToMinutes(endStr);

        let specialRanges = [];
        if (isWeekday) {
            specialRanges.push({ name: "14:40 - 15:00", start: 880, end: 900 });
        } else if (isWeekend) {
            specialRanges.push({ name: "13:50 - 14:20", start: 830, end: 860 });
            specialRanges.push({ name: "16:50 - 17:20", start: 1010, end: 1040 });
        }

        for (const range of specialRanges) {
            if (inputStart < range.end && inputEnd > range.start) {
                const dayName = isWeekday ? "平日" : "假日";
                const warningMsg = `⚠️ 提醒：您新增的時段（${timeStr}）為${dayName}洗冰時間 ${range.name}！`;
                return confirm(`${warningMsg}\n\n請問確定仍要新增此時段嗎？`);
            }
        }
        return true;
    }

    // ------------------------------------------
    // C. 初始化 FullCalendar 迷你月曆
    // ------------------------------------------
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

    // ------------------------------------------
    // D. 圓點渲染與更新邏輯
    // ------------------------------------------
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

    // ------------------------------------------
    // E. 右側時段狀況渲染
    // ------------------------------------------
    function renderRightSlots(dateStr) {
        const titleEl = document.getElementById('selected-date-title');
        const container = document.getElementById('slots-container');
        
        if (titleEl) titleEl.textContent = `${dateStr} 時段狀況`;
        if (!container) return;
        container.innerHTML = '';

        // 判斷是否全包場
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

        const slots = allScheduleData[dateStr] || [];

        if (slots.length === 0) {
            container.innerHTML = `<p class="placeholder-text">當天未排定任何時段</p>`;
            return;
        }

        slots.sort((a, b) => a.time.localeCompare(b.time));

        slots.forEach((slot) => {
            const card = document.createElement('div');
            const isAvail = slot.isAvailable;

            card.className = `slot-card ${isAvail ? 'available' : 'booked'} ${isAdmin ? 'clickable' : ''}`;
            
            card.innerHTML = `
                <span>${slot.time}</span>
                <span class="status-subtext">${isAvail ? '可預約' : '已預約'}</span>
                ${isAdmin ? `
                    <div class="admin-actions">
                        ${isAvail 
                            ? `<button class="book-btn" title="標記為已預約">🚫</button>` 
                            : `<button class="release-btn" title="釋出時段 (回復可預約)">✅</button>`
                        }
                        <button class="delete-btn" title="刪除時段">✕</button>
                    </div>
                ` : ''}
            `;

            if (isAdmin) {
                // 點擊卡片切換狀態
                card.addEventListener('click', async (e) => {
                    if (e.target.closest('.admin-actions')) return;
                    try {
                        await updateDoc(doc(db, "schedule", slot.id), { isAvailable: !isAvail });
                    } catch (err) { console.error(err); }
                });

                // 🚫 標記預約
                const bookBtn = card.querySelector('.book-btn');
                if (bookBtn) {
                    bookBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try { await updateDoc(doc(db, "schedule", slot.id), { isAvailable: false }); } 
                        catch (err) { console.error(err); }
                    });
                }

                // ✅ 釋出回復
                const releaseBtn = card.querySelector('.release-btn');
                if (releaseBtn) {
                    releaseBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try { await updateDoc(doc(db, "schedule", slot.id), { isAvailable: true }); } 
                        catch (err) { console.error(err); }
                    });
                }

                // ✕ 刪除
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
    }

    // ------------------------------------------
    // F. 管理者切換與解鎖
    // ------------------------------------------
    if (adminToggleBtn) {
        adminToggleBtn.addEventListener('click', () => {
            if (!isAdmin) {
                const pwd = prompt("請輸入管理者密碼：");
                if (pwd === "1234") { // 可自行更改密碼
                    isAdmin = true;
                    adminToggleBtn.textContent = "🔓 管理者已登入";
                    adminToggleBtn.classList.add('unlocked');
                    adminPanel.classList.remove('hidden');
                    renderRightSlots(selectedDate);
                } else if (pwd !== null) {
                    alert("密碼錯誤！");
                }
            } else {
                isAdmin = false;
                adminToggleBtn.textContent = "登入";
                adminToggleBtn.classList.remove('unlocked');
                adminPanel.classList.add('hidden');
                renderRightSlots(selectedDate);
            }
        });
    }

    // ------------------------------------------
    // G. 表單動作：單筆新增
    // ------------------------------------------
    if (addSlotForm) {
        addSlotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const dateVal = inputDate.value;
            const timeVal = getTimeRangeString();

            if (!dateVal || !timeVal) {
                alert("請完整選擇開始與結束時間！");
                return;
            }

            if (!checkSpecialTimeNotice(dateVal, timeVal)) return;

            const existingSlots = allScheduleData[dateVal] || [];
            if (existingSlots.some(slot => slot.time === timeVal)) {
                alert(`新增失敗：${dateVal} 已經存在「${timeVal}」時段！`);
                return;
            }

            try {
                await addDoc(collection(db, "schedule"), {
                    date: dateVal,
                    time: timeVal,
                    isAvailable: true
                });
                alert("新增時段成功！");
            } catch (error) {
                console.error("新增失敗：", error);
            }
        });
    }

    // ------------------------------------------
    // H. 表單動作：一鍵每週反覆新增
    // ------------------------------------------
    if (repeatWeeklyBtn) {
        repeatWeeklyBtn.addEventListener('click', async () => {
            const baseDateStr = inputDate.value;
            const timeVal = getTimeRangeString();
            const weeks = parseInt(document.getElementById('repeat-weeks').value, 10);

            if (!baseDateStr || !timeVal) {
                alert("請先選擇「起始日期」與完整的「開始/結束時間」！");
                return;
            }

            if (!checkSpecialTimeNotice(baseDateStr, timeVal)) return;

            if (!confirm(`確定要從 ${baseDateStr} 開始，將時段「${timeVal}」連續新增未來 ${weeks} 週嗎？`)) {
                return;
            }

            try {
                const batch = writeBatch(db);
                const scheduleRef = collection(db, "schedule");

                const [year, month, day] = baseDateStr.split('-').map(Number);
                let currentDate = new Date(year, month - 1, day);

                let addedCount = 0;
                let skippedCount = 0;

                for (let i = 0; i < weeks; i++) {
                    const y = currentDate.getFullYear();
                    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
                    const d = String(currentDate.getDate()).padStart(2, '0');
                    const targetDateStr = `${y}-${m}-${d}`;

                    const existingSlots = allScheduleData[targetDateStr] || [];
                    if (existingSlots.some(slot => slot.time === timeVal)) {
                        skippedCount++;
                    } else {
                        const newDocRef = doc(scheduleRef);
                        batch.set(newDocRef, {
                            date: targetDateStr,
                            time: timeVal,
                            isAvailable: true
                        });
                        addedCount++;
                    }
                    currentDate.setDate(currentDate.getDate() + 7);
                }

                if (addedCount > 0) await batch.commit();

                let resultMsg = `批次處理完成！\n成功新增：${addedCount} 個週次`;
                if (skippedCount > 0) resultMsg += `\n自動跳過（已存在相同時段）：${skippedCount} 個週次`;
                alert(resultMsg);

            } catch (error) {
                console.error("批量新增失敗：", error);
            }
        });
    }

    // ------------------------------------------
    // I. 表單動作：一鍵設定全包場
    // ------------------------------------------
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

    // ------------------------------------------
    // J. Firebase 即時連動 (schedule + fullBookings)
    // ------------------------------------------
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
