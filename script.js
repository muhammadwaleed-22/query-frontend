const API_BASE = 'https://part2computer-app-backend.vercel.app';
const AUTH_TOKEN_KEY = 'auth_token';
const THEME_STORAGE_KEY = 'theme';
const LOGOUT_TIMEOUT_MS = 8000;
const MAX_BULK_DELETE_BATCH = 100;

let activeSessionVersion = 0;
let currentActiveView = 'messages';
let cachedReviewers = [];
let currentReviewerFilter = 'all';
let editingReviewerId = null;
let deletingReviewerId = null;

function clearLegacyLocalToken() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(AUTH_TOKEN_KEY);
        }
    } catch {
        // Ignore storage errors on restricted environments.
    }
}

function getAuthToken() {
    try {
        return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(AUTH_TOKEN_KEY) : null;
    } catch {
        return null;
    }
}

function setAuthToken(token) {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    clearLegacyLocalToken();
}

function clearAuthToken() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(AUTH_TOKEN_KEY);
        }
    } catch {
        // Ignore storage errors on cleanup.
    }
    clearLegacyLocalToken();
}

async function parseJsonSafe(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function getErrorMessage(data, fallback) {
    return data?.message || data?.error?.message || fallback;
}

function formatMessageDate(rawDate) {
    if (!rawDate) return '-';
    const normalized = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawDate)
        ? `${rawDate.replace(' ', 'T')}Z`
        : rawDate;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? String(rawDate) : parsed.toLocaleString();
}

function appendTextCell(tr, text, bold = false) {
    const td = document.createElement('td');
    if (bold) {
        const strong = document.createElement('strong');
        strong.textContent = text;
        td.appendChild(strong);
    } else {
        td.textContent = text;
    }
    tr.appendChild(td);
}

function setLoginError(message) {
    const errorEl = document.getElementById('login-error');
    if (!errorEl) return;
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function setLoginNotice(message, isWarning = false) {
    const noticeEl = document.getElementById('login-notice');
    if (!noticeEl) return;
    noticeEl.classList.remove('notice-info', 'notice-warning');
    if (message) {
        noticeEl.textContent = message;
        noticeEl.classList.add(isWarning ? 'notice-warning' : 'notice-info');
        noticeEl.classList.remove('hidden');
    } else {
        noticeEl.textContent = '';
        noticeEl.classList.add('hidden');
    }
}

function setDashboardError(message) {
    const errorEl = document.getElementById('dashboard-error');
    if (!errorEl) return;
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function setReviewersError(message) {
    const errorEl = document.getElementById('reviewers-error');
    if (!errorEl) return;
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function setModalError(message) {
    const errorEl = document.getElementById('modal-error');
    if (!errorEl) return;
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function clearTableRows() {
    const tbody = document.getElementById('messages-body');
    if (tbody) {
        tbody.replaceChildren();
    }
    const reviewersBody = document.getElementById('reviewers-body');
    if (reviewersBody) {
        reviewersBody.replaceChildren();
    }
}

function renderTableStatus(message, isError = false) {
    const tbody = document.getElementById('messages-body');
    if (!tbody) return;
    tbody.replaceChildren();
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.classList.add('table-status-cell');
    if (isError) {
        td.classList.add('table-status-error');
    }
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
    const selectAll = document.getElementById('select-all');
    if (selectAll) {
        selectAll.checked = false;
    }
    updateBulkDeleteButton();
}

function renderReviewersStatus(message, isError = false) {
    const tbody = document.getElementById('reviewers-body');
    if (!tbody) return;
    tbody.replaceChildren();
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.classList.add('table-status-cell');
    if (isError) {
        td.classList.add('table-status-error');
    }
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

function clearSessionToLogin({ error = '', notice = '', isWarning = false } = {}) {
    activeSessionVersion += 1;
    clearAuthToken();
    clearTableRows();
    setDashboardError('');
    setReviewersError('');

    const dashboardEl = document.getElementById('dashboard-container');
    const loginContainerEl = document.getElementById('login-container');
    const loginFormEl = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

    if (dashboardEl) dashboardEl.classList.add('hidden');
    if (loginContainerEl) loginContainerEl.classList.remove('hidden');
    if (loginFormEl && typeof loginFormEl.reset === 'function') {
        loginFormEl.reset();
    }
    if (logoutBtn) logoutBtn.disabled = false;

    setLoginError(error);
    setLoginNotice(notice, isWarning);
}

function handleUnauthorizedSession(message = 'Your session has expired or is invalid. Please log in again.') {
    clearSessionToLogin({ error: message });
}

function applySavedTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;

    const currentTheme = typeof localStorage !== 'undefined'
        ? (localStorage.getItem(THEME_STORAGE_KEY) || 'light')
        : 'light';

    if (currentTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        toggleBtn.textContent = '☀️ Light Mode';
    } else {
        document.body.removeAttribute('data-theme');
        toggleBtn.textContent = '🌙 Dark Mode';
    }
}

function toggleTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;

    if (document.body.getAttribute('data-theme') === 'dark') {
        document.body.removeAttribute('data-theme');
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(THEME_STORAGE_KEY, 'light');
        }
        toggleBtn.textContent = '🌙 Dark Mode';
    } else {
        document.body.setAttribute('data-theme', 'dark');
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(THEME_STORAGE_KEY, 'dark');
        }
        toggleBtn.textContent = '☀️ Light Mode';
    }
}

async function handleLoginSubmit(e) {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
    }

    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.getElementById('login-submit-btn');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!username || !password) {
        setLoginError('Username and password are required.');
        return;
    }

    setLoginError('');
    setLoginNotice('');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';
    }

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await parseJsonSafe(response);

        if (response.ok && data?.success && data?.token) {
            setAuthToken(data.token);
            if (passwordInput) passwordInput.value = '';
            await showDashboard();
        } else if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            setLoginError(getErrorMessage(data, 'Too many login attempts. Please wait.'));
            if (retryAfter) {
                setLoginNotice(`Too many failed attempts. Try again in ${retryAfter} seconds.`, true);
            }
        } else {
            setLoginError(getErrorMessage(data, 'Invalid credentials'));
        }
    } catch {
        setLoginError('Failed to connect to backend server');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
        }
    }
}

async function handleLogout() {
    const token = getAuthToken();
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.disabled = true;
    }

    let revocationConfirmed = false;
    let notice = 'You have been logged out.';
    let isWarning = false;

    if (token) {
        let timeoutId = null;
        try {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            if (controller) {
                timeoutId = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS);
            }

            const response = await fetch(`${API_BASE}/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                signal: controller ? controller.signal : undefined,
            });

            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }

            if (response.ok) {
                revocationConfirmed = true;
                notice = 'Your session has been securely revoked and signed out.';
                isWarning = false;
            } else {
                revocationConfirmed = false;
                notice = 'You have been signed out locally, but server revocation failed or could not be confirmed.';
                isWarning = true;
            }
        } catch (err) {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            revocationConfirmed = false;
            isWarning = true;
            if (err && (err.name === 'AbortError' || /aborted/i.test(err.message))) {
                notice = 'Logout request timed out. You have been signed out locally, but server revocation could not be verified.';
            } else {
                notice = 'You have been signed out locally, but server revocation failed or could not be confirmed.';
            }
        }
    }

    clearSessionToLogin({ notice, isWarning });
    return { revocationConfirmed, notice, isWarning };
}

async function showDashboard() {
    setDashboardError('');
    setReviewersError('');
    const loginContainer = document.getElementById('login-container');
    if (loginContainer) loginContainer.classList.add('hidden');
    const dashboardContainer = document.getElementById('dashboard-container');
    if (dashboardContainer) dashboardContainer.classList.remove('hidden');

    if (currentActiveView === 'reviewers') {
        await fetchReviewers();
    } else {
        await fetchMessages();
    }
}

function switchView(viewName) {
    currentActiveView = viewName;
    const navMessages = document.getElementById('nav-messages');
    const navReviewers = document.getElementById('nav-reviewers');
    const viewMessages = document.getElementById('view-messages');
    const viewReviewers = document.getElementById('view-reviewers');

    if (viewName === 'messages') {
        if (navMessages) navMessages.classList.add('active');
        if (navReviewers) navReviewers.classList.remove('active');
        if (viewMessages) viewMessages.classList.remove('hidden');
        if (viewReviewers) viewReviewers.classList.add('hidden');
        void fetchMessages();
    } else {
        if (navMessages) navMessages.classList.remove('active');
        if (navReviewers) navReviewers.classList.add('active');
        if (viewMessages) viewMessages.classList.add('hidden');
        if (viewReviewers) viewReviewers.classList.remove('hidden');
        void fetchReviewers();
    }
}

/* ==========================================================================
   MESSAGES MODULE
   ========================================================================== */

async function fetchMessages() {
    const token = getAuthToken();
    if (!token) {
        handleUnauthorizedSession('Please log in to continue.');
        return;
    }

    const requestSessionVersion = activeSessionVersion;
    const pageLimit = 500;
    let offset = 0;
    const allMessages = [];
    const seenIds = new Set();

    try {
        while (true) {
            const response = await fetch(`${API_BASE}/api/messages?limit=${pageLimit}&offset=${offset}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (requestSessionVersion !== activeSessionVersion) {
                return;
            }

            if (response.status === 401) {
                handleUnauthorizedSession('Your session has expired or been revoked. Please log in again.');
                return;
            }

            const data = await parseJsonSafe(response);

            if (!(response.ok && data?.success)) {
                renderTableStatus(getErrorMessage(data, 'Failed to fetch messages'), true);
                return;
            }

            const page = Array.isArray(data.data) ? data.data : [];
            for (const msg of page) {
                if (msg && msg.id !== undefined && msg.id !== null) {
                    if (seenIds.has(msg.id)) {
                        continue;
                    }
                    seenIds.add(msg.id);
                }
                allMessages.push(msg);
            }
            if (page.length < pageLimit) {
                break;
            }
            offset += pageLimit;
        }
        if (requestSessionVersion === activeSessionVersion) {
            renderMessages(allMessages);
        }
    } catch {
        if (requestSessionVersion === activeSessionVersion) {
            renderTableStatus('Failed to connect to backend server', true);
        }
    }
}

function renderMessages(messages) {
    const tbody = document.getElementById('messages-body');
    if (!tbody) return;
    tbody.replaceChildren();

    if (messages.length === 0) {
        renderTableStatus('No messages found');
        return;
    }

    messages.forEach((msg) => {
        const tr = document.createElement('tr');

        const checkboxTd = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('msg-checkbox');
        checkbox.value = String(msg.id);
        checkbox.addEventListener('change', updateBulkDeleteButton);
        checkboxTd.appendChild(checkbox);
        tr.appendChild(checkboxTd);

        appendTextCell(tr, formatMessageDate(msg.created_at));
        appendTextCell(tr, msg.name || '-', true);
        appendTextCell(tr, msg.phone || '-');
        appendTextCell(tr, msg.email || '-');
        appendTextCell(tr, msg.topic || '-');
        appendTextCell(tr, msg.description || '-');

        const actionTd = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.classList.add('btn', 'btn-secondary', 'btn-sm');
        deleteBtn.addEventListener('click', async () => {
            if (typeof confirm === 'function' && !confirm('Are you sure you want to delete this message?')) return;
            await deleteMessage(msg.id, deleteBtn);
        });
        actionTd.appendChild(deleteBtn);
        tr.appendChild(actionTd);

        tbody.appendChild(tr);
    });

    const selectAll = document.getElementById('select-all');
    if (selectAll) {
        selectAll.checked = false;
    }
    updateBulkDeleteButton();
}

function updateBulkDeleteButton() {
    const selected = document.querySelectorAll('.msg-checkbox:checked');
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (!bulkDeleteBtn) return;

    if (selected.length > 0) {
        bulkDeleteBtn.textContent = `Delete Selected (${selected.length})`;
        bulkDeleteBtn.classList.remove('hidden');
    } else {
        bulkDeleteBtn.classList.add('hidden');
    }
}

async function handleBulkDelete() {
    const token = getAuthToken();
    if (!token) {
        handleUnauthorizedSession('Your session has expired. Please log in again.');
        return;
    }

    const checkboxes = Array.from(document.querySelectorAll('.msg-checkbox:checked'));
    const ids = checkboxes
        .map((cb) => Number.parseInt(cb.value, 10))
        .filter((id) => Number.isInteger(id) && id > 0);

    if (ids.length === 0) return;

    if (typeof confirm === 'function' && !confirm(`Are you sure you want to delete ${ids.length} selected message(s)?`)) {
        return;
    }

    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.disabled = true;
    }

    const requestSessionVersion = activeSessionVersion;
    setDashboardError('');
    let deletedCount = 0;

    try {
        for (let i = 0; i < ids.length; i += MAX_BULK_DELETE_BATCH) {
            const batch = ids.slice(i, i + MAX_BULK_DELETE_BATCH);
            const response = await fetch(`${API_BASE}/api/messages/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ ids: batch }),
            });

            if (requestSessionVersion !== activeSessionVersion) {
                return;
            }

            if (response.status === 401) {
                handleUnauthorizedSession('Your session has expired or been revoked. Please log in again.');
                return;
            }

            const data = await parseJsonSafe(response);
            if (!(response.ok && data?.success)) {
                const reason = getErrorMessage(data, 'Bulk delete failed');
                if (deletedCount > 0) {
                    await fetchMessages();
                    setDashboardError(
                        `Deleted ${deletedCount} of ${ids.length} selected messages, but a batch failed: ${reason}`
                    );
                } else {
                    setDashboardError(reason);
                }
                return;
            }

            deletedCount += batch.length;
        }

        await fetchMessages();
    } catch {
        if (requestSessionVersion === activeSessionVersion) {
            if (deletedCount > 0) {
                await fetchMessages();
                setDashboardError(
                    `Deleted ${deletedCount} of ${ids.length} selected messages before connection failed.`
                );
            } else {
                setDashboardError('Failed to connect to backend server');
            }
        }
    } finally {
        if (bulkDeleteBtn) {
            bulkDeleteBtn.disabled = false;
        }
    }
}

async function deleteMessage(id, triggerBtn = null) {
    const token = getAuthToken();
    if (!token) {
        handleUnauthorizedSession('Your session has expired. Please log in again.');
        return;
    }

    const requestSessionVersion = activeSessionVersion;
    setDashboardError('');
    if (triggerBtn) {
        triggerBtn.disabled = true;
    }

    try {
        const response = await fetch(`${API_BASE}/api/messages/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (requestSessionVersion !== activeSessionVersion) {
            return;
        }

        if (response.status === 401) {
            handleUnauthorizedSession('Your session has expired or been revoked. Please log in again.');
            return;
        }

        const data = await parseJsonSafe(response);
        if (response.ok && data?.success) {
            await fetchMessages();
        } else {
            setDashboardError(getErrorMessage(data, 'Failed to delete message'));
        }
    } catch {
        if (requestSessionVersion === activeSessionVersion) {
            setDashboardError('Failed to connect to backend server');
        }
    } finally {
        if (triggerBtn) {
            triggerBtn.disabled = false;
        }
    }
}

/* ==========================================================================
   REVIEWERS MODULE
   ========================================================================== */

async function fetchReviewers() {
    const token = getAuthToken();
    if (!token) {
        handleUnauthorizedSession('Please log in to continue.');
        return;
    }

    const requestSessionVersion = activeSessionVersion;
    setReviewersError('');

    try {
        const cacheBuster = `_t=${Date.now()}`;
        const response = await fetch(`${API_BASE}/api/reviewers?${cacheBuster}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store',
        });

        if (requestSessionVersion !== activeSessionVersion) return;

        if (response.status === 401) {
            handleUnauthorizedSession('Your session has expired. Please log in again.');
            return;
        }

        const data = await parseJsonSafe(response);
        if (response.ok && data?.success && Array.isArray(data.data)) {
            cachedReviewers = data.data;
            updateReviewerCounts();
            renderReviewers();
        } else {
            renderReviewersStatus(getErrorMessage(data, 'Failed to load reviewers'), true);
        }
    } catch {
        if (requestSessionVersion === activeSessionVersion) {
            renderReviewersStatus('Failed to connect to backend server', true);
        }
    }
}

function updateReviewerCounts() {
    const totalCount = cachedReviewers.length;
    const techCount = cachedReviewers.filter((r) => r.type === 'technical').length;
    const acadCount = cachedReviewers.filter((r) => r.type === 'academic').length;

    const countAllEl = document.getElementById('count-all');
    const countTechEl = document.getElementById('count-tech');
    const countAcadEl = document.getElementById('count-acad');

    if (countAllEl) countAllEl.textContent = String(totalCount);
    if (countTechEl) countTechEl.textContent = String(techCount);
    if (countAcadEl) countAcadEl.textContent = String(acadCount);
}

function renderReviewers() {
    const tbody = document.getElementById('reviewers-body');
    if (!tbody) return;
    tbody.replaceChildren();

    const filtered = cachedReviewers.filter((r) => {
        if (currentReviewerFilter === 'technical') return r.type === 'technical';
        if (currentReviewerFilter === 'academic') return r.type === 'academic';
        return true;
    });

    if (filtered.length === 0) {
        renderReviewersStatus('No reviewers found for this category');
        return;
    }

    filtered.forEach((rev) => {
        const tr = document.createElement('tr');

        // Type badge cell
        const typeTd = document.createElement('td');
        const badge = document.createElement('span');
        badge.classList.add('badge');
        if (rev.type === 'technical') {
            badge.classList.add('badge-tech');
            badge.textContent = 'Technical';
        } else {
            badge.classList.add('badge-acad');
            badge.textContent = 'Academic';
        }
        typeTd.appendChild(badge);
        tr.appendChild(typeTd);

        // Name, Designation, Org, Order
        appendTextCell(tr, rev.name || '-', true);
        appendTextCell(tr, rev.designation || '-');
        appendTextCell(tr, rev.organization || '-');
        appendTextCell(tr, String(rev.order_index ?? 0));

        // Actions
        const actionsTd = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.classList.add('btn-sm', 'btn-edit');
        editBtn.addEventListener('click', () => {
            openEditReviewerModal(rev);
        });

        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.classList.add('btn-sm', 'btn-del');
        delBtn.addEventListener('click', () => {
            openDeleteReviewerModal(rev);
        });

        actionsTd.appendChild(editBtn);
        actionsTd.appendChild(delBtn);
        tr.appendChild(actionsTd);

        tbody.appendChild(tr);
    });
}

function setReviewerFilter(filterType) {
    currentReviewerFilter = filterType;
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach((tab) => {
        if (tab.dataset.filter === filterType) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    renderReviewers();
}

function openAddReviewerModal() {
    editingReviewerId = null;
    const modalHeading = document.getElementById('modal-heading');
    if (modalHeading) modalHeading.textContent = 'Add Reviewer';

    const form = document.getElementById('reviewer-form');
    if (form) form.reset();

    const idInput = document.getElementById('reviewer-id');
    if (idInput) idInput.value = '';

    const orderInput = document.getElementById('reviewer-order');
    if (orderInput) orderInput.value = String(cachedReviewers.length + 1);

    setModalError('');
    const modal = document.getElementById('reviewer-modal');
    if (modal) modal.classList.remove('hidden');

    const nameInput = document.getElementById('reviewer-name');
    if (nameInput) nameInput.focus();
}

function openEditReviewerModal(rev) {
    editingReviewerId = rev.id;
    const modalHeading = document.getElementById('modal-heading');
    if (modalHeading) modalHeading.textContent = 'Edit Reviewer';

    const idInput = document.getElementById('reviewer-id');
    if (idInput) idInput.value = String(rev.id);

    const nameInput = document.getElementById('reviewer-name');
    if (nameInput) nameInput.value = rev.name || '';

    const desigInput = document.getElementById('reviewer-designation');
    if (desigInput) desigInput.value = rev.designation || '';

    const orgInput = document.getElementById('reviewer-org');
    if (orgInput) orgInput.value = rev.organization || '';

    const orderInput = document.getElementById('reviewer-order');
    if (orderInput) orderInput.value = String(rev.order_index ?? 0);

    const typeRadios = document.querySelectorAll('input[name="reviewer-type"]');
    typeRadios.forEach((radio) => {
        radio.checked = radio.value === rev.type;
    });

    setModalError('');
    const modal = document.getElementById('reviewer-modal');
    if (modal) modal.classList.remove('hidden');

    if (nameInput) nameInput.focus();
}

function closeReviewerModal() {
    const modal = document.getElementById('reviewer-modal');
    if (modal) modal.classList.add('hidden');
    editingReviewerId = null;
    setModalError('');
}

async function handleReviewerFormSubmit(e) {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
    }

    const token = getAuthToken();
    if (!token) {
        handleUnauthorizedSession('Your session has expired. Please log in again.');
        return;
    }

    const nameInput = document.getElementById('reviewer-name');
    const desigInput = document.getElementById('reviewer-designation');
    const orgInput = document.getElementById('reviewer-org');
    const orderInput = document.getElementById('reviewer-order');
    const selectedTypeRadio = document.querySelector('input[name="reviewer-type"]:checked');
    const saveBtn = document.getElementById('save-reviewer-btn');

    const name = nameInput ? nameInput.value.trim() : '';
    const designation = desigInput ? desigInput.value.trim() : '';
    const organization = orgInput ? orgInput.value.trim() : '';
    const type = selectedTypeRadio ? selectedTypeRadio.value : 'technical';
    const orderIndex = orderInput ? Number.parseInt(orderInput.value, 10) || 0 : 0;

    if (!name || !designation || !organization) {
        setModalError('Please fill in all required fields.');
        return;
    }

    setModalError('');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    const payload = {
        type,
        name,
        designation,
        organization,
        order_index: orderIndex,
    };

    try {
        const isEdit = Boolean(editingReviewerId);
        const url = isEdit ? `${API_BASE}/api/reviewers/${editingReviewerId}` : `${API_BASE}/api/reviewers`;
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });

        if (response.status === 401) {
            handleUnauthorizedSession('Your session has expired. Please log in again.');
            return;
        }

        const data = await parseJsonSafe(response);
        if (response.ok && data?.success) {
            closeReviewerModal();
            await fetchReviewers();
        } else {
            setModalError(getErrorMessage(data, 'Failed to save reviewer.'));
        }
    } catch {
        setModalError('Failed to connect to backend server.');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Reviewer';
        }
    }
}

function openDeleteReviewerModal(rev) {
    deletingReviewerId = rev.id;
    const nameEl = document.getElementById('delete-reviewer-name');
    if (nameEl) nameEl.textContent = rev.name || 'this reviewer';

    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeDeleteModal() {
    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.add('hidden');
    deletingReviewerId = null;
}

async function handleConfirmDelete() {
    if (!deletingReviewerId) return;

    const token = getAuthToken();
    if (!token) {
        handleUnauthorizedSession('Your session has expired. Please log in again.');
        return;
    }

    const confirmBtn = document.getElementById('confirm-delete-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting...';
    }

    try {
        const response = await fetch(`${API_BASE}/api/reviewers/${deletingReviewerId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.status === 401) {
            handleUnauthorizedSession('Your session has expired. Please log in again.');
            return;
        }

        const data = await parseJsonSafe(response);
        if (response.ok && data?.success) {
            closeDeleteModal();
            await fetchReviewers();
        } else {
            setReviewersError(getErrorMessage(data, 'Failed to delete reviewer.'));
            closeDeleteModal();
        }
    } catch {
        setReviewersError('Failed to connect to backend server.');
        closeDeleteModal();
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Delete';
        }
    }
}

/* ==========================================================================
   APP INITIALIZATION
   ========================================================================== */

function initDashboardApp() {
    clearLegacyLocalToken();
    applySavedTheme();

    // Top Bar Theme Toggle
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleTheme);
    }

    // Login Form Submit
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }

    // Sidebar Logout Button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            void handleLogout();
        });
    }

    // Sidebar View Navigation
    const navMessages = document.getElementById('nav-messages');
    if (navMessages) {
        navMessages.addEventListener('click', () => {
            switchView('messages');
        });
    }

    const navReviewers = document.getElementById('nav-reviewers');
    if (navReviewers) {
        navReviewers.addEventListener('click', () => {
            switchView('reviewers');
        });
    }

    // Messages Checkboxes & Bulk Delete
    const selectAll = document.getElementById('select-all');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.msg-checkbox');
            checkboxes.forEach((cb) => {
                cb.checked = e.target.checked;
            });
            updateBulkDeleteButton();
        });
    }

    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', () => {
            void handleBulkDelete();
        });
    }

    // Reviewer Filter Tabs
    const filterTabs = document.querySelectorAll('.tab-btn');
    filterTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            if (tab.dataset.filter) {
                setReviewerFilter(tab.dataset.filter);
            }
        });
    });

    // Reviewer Modal Open / Close / Form Submit
    const openAddBtn = document.getElementById('open-add-reviewer-btn');
    if (openAddBtn) {
        openAddBtn.addEventListener('click', openAddReviewerModal);
    }

    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeReviewerModal);
    }

    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', closeReviewerModal);
    }

    const reviewerForm = document.getElementById('reviewer-form');
    if (reviewerForm) {
        reviewerForm.addEventListener('submit', handleReviewerFormSubmit);
    }

    // Delete Confirmation Modal Open / Close / Confirm
    const closeDeleteBtn = document.getElementById('close-delete-modal-btn');
    if (closeDeleteBtn) {
        closeDeleteBtn.addEventListener('click', closeDeleteModal);
    }

    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    }

    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => {
            void handleConfirmDelete();
        });
    }

    // Escape Key Closes Modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeReviewerModal();
            closeDeleteModal();
        }
    });

    // Check Existing Session
    const token = getAuthToken();
    if (token) {
        void showDashboard();
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDashboardApp);
    } else {
        initDashboardApp();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        API_BASE,
        AUTH_TOKEN_KEY,
        LOGOUT_TIMEOUT_MS,
        MAX_BULK_DELETE_BATCH,
        THEME_STORAGE_KEY,
        deleteMessage,
        fetchMessages,
        fetchReviewers,
        handleBulkDelete,
        handleLoginSubmit,
        handleLogout,
        handleReviewerFormSubmit,
        handleUnauthorizedSession,
        initDashboardApp,
        renderMessages,
        renderReviewers,
        showDashboard,
        switchView,
    };
}
