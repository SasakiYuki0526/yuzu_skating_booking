import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    getDocs
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
    const appContainer = document.getElementById('students-app');

    // 檢查管理員登入狀態
    let authed = sessionStorage.getItem('skatingAdminAuth') === 'true';
    if (!authed) {
        const pwd = prompt("請先輸入管理者密碼以使用學員管理系統：");
        if (pwd === "101010") {
            sessionStorage.setItem('skatingAdminAuth', 'true');
            authed = true;
        } else {
            alert("未通過管理員驗證，將返回預約頁面。");
            window.location.href = 'index.html';
            return;
        }
    }

    appContainer.classList.remove('hidden');

    // 導覽按鈕
    document.getElementById('back-home-btn')?.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    document.getElementById('go-products-btn')?.addEventListener('click', () => {
        window.location.href = 'products.html';
    });

    // 一鍵匯入既有預約學員與紀錄
    const syncHistoryBtn = document.getElementById('sync-history-btn');
    syncHistoryBtn?.addEventListener('click', async () => {
        if (!confirm("要將目前行事曆中所有已預約的學員與上課日期自動匯入學員名單與上課紀錄嗎？（已存在的相同紀錄會自動略過）")) {
            return;
        }

        syncHistoryBtn.disabled = true;
        syncHistoryBtn.textContent = "⏳ 同步中...";

        try {
            const scheduleSnap = await getDocs(collection(db, "schedule"));
            const existingStudentsSnap = await getDocs(collection(db, "students"));
            const existingLogsSnap = await getDocs(collection(db, "lessonLogs"));

            const existingStudentNames = new Set();
            existingStudentsSnap.forEach(docSnap => {
                const name = (docSnap.data().name || "").trim();
                if (name) existingStudentNames.add(name);
            });

            const existingLogKeys = new Set();
            existingLogsSnap.forEach(docSnap => {
                const d = docSnap.data();
                const key = `${(d.studentName || "").trim()}|${d.date || ""}|${d.time || ""}`;
                existingLogKeys.add(key);
            });

            let addedStudentsCount = 0;
            let addedLogsCount = 0;

            for (const docSnap of scheduleSnap.docs) {
                const slot = docSnap.data();
                const isBlocked = slot.studentName === "不開放" || slot.lessonType === "不開放";
                if (slot.isAvailable || isBlocked || !slot.studentName) continue;

                const names = String(slot.studentName)
                    .split('、')
                    .map(n => n.trim())
                    .filter(n => n !== "");

                for (const cleanName of names) {
                    if (!existingStudentNames.has(cleanName)) {
                        await addDoc(collection(db, "students"), {
                            name: cleanName,
                            tag: "",
                            level: "",
                            contact: "",
                            note: "由既有預約匯入",
                            createdAt: new Date().toISOString()
                        });
                        existingStudentNames.add(cleanName);
                        addedStudentsCount++;
                    }

                    const logKey = `${cleanName}|${slot.date || ""}|${slot.time || ""}`;
                    if (!existingLogKeys.has(logKey)) {
                        await addDoc(collection(db, "lessonLogs"), {
                            studentName: cleanName,
                            date: slot.date || "",
                            time: slot.time || "",
                            lessonType: slot.lessonType || "1v1",
                            status: "已預約",
                            content: "",
                            createdAt: new Date().toISOString()
                        });
                        existingLogKeys.add(logKey);
                        addedLogsCount++;
                    }
                }
            }

            alert(`同步完成！\n新增學員：${addedStudentsCount} 位\n新增上課紀錄：${addedLogsCount} 筆`);
        } catch (err) {
            console.error("匯入既有預約失敗：", err);
            alert("匯入失敗，請檢查主控台與 Firebase 權限。");
        } finally {
            syncHistoryBtn.disabled = false;
            syncHistoryBtn.textContent = "🔄 匯入既有預約學員";
        }
    });

    // 學員表單與列表 DOM
    const studentForm = document.getElementById('student-form');
    const studentFormTitle = document.getElementById('student-form-title');
    const editStudentIdInput = document.getElementById('edit-student-id');
    const studentNameInput = document.getElementById('student-name');
    const studentTagInput = document.getElementById('student-tag');
    const studentTagSuggestions = document.getElementById('student-tag-suggestions');
    const studentLevelInput = document.getElementById('student-level');
    const studentContactInput = document.getElementById('student-contact');
    const studentNoteInput = document.getElementById('student-note');
    const studentSubmitBtn = document.getElementById('student-submit-btn');
    const studentCancelBtn = document.getElementById('student-cancel-btn');
    const studentTagFilter = document.getElementById('student-tag-filter');
    const studentSearchInput = document.getElementById('student-search-input');
    const studentListEl = document.getElementById('student-list');

    // 上課紀錄 DOM
    const selectedStudentTitle = document.getElementById('selected-student-title');
    const selectedStudentMeta = document.getElementById('selected-student-meta');
    const addLogForm = document.getElementById('add-log-form');
    const logDateInput = document.getElementById('log-date');
    const logTimeInput = document.getElementById('log-time');
    const logTypeInput = document.getElementById('log-type');
    const logContentInput = document.getElementById('log-content');
    const lessonLogsContainer = document.getElementById('lesson-logs-container');

    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
    if (logDateInput) logDateInput.value = todayStr;

    let studentsData = [];
    let allLogsData = [];
    let selectedStudentName = null;

    function resetStudentForm() {
        studentForm.reset();
        editStudentIdInput.value = "";
        studentFormTitle.textContent = "👤 新增學員";
        studentSubmitBtn.textContent = "儲存學員";
        studentCancelBtn.classList.add('hidden');
    }

    studentCancelBtn?.addEventListener('click', resetStudentForm);

    // 新增或編輯學員（同名合併為同一位學員）
    studentForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = editStudentIdInput.value;
        const name = studentNameInput.value.trim();
        const tag = studentTagInput.value.trim();
        const level = studentLevelInput.value.trim();
        const contact = studentContactInput.value.trim();
        const note = studentNoteInput.value.trim();

        if (!name) return alert("請輸入學員姓名！");

        try {
            if (editId) {
                await updateDoc(doc(db, "students", editId), {
                    name, tag, level, contact, note
                });
                if (selectedStudentName !== name) {
                    selectedStudentName = name;
                }
                alert("學員資料已更新！");
                resetStudentForm();
            } else {
                const existing = studentsData.find(s => s.name === name);
                if (existing) {
                    await updateDoc(doc(db, "students", existing.id), {
                        tag: tag || existing.tag || "",
                        level: level || existing.level || "",
                        contact: contact || existing.contact || "",
                        note: note || existing.note || ""
                    });
                    selectedStudentName = name;
                    alert(`已找到同名學員「${name}」，已將資料合併至同一位學員。`);
                } else {
                    await addDoc(collection(db, "students"), {
                        name, tag, level, contact, note,
                        createdAt: new Date().toISOString()
                    });
                    selectedStudentName = name;
                    alert("已新增學員！");
                }
                resetStudentForm();
            }
            renderStudentsList();
            renderLessonLogs();
        } catch (err) {
            console.error("儲存學員失敗：", err);
            alert("儲存失敗，請檢查主控台。");
        }
    });

    function refreshTagOptions(uniqueList) {
        const currentFilter = studentTagFilter?.value || 'ALL';
        const tagSet = new Set();
        uniqueList.forEach(s => tagSet.add((s.tag || "").trim() || '未分類'));

        if (studentTagFilter) {
            studentTagFilter.innerHTML = `<option value="ALL">全部標籤</option>`;
            Array.from(tagSet)
                .sort((a, b) => {
                    if (a === '未分類') return 1;
                    if (b === '未分類') return -1;
                    return a.localeCompare(b, 'zh-Hant');
                })
                .forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t;
                    opt.textContent = t;
                    studentTagFilter.appendChild(opt);
                });
            if (Array.from(tagSet).includes(currentFilter)) {
                studentTagFilter.value = currentFilter;
            }
        }

        if (studentTagSuggestions) {
            const defaults = ['檢定班', '基礎班', '成人班', '冰舞'];
            tagSet.forEach(t => {
                if (t !== '未分類') defaults.push(t);
            });
            studentTagSuggestions.innerHTML = Array.from(new Set(defaults))
                .map(t => `<option value="${t}">`)
                .join('');
        }
    }

    function renderStudentsList() {
        const keyword = (studentSearchInput?.value || "").trim().toLowerCase();
        const selectedTag = studentTagFilter?.value || 'ALL';
        studentListEl.innerHTML = '';

        const uniqueMap = new Map();
        studentsData.forEach(s => {
            if (!uniqueMap.has(s.name)) {
                uniqueMap.set(s.name, s);
            }
        });

        const uniqueList = Array.from(uniqueMap.values());
        refreshTagOptions(uniqueList);

        const activeTag = studentTagFilter?.value || selectedTag;
        const list = uniqueList
            .filter(s => {
                const sTag = (s.tag || "").trim() || '未分類';
                const matchTag = activeTag === 'ALL' || sTag === activeTag;
                const matchName = !keyword || s.name.toLowerCase().includes(keyword);
                return matchTag && matchName;
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

        if (list.length === 0) {
            studentListEl.innerHTML = `<p class="empty-tip">尚無符合的學員資料</p>`;
            return;
        }

        list.forEach(s => {
            const logCount = allLogsData.filter(l => l.studentName === s.name).length;
            const tagBadge = s.tag ? `<span class="student-tag-badge">${s.tag}</span>` : '';
            const item = document.createElement('div');
            item.className = `student-item ${selectedStudentName === s.name ? 'active' : ''}`;
            item.innerHTML = `
                <div>
                    <div class="student-name-row">${s.name}${tagBadge} <span style="font-size:0.78rem; color:#2b6cb0; font-weight:600;">(${logCount} 筆上課紀錄)</span></div>
                    <div class="student-sub">${s.level ? `級別：${s.level}` : '未填級別'}${s.note ? ` ｜ ${s.note}` : ''}</div>
                </div>
                <div class="student-actions">
                    <button type="button" class="small-btn edit-btn" data-id="${s.id}">編輯</button>
                    <button type="button" class="small-btn del-btn" data-name="${s.name}" data-id="${s.id}">刪除</button>
                </div>
            `;

            item.addEventListener('click', () => {
                selectedStudentName = s.name;
                renderStudentsList();
                renderLessonLogs();
            });

            studentListEl.appendChild(item);
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.getAttribute('data-id');
                const target = studentsData.find(s => s.id === id);
                if (target) {
                    editStudentIdInput.value = target.id;
                    studentNameInput.value = target.name || "";
                    studentTagInput.value = target.tag || "";
                    studentLevelInput.value = target.level || "";
                    studentContactInput.value = target.contact || "";
                    studentNoteInput.value = target.note || "";
                    studentFormTitle.textContent = "✏️ 編輯學員";
                    studentSubmitBtn.textContent = "更新資料";
                    studentCancelBtn.classList.remove('hidden');
                }
            });
        });

        document.querySelectorAll('.del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.getAttribute('data-id');
                const name = e.target.getAttribute('data-name');
                if (confirm(`確定要刪除學員「${name}」嗎？（不會刪除歷史上課紀錄）`)) {
                    try {
                        await deleteDoc(doc(db, "students", id));
                        if (selectedStudentName === name) {
                            selectedStudentName = null;
                            renderLessonLogs();
                        }
                    } catch (err) {
                        console.error("刪除學員失敗：", err);
                    }
                }
            });
        });
    }

    studentTagFilter?.addEventListener('change', renderStudentsList);
    studentSearchInput?.addEventListener('input', renderStudentsList);

    // 手動新增單筆上課紀錄
    addLogForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedStudentName) return alert("請先選擇學員！");

        const dateVal = logDateInput.value;
        const timeVal = logTimeInput.value.trim();
        const typeVal = logTypeInput.value.trim() || "1v1";
        const contentVal = logContentInput.value.trim();

        if (!dateVal) return alert("請選擇上課日期！");

        try {
            await addDoc(collection(db, "lessonLogs"), {
                studentName: selectedStudentName,
                date: dateVal,
                time: timeVal,
                lessonType: typeVal,
                status: "已記錄",
                content: contentVal,
                createdAt: new Date().toISOString()
            });
            logContentInput.value = "";
            alert("已新增上課紀錄！");
        } catch (err) {
            console.error("新增上課紀錄失敗：", err);
            alert("新增失敗。");
        }
    });

    function renderLessonLogs() {
        if (!selectedStudentName) {
            selectedStudentTitle.textContent = "📖 上課情形紀錄";
            selectedStudentMeta.textContent = "請從左側選擇一位學員查看與記錄上課情形";
            addLogForm.classList.add('hidden');
            lessonLogsContainer.innerHTML = `<p class="empty-tip">尚未選擇學員</p>`;
            return;
        }

        const studentObj = studentsData.find(s => s.name === selectedStudentName);
        selectedStudentTitle.textContent = `📖 ${selectedStudentName} 的上課情形`;
        selectedStudentMeta.textContent = studentObj
            ? `標籤：${studentObj.tag || '未分類'} ｜ 級別：${studentObj.level || '未設定'} ｜ 聯絡：${studentObj.contact || '未設定'} ｜ 備註：${studentObj.note || '無'}`
            : `學員：${selectedStudentName}`;
        addLogForm.classList.remove('hidden');

        const logs = allLogsData
            .filter(l => l.studentName === selectedStudentName)
            .sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || ""));

        if (logs.length === 0) {
            lessonLogsContainer.innerHTML = `<p class="empty-tip">這位學員目前尚無上課紀錄（有預約時會自動建立，也可於上方手動新增）</p>`;
            return;
        }

        lessonLogsContainer.innerHTML = '';
        logs.forEach(log => {
            const card = document.createElement('div');
            card.className = 'log-card';
            card.innerHTML = `
                <div class="log-card-top">
                    <div>
                        <span class="log-date-badge">📅 ${log.date}</span>
                        ${log.time ? `<span style="font-size:0.85rem; color:#4a5568; margin-left:6px;">⏰ ${log.time}</span>` : ''}
                    </div>
                    <span class="log-type-badge">${log.lessonType || '課程'}</span>
                </div>
                <textarea class="log-content-input" data-id="${log.id}" rows="2" placeholder="填寫本堂上課情形、動作表現或下次重點...">${log.content || ''}</textarea>
                <div class="log-card-footer">
                    <button type="button" class="small-btn save-log-btn" data-id="${log.id}">儲存情形</button>
                    <button type="button" class="small-btn del-btn delete-log-btn" data-id="${log.id}">刪除</button>
                </div>
            `;
            lessonLogsContainer.appendChild(card);
        });

        document.querySelectorAll('.save-log-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const logId = e.target.getAttribute('data-id');
                const textarea = lessonLogsContainer.querySelector(`.log-content-input[data-id="${logId}"]`);
                const content = textarea ? textarea.value.trim() : "";
                try {
                    await updateDoc(doc(db, "lessonLogs", logId), {
                        content,
                        status: "已記錄",
                        updatedAt: new Date().toISOString()
                    });
                    alert("上課情形已儲存！");
                } catch (err) {
                    console.error("儲存上課情形失敗：", err);
                    alert("儲存失敗。");
                }
            });
        });

        document.querySelectorAll('.delete-log-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const logId = e.target.getAttribute('data-id');
                if (confirm("確定要刪除這筆上課紀錄嗎？")) {
                    try {
                        await deleteDoc(doc(db, "lessonLogs", logId));
                    } catch (err) {
                        console.error("刪除上課紀錄失敗：", err);
                    }
                }
            });
        });
    }

    // 即時監聽學員名單
    onSnapshot(collection(db, "students"), (snapshot) => {
        studentsData = [];
        snapshot.forEach(docSnap => {
            studentsData.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderStudentsList();
        renderLessonLogs();
    });

    // 即時監聽上課紀錄
    onSnapshot(collection(db, "lessonLogs"), (snapshot) => {
        allLogsData = [];
        snapshot.forEach(docSnap => {
            allLogsData.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderStudentsList();
        renderLessonLogs();
    });
});