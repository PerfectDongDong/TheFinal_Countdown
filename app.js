let appData = {
    birthday: null,
    lifeExpectancy: 80,
    tasks: [],
    theme: 'auto'
};

let editingTaskId = null;
let autoBackupInterval = null;

function getBeijingDate() {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
    return beijingTime;
}

function toBeijingISOString(date) {
    const d = date || getBeijingDate();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatBeijingTime(timestamp) {
    const date = new Date(timestamp);
    const beijingDate = new Date(date.getTime() + (date.getTimezoneOffset() + 480) * 60000);
    return beijingDate.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    await loadAppData();
    initEventListeners();
    restoreActiveTab();
    updateUI();
    setInterval(updateCountdown, 1000);
    startAutoBackup();
});

async function initDatabase() {
    try {
        await db.init();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        alert('数据库初始化失败，将使用本地存储作为备用方案');
    }
}

async function loadAppData() {
    try {
        const settings = await db.getAllSettings();
        appData.birthday = settings.birthday || null;
        appData.lifeExpectancy = settings.lifeExpectancy || 80;
        appData.theme = settings.theme || 'auto';
        
        appData.tasks = await db.getAllTasks();
    } catch (error) {
        console.error('Failed to load from database, falling back to localStorage:', error);
        loadFromLocalStorage();
    }
    applyTheme();
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('final-countdown-data');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            appData = data;
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
        }
    }
}

async function saveAppData() {
    try {
        await db.saveSettings('birthday', appData.birthday);
        await db.saveSettings('lifeExpectancy', appData.lifeExpectancy);
        await db.saveSettings('theme', appData.theme);
    } catch (error) {
        console.error('Failed to save to database, falling back to localStorage:', error);
        saveToLocalStorage();
    }
}

function saveToLocalStorage() {
    localStorage.setItem('final-countdown-data', JSON.stringify(appData));
}

function startAutoBackup() {
    autoBackupInterval = setInterval(async () => {
        try {
            await db.createBackup('自动定时备份');
        } catch (error) {
            console.error('自动备份失败:', error);
        }
    }, 24 * 60 * 60 * 1000);
}

function initEventListeners() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.getElementById('save-settings').addEventListener('click', saveUserSettings);
    document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal());
    document.getElementById('close-modal').addEventListener('click', closeTaskModal);
    document.getElementById('cancel-task').addEventListener('click', closeTaskModal);
    document.getElementById('save-task').addEventListener('click', saveTask);
    document.getElementById('theme-select').addEventListener('change', changeTheme);
    
    document.getElementById('export-json').addEventListener('click', exportJSON);
    document.getElementById('export-csv').addEventListener('click', exportCSV);
    document.getElementById('import-data').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });
    document.getElementById('create-backup').addEventListener('click', createManualBackup);
    document.getElementById('view-backups').addEventListener('click', openBackupsModal);
    document.getElementById('clear-backups').addEventListener('click', clearAllBackups);
    document.getElementById('clear-data').addEventListener('click', clearData);
    document.getElementById('close-backups-modal').addEventListener('click', closeBackupsModal);
    document.getElementById('close-backups-btn').addEventListener('click', closeBackupsModal);

    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.id = 'import-file';
    importInput.accept = '.json,.csv';
    importInput.style.display = 'none';
    importInput.addEventListener('change', importData);
    document.body.appendChild(importInput);

    document.getElementById('task-modal').addEventListener('click', (e) => {
        if (e.target.id === 'task-modal') {
            closeTaskModal();
        }
    });

    document.getElementById('backups-modal').addEventListener('click', (e) => {
        if (e.target.id === 'backups-modal') {
            closeBackupsModal();
        }
    });
}

function switchTab(tabName) {
    document.documentElement.dataset.activeTab = tabName;
    localStorage.setItem('final-countdown-active-tab', tabName);
}

function restoreActiveTab() {
    const savedTab = localStorage.getItem('final-countdown-active-tab');
    if (savedTab && ['countdown', 'tasks', 'settings'].includes(savedTab)) {
        document.documentElement.dataset.activeTab = savedTab;
    }
}

async function saveUserSettings() {
    const birthdayInput = document.getElementById('birthday').value;
    const lifeExpectancy = parseInt(document.getElementById('life-expectancy').value);
    
    if (!birthdayInput) {
        alert('请选择出生日期');
        return;
    }
    
    // 将出生日期设置为北京时间 00:00:00
    const birthday = new Date(birthdayInput + 'T00:00:00+08:00');
    appData.birthday = birthday.toISOString();
    appData.lifeExpectancy = lifeExpectancy;
    await saveAppData();
    await db.createBackup('设置更新后自动备份');
    updateUI();
    alert('设置已保存');
}

function updateUI() {
    if (appData.birthday) {
        const birthdayDate = new Date(appData.birthday);
        const year = birthdayDate.getFullYear();
        const month = String(birthdayDate.getMonth() + 1).padStart(2, '0');
        const day = String(birthdayDate.getDate()).padStart(2, '0');
        document.getElementById('birthday').value = `${year}-${month}-${day}`;
        document.getElementById('life-expectancy').value = appData.lifeExpectancy;
        updateCountdown();
    }
    
    document.getElementById('theme-select').value = appData.theme;
    renderTasks();
}

function updateCountdown() {
    if (!appData.birthday) {
        document.getElementById('years-left').textContent = '--';
        document.getElementById('months-left').textContent = '--';
        document.getElementById('days-left').textContent = '--';
        document.getElementById('hours-left').textContent = '--';
        document.getElementById('minutes-left').textContent = '--';
        document.getElementById('seconds-left').textContent = '--';
        document.getElementById('total-days-left').textContent = '--';
        document.getElementById('years-lived').textContent = '--';
        document.getElementById('months-lived').textContent = '--';
        document.getElementById('days-lived').textContent = '--';
        document.getElementById('hours-lived').textContent = '--';
        document.getElementById('minutes-lived').textContent = '--';
        document.getElementById('seconds-lived').textContent = '--';
        document.getElementById('total-days-lived').textContent = '--';
        document.getElementById('life-progress').style.width = '0%';
        document.getElementById('progress-text').textContent = '生命进度: --%';
        return;
    }
    
    const birthday = new Date(appData.birthday);
    const today = getBeijingDate();
    const deathDate = new Date(birthday);
    deathDate.setFullYear(birthday.getUTCFullYear() + appData.lifeExpectancy);
    
    const totalDaysLived = Math.floor((today - birthday) / (1000 * 60 * 60 * 24));
    const diff = deathDate - today;
    const totalDaysLeft = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    
    const livedTime = calculateTimeComponents(birthday, today);
    const leftTime = calculateTimeComponents(today, deathDate);
    
    if (diff <= 0) {
        document.getElementById('years-left').textContent = '0';
        document.getElementById('months-left').textContent = '0';
        document.getElementById('days-left').textContent = '0';
        document.getElementById('hours-left').textContent = '0';
        document.getElementById('minutes-left').textContent = '0';
        document.getElementById('seconds-left').textContent = '0';
        document.getElementById('total-days-left').textContent = '0';
        document.getElementById('life-progress').style.width = '100%';
        document.getElementById('progress-text').textContent = '生命进度: 100%';
    } else {
        document.getElementById('years-left').textContent = leftTime.years;
        document.getElementById('months-left').textContent = leftTime.months;
        document.getElementById('days-left').textContent = leftTime.days;
        document.getElementById('hours-left').textContent = leftTime.hours;
        document.getElementById('minutes-left').textContent = leftTime.minutes;
        document.getElementById('seconds-left').textContent = leftTime.seconds;
        document.getElementById('total-days-left').textContent = totalDaysLeft.toLocaleString();
    }
    
    document.getElementById('years-lived').textContent = livedTime.years;
    document.getElementById('months-lived').textContent = livedTime.months;
    document.getElementById('days-lived').textContent = livedTime.days;
    document.getElementById('hours-lived').textContent = livedTime.hours;
    document.getElementById('minutes-lived').textContent = livedTime.minutes;
    document.getElementById('seconds-lived').textContent = livedTime.seconds;
    document.getElementById('total-days-lived').textContent = totalDaysLived.toLocaleString();
    
    const totalDays = appData.lifeExpectancy * 365;
    const progress = Math.min((totalDaysLived / totalDays) * 100, 100);
    
    document.getElementById('life-progress').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `生命进度: ${progress.toFixed(1)}%`;
}

function calculateTimeComponents(startDate, endDate) {
    let years = endDate.getFullYear() - startDate.getFullYear();
    let months = endDate.getMonth() - startDate.getMonth();
    let days = endDate.getDate() - startDate.getDate();
    let hours = endDate.getHours() - startDate.getHours();
    let minutes = endDate.getMinutes() - startDate.getMinutes();
    let seconds = endDate.getSeconds() - startDate.getSeconds();
    
    if (seconds < 0) {
        seconds += 60;
        minutes--;
    }
    if (minutes < 0) {
        minutes += 60;
        hours--;
    }
    if (hours < 0) {
        hours += 24;
        days--;
    }
    if (days < 0) {
        months--;
        const prevMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
        days += prevMonth.getDate();
    }
    if (months < 0) {
        years--;
        months += 12;
    }
    
    return { years, months, days, hours, minutes, seconds };
}

function initYearSelect() {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const yearSelect = document.getElementById('task-year');
    
    yearSelect.innerHTML = `
        <option value="${currentYear}">${currentYear}年 (今年)</option>
        <option value="${nextYear}">${nextYear}年 (明年)</option>
        <option value="later">以后</option>
    `;
}

function openTaskModal(taskId = null) {
    editingTaskId = taskId;
    const modal = document.getElementById('task-modal');
    const modalTitle = document.getElementById('modal-title');
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    initYearSelect();
    
    if (taskId) {
        const task = appData.tasks.find(t => t.id === taskId);
        if (task) {
            modalTitle.textContent = '编辑任务';
            document.getElementById('task-title').value = task.title;
            document.getElementById('task-description').value = task.description || '';
            document.getElementById('task-completed').checked = task.completed;
            
            if (task.year === currentYear) {
                document.getElementById('task-year').value = currentYear;
            } else if (task.year === nextYear) {
                document.getElementById('task-year').value = nextYear;
            } else {
                document.getElementById('task-year').value = 'later';
            }
        }
    } else {
        modalTitle.textContent = '添加任务';
        document.getElementById('task-title').value = '';
        document.getElementById('task-description').value = '';
        document.getElementById('task-year').value = currentYear;
        document.getElementById('task-completed').checked = false;
    }
    
    modal.classList.add('active');
}

function closeTaskModal() {
    document.getElementById('task-modal').classList.remove('active');
    editingTaskId = null;
}

async function saveTask() {
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const yearValue = document.getElementById('task-year').value;
    let year;
    
    if (yearValue === 'later') {
        year = 9999;
    } else {
        year = parseInt(yearValue);
    }
    
    const completed = document.getElementById('task-completed').checked;
    
    if (!title) {
        alert('请输入任务标题');
        return;
    }
    
    if (editingTaskId) {
        const task = appData.tasks.find(t => t.id === editingTaskId);
        if (task) {
            task.title = title;
            task.description = description;
            task.year = year;
            task.completed = completed;
            task.updatedAt = toBeijingISOString();
            try {
                await db.updateTask(task);
            } catch (error) {
                console.error('Failed to update task in database:', error);
            }
        }
    } else {
        const newTask = {
            id: Date.now().toString(),
            title,
            description,
            year,
            completed,
            createdAt: toBeijingISOString(),
            updatedAt: toBeijingISOString()
        };
        appData.tasks.push(newTask);
        try {
            await db.addTask(newTask);
        } catch (error) {
            console.error('Failed to add task to database:', error);
        }
    }
    
    await saveAppData();
    renderTasks();
    closeTaskModal();
}

async function deleteTask(taskId) {
    if (!confirm('⚠️ 确定要删除这个任务吗？此操作不可恢复！')) {
        return;
    }
    
    appData.tasks = appData.tasks.filter(t => t.id !== taskId);
    try {
        await db.deleteTask(taskId);
    } catch (error) {
        console.error('Failed to delete task from database:', error);
    }
    await saveAppData();
    renderTasks();
}

async function toggleTaskComplete(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        task.updatedAt = toBeijingISOString();
        try {
            await db.updateTask(task);
        } catch (error) {
            console.error('Failed to update task in database:', error);
        }
        await saveAppData();
        renderTasks();
    }
}

function renderTasks() {
    const tasksGroups = document.getElementById('tasks-groups');
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    const thisYearTasks = appData.tasks.filter(t => t.year === currentYear);
    const nextYearTasks = appData.tasks.filter(t => t.year === nextYear);
    const laterTasks = appData.tasks.filter(t => t.year > nextYear);
    
    let html = '';
    
    html += renderTaskGroup('📅 今年 (' + currentYear + '年)', thisYearTasks);
    html += renderTaskGroup('📆 明年 (' + nextYear + '年)', nextYearTasks);
    html += renderTaskGroup('🌟 以后', laterTasks);
    
    const hasTasks = thisYearTasks.length > 0 || nextYearTasks.length > 0 || laterTasks.length > 0;
    
    if (!hasTasks) {
        html = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">暂无任务</p>';
    }
    
    tasksGroups.innerHTML = html;
}

function renderTaskGroup(title, tasks) {
    if (tasks.length === 0) {
        return '';
    }
    
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }
        return 0;
    });
    
    const tasksHtml = sortedTasks.map(task => `
        <div class="task-item ${task.completed ? 'completed' : ''}">
            <div class="task-header">
                <div>
                    <div class="task-title">${escapeHtml(task.title)}</div>
                </div>
                <span class="task-year-badge">${task.year === 9999 ? '以后' : task.year + '年'}</span>
            </div>
            ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
            <div class="task-actions">
                <button class="btn btn-secondary" onclick="toggleTaskComplete('${task.id}')">
                    ${task.completed ? '标记未完成' : '标记完成'}
                </button>
                <button class="btn btn-secondary" onclick="openTaskModal('${task.id}')">编辑</button>
                <button class="btn btn-danger" onclick="deleteTask('${task.id}')">删除</button>
            </div>
        </div>
    `).join('');
    
    return `
        <div class="task-group">
            <h3 class="task-group-title">${title}</h3>
            <div class="task-group-tasks">
                ${tasksHtml}
            </div>
        </div>
    `;
}

function applyTheme() {
    let theme = appData.theme;
    
    if (theme === 'auto') {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

async function changeTheme() {
    appData.theme = document.getElementById('theme-select').value;
    await saveAppData();
    applyTheme();
}

if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (appData.theme === 'auto') {
            applyTheme();
        }
    });
}

async function exportJSON() {
    try {
        const dataStr = await db.exportToJSON();
        const timestamp = toBeijingISOString().replace(/[:.]/g, '-');
        downloadFile(dataStr, `final-countdown-${timestamp}.json`, 'application/json');
        alert('JSON数据导出成功！');
    } catch (error) {
        console.error('导出失败:', error);
        alert('导出失败，请重试');
    }
}

async function exportCSV() {
    try {
        const csvContent = await db.exportToCSV();
        const timestamp = toBeijingISOString().replace(/[:.]/g, '-');
        downloadFile(csvContent, `final-countdown-tasks-${timestamp}.csv`, 'text/csv');
        alert('CSV数据导出成功！');
    } catch (error) {
        console.error('导出失败:', error);
        alert('导出失败，请重试');
    }
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const isCSV = file.name.endsWith('.csv');
    const confirmMessage = isCSV 
        ? '⚠️ 导入CSV将覆盖当前所有任务数据。确定要继续吗？建议先创建备份！'
        : '⚠️ 导入数据将覆盖当前所有数据。确定要继续吗？建议先创建备份！';
    
    if (!confirm(confirmMessage)) {
        event.target.value = '';
        return;
    }

    try {
        let content;
        
        if (file.name.endsWith('.csv')) {
            content = await readFileWithEncoding(file);
        } else {
            content = await readFileAsText(file);
        }
        
        if (file.name.endsWith('.json')) {
            const data = JSON.parse(content);
            await db.importAllData(data);
            await loadAppData();
            updateUI();
            alert('✅ 数据导入成功！已自动创建导入前备份');
        } else if (file.name.endsWith('.csv')) {
            const tasks = db.parseCSV(content);
            if (tasks.length === 0) {
                throw new Error('CSV文件中没有有效的任务数据');
            }
            const count = await db.importTasksFromCSV(tasks);
            await loadAppData();
            updateUI();
            alert(`✅ CSV导入成功！已导入 ${count} 个任务，已自动创建导入前备份`);
        } else {
            throw new Error('不支持的文件格式');
        }
    } catch (err) {
        console.error('导入失败:', err);
        alert('❌ 导入失败：' + err.message);
    }
    
    event.target.value = '';
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('文件读取失败'));
        reader.readAsText(file);
    });
}

async function readFileWithEncoding(file) {
    const buffer = await file.arrayBuffer();
    
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    try {
        const utf8Result = utf8Decoder.decode(buffer);
        if (!hasGarbledText(utf8Result)) {
            return utf8Result;
        }
    } catch (e) {
    }
    
    const gbkDecoder = new TextDecoder('gbk', { fatal: false });
    try {
        const gbkResult = gbkDecoder.decode(buffer);
        return gbkResult;
    } catch (e) {
    }
    
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

function hasGarbledText(text) {
    const garbledPattern = /[\uFFFD\u0000-\u0008\u000B-\u000C\u000E-\u001F]/;
    const commonGarbled = /����/;
    return garbledPattern.test(text) || commonGarbled.test(text);
}

async function createManualBackup() {
    const description = prompt('请输入备份描述（可选）：', '手动备份');
    if (description === null) return;
    
    try {
        await db.createBackup(description || '手动备份');
        alert('✅ 备份创建成功！');
    } catch (error) {
        console.error('备份失败:', error);
        alert('❌ 备份失败，请重试');
    }
}

function openBackupsModal() {
    renderBackupsList();
    document.getElementById('backups-modal').classList.add('active');
}

function closeBackupsModal() {
    document.getElementById('backups-modal').classList.remove('active');
}

function renderBackupsList() {
    const backups = db.getBackups();
    const listContainer = document.getElementById('backups-list');
    
    if (backups.length === 0) {
        listContainer.innerHTML = '<div class="no-backups">暂无备份</div>';
        return;
    }
    
    listContainer.innerHTML = backups.map(backup => {
        const formattedDate = formatBeijingTime(backup.timestamp);
        return `
            <div class="backup-item">
                <div class="backup-info">
                    <div class="backup-time">${formattedDate}</div>
                    <div class="backup-desc">${backup.description || '无描述'}</div>
                </div>
                <div class="backup-actions">
                    <button class="btn btn-primary" onclick="restoreBackup('${backup.id}')">恢复</button>
                    <button class="btn btn-danger" onclick="deleteBackup('${backup.id}')">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

async function restoreBackup(backupId) {
    if (!confirm('⚠️ 恢复备份将覆盖当前所有数据。确定要继续吗？将自动创建当前数据备份！')) {
        return;
    }
    
    try {
        await db.restoreBackup(backupId);
        await loadAppData();
        updateUI();
        closeBackupsModal();
        alert('✅ 备份恢复成功！');
    } catch (error) {
        console.error('恢复失败:', error);
        alert('❌ 恢复失败：' + error.message);
    }
}

function deleteBackup(backupId) {
    if (!confirm('⚠️ 确定要删除这个备份吗？')) {
        return;
    }
    
    db.deleteBackup(backupId);
    renderBackupsList();
}

function clearAllBackups() {
    if (!confirm('⚠️ 确定要清除所有备份吗？此操作不可恢复！')) {
        return;
    }
    
    db.clearAllBackups();
    alert('✅ 所有备份已清除');
}

async function clearData() {
    if (!confirm('⚠️⚠️⚠️ 警告：此操作将清除所有数据（包括设置、任务等），且不可恢复！\n\n强烈建议先导出数据或创建备份！\n\n确定要继续吗？')) {
        return;
    }
    
    if (!confirm('再次确认：真的要清除所有数据吗？')) {
        return;
    }
    
    try {
        await db.clearAllTasks();
        await db.clearAllSettings();
    } catch (error) {
        console.error('Failed to clear database:', error);
    }
    localStorage.removeItem('final-countdown-data');
    appData = {
        birthday: null,
        lifeExpectancy: 80,
        tasks: [],
        theme: 'auto'
    };
    updateUI();
    alert('✅ 所有数据已清除');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
