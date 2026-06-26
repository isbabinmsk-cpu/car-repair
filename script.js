// ===== ИМПОРТ FIREBASE =====
import { db } from './firebase-config.js';
import {
    collection,
    doc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    orderBy,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===== ЕДИНОЕ ИМЯ КОЛЛЕКЦИИ =====
const COLLECTION_NAME = 'car_records';

// ===== ДАННЫЕ =====
let records = [];
let currentFilter = 'all';
let isFirebaseConnected = false;
let editingRecordId = null;

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Приложение запущено');
    await initFirebase();
    loadData();
    initDates();
    updateHistory();
    updateStats();
    addPart();
    addWork();
    console.log('✅ Инициализация завершена');
});

// ===== FIREBASE =====
async function initFirebase() {
    console.log('🔥 Инициализация Firebase...');
    if (!db) {
        console.error('❌ Firebase не инициализирован (db = null)');
        isFirebaseConnected = false;
        updateSyncStatus('error');
        return;
    }

    try {
        const testSnap = await getDocs(collection(db, COLLECTION_NAME));
        console.log('✅ Подключение успешно, найдено документов:', testSnap.size);
        isFirebaseConnected = true;
        updateSyncStatus('connected');
        await syncFromFirebase();
    } catch (error) {
        console.error('❌ Firebase error:', error);
        isFirebaseConnected = false;
        updateSyncStatus('error');
        
        if (error.code === 'permission-denied') {
            console.warn('⚠️ Проверьте правила безопасности Firestore в консоли Firebase');
        }
    }
}

function updateSyncStatus(status) {
    const el = document.getElementById('sync-status');
    const detail = document.getElementById('sync-status-detail');
    let html = '';
    let className = 'sync-status';

    if (status === 'connected') {
        html = '<ion-icon name="cloud-done-outline"></ion-icon> <span>✓ Подключено к Firebase</span>';
        className += ' connected';
    } else if (status === 'error') {
        html = '<ion-icon name="cloud-offline-outline"></ion-icon> <span>⚠ Ошибка подключения</span>';
        className += ' error';
    } else {
        html = '<ion-icon name="phone-portrait-outline"></ion-icon> <span>📱 Локальное хранение</span>';
    }

    if (el) { el.className = className; el.innerHTML = html; }
    if (detail) { detail.className = className; detail.innerHTML = html; }
}

async function syncFromFirebase() {
    if (!isFirebaseConnected || !db) return;
    try {
        const recordsSnap = await getDocs(collection(db, COLLECTION_NAME));
        const newRecords = [];
        recordsSnap.forEach(docSnap => {
            newRecords.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        if (newRecords.length > 0) {
            records = newRecords;
            saveLocal();
            updateHistory();
            updateStats();
        }
    } catch (error) {
        console.error('❌ Sync from Firebase error:', error);
    }
}

async function syncRecordToFirebase(record) {
    if (!isFirebaseConnected || !db) return;
    try {
        await setDoc(doc(db, COLLECTION_NAME, record.id), record);
    } catch (error) {
        console.error('❌ Sync record error:', error);
    }
}

async function deleteRecordFromFirebase(id) {
    if (!isFirebaseConnected || !db) return;
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (error) {
        console.error('❌ Delete record error:', error);
    }
}

// ===== ЛОКАЛЬНОЕ ХРАНЕНИЕ =====
function loadData() {
    const savedRecords = localStorage.getItem('car_records');
    if (savedRecords) records = JSON.parse(savedRecords);
    saveLocal();
}
function saveLocal() {
    localStorage.setItem('car_records', JSON.stringify(records));
}
function initDates() {
    const today = new Date().toISOString().split('T')[0];
    const dateField = document.getElementById('record-date');
    if (dateField && !dateField.value) dateField.value = today;
}

// ===== НАВИГАЦИЯ =====
function switchTab(tabName, btn) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');
    if (btn) btn.classList.add('active');

    if (tabName === 'history') updateHistory();
    if (tabName === 'stats') updateStats();
}

// ===== ДИНАМИЧЕСКИЕ СПИСКИ =====
function addPart() {
    const list = document.getElementById('parts-list');
    if (!list) return;
    const item = document.createElement('div');
    item.className = 'dynamic-item';
    item.innerHTML = `
        <input type="text" placeholder="Название детали" class="part-name">
        <input type="number" placeholder="Стоимость" class="part-cost" step="0.01" min="0" oninput="calculateTotal()">
        <button type="button" class="btn-remove" onclick="this.parentElement.remove(); calculateTotal()">
            <ion-icon name="trash-outline"></ion-icon>
        </button>
    `;
    list.appendChild(item);
}

function addWork() {
    const list = document.getElementById('works-list');
    if (!list) return;
    const item = document.createElement('div');
    item.className = 'dynamic-item';
    item.innerHTML = `
        <input type="text" placeholder="Название работы" class="work-name">
        <input type="number" placeholder="Стоимость" class="work-cost" step="0.01" min="0" oninput="calculateTotal()">
        <button type="button" class="btn-remove" onclick="this.parentElement.remove(); calculateTotal()">
            <ion-icon name="trash-outline"></ion-icon>
        </button>
    `;
    list.appendChild(item);
}

function calculateTotal() {
    let partsTotal = 0, worksTotal = 0;
    document.querySelectorAll('.part-cost').forEach(input => partsTotal += parseFloat(input.value) || 0);
    document.querySelectorAll('.work-cost').forEach(input => worksTotal += parseFloat(input.value) || 0);
    const total = partsTotal + worksTotal;

    const el1 = document.getElementById('total-parts');
    const el2 = document.getElementById('total-works');
    const el3 = document.getElementById('total-cost');

    if (el1) el1.textContent = `${partsTotal.toFixed(2)} ₽`;
    if (el2) el2.textContent = `${worksTotal.toFixed(2)} ₽`;
    if (el3) el3.textContent = `${total.toFixed(2)} ₽`;
}

// ===== СОХРАНЕНИЕ ЗАПИСИ =====
async function saveRecord() {
    const date = document.getElementById('record-date').value;
    const mileage = parseInt(document.getElementById('record-mileage').value);
    const type = document.getElementById('record-type').value;
    const description = document.getElementById('record-description').value;

    if (!date || !mileage) { alert('⚠ Заполните дату и пробег!'); return; }

    const parts = [], works = [];
    document.querySelectorAll('#parts-list .dynamic-item').forEach(item => {
        const name = item.querySelector('.part-name').value;
        const cost = parseFloat(item.querySelector('.part-cost').value) || 0;
        if (name) parts.push({ name, cost });
    });
    document.querySelectorAll('#works-list .dynamic-item').forEach(item => {
        const name = item.querySelector('.work-name').value;
        const cost = parseFloat(item.querySelector('.work-cost').value) || 0;
        if (name) works.push({ name, cost });
    });

    const partsTotal = parts.reduce((sum, p) => sum + p.cost, 0);
    const worksTotal = works.reduce((sum, w) => sum + w.cost, 0);

    const record = {
        id: 'record_' + Date.now(), date, mileage, type, description, parts, works,
        partsTotal, worksTotal, total: partsTotal + worksTotal,
        createdAt: new Date().toISOString()
    };

    records.push(record);
    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    saveLocal();
    await syncRecordToFirebase(record);
    clearForm();
    updateHistory();
    updateStats();
    alert('✓ Запись сохранена!');
}

function clearForm() {
    document.getElementById('record-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('record-mileage').value = '';
    document.getElementById('record-type').value = 'repair';
    document.getElementById('record-description').value = '';
    document.getElementById('parts-list').innerHTML = '';
    document.getElementById('works-list').innerHTML = '';
    addPart(); addWork(); calculateTotal();
}

// ===== ИСТОРИЯ =====
function filterHistory(type, btn) {
    currentFilter = type;
    document.querySelectorAll('#tab-history .filter-tab').forEach(tab => tab.classList.remove('active'));
    if (btn) btn.classList.add('active');
    updateHistory();
}

function updateHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    let filtered = [...records];
    if (currentFilter !== 'all') filtered = filtered.filter(r => r.type === currentFilter);
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) { list.innerHTML = '<p class="hint-text">Нет записей</p>'; return; }

    const typeNames = { 'repair': 'Ремонт', 'oil': 'Замена масла', 'maintenance': 'ТО', 'tire': 'Шиномонтаж', 'other': 'Другое' };

    list.innerHTML = filtered.map(r => {
        const partsHTML = r.parts && r.parts.length > 0 ? `
            <div class="history-parts"><h4>Запчасти:</h4><ul class="history-parts-list">
                ${r.parts.map(p => `<li>${p.name} - ${p.cost.toFixed(2)} ₽</li>`).join('')}
            </ul></div>` : '';
        
        const worksHTML = r.works && r.works.length > 0 ? `
            <div class="history-works"><h4>Работы:</h4><ul class="history-works-list">
                ${r.works.map(w => `<li>${w.name} - ${w.cost.toFixed(2)} ₽</li>`).join('')}
            </ul></div>` : '';
        
        return `
            <div class="history-item ${r.type}">
                <div class="history-header">
                    <span class="history-date"><ion-icon name="calendar-outline"></ion-icon> ${formatDate(r.date)}</span>
                    <span class="history-type">${typeNames[r.type] || r.type}</span>
                </div>
                <div class="history-mileage"><ion-icon name="speedometer-outline"></ion-icon> Пробег: ${r.mileage.toLocaleString()} км</div>
                ${r.description ? `<div class="history-description">${r.description}</div>` : ''}
                ${partsHTML}${worksHTML}
                <div class="history-total"><span>Итого:</span><span>${r.total.toFixed(2)} ₽</span></div>
                <div class="history-actions">
                    <button class="btn btn-secondary" onclick="editRecord('${r.id}')"><ion-icon name="create-outline"></ion-icon> Редактировать</button>
                    <button class="btn btn-danger" onclick="deleteRecord('${r.id}')"><ion-icon name="trash-outline"></ion-icon> Удалить</button>
                </div>
            </div>`;
    }).join('');
}

async function deleteRecord(id) {
    if (!confirm('Удалить эту запись?')) return;
    records = records.filter(r => r.id !== id);
    saveLocal();
    await deleteRecordFromFirebase(id);
    updateHistory(); updateStats();
}

// ===== РЕДАКТИРОВАНИЕ =====
function editRecord(id) {
    const record = records.find(r => r.id === id);
    if (!record) return;
    editingRecordId = id;

    const modal = document.getElementById('edit-modal');
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    if (!modal || !modalBody) return;

    modalTitle.innerHTML = `<ion-icon name="create-outline"></ion-icon> Редактирование записи`;

    modalBody.innerHTML = `
        <div class="form-row"><div class="form-group"><label>Дата *</label><input type="date" id="edit-date" value="${record.date}" required></div></div>
        <div class="form-row"><div class="form-group"><label>Пробег (км) *</label><input type="number" id="edit-mileage" value="${record.mileage}" required></div></div>
        <div class="form-row"><div class="form-group"><label>Тип работ *</label>
            <select id="edit-type" required>
                <option value="repair" ${record.type === 'repair' ? 'selected' : ''}>Ремонт</option>
                <option value="oil" ${record.type === 'oil' ? 'selected' : ''}>Замена масла</option>
                <option value="maintenance" ${record.type === 'maintenance' ? 'selected' : ''}>ТО</option>
                <option value="tire" ${record.type === 'tire' ? 'selected' : ''}>Шиномонтаж</option>
                <option value="other" ${record.type === 'other' ? 'selected' : ''}>Другое</option>
            </select></div></div>
        <div class="form-row"><div class="form-group"><label>Описание</label><input type="text" id="edit-description" value="${record.description || ''}"></div></div>
        
        <div class="form-section"><h3>Запчасти</h3><div id="edit-parts-list">
            ${(record.parts || []).map(p => `<div class="dynamic-item"><input type="text" value="${p.name}" class="part-name"><input type="number" value="${p.cost}" class="part-cost" step="0.01" min="0"><button type="button" class="btn-remove" onclick="this.parentElement.remove()"><ion-icon name="trash-outline"></ion-icon></button></div>`).join('')}
        </div><button type="button" class="btn btn-secondary btn-small" onclick="addEditPart()"><ion-icon name="add-outline"></ion-icon> Добавить деталь</button></div>
        
        <div class="form-section"><h3>Работы</h3><div id="edit-works-list">
            ${(record.works || []).map(w => `<div class="dynamic-item"><input type="text" value="${w.name}" class="work-name"><input type="number" value="${w.cost}" class="work-cost" step="0.01" min="0"><button type="button" class="btn-remove" onclick="this.parentElement.remove()"><ion-icon name="trash-outline"></ion-icon></button></div>`).join('')}
        </div><button type="button" class="btn btn-secondary btn-small" onclick="addEditWork()"><ion-icon name="add-outline"></ion-icon> Добавить работу</button></div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function addEditPart() {
    const list = document.getElementById('edit-parts-list');
    const item = document.createElement('div');
    item.className = 'dynamic-item';
    item.innerHTML = `
        <input type="text" placeholder="Название детали" class="part-name">
        <input type="number" placeholder="Стоимость" class="part-cost" step="0.01" min="0">
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()"><ion-icon name="trash-outline"></ion-icon></button>
    `;
    list.appendChild(item);
}

function addEditWork() {
    const list = document.getElementById('edit-works-list');
    const item = document.createElement('div');
    item.className = 'dynamic-item';
    item.innerHTML = `
        <input type="text" placeholder="Название работы" class="work-name">
        <input type="number" placeholder="Стоимость" class="work-cost" step="0.01" min="0">
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()"><ion-icon name="trash-outline"></ion-icon></button>
    `;
    list.appendChild(item);
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
    editingRecordId = null;
}

async function saveEditedRecord() {
    if (!editingRecordId) return;
    const recordIndex = records.findIndex(r => r.id === editingRecordId);
    if (recordIndex === -1) { closeEditModal(); return; }

    const date = document.getElementById('edit-date').value;
    const mileage = parseInt(document.getElementById('edit-mileage').value);
    const type = document.getElementById('edit-type').value;
    const description = document.getElementById('edit-description').value;

    if (!date || !mileage) { alert('⚠ Заполните дату и пробег!'); return; }

    const parts = [], works = [];
    document.querySelectorAll('#edit-parts-list .dynamic-item').forEach(item => {
        const name = item.querySelector('.part-name').value;
        const cost = parseFloat(item.querySelector('.part-cost').value) || 0;
        if (name) parts.push({ name, cost });
    });
    document.querySelectorAll('#edit-works-list .dynamic-item').forEach(item => {
        const name = item.querySelector('.work-name').value;
        const cost = parseFloat(item.querySelector('.work-cost').value) || 0;
        if (name) works.push({ name, cost });
    });

    const partsTotal = parts.reduce((sum, p) => sum + p.cost, 0);
    const worksTotal = works.reduce((sum, w) => sum + w.cost, 0);

    records[recordIndex] = { ...records[recordIndex], date, mileage, type, description, parts, works, partsTotal, worksTotal, total: partsTotal + worksTotal, updatedAt: new Date().toISOString() };

    saveLocal();
    await syncRecordToFirebase(records[recordIndex]);
    updateHistory(); updateStats(); closeEditModal();
    alert('✓ Запись обновлена!');
}

// ===== СТАТИСТИКА =====
function updateStats() {
    const totalCost = records.reduce((sum, r) => sum + (r.total || 0), 0);
    const totalParts = records.reduce((sum, r) => sum + (r.partsTotal || 0), 0);
    const totalWorks = records.reduce((sum, r) => sum + (r.worksTotal || 0), 0);
    const count = records.length;
    
    const lastMileage = records.length > 0 ? Math.max(...records.map(r => r.mileage || 0)) : 0;
    const firstMileage = records.length > 0 ? Math.min(...records.map(r => r.mileage || 0)) : 0;
    const mileageDiff = lastMileage - firstMileage;
    const perKm = mileageDiff > 0 ? totalCost / mileageDiff : 0;

    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

    set('stat-total', `${totalCost.toFixed(2)} ₽`);
    set('stat-parts', `${totalParts.toFixed(2)} ₽`);
    set('stat-works', `${totalWorks.toFixed(2)} ₽`);
    set('stat-count', count);
    set('stat-per-km', `${perKm.toFixed(2)} ₽/км`);
    set('stat-last-mileage', `${lastMileage.toLocaleString()} км`);

    const byType = {};
    records.forEach(r => { if (!byType[r.type]) byType[r.type] = 0; byType[r.type] += (r.total || 0); });

    const typeNames = { 'repair': 'Ремонт', 'oil': 'Замена масла', 'maintenance': 'ТО', 'tire': 'Шиномонтаж', 'other': 'Другое' };
    const statsByTypeList = document.getElementById('stats-by-type-list');
    
    if (statsByTypeList) {
        statsByTypeList.innerHTML = Object.entries(byType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, total]) => `<div class="stat-type-item"><span class="stat-type-label">${typeNames[type] || type}</span><span class="stat-type-value">${total.toFixed(2)} ₽</span></div>`).join('');
    }
}

// ===== УТИЛИТЫ =====
function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ===== ЭКСПОРТ/ИМПОРТ =====
function exportData() {
    const data = { records, exportDate: new Date().toISOString(), version: '1.0' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `car-records-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
}

async function importData(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const recordsArray = Array.isArray(data.records) ? data.records : Object.values(data.records);
            if (!confirm(`Импортировать ${recordsArray.length} записей? Текущие данные будут заменены.`)) return;
            
            records = recordsArray; saveLocal();
            if (isFirebaseConnected && db) {
                const batch = writeBatch(db);
                records.forEach(r => batch.set(doc(db, COLLECTION_NAME, r.id), r));
                await batch.commit();
            }
            updateHistory(); updateStats();
            alert(`✓ Импортировано ${recordsArray.length} записей!`);
        } catch (err) { alert('❌ Ошибка импорта: ' + err.message); }
    };
    reader.readAsText(file);
}

async function resetAllData() {
    if (!confirm('⚠ ВНИМАНИЕ! Все локальные данные будут удалены. Продолжить?')) return;
    records = []; localStorage.removeItem('car_records');
    updateHistory(); updateStats();
}

// ===== ЗАКРЫТИЕ МОДАЛЬНОГО ОКНА =====
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.addEventListener('click', (e) => { if (e.target === modal) closeEditModal(); });
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditModal(); });
});

// ===== ЭКСПОРТ ФУНКЦИЙ =====
window.switchTab = switchTab; window.addPart = addPart; window.addWork = addWork;
window.calculateTotal = calculateTotal; window.saveRecord = saveRecord; window.clearForm = clearForm;
window.filterHistory = filterHistory; window.deleteRecord = deleteRecord; window.editRecord = editRecord;
window.closeEditModal = closeEditModal; window.saveEditedRecord = saveEditedRecord;
window.addEditPart = addEditPart; window.addEditWork = addEditWork;
window.exportData = exportData; window.importData = importData; window.resetAllData = resetAllData;