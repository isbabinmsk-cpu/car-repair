// ===== ИМПОРТ FIREBASE =====
import { db, auth } from './firebase-config.js';
import { collection, doc, getDocs, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"; // <-- добавили signOut

// ===== ИМЕНА КОЛЛЕКЦИЙ =====
const COLLECTION_RECORDS = 'car_records';
const COLLECTION_FUEL = 'car_fuel';
const COLLECTION_PROFILE = 'car_profile';
const COLLECTION_SERVICES = 'car_services';
const COLLECTION_WARRANTIES = 'car_warranties';
const COLLECTION_NOTIFICATIONS = 'car_notifications';
const COLLECTION_MILEAGE = 'car_mileage';
const COLLECTION_NOTIFICATION_SETTINGS = 'notification_settings';
const PROFILE_DOC_ID = 'main_profile';
const NOTIFICATION_SETTINGS_DOC_ID = 'main_settings';

// ===== ДАННЫЕ =====
let records = [];
let fuelRecords = [];
let profile = null;
let services = [];
let warranties = [];
let notifications = [];
let mileageHistory = [];
let notificationSettings = {
    oilInterval: 10000,
    airFilterInterval: 15000,
    sparkPlugsInterval: 30000,
    brakePadsInterval: 40000,
    maintenanceInterval: 15000,
    coolantInterval: 60000
};
let currentFilter = 'all';
let isFirebaseConnected = false;
let editingRecordId = null;
let editingServiceId = null;
let fuelChart = null;

// ===== ИНДИКАТОР ЗАГРУЗКИ =====
function showLoading(text = 'Загрузка...') {
    const overlay = document.getElementById('loading-overlay');
    const textEl = overlay?.querySelector('.loading-text');
    if (textEl) textEl.textContent = text;
    if (overlay) overlay.classList.add('active');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚗 App started');
    showLoading('Загрузка локальных данных...');
    
    try {
        // 1. Запускаем слушатель авторизации
        setupAuthListener();

        // 2. Сразу грузим локальные данные (Offline First)
        loadProfile();
        loadData();
        loadFuelData();
        loadServices();
        loadWarranties();
        loadNotifications();
        await loadNotificationSettings();
        await loadMileageHistory();

        // 3. Инициализируем UI
        initDates();
        updateCarBrief();
        updateServiceSelects();
        updateUnifiedHistory();
        updateStats();
        updateFuelStats();
        updateFuelHistory();
        updateGarageStats();
        updateServicesList();
        updateWarrantyStats();
        updateWarrantiesList();
        updateMaintenanceStatus();
        updateNotificationHistory();
        updateMileageDisplay();
        
        addPart();
        addWork();
        setupFuelCalcPreview();
        
        // 4. Настраиваем кнопку входа
        setupAuthUI();

        console.log('✅ Local initialization complete');
    } catch (error) {
        console.error('❌ Initialization error:', error);
        showToast('Ошибка', 'Ошибка при загрузке приложения', 'danger');
    } finally {
        hideLoading();
    }
});

// ===== АВТОРИЗАЦИЯ =====
function setupAuthUI() {
    const loginBtn = document.getElementById('auth-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            const errorEl = document.getElementById('auth-error');
            
            if (!email || !password) {
                errorEl.textContent = 'Заполните все поля';
                return;
            }

            loginBtn.disabled = true;
            loginBtn.textContent = 'Вход...';
            errorEl.textContent = '';

            try {
                await signInWithEmailAndPassword(auth, email, password);
                // Если успешно, onAuthStateChanged сам скроет экран и загрузит данные
            } catch (error) {
                console.error('Auth error:', error);
                errorEl.textContent = 'Неверный email или пароль';
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Войти';
            }
        });
    }
}

function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        const authOverlay = document.getElementById('auth-overlay');
        
        if (user) {
            // ✅ Пользователь вошел в систему
            if (authOverlay) authOverlay.style.display = 'none';
            isFirebaseConnected = true;
            updateSyncStatus('connected');
            
            console.log('✅ Authenticated. Syncing with Firebase...');
            showLoading('Синхронизация...');
            
            try {
                await syncFromFirebase();
                await syncFuelFromFirebase();
                await syncProfileFromFirebase();
                await syncServicesFromFirebase();
                await syncWarrantiesFromFirebase();
                await syncNotificationsFromFirebase();
                await syncMileageFromFirebase();
                await syncNotificationSettingsFromFirebase();
                
                // Обновляем UI после синхронизации
                updateUnifiedHistory();
                updateStats();
                updateFuelStats();
                updateFuelHistory();
                updateGarageStats();
                updateServicesList();
                updateWarrantyStats();
                updateWarrantiesList();
                updateMaintenanceStatus();
                updateNotificationHistory();
                updateMileageDisplay();
                checkNotifications();
                
                console.log('✅ Firebase sync complete');
            } catch (error) {
                console.error('❌ Sync error:', error);
                updateSyncStatus('error');
            } finally {
                hideLoading();
            }
        } else {
            // ❌ Пользователь не авторизован
            if (authOverlay) authOverlay.style.display = 'flex';
            isFirebaseConnected = false;
            updateSyncStatus('local'); // Показываем статус "Локально"
        }
    });
}

// ===== ВЫХОД ИЗ СИСТЕМЫ =====
async function logoutUser() {
    if (!await showConfirm('Выход из системы', 'Вы уверены, что хотите выйти? Данные останутся в облаке.', 'Выйти', 'Отмена', 'warning')) return;
    
    showLoading('Выход...');
    try {
        await signOut(auth);
        // onAuthStateChanged автоматически покажет экран входа
        showToast('Успех', 'Вы вышли из системы', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Ошибка', 'Не удалось выйти из системы', 'danger');
    } finally {
        hideLoading();
    }
}

// Старую функцию initFirebase() можно полностью удалить!

// ===== МОДАЛЬНЫЕ ОКНА =====
document.addEventListener('DOMContentLoaded', () => {
    const editModal = document.getElementById('edit-modal');
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) closeEditModal();
        });
    }

    const visitModal = document.getElementById('service-visit-modal');
    if (visitModal) {
        visitModal.addEventListener('click', (e) => {
            if (e.target === visitModal) closeServiceVisitModal();
        });
    }

    const editServiceModal = document.getElementById('edit-service-modal');
    if (editServiceModal) {
        editServiceModal.addEventListener('click', (e) => {
            if (e.target === editServiceModal) closeEditServiceModal();
        });
    }

    const quickAddModal = document.getElementById('quick-add-modal');
    if (quickAddModal) {
        quickAddModal.addEventListener('click', (e) => {
            if (e.target === quickAddModal) closeQuickAddModal();
        });
    }

    const confirmModal = document.getElementById('confirm-modal');
    if (confirmModal) {
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
                confirmModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeEditModal();
            closeServiceVisitModal();
            closeEditServiceModal();
            closeQuickAddModal();
            const cm = document.getElementById('confirm-modal');
            if (cm) {
                cm.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
    });
});

// ===== FIREBASE =====


function updateSyncStatus(status) {
    const el = document.getElementById('sync-status');
    const detail = document.getElementById('sync-status-detail');
    let html = '', className = 'sync-status';
    if (status === 'connected') {
        html = '<ion-icon name="cloud-done-outline"></ion-icon><span>✓ Firebase</span>';
        className += ' connected';
    } else if (status === 'error') {
        html = '<ion-icon name="cloud-offline-outline"></ion-icon><span>⚠ Ошибка</span>';
        className += ' error';
    } else {
        html = '<ion-icon name="phone-portrait-outline"></ion-icon><span>Локально</span>';
    }
    if (el) { el.className = className; el.innerHTML = html; }
    if (detail) { detail.className = className; detail.innerHTML = html; }
}

async function syncFromFirebase() {
    if (!isFirebaseConnected) return;
    const snap = await getDocs(collection(db, COLLECTION_RECORDS));
    const data = [];
    snap.forEach(d => data.push({ id: d.id, ...d.data() }));
    if (data.length > 0) {
        records = data;
        saveLocal();
        updateUnifiedHistory();
        updateStats();
    }
}

async function syncRecordToFirebase(record) {
    if (!isFirebaseConnected) return;
    await setDoc(doc(db, COLLECTION_RECORDS, record.id), record);
}

async function deleteRecordFromFirebase(id) {
    if (!isFirebaseConnected) return;
    await deleteDoc(doc(db, COLLECTION_RECORDS, id));
}

async function syncFuelFromFirebase() {
    if (!isFirebaseConnected) return;
    const snap = await getDocs(collection(db, COLLECTION_FUEL));
    const data = [];
    snap.forEach(d => data.push({ id: d.id, ...d.data() }));
    if (data.length > 0) {
        fuelRecords = data;
        saveFuelLocal();
        updateFuelStats();
        updateFuelHistory();
        updateFuelChart();
    }
}

async function syncFuelToFirebase(record) {
    if (!isFirebaseConnected) return;
    await setDoc(doc(db, COLLECTION_FUEL, record.id), record);
}

async function deleteFuelFromFirebase(id) {
    if (!isFirebaseConnected) return;
    await deleteDoc(doc(db, COLLECTION_FUEL, id));
}

async function syncProfileFromFirebase() {
    if (!isFirebaseConnected) return;
    const snap = await getDocs(collection(db, COLLECTION_PROFILE));
    if (!snap.empty) {
        const d = snap.docs[0];
        profile = { id: d.id, ...d.data() };
        saveProfileLocal();
        fillProfileForm();
        updateCarBrief();
        updateProfilePreview();
    }
}

async function syncProfileToFirebase(data) {
    if (!isFirebaseConnected) return;
    await setDoc(doc(db, COLLECTION_PROFILE, PROFILE_DOC_ID), data);
}

async function syncServicesFromFirebase() {
    if (!isFirebaseConnected) return;
    const snap = await getDocs(collection(db, COLLECTION_SERVICES));
    const data = [];
    snap.forEach(d => data.push({ id: d.id, ...d.data() }));
    if (data.length > 0) {
        services = data;
        saveServicesLocal();
        updateServiceSelects();
        updateGarageStats();
        updateServicesList();
    }
}

async function syncServiceToFirebase(service) {
    if (!isFirebaseConnected) return;
    await setDoc(doc(db, COLLECTION_SERVICES, service.id), service);
}

async function deleteServiceFromFirebase(id) {
    if (!isFirebaseConnected) return;
    await deleteDoc(doc(db, COLLECTION_SERVICES, id));
}

async function syncWarrantiesFromFirebase() {
    if (!isFirebaseConnected) return;
    const snap = await getDocs(collection(db, COLLECTION_WARRANTIES));
    const data = [];
    snap.forEach(d => data.push({ id: d.id, ...d.data() }));
    if (data.length > 0) {
        warranties = data;
        saveWarrantiesLocal();
        updateWarrantyStats();
        updateWarrantiesList();
    }
}

async function syncWarrantyToFirebase(warranty) {
    if (!isFirebaseConnected) return;
    await setDoc(doc(db, COLLECTION_WARRANTIES, warranty.id), warranty);
}

async function deleteWarrantyFromFirebase(id) {
    if (!isFirebaseConnected) return;
    await deleteDoc(doc(db, COLLECTION_WARRANTIES, id));
}

async function syncNotificationsFromFirebase() {
    if (!isFirebaseConnected) return;
    const snap = await getDocs(collection(db, COLLECTION_NOTIFICATIONS));
    const data = [];
    snap.forEach(d => data.push({ id: d.id, ...d.data() }));
    if (data.length > 0) {
        notifications = data;
        saveNotificationsLocal();
        updateNotificationHistory();
    }
}

async function syncNotificationToFirebase(notification) {
    if (!isFirebaseConnected) return;
    await setDoc(doc(db, COLLECTION_NOTIFICATIONS, notification.id), notification);
}

async function syncMileageFromFirebase() {
    if (!isFirebaseConnected) return;
    try {
        const snap = await getDocs(collection(db, COLLECTION_MILEAGE));
        const data = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() }));
        if (data.length > 0) {
            mileageHistory = data;
            localStorage.setItem('mileage_history', JSON.stringify(mileageHistory));
            updateMileageDisplay();
        }
    } catch (error) {
        console.error('Ошибка синхронизации пробега:', error);
    }
}

async function syncMileageToFirebase(item) {
    if (!isFirebaseConnected || !db) return;
    try {
        await setDoc(doc(db, COLLECTION_MILEAGE, item.id), item);
    } catch (error) {
        console.error('Ошибка сохранения пробега в Firebase:', error);
    }
}

async function deleteMileageFromFirebase(id) {
    if (!isFirebaseConnected || !db) return;
    try {
        await deleteDoc(doc(db, COLLECTION_MILEAGE, id));
    } catch (error) {
        console.error('Ошибка удаления пробега из Firebase:', error);
    }
}

async function syncNotificationSettingsFromFirebase() {
    if (!isFirebaseConnected) return;
    try {
        const snap = await getDocs(collection(db, COLLECTION_NOTIFICATION_SETTINGS));
        if (!snap.empty) {
            const docData = snap.docs[0].data();
            notificationSettings = {
                oilInterval: docData.oilInterval || 10000,
                airFilterInterval: docData.airFilterInterval || 15000,
                sparkPlugsInterval: docData.sparkPlugsInterval || 30000,
                brakePadsInterval: docData.brakePadsInterval || 40000,
                maintenanceInterval: docData.maintenanceInterval || 15000,
                coolantInterval: docData.coolantInterval || 60000
            };
            saveNotificationSettingsLocal();
            fillNotificationSettings();
            updateMaintenanceStatus();
        }
    } catch (error) {
        console.error('Ошибка синхронизации настроек:', error);
    }
}

async function syncNotificationSettingsToFirebase() {
    if (!isFirebaseConnected || !db) return;
    try {
        const docRef = doc(db, COLLECTION_NOTIFICATION_SETTINGS, NOTIFICATION_SETTINGS_DOC_ID);
        await setDoc(docRef, {
            ...notificationSettings,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка сохранения настроек в Firebase:', error);
    }
}

// ===== LOCAL STORAGE =====
function loadData() {
    const saved = localStorage.getItem('car_records');
    if (saved) records = JSON.parse(saved);
    saveLocal();
}

function saveLocal() {
    localStorage.setItem('car_records', JSON.stringify(records));
}

function loadFuelData() {
    const saved = localStorage.getItem('car_fuel');
    if (saved) fuelRecords = JSON.parse(saved);
    saveFuelLocal();
}

function saveFuelLocal() {
    localStorage.setItem('car_fuel', JSON.stringify(fuelRecords));
}

function loadProfile() {
    const saved = localStorage.getItem('car_profile');
    if (saved) {
        profile = JSON.parse(saved);
        fillProfileForm();
        updateCarBrief();
        updateProfilePreview();
    }
}

function saveProfileLocal() {
    if (profile) localStorage.setItem('car_profile', JSON.stringify(profile));
}

function loadServices() {
    const saved = localStorage.getItem('car_services');
    if (saved) services = JSON.parse(saved);
    saveServicesLocal();
}

function saveServicesLocal() {
    localStorage.setItem('car_services', JSON.stringify(services));
}

function loadWarranties() {
    const saved = localStorage.getItem('car_warranties');
    if (saved) warranties = JSON.parse(saved);
    saveWarrantiesLocal();
}

function saveWarrantiesLocal() {
    localStorage.setItem('car_warranties', JSON.stringify(warranties));
}

function loadNotifications() {
    const saved = localStorage.getItem('car_notifications');
    if (saved) notifications = JSON.parse(saved);
    saveNotificationsLocal();
}

function saveNotificationsLocal() {
    localStorage.setItem('car_notifications', JSON.stringify(notifications));
}

function saveNotificationSettingsLocal() {
    localStorage.setItem('car_notification_settings', JSON.stringify(notificationSettings));
}

// ===== НАСТРОЙКИ УВЕДОМЛЕНИЙ =====
async function loadNotificationSettings() {
    if (isFirebaseConnected && db) {
        try {
            const snap = await getDocs(collection(db, COLLECTION_NOTIFICATION_SETTINGS));
            if (!snap.empty) {
                const docData = snap.docs[0].data();
                notificationSettings = {
                    oilInterval: docData.oilInterval || 10000,
                    airFilterInterval: docData.airFilterInterval || 15000,
                    sparkPlugsInterval: docData.sparkPlugsInterval || 30000,
                    brakePadsInterval: docData.brakePadsInterval || 40000,
                    maintenanceInterval: docData.maintenanceInterval || 15000,
                    coolantInterval: docData.coolantInterval || 60000
                };
                saveNotificationSettingsLocal();
            } else {
                const saved = localStorage.getItem('car_notification_settings');
                if (saved) {
                    try {
                        notificationSettings = JSON.parse(saved);
                        await syncNotificationSettingsToFirebase();
                        localStorage.removeItem('car_notification_settings');
                    } catch (e) {
                        setDefaultNotificationSettings();
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки настроек:', error);
            const saved = localStorage.getItem('car_notification_settings');
            if (saved) {
                try { notificationSettings = JSON.parse(saved); } catch (e) { setDefaultNotificationSettings(); }
            } else {
                setDefaultNotificationSettings();
            }
        }
    } else {
        const saved = localStorage.getItem('car_notification_settings');
        if (saved) {
            try { notificationSettings = JSON.parse(saved); } catch (e) { setDefaultNotificationSettings(); }
        } else {
            setDefaultNotificationSettings();
        }
    }
    fillNotificationSettings();
}

function setDefaultNotificationSettings() {
    notificationSettings = {
        oilInterval: 10000,
        airFilterInterval: 15000,
        sparkPlugsInterval: 30000,
        brakePadsInterval: 40000,
        maintenanceInterval: 15000,
        coolantInterval: 60000
    };
}

function fillNotificationSettings() {
    const fields = {
        'setting-oil-interval': notificationSettings.oilInterval,
        'setting-air-filter-interval': notificationSettings.airFilterInterval,
        'setting-spark-plugs-interval': notificationSettings.sparkPlugsInterval,
        'setting-brake-pads-interval': notificationSettings.brakePadsInterval,
        'setting-maintenance-interval': notificationSettings.maintenanceInterval,
        'setting-coolant-interval': notificationSettings.coolantInterval
    };
    for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el && value !== undefined) el.value = value;
    }
}

// ===== ПРОФИЛЬ =====
function fillProfileForm() {
    if (!profile) return;
    const fields = {
        'profile-brand': profile.brand || '',
        'profile-model': profile.model || '',
        'profile-year': profile.year || '',
        'profile-color': profile.color || '',
        'profile-trim': profile.trim || '',
        'profile-vin': profile.vin || '',
        'profile-plate': profile.plate || '',
        'profile-purchase-date': profile.purchaseDate || '',
        'profile-initial-mileage': profile.initialMileage || '',
        'profile-notes': profile.notes || ''
    };
    for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }
}

function updateProfilePreview() {
    const brand = document.getElementById('profile-brand')?.value || '';
    const model = document.getElementById('profile-model')?.value || '';
    const year = document.getElementById('profile-year')?.value || '';
    const plate = document.getElementById('profile-plate')?.value || '';
    const purchaseDate = document.getElementById('profile-purchase-date')?.value || '';
    const initialMileage = document.getElementById('profile-initial-mileage')?.value || '';
    const carName = (brand || model) ? `${brand} ${model}`.trim() : 'Автомобиль не указан';
    const el1 = document.getElementById('preview-car-name');
    const el2 = document.getElementById('preview-car-year');
    const el3 = document.getElementById('preview-plate');
    const el4 = document.getElementById('preview-purchase');
    const el5 = document.getElementById('preview-mileage');
    if (el1) el1.textContent = carName;
    if (el2) el2.textContent = year ? `(${year} год)` : '';
    if (el3) el3.textContent = plate || '—';
    if (el4) el4.textContent = purchaseDate ? formatDate(purchaseDate) : '—';
    if (el5) el5.textContent = initialMileage ? `${parseInt(initialMileage).toLocaleString()} км` : '— км';
}

function updateCarBrief() {
    const el = document.getElementById('car-brief');
    if (!el) return;
    if (profile && (profile.brand || profile.model)) {
        const name = `${profile.brand || ''} ${profile.model || ''}`.trim();
        const year = profile.year ? `• ${profile.year}` : '';
        el.innerHTML = `<ion-icon name="car-sport"></ion-icon><span>${name} ${year}</span>`;
    } else {
        el.innerHTML = '';
    }
}

async function saveProfile() {
    const brand = document.getElementById('profile-brand').value.trim();
    const model = document.getElementById('profile-model').value.trim();
    if (!brand && !model) {
        showToast('Внимание', 'Укажите марку или модель!', 'warning');
        return;
    }
    profile = {
        id: PROFILE_DOC_ID,
        brand,
        model,
        year: document.getElementById('profile-year').value,
        color: document.getElementById('profile-color').value.trim(),
        trim: document.getElementById('profile-trim').value.trim(),
        vin: document.getElementById('profile-vin').value.trim().toUpperCase(),
        plate: document.getElementById('profile-plate').value.trim().toUpperCase(),
        purchaseDate: document.getElementById('profile-purchase-date').value,
        initialMileage: document.getElementById('profile-initial-mileage').value,
        notes: document.getElementById('profile-notes').value.trim(),
        updatedAt: new Date().toISOString()
    };
    saveProfileLocal();
    await syncProfileToFirebase(profile);
    updateCarBrief();
    updateProfilePreview();
    showToast('Успех', 'Профиль сохранён!', 'success');
}

async function clearProfile() {
    if (!await showConfirm('Очистка профиля', 'Все данные профиля будут удалены', 'Очистить', 'Отмена', 'warning')) return;
    const fields = ['profile-brand', 'profile-model', 'profile-year', 'profile-color', 'profile-trim', 'profile-vin', 'profile-plate', 'profile-purchase-date', 'profile-initial-mileage', 'profile-notes'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    profile = null;
    localStorage.removeItem('car_profile');
    updateCarBrief();
    updateProfilePreview();
    showToast('Успех', 'Профиль очищен', 'success');
}

// ===== ДАТЫ =====
function initDates() {
    const today = new Date().toISOString().split('T')[0];
    const d1 = document.getElementById('record-date');
    if (d1 && !d1.value) d1.value = today;
    const d2 = document.getElementById('fuel-date');
    if (d2 && !d2.value) d2.value = today;
    const d3 = document.getElementById('warranty-start-date');
    if (d3 && !d3.value) d3.value = today;

    const currentMileage = getCurrentMileage();
    const mileageInput = document.getElementById('record-mileage');
    if (mileageInput && !mileageInput.value && currentMileage > 0) {
        mileageInput.value = currentMileage + 100;
    }
    const fuelMileageInput = document.getElementById('fuel-mileage');
    if (fuelMileageInput && !fuelMileageInput.value && currentMileage > 0) {
        fuelMileageInput.value = currentMileage + 100;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ===== НАВИГАЦИЯ =====
function switchTab(tabName, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const target = document.getElementById(`tab-${tabName}`);
    if (target) target.classList.add('active');
    if (btn) btn.classList.add('active');

    if (tabName === 'history') updateUnifiedHistory();
    if (tabName === 'stats') updateStats();
    if (tabName === 'profile') { loadProfile(); updateProfilePreview(); }
    if (tabName === 'more') {
        updateFuelStats();
        updateFuelHistory();
        updateGarageStats();
        updateServicesList();
        updateWarrantyStats();
        updateWarrantiesList();
        updateMaintenanceStatus();
        updateNotificationHistory();
        updateMileageDisplay();
        setTimeout(() => updateFuelChart(), 100);
    }
}

function showMoreSection(section) {
    document.querySelectorAll('.more-section').forEach(s => s.style.display = 'none');
    const target = document.getElementById(`more-${section}`);
    if (target) {
        target.style.display = 'block';
        if (section === 'fuel') {
            updateFuelStats();
            updateFuelHistory();
            setTimeout(() => updateFuelChart(), 100);
        }
        if (section === 'garage') { updateGarageStats(); updateServicesList(); }
        if (section === 'warranties') { updateWarrantyStats(); updateWarrantiesList(); }
        if (section === 'notifications') { updateMaintenanceStatus(); updateNotificationHistory(); }
        if (section === 'data') {}
    }
}

// ===== TOAST УВЕДОМЛЕНИЯ =====
function showToast(title, message, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const existingToasts = container.querySelectorAll('.toast:not(.hiding)');
    if (existingToasts.length >= 3) {
        existingToasts[0].classList.add('hiding');
        setTimeout(() => existingToasts[0].remove(), 300);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = {
        'info': 'information-circle-outline',
        'success': 'checkmark-circle-outline',
        'warning': 'warning-outline',
        'danger': 'alert-circle-outline'
    };

    toast.innerHTML = `
        <div class="toast-icon">
            <ion-icon name="${iconMap[type] || 'notifications-outline'}"></ion-icon>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.classList.add('hiding'); setTimeout(() => this.parentElement.remove(), 300);">
            <ion-icon name="close-outline"></ion-icon>
        </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

// ===== CUSTOM CONFIRM MODAL =====
function showConfirm(title, message, okText = 'Подтвердить', cancelText = 'Отмена', type = 'danger') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        const iconEl = modal.querySelector('.confirm-modal-icon ion-icon');

        titleEl.textContent = title;
        messageEl.textContent = message;
        okBtn.textContent = okText;
        cancelBtn.textContent = cancelText;

        const iconMap = {
            'danger': { icon: 'alert-circle', color: 'var(--accent-red)' },
            'warning': { icon: 'warning', color: 'var(--accent-orange)' },
            'info': { icon: 'information-circle', color: 'var(--accent-blue)' },
            'success': { icon: 'checkmark-circle', color: 'var(--accent-green)' }
        };

        const config = iconMap[type] || iconMap['danger'];
        iconEl.setAttribute('name', `${config.icon}-outline`);
        iconEl.style.color = config.color;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        const handleConfirm = () => { cleanup(); resolve(true); };
        const handleCancel = () => { cleanup(); resolve(false); };

        const cleanup = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            okBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleEscape);
        };

        const handleEscape = (e) => {
            if (e.key === 'Escape') { cleanup(); resolve(false); }
        };

        okBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleEscape);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) { cleanup(); resolve(false); }
        });
    });
}

// ===== НАСТРОЙКИ ОБСЛУЖИВАНИЯ =====
async function saveNotificationSettings() {
    showLoading('Сохранение...');
    notificationSettings = {
        oilInterval: parseInt(document.getElementById('setting-oil-interval').value) || 10000,
        airFilterInterval: parseInt(document.getElementById('setting-air-filter-interval').value) || 15000,
        sparkPlugsInterval: parseInt(document.getElementById('setting-spark-plugs-interval').value) || 30000,
        brakePadsInterval: parseInt(document.getElementById('setting-brake-pads-interval').value) || 40000,
        maintenanceInterval: parseInt(document.getElementById('setting-maintenance-interval').value) || 15000,
        coolantInterval: parseInt(document.getElementById('setting-coolant-interval').value) || 60000
    };
    saveNotificationSettingsLocal();
    await syncNotificationSettingsToFirebase();
    updateMaintenanceStatus();
    checkNotifications();
    hideLoading();
    showToast('Успех', 'Настройки сохранены!', 'success');
}

function getLastServiceMileage(type) {
    const typeMap = {
        'oil': 'oil',
        'airFilter': 'maintenance',
        'sparkPlugs': 'maintenance',
        'brakePads': 'repair',
        'maintenance': 'maintenance',
        'coolant': 'maintenance'
    };
    const serviceType = typeMap[type];
    const relevantRecords = records.filter(r => r.type === serviceType);
    if (relevantRecords.length === 0) return null;
    const lastRecord = relevantRecords.reduce((prev, current) =>
        (prev.mileage > current.mileage) ? prev : current
    );
    return lastRecord.mileage;
}

function updateMaintenanceStatus() {
    const list = document.getElementById('maintenance-status-list');
    if (!list) return;
    const currentMileage = getCurrentMileage();

    const items = [
        { id: 'oil', name: 'Замена масла', icon: 'drop-outline', interval: notificationSettings.oilInterval },
        { id: 'airFilter', name: 'Воздушный фильтр', icon: 'air-outline', interval: notificationSettings.airFilterInterval },
        { id: 'sparkPlugs', name: 'Свечи зажигания', icon: 'flame-outline', interval: notificationSettings.sparkPlugsInterval },
        { id: 'brakePads', name: 'Тормозные колодки', icon: 'disc-outline', interval: notificationSettings.brakePadsInterval },
        { id: 'maintenance', name: 'Плановое ТО', icon: 'settings-outline', interval: notificationSettings.maintenanceInterval },
        { id: 'coolant', name: 'Охлаждающая жидкость', icon: 'thermometer-outline', interval: notificationSettings.coolantInterval }
    ];

    list.innerHTML = items.map(item => {
        const lastMileage = getLastServiceMileage(item.id);
        const nextMileage = lastMileage ? lastMileage + item.interval : item.interval;
        const remaining = nextMileage - currentMileage;
        const percentage = lastMileage ? ((currentMileage - lastMileage) / item.interval) * 100 : 0;

        let status = 'ok';
        let statusText = `${remaining.toLocaleString()} км`;

        if (remaining <= 0) {
            status = 'danger';
            statusText = 'Просрочено!';
        } else if (remaining <= item.interval * 0.2) {
            status = 'warning';
            statusText = `Осталось ${remaining.toLocaleString()} км`;
        }

        return `
            <div class="maintenance-status-item ${status}">
                <div class="maintenance-status-header">
                    <div class="maintenance-status-name">
                        <ion-icon name="${item.icon}"></ion-icon>
                        ${item.name}
                    </div>
                    <span class="maintenance-status-badge ${status}">${statusText}</span>
                </div>
                <div class="maintenance-status-details">
                    <div class="maintenance-status-detail">
                        <span class="maintenance-status-detail-label">Интервал</span>
                        <span class="maintenance-status-detail-value">${item.interval.toLocaleString()} км</span>
                    </div>
                    <div class="maintenance-status-detail">
                        <span class="maintenance-status-detail-label">Следующее ТО</span>
                        <span class="maintenance-status-detail-value">${nextMileage.toLocaleString()} км</span>
                    </div>
                    <div class="maintenance-status-detail">
                        <span class="maintenance-status-detail-label">Прогресс</span>
                        <span class="maintenance-status-detail-value">${Math.min(100, percentage).toFixed(0)}%</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function checkNotifications() {
    const currentMileage = getCurrentMileage();
    const items = [
        { id: 'oil', name: 'Замена масла', interval: notificationSettings.oilInterval },
        { id: 'airFilter', name: 'Воздушный фильтр', interval: notificationSettings.airFilterInterval },
        { id: 'sparkPlugs', name: 'Свечи зажигания', interval: notificationSettings.sparkPlugsInterval },
        { id: 'brakePads', name: 'Тормозные колодки', interval: notificationSettings.brakePadsInterval },
        { id: 'maintenance', name: 'Плановое ТО', interval: notificationSettings.maintenanceInterval },
        { id: 'coolant', name: 'Охлаждающая жидкость', interval: notificationSettings.coolantInterval }
    ];

    items.forEach(item => {
        const lastMileage = getLastServiceMileage(item.id);
        const nextMileage = lastMileage ? lastMileage + item.interval : item.interval;
        const remaining = nextMileage - currentMileage;

        if (remaining <= item.interval * 0.2 && remaining > 0) {
            const notification = {
                id: 'notif_' + Date.now() + '_' + item.id,
                type: 'warning',
                title: `Требуется ${item.name.toLowerCase()}`,
                message: `Осталось ${remaining.toLocaleString()} км до следующего обслуживания`,
                timestamp: new Date().toISOString()
            };
            notifications.push(notification);
            saveNotificationsLocal();
            syncNotificationToFirebase(notification);
            showToast('🔧 Обслуживание', `${item.name}: осталось ${remaining.toLocaleString()} км`, 'warning', 7000);
        } else if (remaining <= 0) {
            const notification = {
                id: 'notif_' + Date.now() + '_' + item.id,
                type: 'danger',
                title: `Просрочено: ${item.name.toLowerCase()}`,
                message: `Необходимо срочно выполнить обслуживание!`,
                timestamp: new Date().toISOString()
            };
            notifications.push(notification);
            saveNotificationsLocal();
            syncNotificationToFirebase(notification);
            showToast('⚠️ Срочно', `${item.name}: обслуживание просрочено!`, 'danger', 7000);
        }
    });

    updateNotificationHistory();
}

function updateNotificationHistory() {
    const list = document.getElementById('notification-history-list');
    if (!list) return;
    if (notifications.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет уведомлений</p>';
        return;
    }
    const sorted = [...notifications].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    list.innerHTML = sorted.slice(0, 20).map(n => {
        const icon = n.type === 'danger' ? 'alert-circle-outline' : 'notifications-outline';
        const time = new Date(n.timestamp).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        return `
            <div class="notification-history-item">
                <div class="notification-history-icon">
                    <ion-icon name="${icon}"></ion-icon>
                </div>
                <div class="notification-history-content">
                    <div class="notification-history-title">${n.title}</div>
                    <div class="notification-history-message">${n.message}</div>
                    <div class="notification-history-time">${time}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ===== ТОПЛИВО =====
function setupFuelCalcPreview() {
    const l = document.getElementById('fuel-liters');
    const p = document.getElementById('fuel-price');
    const m = document.getElementById('fuel-mileage');
    if (l && p && m) {
        l.addEventListener('input', updateFuelCalcPreview);
        p.addEventListener('input', updateFuelCalcPreview);
        m.addEventListener('input', updateFuelCalcPreview);
    }
}

function updateFuelCalcPreview() {
    const liters = parseFloat(document.getElementById('fuel-liters').value) || 0;
    const price = parseFloat(document.getElementById('fuel-price').value) || 0;
    const mileage = parseInt(document.getElementById('fuel-mileage').value) || 0;
    const total = liters * price;
    document.getElementById('fuel-calc-total').textContent = `${total.toFixed(2)} ₽`;
    if (mileage > 0 && fuelRecords.length > 0) {
        const sorted = [...fuelRecords].sort((a, b) => b.mileage - a.mileage);
        const last = sorted[0];
        if (mileage > last.mileage) {
            const distance = mileage - last.mileage;
            const consumption = (liters / distance) * 100;
            document.getElementById('fuel-calc-consumption').textContent = `${consumption.toFixed(2)} л/100км`;
        } else {
            document.getElementById('fuel-calc-consumption').textContent = '— л/100км';
        }
    } else {
        document.getElementById('fuel-calc-consumption').textContent = '— л/100км';
    }
}

async function saveFuelRecord() {
    showLoading('Сохранение...');
    const date = document.getElementById('fuel-date').value;
    const mileage = parseInt(document.getElementById('fuel-mileage').value);
    const liters = parseFloat(document.getElementById('fuel-liters').value);
    const price = parseFloat(document.getElementById('fuel-price').value);
    if (!date || !mileage || !liters || !price) {
        hideLoading();
        showToast('Внимание', 'Заполните все поля!', 'warning');
        return;
    }
    const total = liters * price;
    let consumption = null;
    const sorted = [...fuelRecords].sort((a, b) => b.mileage - a.mileage);
    if (sorted.length > 0 && mileage > sorted[0].mileage) {
        const distance = mileage - sorted[0].mileage;
        consumption = (liters / distance) * 100;
    }
    const record = {
        id: 'fuel_' + Date.now(),
        date, mileage, liters, price, total, consumption,
        createdAt: new Date().toISOString()
    };
    fuelRecords.push(record);
    fuelRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
    saveFuelLocal();
    await syncFuelToFirebase(record);
    clearFuelForm();
    updateFuelStats();
    updateFuelHistory();
    updateFuelChart();
    updateUnifiedHistory();
    updateStats();
    hideLoading();
    showToast('Успех', 'Заправка добавлена!', 'success');
}

function clearFuelForm() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fuel-date').value = today;
    document.getElementById('fuel-mileage').value = '';
    document.getElementById('fuel-liters').value = '';
    document.getElementById('fuel-price').value = '';
    document.getElementById('fuel-calc-total').textContent = '0 ₽';
    document.getElementById('fuel-calc-consumption').textContent = '— л/100км';
    initDates();
}

function updateFuelStats() {
    if (fuelRecords.length === 0) {
        document.getElementById('fuel-avg-consumption').textContent = '— л/100км';
        document.getElementById('fuel-total-liters').textContent = '0 л';
        document.getElementById('fuel-total-cost').textContent = '0 ₽';
        document.getElementById('fuel-count').textContent = '0';
        return;
    }
    const totalLiters = fuelRecords.reduce((s, r) => s + r.liters, 0);
    const totalCost = fuelRecords.reduce((s, r) => s + r.total, 0);
    const count = fuelRecords.length;
    const withConsumption = fuelRecords.filter(r => r.consumption !== null);
    const avgConsumption = withConsumption.length > 0 ? withConsumption.reduce((s, r) => s + r.consumption, 0) / withConsumption.length : 0;
    document.getElementById('fuel-avg-consumption').textContent = `${avgConsumption.toFixed(2)} л/100км`;
    document.getElementById('fuel-total-liters').textContent = `${totalLiters.toFixed(1)} л`;
    document.getElementById('fuel-total-cost').textContent = `${totalCost.toFixed(2)} ₽`;
    document.getElementById('fuel-count').textContent = count;
}

function updateFuelHistory() {
    const list = document.getElementById('fuel-history-list');
    if (!list) return;
    if (fuelRecords.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет записей о заправках</p>';
        return;
    }
    const sorted = [...fuelRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
    list.innerHTML = sorted.map(r => `
        <div class="fuel-history-item">
            <div class="fuel-history-header">
                <span class="fuel-history-date">${formatDate(r.date)}</span>
                <span class="fuel-history-mileage">Пробег: ${r.mileage.toLocaleString()} км</span>
            </div>
            <div class="fuel-history-details">
                <div class="fuel-history-detail">
                    <span class="fuel-history-detail-label">Литры</span>
                    <span class="fuel-history-detail-value">${r.liters.toFixed(2)} л</span>
                </div>
                <div class="fuel-history-detail">
                    <span class="fuel-history-detail-label">Цена/л</span>
                    <span class="fuel-history-detail-value">${r.price.toFixed(2)} ₽</span>
                </div>
                <div class="fuel-history-detail">
                    <span class="fuel-history-detail-label">Расход</span>
                    <span class="fuel-history-detail-value fuel-history-consumption">${r.consumption ? r.consumption.toFixed(2) + ' л/100км' : '—'}</span>
                </div>
            </div>
            <div class="fuel-history-actions">
                <button class="btn btn-danger btn-small" onclick="deleteFuelRecord('${r.id}')">
                    <ion-icon name="trash-outline"></ion-icon>Удалить
                </button>
            </div>
        </div>
    `).join('');
}

async function deleteFuelRecord(id) {
    if (!await showConfirm('Удаление заправки', 'Удалить эту запись о заправке?', 'Удалить', 'Отмена', 'danger')) return;
    fuelRecords = fuelRecords.filter(r => r.id !== id);
    saveFuelLocal();
    await deleteFuelFromFirebase(id);
    updateFuelStats();
    updateFuelHistory();
    updateFuelChart();
    updateUnifiedHistory();
    updateStats();
    showToast('Успех', 'Запись удалена!', 'success');
}

function updateFuelChart() {
    const canvas = document.getElementById('fuelChart');
    if (!canvas) return;
    if (fuelChart) fuelChart.destroy();
    const sorted = [...fuelRecords].filter(r => r.consumption !== null).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sorted.length === 0) {
        canvas.parentElement.innerHTML = '<p class="hint-text">Недостаточно данных</p>';
        return;
    }
    const ctx = canvas.getContext('2d');
    fuelChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sorted.map(r => formatDate(r.date)),
            datasets: [{
                label: 'Расход (л/100км)',
                data: sorted.map(r => r.consumption),
                borderColor: '#ff9500',
                backgroundColor: 'rgba(255, 149, 0, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ff9500',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(29, 29, 31, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(2)} л/100км` }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#86868b', font: { size: 11 }, maxRotation: 45, minRotation: 45 }
                },
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { color: '#86868b', font: { size: 11 }, callback: (v) => v.toFixed(1) }
                }
            }
        }
    });
}

// ===== СЕРВИСЫ =====
function updateServiceSelects() {
    const selects = [document.getElementById('record-service'), document.getElementById('warranty-service')];
    selects.forEach(select => {
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = '<option value="">-- Не указан --</option>';
        services.forEach(s => {
            select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
        });
        select.value = currentValue;
    });
}

async function saveService() {
    const name = document.getElementById('service-name').value.trim();
    if (!name) {
        showToast('Внимание', 'Укажите название сервиса!', 'warning');
        return;
    }
    const service = {
        id: 'service_' + Date.now(),
        name,
        address: document.getElementById('service-address').value.trim(),
        phone: document.getElementById('service-phone').value.trim(),
        notes: document.getElementById('service-notes').value.trim(),
        visits: [],
        createdAt: new Date().toISOString()
    };
    services.push(service);
    saveServicesLocal();
    await syncServiceToFirebase(service);
    clearServiceForm();
    updateServiceSelects();
    updateGarageStats();
    updateServicesList();
    showToast('Успех', 'Сервис добавлен!', 'success');
}

function clearServiceForm() {
    document.getElementById('service-name').value = '';
    document.getElementById('service-address').value = '';
    document.getElementById('service-phone').value = '';
    document.getElementById('service-notes').value = '';
}

function updateGarageStats() {
    const totalVisits = services.reduce((sum, s) => sum + (s.visits?.length || 0), 0);
    const totalSpent = services.reduce((sum, s) => sum + (s.visits?.reduce((s2, v) => s2 + (v.cost || 0), 0) || 0), 0);
    document.getElementById('garage-count').textContent = services.length;
    document.getElementById('garage-visits-count').textContent = totalVisits;
    document.getElementById('garage-total-spent').textContent = `${totalSpent.toFixed(2)} ₽`;
}

function updateServicesList() {
    const list = document.getElementById('services-list');
    if (!list) return;
    if (services.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет добавленных сервисов</p>';
        return;
    }
    list.innerHTML = services.map(s => {
        let visitsHTML;
        if (s.visits && s.visits.length > 0) {
            const visitsList = s.visits.map(v => {
                const costText = v.cost ? v.cost.toFixed(2) + ' ₽' : '—';
                const descHTML = v.description ? `<div class="visit-description">${v.description}</div>` : '';
                return `
                    <div class="visit-item">
                        <div class="visit-header">
                            <span class="visit-date">${formatDate(v.date)}</span>
                            <span class="visit-cost">${costText}</span>
                        </div>
                        ${descHTML}
                    </div>
                `;
            }).join('');
            visitsHTML = `
                <div class="service-visits">
                    <h4>История посещений (${s.visits.length})</h4>
                    ${visitsList}
                </div>
            `;
        } else {
            visitsHTML = '<p class="hint-text" style="margin-top: 12px;">Нет посещений</p>';
        }

        const addressHTML = s.address ? `<div class="service-info-item"><ion-icon name="location-outline"></ion-icon><span>${s.address}</span></div>` : '';
        const phoneHTML = s.phone ? `<div class="service-info-item"><ion-icon name="call-outline"></ion-icon><span>${s.phone}</span></div>` : '';
        const notesHTML = s.notes ? `<div class="service-info-item"><ion-icon name="document-text-outline"></ion-icon><span>${s.notes}</span></div>` : '';

        return `
            <div class="service-card">
                <div class="service-header">
                    <div class="service-name">${s.name}</div>
                    <div class="service-actions">
                        <button class="btn btn-secondary btn-small" onclick="editService('${s.id}')">
                            <ion-icon name="create-outline"></ion-icon>
                        </button>
                        <button class="btn btn-danger btn-small" onclick="deleteService('${s.id}')">
                            <ion-icon name="trash-outline"></ion-icon>
                        </button>
                    </div>
                </div>
                <div class="service-info">
                    ${addressHTML}
                    ${phoneHTML}
                    ${notesHTML}
                </div>
                ${visitsHTML}
            </div>
        `;
    }).join('');
}

async function deleteService(id) {
    if (!await showConfirm('Удаление сервиса', 'Удалить этот сервис из списка?', 'Удалить', 'Отмена', 'danger')) return;
    services = services.filter(s => s.id !== id);
    saveServicesLocal();
    await deleteServiceFromFirebase(id);
    updateServiceSelects();
    updateGarageStats();
    updateServicesList();
    showToast('Успех', 'Сервис удалён!', 'success');
}

function editService(id) {
    const service = services.find(s => s.id === id);
    if (!service) return;
    editingServiceId = id;
    document.getElementById('edit-service-name').value = service.name || '';
    document.getElementById('edit-service-address').value = service.address || '';
    document.getElementById('edit-service-phone').value = service.phone || '';
    document.getElementById('edit-service-notes').value = service.notes || '';
    const modal = document.getElementById('edit-service-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeEditServiceModal() {
    const modal = document.getElementById('edit-service-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    editingServiceId = null;
}

async function saveEditedService() {
    if (!editingServiceId) return;
    const name = document.getElementById('edit-service-name').value.trim();
    if (!name) {
        showToast('Внимание', 'Укажите название сервиса!', 'warning');
        return;
    }
    const serviceIndex = services.findIndex(s => s.id === editingServiceId);
    if (serviceIndex === -1) return;
    services[serviceIndex] = {
        ...services[serviceIndex],
        name: name,
        address: document.getElementById('edit-service-address').value.trim(),
        phone: document.getElementById('edit-service-phone').value.trim(),
        notes: document.getElementById('edit-service-notes').value.trim(),
        updatedAt: new Date().toISOString()
    };
    saveServicesLocal();
    await syncServiceToFirebase(services[serviceIndex]);
    updateServiceSelects();
    updateGarageStats();
    updateServicesList();
    closeEditServiceModal();
    showToast('Успех', 'Сервис обновлён!', 'success');
}

// ===== ГАРАНТИИ =====
function getWarrantyStatus(warranty) {
    const now = new Date();
    const expiry = new Date(warranty.expiryDate);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { status: 'expired', label: 'Истекла', daysLeft };
    if (daysLeft <= 30) return { status: 'expiring', label: `Истекает (${daysLeft} дн.)`, daysLeft };
    return { status: 'active', label: `Активна (${daysLeft} дн.)`, daysLeft };
}

async function saveWarranty() {
    const part = document.getElementById('warranty-part').value.trim();
    const startDate = document.getElementById('warranty-start-date').value;
    const months = parseInt(document.getElementById('warranty-months').value);
    if (!part || !startDate || !months) {
        showToast('Внимание', 'Заполните обязательные поля!', 'warning');
        return;
    }
    const startDateObj = new Date(startDate);
    const expiryDate = new Date(startDateObj);
    expiryDate.setMonth(expiryDate.getMonth() + months);
    const warranty = {
        id: 'warranty_' + Date.now(),
        part,
        serviceId: document.getElementById('warranty-service').value,
        startDate,
        months,
        expiryDate: expiryDate.toISOString().split('T')[0],
        cost: parseFloat(document.getElementById('warranty-cost').value) || 0,
        notes: document.getElementById('warranty-notes').value.trim(),
        createdAt: new Date().toISOString()
    };
    warranties.push(warranty);
    saveWarrantiesLocal();
    await syncWarrantyToFirebase(warranty);
    clearWarrantyForm();
    updateWarrantyStats();
    updateWarrantiesList();
    showToast('Успех', 'Гарантия добавлена!', 'success');
}

function clearWarrantyForm() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('warranty-part').value = '';
    document.getElementById('warranty-service').value = '';
    document.getElementById('warranty-start-date').value = today;
    document.getElementById('warranty-months').value = '';
    document.getElementById('warranty-cost').value = '';
    document.getElementById('warranty-notes').value = '';
}

function updateWarrantyStats() {
    let active = 0, expiring = 0, expired = 0;
    warranties.forEach(w => {
        const { status } = getWarrantyStatus(w);
        if (status === 'active') active++;
        else if (status === 'expiring') expiring++;
        else expired++;
    });
    document.getElementById('warranty-active-count').textContent = active;
    document.getElementById('warranty-expiring-count').textContent = expiring;
    document.getElementById('warranty-expired-count').textContent = expired;
}

function updateWarrantiesList() {
    const list = document.getElementById('warranties-list');
    if (!list) return;
    if (warranties.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет добавленных гарантий</p>';
        return;
    }
    const sorted = [...warranties].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    list.innerHTML = sorted.map(w => {
        const { status, label } = getWarrantyStatus(w);
        const totalDays = Math.ceil((new Date(w.expiryDate) - new Date(w.startDate)) / (1000 * 60 * 60 * 24));
        const elapsedDays = Math.ceil((new Date() - new Date(w.startDate)) / (1000 * 60 * 60 * 24));
        const progress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
        const service = services.find(s => s.id === w.serviceId);
        return `
            <div class="warranty-card ${status}">
                <div class="warranty-header">
                    <div class="warranty-part-name">${w.part}</div>
                    <span class="warranty-status ${status}">${label}</span>
                </div>
                <div class="warranty-details">
                    <div class="warranty-detail">
                        <span class="warranty-detail-label">Дата покупки</span>
                        <span class="warranty-detail-value">${formatDate(w.startDate)}</span>
                    </div>
                    <div class="warranty-detail">
                        <span class="warranty-detail-label">Срок гарантии</span>
                        <span class="warranty-detail-value">${w.months} мес.</span>
                    </div>
                    <div class="warranty-detail">
                        <span class="warranty-detail-label">Истекает</span>
                        <span class="warranty-detail-value">${formatDate(w.expiryDate)}</span>
                    </div>
                    <div class="warranty-detail">
                        <span class="warranty-detail-label">Стоимость</span>
                        <span class="warranty-detail-value">${w.cost ? w.cost.toFixed(2) + ' ₽' : '—'}</span>
                    </div>
                </div>
                ${service ? `<div class="warranty-notes"><ion-icon name="business-outline"></ion-icon> ${service.name}</div>` : ''}
                ${w.notes ? `<div class="warranty-notes">${w.notes}</div>` : ''}
                <div class="warranty-progress">
                    <div class="warranty-progress-bar">
                        <div class="warranty-progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="warranty-progress-text">${progress.toFixed(0)}% использовано</div>
                </div>
                <div class="warranty-actions">
                    <button class="btn btn-danger btn-small" onclick="deleteWarranty('${w.id}')">
                        <ion-icon name="trash-outline"></ion-icon>Удалить
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function deleteWarranty(id) {
    if (!await showConfirm('Удаление гарантии', 'Удалить эту гарантию?', 'Удалить', 'Отмена', 'danger')) return;
    warranties = warranties.filter(w => w.id !== id);
    saveWarrantiesLocal();
    await deleteWarrantyFromFirebase(id);
    updateWarrantyStats();
    updateWarrantiesList();
    showToast('Успех', 'Гарантия удалена!', 'success');
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
    document.querySelectorAll('.part-cost').forEach(i => partsTotal += parseFloat(i.value) || 0);
    document.querySelectorAll('.work-cost').forEach(i => worksTotal += parseFloat(i.value) || 0);
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
    showLoading('Сохранение...');
    const date = document.getElementById('record-date').value;
    const mileage = parseInt(document.getElementById('record-mileage').value);
    const type = document.getElementById('record-type').value;
    const description = document.getElementById('record-description').value;
    const serviceId = document.getElementById('record-service').value;
    if (!date || !mileage) {
        hideLoading();
        showToast('Внимание', 'Заполните дату и пробег!', 'warning');
        return;
    }
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
    const partsTotal = parts.reduce((s, p) => s + p.cost, 0);
    const worksTotal = works.reduce((s, w) => s + w.cost, 0);
    const record = {
        id: 'record_' + Date.now(),
        date, mileage, type, description, serviceId,
        parts, works, partsTotal, worksTotal,
        total: partsTotal + worksTotal,
        createdAt: new Date().toISOString()
    };
    records.push(record);
    records.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (serviceId) {
        const service = services.find(s => s.id === serviceId);
        if (service) {
            if (!service.visits) service.visits = [];
            service.visits.push({
                recordId: record.id,
                date: date,
                mileage: mileage,
                description: description || (type + ' - ' + parts.map(p => p.name).join(', ')),
                cost: record.total
            });
        }
    }

    saveLocal();
    saveServicesLocal();
    await syncRecordToFirebase(record);
    if (serviceId) await syncServiceToFirebase(services.find(s => s.id === serviceId));

    clearForm();
    updateUnifiedHistory();
    updateStats();
    updateMaintenanceStatus();
    updateGarageStats();
    updateServicesList();
    checkNotifications();
    hideLoading();
    showToast('Успех', 'Запись сохранена!', 'success');
}

function clearForm() {
    document.getElementById('record-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('record-mileage').value = '';
    document.getElementById('record-type').value = 'repair';
    document.getElementById('record-description').value = '';
    document.getElementById('record-service').value = '';
    document.getElementById('parts-list').innerHTML = '';
    document.getElementById('works-list').innerHTML = '';
    addPart();
    addWork();
    calculateTotal();
    initDates();
}

// ===== ОБЪЕДИНЁННАЯ ИСТОРИЯ =====
function filterHistory(type, btn) {
    currentFilter = type;
    document.querySelectorAll('#tab-history .filter-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    updateUnifiedHistory();
}

function updateUnifiedHistory() {
    const list = document.getElementById('unified-history-list');
    if (!list) return;

    let allEvents = [];

    records.forEach(r => {
        allEvents.push({
            type: 'repair',
            recordType: r.type,
            date: r.date,
            mileage: r.mileage,
            total: r.total,
            description: r.description,
            serviceId: r.serviceId,
            parts: r.parts,
            works: r.works,
            id: r.id
        });
    });

    fuelRecords.forEach(f => {
        allEvents.push({
            type: 'fuel',
            date: f.date,
            mileage: f.mileage,
            total: f.total,
            liters: f.liters,
            price: f.price,
            consumption: f.consumption,
            id: f.id
        });
    });

    if (currentFilter !== 'all') {
        if (currentFilter === 'fuel') {
            allEvents = allEvents.filter(e => e.type === 'fuel');
        } else {
            allEvents = allEvents.filter(e => e.type === 'repair' && e.recordType === currentFilter);
        }
    }

    allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allEvents.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет записей</p>';
        return;
    }

    const grouped = {};
    allEvents.forEach(event => {
        const monthKey = event.date.substring(0, 7);
        if (!grouped[monthKey]) grouped[monthKey] = [];
        grouped[monthKey].push(event);
    });

    const monthNames = {
        '01': 'Январь', '02': 'Февраль', '03': 'Март',
        '04': 'Апрель', '05': 'Май', '06': 'Июнь',
        '07': 'Июль', '08': 'Август', '09': 'Сентябрь',
        '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
    };

    const typeNames = {
        'repair': 'Ремонт', 'oil': 'Замена масла',
        'maintenance': 'ТО', 'tire': 'Шиномонтаж', 'other': 'Другое'
    };

    let html = '';
    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(monthKey => {
        const [year, month] = monthKey.split('-');
        const monthTotal = grouped[monthKey].reduce((sum, e) => sum + (e.total || 0), 0);

        html += `<div class="month-group">
            <div class="month-header">
                <h3>${monthNames[month]} ${year}</h3>
                <span class="month-total">${monthTotal.toFixed(2)} ₽</span>
            </div>
            <div class="month-items">`;

        grouped[monthKey].forEach(event => {
            if (event.type === 'fuel') {
                html += `
                    <div class="history-item fuel-entry">
                        <div class="history-header">
                            <span class="history-date"><ion-icon name="calendar-outline"></ion-icon>${formatDate(event.date)}</span>
                            <span class="record-type-badge fuel"><ion-icon name="fuel-outline"></ion-icon>Топливо</span>
                        </div>
                        <div class="history-mileage"><ion-icon name="speedometer-outline"></ion-icon>Пробег: ${event.mileage.toLocaleString()} км</div>
                        <div class="history-mileage"><ion-icon name="drop-outline"></ion-icon>Заправлено: ${event.liters.toFixed(1)} л × ${event.price.toFixed(2)} ₽</div>
                        ${event.consumption ? `<div class="history-mileage"><ion-icon name="trending-up-outline"></ion-icon>Расход: ${event.consumption.toFixed(2)} л/100км</div>` : ''}
                        <div class="history-total"><span>Итого:</span><span>${event.total.toFixed(2)} ₽</span></div>
                        <div class="history-actions">
                            <button class="btn btn-danger" onclick="deleteFuelRecord('${event.id}')">
                                <ion-icon name="trash-outline"></ion-icon>Удалить
                            </button>
                        </div>
                    </div>
                `;
            } else {
                const service = services.find(s => s.id === event.serviceId);
                const partsHTML = event.parts && event.parts.length > 0 ? `
                    <div class="history-parts">
                        <h4>Запчасти:</h4>
                        <ul class="history-parts-list">
                            ${event.parts.map(p => `<li>${p.name} - ${p.cost.toFixed(2)} ₽</li>`).join('')}
                        </ul>
                    </div>
                ` : '';
                const worksHTML = event.works && event.works.length > 0 ? `
                    <div class="history-works">
                        <h4>Работы:</h4>
                        <ul class="history-works-list">
                            ${event.works.map(w => `<li>${w.name} - ${w.cost.toFixed(2)} ₽</li>`).join('')}
                        </ul>
                    </div>
                ` : '';

                html += `
                    <div class="history-item repair-entry">
                        <div class="history-header">
                            <span class="history-date"><ion-icon name="calendar-outline"></ion-icon>${formatDate(event.date)}</span>
                            <span class="record-type-badge repair">${typeNames[event.recordType] || event.recordType}</span>
                        </div>
                        <div class="history-mileage"><ion-icon name="speedometer-outline"></ion-icon>Пробег: ${event.mileage.toLocaleString()} км</div>
                        ${service ? `<div class="history-mileage"><ion-icon name="business-outline"></ion-icon>Сервис: ${service.name}</div>` : ''}
                        ${event.description ? `<div class="history-description">${event.description}</div>` : ''}
                        ${partsHTML}${worksHTML}
                        <div class="history-total"><span>Итого:</span><span>${event.total.toFixed(2)} ₽</span></div>
                        <div class="history-actions">
                            <button class="btn btn-secondary" onclick="editRecord('${event.id}')">
                                <ion-icon name="create-outline"></ion-icon>Редактировать
                            </button>
                            <button class="btn btn-danger" onclick="deleteRecord('${event.id}')">
                                <ion-icon name="trash-outline"></ion-icon>Удалить
                            </button>
                        </div>
                    </div>
                `;
            }
        });

        html += `</div></div>`;
    });

    list.innerHTML = html;
}

async function deleteRecord(id) {
    if (!await showConfirm('Удаление записи', 'Вы уверены, что хотите удалить эту запись?', 'Удалить', 'Отмена', 'danger')) return;
    const record = records.find(r => r.id === id);
    records = records.filter(r => r.id !== id);

    if (record && record.serviceId) {
        const service = services.find(s => s.id === record.serviceId);
        if (service && service.visits) {
            service.visits = service.visits.filter(v => v.recordId !== id);
        }
    }

    saveLocal();
    saveServicesLocal();
    await deleteRecordFromFirebase(id);
    if (record && record.serviceId) await syncServiceToFirebase(services.find(s => s.id === record.serviceId));

    updateUnifiedHistory();
    updateStats();
    updateMaintenanceStatus();
    updateGarageStats();
    updateServicesList();
    checkNotifications();
    showToast('Успех', 'Запись удалена!', 'success');
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
    modalTitle.innerHTML = `<ion-icon name="create-outline"></ion-icon>Редактирование`;
    modalBody.innerHTML = `
        <div class="form-row">
            <div class="form-group">
                <label>Дата *</label>
                <input type="date" id="edit-date" value="${record.date}" required>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Пробег (км) *</label>
                <input type="number" id="edit-mileage" value="${record.mileage}" required>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Тип работ *</label>
                <select id="edit-type" required>
                    <option value="repair" ${record.type === 'repair' ? 'selected' : ''}>Ремонт</option>
                    <option value="oil" ${record.type === 'oil' ? 'selected' : ''}>Замена масла</option>
                    <option value="maintenance" ${record.type === 'maintenance' ? 'selected' : ''}>ТО</option>
                    <option value="tire" ${record.type === 'tire' ? 'selected' : ''}>Шиномонтаж</option>
                    <option value="other" ${record.type === 'other' ? 'selected' : ''}>Другое</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Сервис/СТО</label>
                <select id="edit-service">
                    <option value="">-- Не указан --</option>
                    ${services.map(s => `<option value="${s.id}" ${record.serviceId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Описание</label>
                <input type="text" id="edit-description" value="${record.description || ''}">
            </div>
        </div>
        <div class="form-section">
            <h3>Запчасти</h3>
            <div id="edit-parts-list">
                ${(record.parts || []).map(p => `
                    <div class="dynamic-item">
                        <input type="text" value="${p.name}" class="part-name">
                        <input type="number" value="${p.cost}" class="part-cost" step="0.01" min="0">
                        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">
                            <ion-icon name="trash-outline"></ion-icon>
                        </button>
                    </div>
                `).join('')}
            </div>
            <button type="button" class="btn btn-secondary btn-small" onclick="addEditPart()">
                <ion-icon name="add-outline"></ion-icon>Добавить деталь
            </button>
        </div>
        <div class="form-section">
            <h3>Работы</h3>
            <div id="edit-works-list">
                ${(record.works || []).map(w => `
                    <div class="dynamic-item">
                        <input type="text" value="${w.name}" class="work-name">
                        <input type="number" value="${w.cost}" class="work-cost" step="0.01" min="0">
                        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">
                            <ion-icon name="trash-outline"></ion-icon>
                        </button>
                    </div>
                `).join('')}
            </div>
            <button type="button" class="btn btn-secondary btn-small" onclick="addEditWork()">
                <ion-icon name="add-outline"></ion-icon>Добавить работу
            </button>
        </div>
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
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">
            <ion-icon name="trash-outline"></ion-icon>
        </button>
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
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()">
            <ion-icon name="trash-outline"></ion-icon>
        </button>
    `;
    list.appendChild(item);
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
    editingRecordId = null;
}

function closeServiceVisitModal() {
    const modal = document.getElementById('service-visit-modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
}

async function saveEditedRecord() {
    if (!editingRecordId) return;
    showLoading('Сохранение...');
    const idx = records.findIndex(r => r.id === editingRecordId);
    if (idx === -1) { closeEditModal(); hideLoading(); return; }
    const oldRecord = records[idx];
    const date = document.getElementById('edit-date').value;
    const mileage = parseInt(document.getElementById('edit-mileage').value);
    const type = document.getElementById('edit-type').value;
    const description = document.getElementById('edit-description').value;
    const serviceId = document.getElementById('edit-service').value;
    if (!date || !mileage) {
        hideLoading();
        showToast('Внимание', 'Заполните дату и пробег!', 'warning');
        return;
    }
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
    const partsTotal = parts.reduce((s, p) => s + p.cost, 0);
    const worksTotal = works.reduce((s, w) => s + w.cost, 0);

    if (oldRecord && oldRecord.serviceId) {
        const oldService = services.find(s => s.id === oldRecord.serviceId);
        if (oldService && oldService.visits) {
            oldService.visits = oldService.visits.filter(v => v.recordId !== editingRecordId);
        }
    }

    records[idx] = {
        ...oldRecord,
        date, mileage, type, description, serviceId,
        parts, works, partsTotal, worksTotal,
        total: partsTotal + worksTotal,
        updatedAt: new Date().toISOString()
    };

    if (serviceId) {
        const service = services.find(s => s.id === serviceId);
        if (service) {
            if (!service.visits) service.visits = [];
            service.visits.push({
                recordId: editingRecordId,
                date: date,
                mileage: mileage,
                description: description || (type + ' - ' + parts.map(p => p.name).join(', ')),
                cost: records[idx].total
            });
            saveServicesLocal();
            await syncServiceToFirebase(service);
        }
    }

    saveLocal();
    await syncRecordToFirebase(records[idx]);
    updateUnifiedHistory();
    updateStats();
    updateMaintenanceStatus();
    updateGarageStats();
    updateServicesList();
    checkNotifications();
    closeEditModal();
    hideLoading();
    showToast('Успех', 'Запись обновлена!', 'success');
}

// ===== СТАТИСТИКА =====
function updateStats() {
    const totalCost = records.reduce((s, r) => s + (r.total || 0), 0) + fuelRecords.reduce((s, r) => s + (r.total || 0), 0);
    const totalParts = records.reduce((s, r) => s + (r.partsTotal || 0), 0);
    const totalWorks = records.reduce((s, r) => s + (r.worksTotal || 0), 0);
    const count = records.length + fuelRecords.length;
    
    // Последний пробег из ВСЕХ источников
    const lastMileage = getCurrentMileage();
    
    // Первый пробег из всех источников
    let firstMileage = Infinity;
    if (records.length > 0) firstMileage = Math.min(firstMileage, ...records.map(r => r.mileage || 0));
    if (fuelRecords.length > 0) firstMileage = Math.min(firstMileage, ...fuelRecords.map(r => r.mileage || 0));
    if (mileageHistory.length > 0) firstMileage = Math.min(firstMileage, ...mileageHistory.map(m => m.mileage));
    if (firstMileage === Infinity) firstMileage = 0;
    
    const mileageDiff = lastMileage - firstMileage;
    const perKm = mileageDiff > 0 ? totalCost / mileageDiff : 0;
    
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    
    set('stat-total', `${totalCost.toFixed(2)} ₽`);
    set('stat-parts', `${totalParts.toFixed(2)} ₽`);
    set('stat-works', `${totalWorks.toFixed(2)} ₽`);
    set('stat-count', count);
    set('stat-per-km', `${perKm.toFixed(2)} ₽/км`);
    set('stat-last-mileage', `${lastMileage.toLocaleString()} км`);
    
    const byType = {};
    records.forEach(r => {
        if (!byType[r.type]) byType[r.type] = 0;
        byType[r.type] += (r.total || 0);
    });
    byType['fuel'] = fuelRecords.reduce((s, r) => s + (r.total || 0), 0);
    
    const typeNames = {
        'repair': 'Ремонт',
        'oil': 'Замена масла',
        'maintenance': 'ТО',
        'tire': 'Шиномонтаж',
        'other': 'Другое',
        'fuel': 'Топливо'
    };
    
    const list = document.getElementById('stats-by-type-list');
    if (list) {
        list.innerHTML = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, total]) => `
            <div class="stat-type-item">
                <span class="stat-type-label">${typeNames[type] || type}</span>
                <span class="stat-type-value">${total.toFixed(2)} ₽</span>
            </div>
        `).join('');
    }
}

// ===== ИСТОРИЯ ПРОБЕГА =====
async function loadMileageHistory() {
    if (isFirebaseConnected && db) {
        try {
            const snap = await getDocs(collection(db, COLLECTION_MILEAGE));
            const data = [];
            snap.forEach(d => data.push({ id: d.id, ...d.data() }));
            if (data.length > 0) {
                mileageHistory = data;
                localStorage.setItem('mileage_history', JSON.stringify(mileageHistory));
            } else {
                const saved = localStorage.getItem('mileage_history');
                if (saved) {
                    try {
                        const localData = JSON.parse(saved);
                        if (Array.isArray(localData) && localData.length > 0) {
                            mileageHistory = localData;
                            for (const item of mileageHistory) {
                                if (!item.id) item.id = 'mileage_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                                await syncMileageToFirebase(item);
                            }
                            showToast('Миграция', 'История пробега перенесена в облако', 'info', 3000);
                        }
                    } catch (e) {
                        mileageHistory = [];
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки истории пробега:', error);
            const saved = localStorage.getItem('mileage_history');
            if (saved) {
                try { mileageHistory = JSON.parse(saved); } catch (e) { mileageHistory = []; }
            }
        }
    } else {
        const saved = localStorage.getItem('mileage_history');
        if (saved) {
            try { mileageHistory = JSON.parse(saved); } catch (e) { mileageHistory = []; }
        }
    }
    updateMileageDisplay();
}

function saveMileageHistory() {
    localStorage.setItem('mileage_history', JSON.stringify(mileageHistory));
}

function updateMileageDisplay() {
    const display = document.getElementById('current-mileage-display');
    if (!display) return;
    let maxMileage = 0;
    if (records.length > 0) maxMileage = Math.max(...records.map(r => r.mileage || 0));
    if (fuelRecords.length > 0) maxMileage = Math.max(maxMileage, ...fuelRecords.map(r => r.mileage || 0));
    if (mileageHistory.length > 0) maxMileage = Math.max(maxMileage, ...mileageHistory.map(m => m.mileage));
    display.textContent = maxMileage > 0 ? `${maxMileage.toLocaleString()} км` : '— км';
    const historySection = document.getElementById('mileage-history-section');
    if (mileageHistory.length > 0 && historySection) {
        historySection.style.display = 'block';
        updateMileageHistoryList();
    } else if (historySection) {
        historySection.style.display = 'none';
    }
}

function updateMileageHistoryList() {
    const list = document.getElementById('mileage-history-list');
    if (!list) return;
    if (mileageHistory.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет показаний</p>';
        return;
    }
    const sorted = [...mileageHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    list.innerHTML = sorted.slice(0, 10).map((item, index) => {
        const prevMileage = index < sorted.length - 1 ? sorted[index + 1].mileage : null;
        const diff = prevMileage ? item.mileage - prevMileage : null;
        return `
            <div class="mileage-history-item">
                <span class="date">${formatDate(item.date)}</span>
                <span class="mileage">${item.mileage.toLocaleString()} км</span>
                ${diff !== null ? `<span class="diff">+${diff.toLocaleString()} км</span>` : ''}
                <button class="btn-remove-mileage" onclick="deleteMileageRecord('${item.id}')" title="Удалить">
                    <ion-icon name="trash-outline"></ion-icon>
                </button>
            </div>
        `;
    }).join('');
}

async function updateMileage() {
    const input = document.getElementById('quick-mileage-input');
    if (!input) return;
    const mileage = parseInt(input.value);
    if (!mileage || mileage <= 0) {
        showToast('Внимание', 'Введите корректный пробег!', 'warning');
        return;
    }
    const maxMileage = getCurrentMileage();
    if (maxMileage > 0 && mileage < maxMileage) {
        if (!await showConfirm('Пробег меньше', `Новый пробег (${mileage.toLocaleString()} км) меньше предыдущего (${maxMileage.toLocaleString()} км). Продолжить?`, 'Продолжить', 'Отмена', 'warning')) return;
    }
    const item = {
        id: 'mileage_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        date: new Date().toISOString().split('T')[0],
        mileage: mileage,
        timestamp: new Date().toISOString(),
        source: 'manual'
    };
    mileageHistory.push(item);
    saveMileageHistory();
    await syncMileageToFirebase(item);
    updateMileageDisplay();
    input.value = '';
    showToast('Успех', `Пробег обновлён: ${mileage.toLocaleString()} км`, 'success');
}

async function deleteMileageRecord(id) {
    if (!await showConfirm('Удаление показания', 'Удалить это показание пробега?', 'Удалить', 'Отмена', 'danger')) return;
    mileageHistory = mileageHistory.filter(m => m.id !== id);
    saveMileageHistory();
    await deleteMileageFromFirebase(id);
    updateMileageDisplay();
    showToast('Успех', 'Показание удалено', 'success');
}

function getCurrentMileage() {
    let maxMileage = 0;
    if (records.length > 0) maxMileage = Math.max(...records.map(r => r.mileage || 0));
    if (fuelRecords.length > 0) maxMileage = Math.max(maxMileage, ...fuelRecords.map(r => r.mileage || 0));
    if (mileageHistory.length > 0) maxMileage = Math.max(maxMileage, ...mileageHistory.map(m => m.mileage));
    return maxMileage;
}

// ===== БЫСТРОЕ ДОБАВЛЕНИЕ (FAB) =====
function openQuickAddModal() {
    const modal = document.getElementById('quick-add-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeQuickAddModal() {
    const modal = document.getElementById('quick-add-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function quickAddRecord(type) {
    closeQuickAddModal();
    const addTab = document.getElementById('tab-add');
    const navBtns = document.querySelectorAll('.nav-btn');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    if (addTab) addTab.classList.add('active');
    navBtns.forEach(b => b.classList.remove('active'));
    navBtns.forEach(b => {
        if (b.onclick && b.onclick.toString().includes("'add'")) b.classList.add('active');
    });
    const typeSelect = document.getElementById('record-type');
    if (typeSelect) typeSelect.value = type;
    const dateInput = document.getElementById('record-date');
    if (dateInput) dateInput.focus();
    showToast('Подсказка', `Выбран тип: ${getTypeName(type)}`, 'info', 3000);
}

function quickAddFuel() {
    closeQuickAddModal();
    const moreTab = document.getElementById('tab-more');
    const navBtns = document.querySelectorAll('.nav-btn');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    if (moreTab) moreTab.classList.add('active');
    navBtns.forEach(b => b.classList.remove('active'));
    navBtns.forEach(b => {
        if (b.onclick && b.onclick.toString().includes("'more'")) b.classList.add('active');
    });
    showMoreSection('fuel');
    setTimeout(() => {
        const dateInput = document.getElementById('fuel-date');
        if (dateInput) dateInput.focus();
    }, 300);
    showToast('Подсказка', 'Открыта форма добавления заправки', 'info', 3000);
}

function quickAddService() {
    closeQuickAddModal();
    const moreTab = document.getElementById('tab-more');
    const navBtns = document.querySelectorAll('.nav-btn');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    if (moreTab) moreTab.classList.add('active');
    navBtns.forEach(b => b.classList.remove('active'));
    navBtns.forEach(b => {
        if (b.onclick && b.onclick.toString().includes("'more'")) b.classList.add('active');
    });
    showMoreSection('garage');
    setTimeout(() => {
        const nameInput = document.getElementById('service-name');
        if (nameInput) nameInput.focus();
    }, 300);
    showToast('Подсказка', 'Открыта форма добавления сервиса', 'info', 3000);
}

function quickAddMileage() {
    closeQuickAddModal();
    const profileTab = document.getElementById('tab-profile');
    const navBtns = document.querySelectorAll('.nav-btn');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    if (profileTab) profileTab.classList.add('active');
    navBtns.forEach(b => b.classList.remove('active'));
    navBtns.forEach(b => {
        if (b.onclick && b.onclick.toString().includes("'profile'")) b.classList.add('active');
    });
    setTimeout(() => {
        const mileageInput = document.getElementById('quick-mileage-input');
        if (mileageInput) {
            mileageInput.focus();
            const currentMileage = getCurrentMileage();
            if (currentMileage > 0) {
                mileageInput.placeholder = `Текущий: ${currentMileage.toLocaleString()} км`;
            }
        }
    }, 300);
    showToast('Подсказка', 'Введите текущий пробег', 'info', 3000);
}

function getTypeName(type) {
    const names = {
        'repair': 'Ремонт', 'oil': 'Замена масла',
        'maintenance': 'ТО', 'tire': 'Шиномонтаж', 'other': 'Другое'
    };
    return names[type] || type;
}

// ===== ЭКСПОРТ/ИМПОРТ =====
function exportData() {
    showLoading('Экспорт...');
    const data = {
        records, fuelRecords, profile, services, warranties,
        notifications, notificationSettings, mileageHistory,
        exportDate: new Date().toISOString(), version: '5.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `car-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    hideLoading();
    showToast('Успех', 'Данные экспортированы!', 'success');
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    showLoading('Импорт...');
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const recordsArray = Array.isArray(data.records) ? data.records : (Array.isArray(data) ? data : []);
            const importedFuel = Array.isArray(data.fuelRecords) ? data.fuelRecords : [];
            const importedProfile = data.profile || null;
            const importedServices = Array.isArray(data.services) ? data.services : [];
            const importedWarranties = Array.isArray(data.warranties) ? data.warranties : [];
            const importedNotifications = Array.isArray(data.notifications) ? data.notifications : [];
            const importedSettings = data.notificationSettings || null;
            const importedMileage = Array.isArray(data.mileageHistory) ? data.mileageHistory : [];

            if (!await showConfirm('Импорт данных', `Импортировать ${recordsArray.length} записей, ${importedFuel.length} заправок, ${importedServices.length} сервисов, ${importedWarranties.length} гарантий?`, 'Импортировать', 'Отмена', 'info')) {
                hideLoading();
                return;
            }

            records = recordsArray;
            fuelRecords = importedFuel;
            services = importedServices;
            warranties = importedWarranties;
            notifications = importedNotifications;
            mileageHistory = importedMileage;

            if (importedSettings) {
                notificationSettings = importedSettings;
                saveNotificationSettingsLocal();
                fillNotificationSettings();
                await syncNotificationSettingsToFirebase();
            }

            if (importedProfile) {
                profile = importedProfile;
                saveProfileLocal();
                fillProfileForm();
                updateCarBrief();
                updateProfilePreview();
            }

            saveLocal();
            saveFuelLocal();
            saveServicesLocal();
            saveWarrantiesLocal();
            saveNotificationsLocal();
            saveMileageHistory();

            if (isFirebaseConnected && db) {
                const batch = writeBatch(db);
                records.forEach(r => batch.set(doc(db, COLLECTION_RECORDS, r.id), r));
                fuelRecords.forEach(r => batch.set(doc(db, COLLECTION_FUEL, r.id), r));
                services.forEach(r => batch.set(doc(db, COLLECTION_SERVICES, r.id), r));
                warranties.forEach(r => batch.set(doc(db, COLLECTION_WARRANTIES, r.id), r));
                notifications.forEach(r => batch.set(doc(db, COLLECTION_NOTIFICATIONS, r.id), r));
                mileageHistory.forEach(r => batch.set(doc(db, COLLECTION_MILEAGE, r.id), r));
                if (profile) batch.set(doc(db, COLLECTION_PROFILE, PROFILE_DOC_ID), profile);
                await batch.commit();
            }

            updateServiceSelects();
            updateUnifiedHistory();
            updateStats();
            updateFuelStats();
            updateFuelHistory();
            updateFuelChart();
            updateGarageStats();
            updateServicesList();
            updateWarrantyStats();
            updateWarrantiesList();
            updateMaintenanceStatus();
            updateNotificationHistory();
            updateMileageDisplay();

            hideLoading();
            showToast('Успех', 'Данные импортированы!', 'success');
        } catch (err) {
            hideLoading();
            showToast('Ошибка', 'Ошибка импорта: ' + err.message, 'danger');
        }
    };
    reader.readAsText(file);
}

async function resetAllData() {
    if (!await showConfirm('Сброс данных', 'Все данные будут безвозвратно удалены! Это действие нельзя отменить!', 'Сбросить', 'Отмена', 'danger')) return;
    showLoading('Сброс...');
    records = [];
    fuelRecords = [];
    profile = null;
    services = [];
    warranties = [];
    notifications = [];
    mileageHistory = [];
    setDefaultNotificationSettings();

    localStorage.removeItem('car_records');
    localStorage.removeItem('car_fuel');
    localStorage.removeItem('car_profile');
    localStorage.removeItem('car_services');
    localStorage.removeItem('car_warranties');
    localStorage.removeItem('car_notifications');
    localStorage.removeItem('car_notification_settings');
    localStorage.removeItem('mileage_history');

    if (isFirebaseConnected && db) {
        try {
            const collections = [
                COLLECTION_RECORDS, COLLECTION_FUEL, COLLECTION_SERVICES,
                COLLECTION_WARRANTIES, COLLECTION_NOTIFICATIONS,
                COLLECTION_MILEAGE, COLLECTION_NOTIFICATION_SETTINGS
            ];
            for (const collectionName of collections) {
                const snap = await getDocs(collection(db, collectionName));
                const batch = writeBatch(db);
                snap.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        } catch (error) {
            console.error('Ошибка удаления из Firebase:', error);
        }
    }

    fillProfileForm();
    updateCarBrief();
    updateProfilePreview();
    updateServiceSelects();
    updateUnifiedHistory();
    updateStats();
    updateFuelStats();
    updateFuelHistory();
    updateFuelChart();
    updateGarageStats();
    updateServicesList();
    updateWarrantyStats();
    updateWarrantiesList();
    updateMaintenanceStatus();
    updateNotificationHistory();
    updateMileageDisplay();
    fillNotificationSettings();

    hideLoading();
    showToast('Успех', 'Данные сброшены!', 'success');
}

// ===== ЭКСПОРТ ФУНКЦИЙ =====
window.switchTab = switchTab;
window.showMoreSection = showMoreSection;
window.addPart = addPart;
window.addWork = addWork;
window.calculateTotal = calculateTotal;
window.saveRecord = saveRecord;
window.clearForm = clearForm;
window.filterHistory = filterHistory;
window.deleteRecord = deleteRecord;
window.editRecord = editRecord;
window.closeEditModal = closeEditModal;
window.closeServiceVisitModal = closeServiceVisitModal;
window.saveEditedRecord = saveEditedRecord;
window.addEditPart = addEditPart;
window.addEditWork = addEditWork;
window.saveProfile = saveProfile;
window.clearProfile = clearProfile;
window.saveFuelRecord = saveFuelRecord;
window.clearFuelForm = clearFuelForm;
window.deleteFuelRecord = deleteFuelRecord;
window.saveService = saveService;
window.clearServiceForm = clearServiceForm;
window.deleteService = deleteService;
window.editService = editService;
window.closeEditServiceModal = closeEditServiceModal;
window.saveEditedService = saveEditedService;
window.saveWarranty = saveWarranty;
window.clearWarrantyForm = clearWarrantyForm;
window.deleteWarranty = deleteWarranty;
window.showToast = showToast;
window.showConfirm = showConfirm;
window.saveNotificationSettings = saveNotificationSettings;
window.updateMileage = updateMileage;
window.deleteMileageRecord = deleteMileageRecord;
window.exportData = exportData;
window.importData = importData;
window.resetAllData = resetAllData;
window.openQuickAddModal = openQuickAddModal;
window.closeQuickAddModal = closeQuickAddModal;
window.quickAddRecord = quickAddRecord;
window.quickAddFuel = quickAddFuel;
window.quickAddService = quickAddService;
window.quickAddMileage = quickAddMileage;
window.logoutUser = logoutUser;