const DB_NAME = 'FinalCountdownDB';
const DB_VERSION = 1;
const STORE_SETTINGS = 'settings';
const STORE_TASKS = 'tasks';
const BACKUP_KEY = 'final-countdown-backups';
const MAX_BACKUPS = 3;

class Database {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Database opening error');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database opened successfully');
                this.cleanupOldBackups();
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                    const settingsStore = db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
                    settingsStore.createIndex('key', 'key', { unique: true });
                }

                if (!db.objectStoreNames.contains(STORE_TASKS)) {
                    const tasksStore = db.createObjectStore(STORE_TASKS, { keyPath: 'id' });
                    tasksStore.createIndex('year', 'year', { unique: false });
                    tasksStore.createIndex('completed', 'completed', { unique: false });
                }
            };
        });
    }

    generateChecksum(data) {
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    validateData(data) {
        const errors = [];
        
        if (!data) {
            errors.push('数据为空');
            return { valid: false, errors };
        }

        if (!data.settings && !data.tasks) {
            errors.push('数据格式不正确');
        }

        if (data.settings) {
            if (typeof data.settings !== 'object') {
                errors.push('设置数据格式不正确');
            }
        }

        if (data.tasks) {
            if (!Array.isArray(data.tasks)) {
                errors.push('任务数据格式不正确');
            } else {
                data.tasks.forEach((task, index) => {
                    if (!task.id) {
                        errors.push(`任务 ${index + 1} 缺少ID`);
                    }
                    if (!task.title) {
                        errors.push(`任务 ${index + 1} 缺少标题`);
                    }
                    if (!task.year) {
                        errors.push(`任务 ${index + 1} 缺少年份`);
                    }
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    async saveSettings(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_SETTINGS], 'readwrite');
            const store = transaction.objectStore(STORE_SETTINGS);
            const request = store.put({ key, value });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getSettings(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_SETTINGS], 'readonly');
            const store = transaction.objectStore(STORE_SETTINGS);
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result ? request.result.value : null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getAllSettings() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_SETTINGS], 'readonly');
            const store = transaction.objectStore(STORE_SETTINGS);
            const request = store.getAll();

            request.onsuccess = () => {
                const settings = {};
                request.result.forEach(item => {
                    settings[item.key] = item.value;
                });
                resolve(settings);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async addTask(task) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_TASKS], 'readwrite');
            const store = transaction.objectStore(STORE_TASKS);
            const request = store.add(task);

            request.onsuccess = () => resolve(task.id);
            request.onerror = () => reject(request.error);
        });
    }

    async updateTask(task) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_TASKS], 'readwrite');
            const store = transaction.objectStore(STORE_TASKS);
            const request = store.put(task);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteTask(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_TASKS], 'readwrite');
            const store = transaction.objectStore(STORE_TASKS);
            const request = store.delete(taskId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getTask(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_TASKS], 'readonly');
            const store = transaction.objectStore(STORE_TASKS);
            const request = store.get(taskId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllTasks() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_TASKS], 'readonly');
            const store = transaction.objectStore(STORE_TASKS);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getTasksByYear(year) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_TASKS], 'readonly');
            const store = transaction.objectStore(STORE_TASKS);
            const index = store.index('year');
            const request = index.getAll(year);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clearAllTasks() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_TASKS], 'readwrite');
            const store = transaction.objectStore(STORE_TASKS);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearAllSettings() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_SETTINGS], 'readwrite');
            const store = transaction.objectStore(STORE_SETTINGS);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    getBeijingDate() {
        const now = new Date();
        return new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
    }

    toBeijingISOString(date) {
        const d = date || this.getBeijingDate();
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    async exportAllData() {
        const settings = await this.getAllSettings();
        const tasks = await this.getAllTasks();
        const timestamp = this.toBeijingISOString();
        const data = {
            version: '1.0',
            exportTime: timestamp,
            checksum: this.generateChecksum({ settings, tasks }),
            settings,
            tasks
        };
        return data;
    }

    async exportToJSON() {
        const data = await this.exportAllData();
        return JSON.stringify(data, null, 2);
    }

    async exportToCSV() {
        const tasks = await this.getAllTasks();
        const headers = ['ID', '标题', '描述', '年份', '完成状态', '创建时间', '更新时间'];
        
        const escapeCSV = (value) => {
            if (value === null || value === undefined) {
                return '';
            }
            const str = String(value);
            if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };
        
        const rows = tasks.map(task => [
            task.id,
            task.title,
            task.description || '',
            task.year,
            task.completed ? '是' : '否',
            task.createdAt || '',
            task.updatedAt || ''
        ]);
        
        const csvContent = [
            headers.map(escapeCSV).join(','),
            ...rows.map(row => row.map(escapeCSV).join(','))
        ].join('\n');
        
        return '\uFEFF' + csvContent;
    }

    parseCSV(csvString) {
        let content = csvString;
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
        }
        
        const rows = [];
        let currentRow = [];
        let currentCell = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < content.length) {
            const char = content[i];
            
            if (char === '"') {
                if (inQuotes && content[i + 1] === '"') {
                    currentCell += '"';
                    i += 2;
                } else {
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === ',' && !inQuotes) {
                currentRow.push(currentCell);
                currentCell = '';
                i++;
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (currentCell || currentRow.length > 0) {
                    currentRow.push(currentCell);
                    rows.push(currentRow);
                    currentRow = [];
                    currentCell = '';
                }
                if (char === '\r' && content[i + 1] === '\n') {
                    i += 2;
                } else {
                    i++;
                }
            } else {
                currentCell += char;
                i++;
            }
        }
        
        if (currentCell || currentRow.length > 0) {
            currentRow.push(currentCell);
            rows.push(currentRow);
        }
        
        if (rows.length < 2) {
            throw new Error('CSV文件格式错误：至少需要表头和一行数据');
        }

        const headers = rows[0];
        const tasks = [];

        for (let i = 1; i < rows.length; i++) {
            const values = rows[i];
            if (values.length !== headers.length) {
                continue;
            }

            const task = {
                id: values[0] || Date.now().toString() + i,
                title: values[1],
                description: values[2] || '',
                year: this.parseYear(values[3]),
                completed: values[4] === '是' || values[4] === 'true' || values[4] === '1',
                createdAt: values[5] || this.toBeijingISOString(),
                updatedAt: values[6] || this.toBeijingISOString()
            };

            if (!task.title || !task.title.trim()) {
                continue;
            }

            tasks.push(task);
        }

        return tasks;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }

    parseYear(yearStr) {
        if (!yearStr) {
            return new Date().getFullYear();
        }
        if (yearStr === '以后' || yearStr === 'later') {
            return 9999;
        }
        const year = parseInt(yearStr);
        return isNaN(year) ? new Date().getFullYear() : year;
    }

    async importTasksFromCSV(tasks) {
        await this.createBackup('CSV导入前自动备份');
        await this.clearAllTasks();
        
        for (const task of tasks) {
            await this.addTask(task);
        }
        
        return tasks.length;
    }

    async importAllData(data) {
        if (!data.checksum) {
            console.warn('导入数据缺少校验和');
        } else {
            const calculatedChecksum = this.generateChecksum({ settings: data.settings, tasks: data.tasks });
            if (data.checksum !== calculatedChecksum) {
                throw new Error('数据校验失败，数据可能已损坏或被篡改');
            }
        }

        const validation = this.validateData(data);
        if (!validation.valid) {
            throw new Error('数据验证失败: ' + validation.errors.join(', '));
        }

        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                await this.saveSettings(key, value);
            }
        }
        if (data.tasks) {
            await this.clearAllTasks();
            for (const task of data.tasks) {
                await this.addTask(task);
            }
        }

        await this.createBackup('导入前自动备份');
    }

    getBackups() {
        try {
            const backups = localStorage.getItem(BACKUP_KEY);
            return backups ? JSON.parse(backups) : [];
        } catch (e) {
            console.error('读取备份失败:', e);
            return [];
        }
    }

    saveBackups(backups) {
        try {
            localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
        } catch (e) {
            console.error('保存备份失败:', e);
        }
    }

    async createBackup(description = '') {
        const data = await this.exportAllData();
        const backup = {
            id: Date.now().toString(),
            timestamp: this.toBeijingISOString(),
            description,
            data
        };

        let backups = this.getBackups();
        backups.unshift(backup);
        
        if (backups.length > MAX_BACKUPS) {
            backups = backups.slice(0, MAX_BACKUPS);
        }

        this.saveBackups(backups);
        console.log('备份已创建:', backup.id);
        return backup;
    }

    async restoreBackup(backupId) {
        const backups = this.getBackups();
        const backup = backups.find(b => b.id === backupId);
        
        if (!backup) {
            throw new Error('备份不存在');
        }

        await this.createBackup('恢复前自动备份');
        await this.importAllData(backup.data);
        return backup;
    }

    deleteBackup(backupId) {
        let backups = this.getBackups();
        backups = backups.filter(b => b.id !== backupId);
        this.saveBackups(backups);
    }

    clearAllBackups() {
        localStorage.removeItem(BACKUP_KEY);
    }

    cleanupOldBackups() {
        let backups = this.getBackups();
        if (backups.length > MAX_BACKUPS) {
            backups = backups.slice(0, MAX_BACKUPS);
            this.saveBackups(backups);
            console.log(`已清理旧备份，保留最近${MAX_BACKUPS}个备份`);
        }
    }
}

const db = new Database();
