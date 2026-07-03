// ===== ИМПОРТ FIREBASE =====
import { db, auth } from './firebase-config.js';
import { collection, doc, getDocs, setDoc, deleteDoc, writeBatch, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// ===== БЕЗОПАСНОСТЬ: ЭКРАНИРОВАНИЕ HTML =====
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

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

// ===== ОЧИСТКА ВСЕХ ЛОКАЛЬНЫХ ДАННЫХ =====
function clearAllLocalData() {
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
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚗 App started');
    showLoading('Загрузка локальных данных...');
    
    try {
        setupAuthListener();
        
        loadProfile();
        loadData();
        loadFuelData();
        loadServices();
        loadWarranties();
        loadNotifications();
        await loadNotificationSettings();
        await loadMileageHistory();
        
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

// Переключение табов Вход/Регистрация
function switchAuthTab(tab) {
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');
    
    tabs.forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    
    forms.forEach(f => {
        f.classList.toggle('active', f.id === `${tab}-form`);
    });
    
    // Очищаем ошибки
    document.getElementById('login-error').classList.remove('show');
    document.getElementById('register-error').classList.remove('show');
    document.getElementById('login-error').textContent = '';
    document.getElementById('register-error').textContent = '';
}

// Показ/скрытие пароля
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const button = input.parentElement.querySelector('.toggle-password');
    const icon = button?.querySelector('ion-icon');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon?.setAttribute('name', 'eye-off-outline');
    } else {
        input.type = 'password';
        icon?.setAttribute('name', 'eye-outline');
    }
}

// Проверка сложности пароля
function checkPasswordStrength(password) {
    const strengthBar = document.getElementById('password-strength');
    if (!strengthBar) return;
    
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    strengthBar.className = 'password-strength';
    
    if (password.length === 0) {
        strengthBar.classList.remove('weak', 'medium', 'strong');
    } else if (strength <= 2) {
        strengthBar.classList.add('weak');
    } else if (strength <= 4) {
        strengthBar.classList.add('medium');
    } else {
        strengthBar.classList.add('strong');
    }
}

// Сообщения об ошибках авторизации
function getAuthErrorMessage(errorCode) {
    const messages = {
        'auth/email-already-in-use': 'Этот email уже зарегистрирован',
        'auth/invalid-email': 'Некорректный email',
        'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов)',
        'auth/user-not-found': 'Пользователь не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/invalid-credential': 'Неверный email или пароль',
        'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже',
        'auth/network-request-failed': 'Ошибка сети. Проверьте подключение'
    };
    return messages[errorCode] || 'Произошла ошибка. Попробуйте еще раз';
}

// Настройка UI авторизации
function setupAuthUI() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const passwordInput = document.getElementById('register-password');
    
    // Обработчик ввода пароля для индикатора сложности
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            checkPasswordStrength(this.value);
        });
    }
    
    // === ЛОГИКА ВХОДА ===
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            
            if (!email || !password) {
                errorEl.textContent = 'Заполните все поля';
                errorEl.classList.add('show');
                return;
            }
            
            errorEl.classList.remove('show');
            errorEl.textContent = '';
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error('Auth error:', error);
                errorEl.textContent = getAuthErrorMessage(error.code);
                errorEl.classList.add('show');
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        });
    }
    
    // === ЛОГИКА РЕГИСТРАЦИИ ===
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('register-name').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value;
            const confirm = document.getElementById('register-confirm').value;
            const errorEl = document.getElementById('register-error');
            const submitBtn = registerForm.querySelector('button[type="submit"]');
            
            // Валидация
            if (!name || !email || !password || !confirm) {
                errorEl.textContent = 'Заполните все поля';
                errorEl.classList.add('show');
                return;
            }
            
            if (password.length < 6) {
                errorEl.textContent = 'Пароль должен содержать минимум 6 символов';
                errorEl.classList.add('show');
                return;
            }
            
            if (password !== confirm) {
                errorEl.textContent = 'Пароли не совпадают';
                errorEl.classList.add('show');
                return;
            }
            
            errorEl.classList.remove('show');
            errorEl.textContent = '';
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                
                // Сохраняем имя пользователя
                await userCredential.user.updateProfile({
                    displayName: name
                });
                
                // Создаем документ пользователя в Firestore
                await setDoc(doc(db, 'users', userCredential.user.uid), {
                    name: name,
                    email: email,
                    createdAt: serverTimestamp()
                });
                
                showToast('Успех', 'Аккаунт создан! Загружаем данные...', 'success');
            } catch (error) {
                console.error('Registration error:', error);
                errorEl.textContent = getAuthErrorMessage(error.code);
                errorEl.classList.add('show');
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        });
    }
}

// Слушатель состояния аутентификации
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        const authOverlay = document.getElementById('auth-overlay');
        const container = document.querySelector('.container');
        const bottomNav = document.querySelector('.bottom-nav');
        
        if (user) {
            // Пользователь вошёл
            if (authOverlay) authOverlay.style.display = 'none';
            if (container) container.style.display = 'block';
            if (bottomNav) bottomNav.style.display = 'flex';
            
            isFirebaseConnected = true;
            updateSyncStatus('connected');
            
            console.log('✅ Authenticated as:', user.uid);
            
            // Очищаем локальные данные предыдущего пользователя
            clearAllLocalData();
            
            showLoading('Синхронизация...');
            
            try {
                // Загружаем все данные пользователя из Firebase
                await syncFromFirebase();
                await syncFuelFromFirebase();
                await syncProfileFromFirebase();
                await syncServicesFromFirebase();
                await syncWarrantiesFromFirebase();
                await syncNotificationsFromFirebase();
                await syncMileageFromFirebase();
                await syncNotificationSettingsFromFirebase();
                
                // Обновляем весь интерфейс
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
                fillProfileForm();
                updateCarBrief();
                updateProfilePreview();
                fillNotificationSettings();
                checkNotifications();
                
                console.log('✅ Firebase sync complete');
            } catch (error) {
                console.error('❌ Sync error:', error);
                updateSyncStatus('error');
                showToast('Ошибка', 'Не удалось загрузить данные', 'danger');
            } finally {
                hideLoading();
            }
        } else {
            // Пользователь вышел
            if (authOverlay) authOverlay.style.display = 'flex';
            if (container) container.style.display = 'none';
            if (bottomNav) bottomNav.style.display = 'none';
            
            isFirebaseConnected = false;
            updateSyncStatus('local');
            
            clearAllLocalData();
        }
    });
}

// Выход из системы
async function logoutUser() {
    if (!await showConfirm('Выход из системы', 'Вы уверены, что хотите выйти?', 'Выйти', 'Отмена', 'warning')) return;
    
    showLoading('Выход...');
    
    try {
        clearAllLocalData();
        await signOut(auth);
        showToast('Успех', 'Вы вышли из системы', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Ошибка', 'Не удалось выйти', 'danger');
    } finally {
        hideLoading();
    }
}

// ===== FIREBASE ФУНКЦИИ С userId =====
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

// ===== ЗАПИСИ (RECORDS) =====
async function syncFromFirebase() {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        const q = query(
            collection(db, COLLECTION_RECORDS), 
            where("userId", "==", auth.currentUser.uid)
        );
        const snap = await getDocs(q);
        const data = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() }));
        if (data.length > 0) {
            records = data;
            saveLocal();
            updateUnifiedHistory();
            updateStats();
        }
    } catch (error) {
        console.error('Ошибка синхронизации записей:', error);
    }
}

async function syncRecordToFirebase(record) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await setDoc(doc(db, COLLECTION_RECORDS, record.id), { 
            ...record, 
            userId: auth.currentUser.uid,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка сохранения записи:', error);
    }
}

async function deleteRecordFromFirebase(id) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await deleteDoc(doc(db, COLLECTION_RECORDS, id));
    } catch (error) {
        console.error('Ошибка удаления записи:', error);
    }
}

// ===== ТОПЛИВО (FUEL) =====
async function syncFuelFromFirebase() {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        const q = query(
            collection(db, COLLECTION_FUEL), 
            where("userId", "==", auth.currentUser.uid)
        );
        const snap = await getDocs(q);
        const data = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() }));
        if (data.length > 0) {
            fuelRecords = data;
            saveFuelLocal();
            updateFuelStats();
            updateFuelHistory();
            updateFuelChart();
        }
    } catch (error) {
        console.error('Ошибка синхронизации заправок:', error);
    }
}

async function syncFuelToFirebase(record) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await setDoc(doc(db, COLLECTION_FUEL, record.id), { 
            ...record, 
            userId: auth.currentUser.uid,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка сохранения заправки:', error);
    }
}

async function deleteFuelFromFirebase(id) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await deleteDoc(doc(db, COLLECTION_FUEL, id));
    } catch (error) {
        console.error('Ошибка удаления заправки:', error);
    }
}

// ===== ПРОФИЛЬ (PROFILE) =====
async function syncProfileFromFirebase() {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        const q = query(
            collection(db, COLLECTION_PROFILE), 
            where("userId", "==", auth.currentUser.uid)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
            const d = snap.docs[0];
            profile = { id: d.id, ...d.data() };
            saveProfileLocal();
            fillProfileForm();
            updateCarBrief();
            updateProfilePreview();
        }
    } catch (error) {
        console.error('Ошибка синхронизации профиля:', error);
    }
}

async function syncProfileToFirebase(data) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        const profileId = 'profile_' + auth.currentUser.uid;
        await setDoc(doc(db, COLLECTION_PROFILE, profileId), { 
            ...data, 
            userId: auth.currentUser.uid,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка сохранения профиля:', error);
    }
}

// ===== СЕРВИСЫ (SERVICES) =====
async function syncServicesFromFirebase() {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        const q = query(
            collection(db, COLLECTION_SERVICES), 
            where("userId", "==", auth.currentUser.uid)
        );
        const snap = await getDocs(q);
        const data = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() }));
        if (data.length > 0) {
            services = data;
            saveServicesLocal();
            updateServiceSelects();
            updateGarageStats();
            updateServicesList();
        }
    } catch (error) {
        console.error('Ошибка синхронизации сервисов:', error);
    }
}

async function syncServiceToFirebase(service) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await setDoc(doc(db, COLLECTION_SERVICES, service.id), { 
            ...service, 
            userId: auth.currentUser.uid,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка сохранения сервиса:', error);
    }
}

async function deleteServiceFromFirebase(id) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await deleteDoc(doc(db, COLLECTION_SERVICES, id));
    } catch (error) {
        console.error('Ошибка удаления сервиса:', error);
    }
}

// ===== ГАРАНТИИ (WARRANTIES) =====
async function syncWarrantiesFromFirebase() {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        const q = query(
            collection(db, COLLECTION_WARRANTIES), 
            where("userId", "==", auth.currentUser.uid)
        );
        const snap = await getDocs(q);
        const data = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() }));
        if (data.length > 0) {
            warranties = data;
            saveWarrantiesLocal();
            updateWarrantyStats();
            updateWarrantiesList();
        }
    } catch (error) {
        console.error('Ошибка синхронизации гарантий:', error);
    }
}

async function syncWarrantyToFirebase(warranty) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await setDoc(doc(db, COLLECTION_WARRANTIES, warranty.id), { 
            ...warranty, 
            userId: auth.currentUser.uid,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка сохранения гарантии:', error);
    }
}

async function deleteWarrantyFromFirebase(id) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await deleteDoc(doc(db, COLLECTION_WARRANTIES, id));
    } catch (error) {
        console.error('Ошибка удаления гарантии:', error);
    }
}

// ===== УВЕДОМЛЕНИЯ (NOTIFICATIONS) =====
async function syncNotificationsFromFirebase() {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        const q = query(
            collection(db, COLLECTION_NOTIFICATIONS), 
            where("userId", "==", auth.currentUser.uid)
        );
        const snap = await getDocs(q);
        const data = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() }));
        if (data.length > 0) {
            notifications = data;
            saveNotificationsLocal();
            updateNotificationHistory();
        }
    } catch (error) {
        console.error('Ошибка синхронизации уведомлений:', error);
    }
}

async function syncNotificationToFirebase(notification) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await setDoc(doc(db, COLLECTION_NOTIFICATIONS, notification.id), { 
            ...notification, 
            userId: auth.currentUser.uid,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка сохранения уведомления:', error);
    }
}

// ===== ПРОБЕГ (MILEAGE) =====
async function syncMileageFromFirebase() {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        const q = query(
            collection(db, COLLECTION_MILEAGE), 
            where("userId", "==", auth.currentUser.uid)
        );
        const snap = await getDocs(q);
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
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await setDoc(doc(db, COLLECTION_MILEAGE, item.id), { 
            ...item, 
            userId: auth.currentUser.uid,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка сохранения пробега в Firebase:', error);
    }
}

async function deleteMileageFromFirebase(id) {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        await deleteDoc(doc(db, COLLECTION_MILEAGE, id));
    } catch (error) {
        console.error('Ошибка удаления пробега из Firebase:', error);
    }
}

// ===== НАСТРОЙКИ УВЕДОМЛЕНИЙ (NOTIFICATION SETTINGS) =====
async function syncNotificationSettingsFromFirebase() {
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        const q = query(
            collection(db, COLLECTION_NOTIFICATION_SETTINGS), 
            where("userId", "==", auth.currentUser.uid)
        );
        const snap = await getDocs(q);
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
    if (!isFirebaseConnected || !auth.currentUser) return;
    try {
        const settingsId = 'settings_' + auth.currentUser.uid;
        await setDoc(doc(db, COLLECTION_NOTIFICATION_SETTINGS, settingsId), {
            ...notificationSettings,
            userId: auth.currentUser.uid,
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

async function loadNotificationSettings() {
    if (isFirebaseConnected && db && auth.currentUser) {
        try {
            const q = query(collection(db, COLLECTION_NOTIFICATION_SETTINGS), where("userId", "==", auth.currentUser.uid));
            const snap = await getDocs(q);
            
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
                setDefaultNotificationSettings();
            }
        } catch (error) {
            console.error('Ошибка загрузки настроек:', error);
            setDefaultNotificationSettings();
        }
    } else {
        setDefaultNotificationSettings();
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
        el.innerHTML = `<ion-icon name="car-sport-outline"></ion-icon><span>${escapeHtml(name)} ${escapeHtml(year)}</span>`;
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
        userId: auth.currentUser?.uid,
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
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
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
        };
        
        okBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        
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
        'oilFilter': 'oilFilter',
        'airFilter': 'airFilter',
        'cabinFilter': 'cabinFilter',
        'sparkPlugs': 'sparkPlugs',
        'brakePads': 'brakePads',
        'coolant': 'coolant',
        'brakeFluid': 'brakeFluid',
        'transmissionFluid': 'transmissionFluid',
        'tires': 'tires',
        'battery': 'battery',
        'wipers': 'wipers',
        'maintenance': 'maintenance'
    };
    
    const serviceType = typeMap[type];
    const relevantRecords = records.filter(r => r.serviceItems && r.serviceItems.includes(serviceType));
    
    if (relevantRecords.length === 0) {
        const oldTypeMap = {
            'oil': 'oil',
            'airFilter': 'maintenance',
            'sparkPlugs': 'maintenance',
            'brakePads': 'repair',
            'maintenance': 'maintenance',
            'coolant': 'maintenance'
        };
        const oldServiceType = oldTypeMap[type];
        const oldRecords = records.filter(r => r.type === oldServiceType);
        if (oldRecords.length === 0) return null;
        const lastRecord = oldRecords.reduce((prev, current) => (prev.mileage > current.mileage) ? prev : current);
        return lastRecord.mileage;
    }
    
    const lastRecord = relevantRecords.reduce((prev, current) => (prev.mileage > current.mileage) ? prev : current);
    return lastRecord.mileage;
}

function updateMaintenanceStatus() {
    const list = document.getElementById('maintenance-status-list');
    if (!list) return;
    
    const currentMileage = getCurrentMileage();
    const items = [
        { id: 'oil', name: 'Замена масла', icon: 'drop-outline', interval: notificationSettings.oilInterval },
        { id: 'oilFilter', name: 'Масляный фильтр', icon: 'disc-outline', interval: notificationSettings.oilInterval },
        { id: 'airFilter', name: 'Воздушный фильтр', icon: 'air-outline', interval: notificationSettings.airFilterInterval },
        { id: 'cabinFilter', name: 'Салонный фильтр', icon: 'leaf-outline', interval: notificationSettings.airFilterInterval },
        { id: 'sparkPlugs', name: 'Свечи зажигания', icon: 'flame-outline', interval: notificationSettings.sparkPlugsInterval },
        { id: 'brakePads', name: 'Тормозные колодки', icon: 'disc-outline', interval: notificationSettings.brakePadsInterval },
        { id: 'coolant', name: 'Охлаждающая жидкость', icon: 'thermometer-outline', interval: notificationSettings.coolantInterval },
        { id: 'brakeFluid', name: 'Тормозная жидкость', icon: 'water-outline', interval: notificationSettings.brakePadsInterval },
        { id: 'transmissionFluid', name: 'Трансмиссионное масло', icon: 'settings-outline', interval: notificationSettings.maintenanceInterval },
        { id: 'tires', name: 'Шины/Колёса', icon: 'car-outline', interval: notificationSettings.maintenanceInterval },
        { id: 'battery', name: 'Аккумулятор', icon: 'battery-full-outline', interval: 60000 },
        { id: 'wipers', name: 'Дворники', icon: 'rainy-outline', interval: 10000 }
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
    
    // Получаем время последнего уведомления каждого типа из localStorage
    const lastNotificationTimes = JSON.parse(localStorage.getItem('last_notification_times') || '{}');
    
    const items = [
        { id: 'oil', name: 'Замена масла', icon: 'drop-outline', interval: notificationSettings.oilInterval },
        { id: 'oilFilter', name: 'Масляный фильтр', icon: 'disc-outline', interval: notificationSettings.oilInterval },
        { id: 'airFilter', name: 'Воздушный фильтр', icon: 'air-outline', interval: notificationSettings.airFilterInterval },
        { id: 'cabinFilter', name: 'Салонный фильтр', icon: 'leaf-outline', interval: notificationSettings.airFilterInterval },
        { id: 'sparkPlugs', name: 'Свечи зажигания', icon: 'flame-outline', interval: notificationSettings.sparkPlugsInterval },
        { id: 'brakePads', name: 'Тормозные колодки', icon: 'disc-outline', interval: notificationSettings.brakePadsInterval },
        { id: 'coolant', name: 'Охлаждающая жидкость', icon: 'thermometer-outline', interval: notificationSettings.coolantInterval },
        { id: 'brakeFluid', name: 'Тормозная жидкость', icon: 'water-outline', interval: notificationSettings.brakePadsInterval },
        { id: 'transmissionFluid', name: 'Трансмиссионное масло', icon: 'settings-outline', interval: notificationSettings.maintenanceInterval },
        { id: 'tires', name: 'Шины/Колёса', icon: 'car-outline', interval: notificationSettings.maintenanceInterval },
        { id: 'battery', name: 'Аккумулятор', icon: 'battery-full-outline', interval: 60000 },
        { id: 'wipers', name: 'Дворники', icon: 'rainy-outline', interval: 10000 }
    ];
    
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
    let hasNewNotification = false;
    
    items.forEach(item => {
        const lastMileage = getLastServiceMileage(item.id);
        const nextMileage = lastMileage ? lastMileage + item.interval : item.interval;
        const remaining = nextMileage - currentMileage;
        
        // Проверяем, когда было последнее уведомление этого типа
        const lastTime = lastNotificationTimes[item.id] || 0;
        const timeSinceLast = now - lastTime;
        
        // Если прошло меньше 24 часов - пропускаем
        if (timeSinceLast < TWENTY_FOUR_HOURS) {
            return;
        }
        
        let notification = null;
        
        if (remaining <= item.interval * 0.2 && remaining > 0) {
            notification = {
                id: 'notif_' + Date.now() + '_' + item.id,
                type: 'warning',
                title: `Требуется ${item.name.toLowerCase()}`,
                message: `Осталось ${remaining.toLocaleString()} км до следующего обслуживания`,
                timestamp: new Date().toISOString()
            };
        } else if (remaining <= 0) {
            notification = {
                id: 'notif_' + Date.now() + '_' + item.id,
                type: 'danger',
                title: `Просрочено: ${item.name.toLowerCase()}`,
                message: `Необходимо срочно выполнить обслуживание!`,
                timestamp: new Date().toISOString()
            };
        }
        
        // Если создали уведомление - добавляем и обновляем время
        if (notification) {
            notifications.push(notification);
            lastNotificationTimes[item.id] = now;
            hasNewNotification = true;
            
            // Показываем toast
            if (notification.type === 'danger') {
                showToast('⚠️ Срочно', `${item.name}: обслуживание просрочено!`, 'danger', 7000);
            } else {
                showToast('🔧 Обслуживание', `${item.name}: осталось ${remaining.toLocaleString()} км`, 'warning', 7000);
            }
        }
    });
    
    // Ограничиваем историю до 15 последних уведомлений
    if (notifications.length > 15) {
        notifications = notifications.slice(-15);
    }
    
    // Сохраняем время последнего уведомления
    localStorage.setItem('last_notification_times', JSON.stringify(lastNotificationTimes));
    
    // Сохраняем уведомления только если были новые
    if (hasNewNotification) {
        saveNotificationsLocal();
        // Синхронизируем только последние 15 уведомлений
        notifications.forEach(n => syncNotificationToFirebase(n));
    }
    
    updateNotificationHistory();
}

function updateNotificationHistory() {
    const list = document.getElementById('notification-history-list');
    if (!list) return;
    
    if (notifications.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет уведомлений</p>';
        return;
    }
    
    // Сортируем по времени (новые сверху) и берем только последние 15
    const sorted = [...notifications]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 15);
    
    list.innerHTML = sorted.map(n => {
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
                    <div class="notification-history-title">${escapeHtml(n.title)}</div>
                    <div class="notification-history-message">${escapeHtml(n.message)}</div>
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
        userId: auth.currentUser?.uid,
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
                    <span class="fuel-history-detail-value fuel-history-consumption">${r.consumption ? escapeHtml(r.consumption.toFixed(2) + ' л/100км') : '—'}</span>
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
            select.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
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
        userId: auth.currentUser?.uid,
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
                const descHTML = v.description ? `<div class="visit-description">${escapeHtml(v.description)}</div>` : '';
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
            visitsHTML = `<div class="service-visits"><h4>История посещений (${s.visits.length})</h4>${visitsList}</div>`;
        } else {
            visitsHTML = '<p class="hint-text" style="margin-top: 12px;">Нет посещений</p>';
        }
        
        const addressHTML = s.address ? `<div class="service-info-item"><ion-icon name="location-outline"></ion-icon><span>${escapeHtml(s.address)}</span></div>` : '';
        const phoneHTML = s.phone ? `<div class="service-info-item"><ion-icon name="call-outline"></ion-icon><span>${escapeHtml(s.phone)}</span></div>` : '';
        const notesHTML = s.notes ? `<div class="service-info-item"><ion-icon name="document-text-outline"></ion-icon><span>${escapeHtml(s.notes)}</span></div>` : '';
        
        return `
            <div class="service-card">
                <div class="service-header">
                    <div class="service-name">${escapeHtml(s.name)}</div>
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
        userId: auth.currentUser?.uid,
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
        userId: auth.currentUser?.uid,
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
                    <div class="warranty-part-name">${escapeHtml(w.part)}</div>
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
                ${service ? `<div class="warranty-notes"><ion-icon name="business-outline"></ion-icon>${escapeHtml(service.name)}</div>` : ''}
                ${w.notes ? `<div class="warranty-notes">${escapeHtml(w.notes)}</div>` : ''}
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
    
    const serviceItems = [];
    document.querySelectorAll('input[name="service-item"]:checked').forEach(cb => {
        serviceItems.push(cb.value);
    });
    
    const partsTotal = parts.reduce((s, p) => s + p.cost, 0);
    const worksTotal = works.reduce((s, w) => s + w.cost, 0);
    
    const record = {
        id: 'record_' + Date.now(),
        userId: auth.currentUser?.uid,
        date, mileage, type, description, serviceId,
        parts, works, partsTotal, worksTotal,
        total: partsTotal + worksTotal,
        serviceItems: serviceItems,
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
    document.querySelectorAll('input[name="service-item"]').forEach(cb => cb.checked = false);
    
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
        
        html += `
            <div class="month-group">
                <div class="month-header">
                    <h3>${monthNames[month]} ${year}</h3>
                    <span class="month-total">${monthTotal.toFixed(2)} ₽</span>
                </div>
                <div class="month-items">
        `;
        
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
                            ${event.parts.map(p => `<li>${escapeHtml(p.name)} - ${p.cost.toFixed(2)} ₽</li>`).join('')}
                        </ul>
                    </div>
                ` : '';
                
                const worksHTML = event.works && event.works.length > 0 ? `
                    <div class="history-works">
                        <h4>Работы:</h4>
                        <ul class="history-works-list">
                            ${event.works.map(w => `<li>${escapeHtml(w.name)} - ${w.cost.toFixed(2)} ₽</li>`).join('')}
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
                        ${service ? `<div class="history-mileage"><ion-icon name="business-outline"></ion-icon>Сервис: ${escapeHtml(service.name)}</div>` : ''}
                        ${event.description ? `<div class="history-description">${escapeHtml(event.description)}</div>` : ''}
                        ${event.serviceItems && event.serviceItems.length > 0 ? `
                            <div class="history-service-items">
                                <h4>Выполнено:</h4>
                                <div class="service-items-tags">
                                    ${event.serviceItems.map(item => {
                                        const names = {
                                            'oil': '🛢️ Масло', 'oilFilter': '🔵 Масляный фильтр',
                                            'airFilter': '💨 Воздушный фильтр', 'cabinFilter': '🌬️ Салонный фильтр',
                                            'sparkPlugs': '⚡ Свечи', 'brakePads': '🔴 Колодки',
                                            'coolant': '❄️ Охлаждающая', 'brakeFluid': '💧 Тормозная жидкость',
                                            'transmissionFluid': '⚙️ Трансмиссия', 'tires': '🛞 Шины',
                                            'battery': '🔋 Аккумулятор', 'wipers': '🌧️ Дворники'
                                        };
                                        return `<span class="service-item-tag">${names[item] || item}</span>`;
                                    }).join('')}
                                </div>
                            </div>
                        ` : ''}
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
        
        html += '</div></div>';
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
    
    modalTitle.innerHTML = '<ion-icon name="create-outline"></ion-icon>Редактирование';
    
    const serviceItems = record.serviceItems || [];
    const allServiceItems = [
        { value: 'oil', icon: '🛢️', name: 'Масло' },
        { value: 'oilFilter', icon: '🔵', name: 'Масляный фильтр' },
        { value: 'airFilter', icon: '💨', name: 'Воздушный фильтр' },
        { value: 'cabinFilter', icon: '🌬️', name: 'Салонный фильтр' },
        { value: 'sparkPlugs', icon: '⚡', name: 'Свечи зажигания' },
        { value: 'brakePads', icon: '🔴', name: 'Тормозные колодки' },
        { value: 'coolant', icon: '❄️', name: 'Охлаждающая жидкость' },
        { value: 'brakeFluid', icon: '💧', name: 'Тормозная жидкость' },
        { value: 'transmissionFluid', icon: '⚙️', name: 'Трансмиссионное масло' },
        { value: 'tires', icon: '🛞', name: 'Шины/Колёса' },
        { value: 'battery', icon: '🔋', name: 'Аккумулятор' },
        { value: 'wipers', icon: '🌧️', name: 'Дворники' }
    ];
    
    const serviceItemsHTML = allServiceItems.map(item => `
        <label class="service-item-checkbox">
            <input type="checkbox" name="edit-service-item" value="${item.value}" ${serviceItems.includes(item.value) ? 'checked' : ''}>
            <span class="service-item-icon">${item.icon}</span>
            <span class="service-item-name">${item.name}</span>
        </label>
    `).join('');
    
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
                    ${services.map(s => `<option value="${s.id}" ${record.serviceId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Описание</label>
                <input type="text" id="edit-description" value="${escapeHtml(record.description || '')}">
            </div>
        </div>
        
        <div class="form-section">
            <h3>Что менялось?</h3>
            <div class="service-items-grid">
                ${serviceItemsHTML}
            </div>
        </div>
        
        <div class="form-section">
            <h3>Запчасти</h3>
            <div id="edit-parts-list">
                ${(record.parts || []).map(p => `
                    <div class="dynamic-item">
                        <input type="text" value="${escapeHtml(p.name)}" class="part-name">
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
                        <input type="text" value="${escapeHtml(w.name)}" class="work-name">
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
    document.querySelectorAll('input[name="edit-service-item"]').forEach(cb => cb.checked = false);
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
    
    const serviceItems = [];
    document.querySelectorAll('input[name="edit-service-item"]:checked').forEach(cb => {
        serviceItems.push(cb.value);
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
        userId: auth.currentUser?.uid,
        date, mileage, type, description, serviceId,
        parts, works, partsTotal, worksTotal,
        total: partsTotal + worksTotal,
        serviceItems: serviceItems,
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
    
    const lastMileage = getCurrentMileage();
    
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
    if (isFirebaseConnected && db && auth.currentUser) {
        try {
            const q = query(collection(db, COLLECTION_MILEAGE), where("userId", "==", auth.currentUser.uid));
            const snap = await getDocs(q);
            
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
        userId: auth.currentUser?.uid,
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
        'repair': 'Ремонт',
        'oil': 'Замена масла',
        'maintenance': 'ТО',
        'tire': 'Шиномонтаж',
        'other': 'Другое'
    };
    return names[type] || type;
}

// ===== ЭКСПОРТ/ИМПОРТ =====
function exportData() {
    showLoading('Экспорт...');
    
    const data = {
        records,
        fuelRecords,
        profile,
        services,
        warranties,
        notifications,
        notificationSettings,
        mileageHistory,
        exportDate: new Date().toISOString(),
        version: '5.0'
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
            
            if (!await showConfirm('Импорт данных', 
                `Импортировать ${recordsArray.length} записей, ${importedFuel.length} заправок, ${importedServices.length} сервисов, ${importedWarranties.length} гарантий?`, 
                'Импортировать', 'Отмена', 'info')) {
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

            // Синхронизация с Firebase с userId
            if (isFirebaseConnected && db && auth.currentUser) {
                const batch = writeBatch(db);
                
                records.forEach(r => {
                    batch.set(doc(db, COLLECTION_RECORDS, r.id), {
                        ...r,
                        userId: auth.currentUser.uid,
                        updatedAt: new Date().toISOString()
                    });
                });
                fuelRecords.forEach(r => {
                    batch.set(doc(db, COLLECTION_FUEL, r.id), {
                        ...r,
                        userId: auth.currentUser.uid,
                        updatedAt: new Date().toISOString()
                    });
                });
                services.forEach(r => {
                    batch.set(doc(db, COLLECTION_SERVICES, r.id), {
                        ...r,
                        userId: auth.currentUser.uid,
                        updatedAt: new Date().toISOString()
                    });
                });
                warranties.forEach(r => {
                    batch.set(doc(db, COLLECTION_WARRANTIES, r.id), {
                        ...r,
                        userId: auth.currentUser.uid,
                        updatedAt: new Date().toISOString()
                    });
                });
                notifications.forEach(r => {
                    batch.set(doc(db, COLLECTION_NOTIFICATIONS, r.id), {
                        ...r,
                        userId: auth.currentUser.uid,
                        updatedAt: new Date().toISOString()
                    });
                });
                mileageHistory.forEach(r => {
                    batch.set(doc(db, COLLECTION_MILEAGE, r.id), {
                        ...r,
                        userId: auth.currentUser.uid,
                        updatedAt: new Date().toISOString()
                    });
                });
                if (profile) {
                    batch.set(doc(db, COLLECTION_PROFILE, PROFILE_DOC_ID + '_' + auth.currentUser.uid), {
                        ...profile,
                        userId: auth.currentUser.uid,
                        updatedAt: new Date().toISOString()
                    });
                }
                if (importedSettings) {
                    batch.set(doc(db, COLLECTION_NOTIFICATION_SETTINGS, NOTIFICATION_SETTINGS_DOC_ID + '_' + auth.currentUser.uid), {
                        ...importedSettings,
                        userId: auth.currentUser.uid,
                        updatedAt: new Date().toISOString()
                    });
                }
                
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
    if (!await showConfirm(
        'Сброс данных', 
        'Все ваши данные будут безвозвратно удалены из облака и локально! Это действие нельзя отменить!', 
        'Сбросить', 
        'Отмена', 
        'danger'
    )) return;
    
    showLoading('Сброс данных...');
    
    try {
        // 1. Очищаем локальные переменные
        records = [];
        fuelRecords = [];
        profile = null;
        services = [];
        warranties = [];
        notifications = [];
        mileageHistory = [];
        setDefaultNotificationSettings();
        
        // 2. Очищаем localStorage
        localStorage.removeItem('car_records');
        localStorage.removeItem('car_fuel');
        localStorage.removeItem('car_profile');
        localStorage.removeItem('car_services');
        localStorage.removeItem('car_warranties');
        localStorage.removeItem('car_notifications');
        localStorage.removeItem('car_notification_settings');
        localStorage.removeItem('mileage_history');
        localStorage.removeItem('last_notification_times');
        
        // 3. Удаляем данные из Firebase (только текущего пользователя)
        if (isFirebaseConnected && db && auth.currentUser) {
            const userId = auth.currentUser.uid;
            
            const collections = [
                COLLECTION_RECORDS, 
                COLLECTION_FUEL, 
                COLLECTION_SERVICES,
                COLLECTION_WARRANTIES, 
                COLLECTION_NOTIFICATIONS,
                COLLECTION_MILEAGE
            ];
            
            for (const collectionName of collections) {
                try {
                    const q = query(
                        collection(db, collectionName), 
                        where("userId", "==", userId)
                    );
                    const snap = await getDocs(q);
                    
                    if (!snap.empty) {
                        // Firestore batch ограничен 500 операциями
                        const docsArray = [];
                        snap.forEach(d => docsArray.push(d.ref));
                        
                        // Удаляем батчами по 400 документов
                        for (let i = 0; i < docsArray.length; i += 400) {
                            const batch = writeBatch(db);
                            const chunk = docsArray.slice(i, i + 400);
                            chunk.forEach(ref => batch.delete(ref));
                            await batch.commit();
                        }
                        
                        console.log(`✅ Удалено ${docsArray.length} документов из ${collectionName}`);
                    }
                } catch (error) {
                    console.error(`❌ Ошибка удаления из ${collectionName}:`, error);
                }
            }
            
            // Удаляем профиль пользователя
            try {
                const profileId = 'profile_' + userId;
                const profileRef = doc(db, COLLECTION_PROFILE, profileId);
                await deleteDoc(profileRef);
                console.log('✅ Профиль удалён');
            } catch (error) {
                console.error('Ошибка удаления профиля:', error);
            }
            
            // Удаляем настройки уведомлений
            try {
                const settingsId = 'settings_' + userId;
                const settingsRef = doc(db, COLLECTION_NOTIFICATION_SETTINGS, settingsId);
                await deleteDoc(settingsRef);
                console.log('✅ Настройки удалены');
            } catch (error) {
                console.error('Ошибка удаления настроек:', error);
            }
        }
        
        // 4. Обновляем UI
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
        showToast('Успех', 'Все данные сброшены!', 'success');
        
    } catch (error) {
        console.error('❌ Критическая ошибка сброса:', error);
        hideLoading();
        showToast('Ошибка', 'Не удалось сбросить данные: ' + error.message, 'danger');
    }
}

// ===== УДАЛЕНИЕ АККАУНТА =====
async function deleteAccount() {
    if (!auth.currentUser) {
        showToast('Ошибка', 'Вы не авторизованы', 'danger');
        return;
    }

    if (!await showConfirm(
        'Удаление аккаунта', 
        'ВНИМАНИЕ! Ваш аккаунт и все данные будут безвозвратно удалены. Это действие нельзя отменить!', 
        'Удалить аккаунт', 
        'Отмена', 
        'danger'
    )) return;

    showLoading('Удаление аккаунта...');

    try {
        const userId = auth.currentUser.uid;

        // 1. Удаляем все данные пользователя из Firestore
        if (db) {
            const collections = [
                COLLECTION_RECORDS, 
                COLLECTION_FUEL, 
                COLLECTION_SERVICES,
                COLLECTION_WARRANTIES, 
                COLLECTION_NOTIFICATIONS,
                COLLECTION_MILEAGE, 
                COLLECTION_NOTIFICATION_SETTINGS,
                COLLECTION_PROFILE
            ];

            for (const collectionName of collections) {
                const snap = await getDocs(collection(db, collectionName));
                const batch = writeBatch(db);
                snap.forEach(d => {
                    const docData = d.data();
                    if (docData.userId === userId) {
                        batch.delete(d.ref);
                    }
                });
                await batch.commit();
            }
        }

        // 2. Очищаем локальные данные
        localStorage.clear();

        // 3. Удаляем аккаунт
        await auth.currentUser.delete();

        showToast('Успех', 'Аккаунт удалён', 'success');
        setTimeout(() => window.location.reload(), 2000);

    } catch (error) {
        console.error('Ошибка удаления аккаунта:', error);
        
        if (error.code === 'auth/requires-recent-login') {
            showToast('Ошибка', 'Для удаления аккаунта необходимо войти повторно', 'danger');
            await logoutUser();
        } else {
            showToast('Ошибка', 'Не удалось удалить аккаунт: ' + error.message, 'danger');
        }
    } finally {
        hideLoading();
    }
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
window.escapeHtml = escapeHtml;
window.deleteAccount = deleteAccount;
// ===== ЭКСПОРТ ФУНКЦИЙ =====
window.switchAuthTab = switchAuthTab;
window.togglePassword = togglePassword;
window.checkPasswordStrength = checkPasswordStrength;