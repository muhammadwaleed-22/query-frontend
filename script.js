const API_BASE = 'https://part2computer-app-backend.vercel.app';

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

function renderTableStatus(message, isError = false) {
    const tbody = document.getElementById('messages-body');
    tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.style.textAlign = 'center';
    if (isError) {
        td.style.color = '#d32f2f';
    }
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
    document.getElementById('select-all').checked = false;
    updateBulkDeleteButton();
}

document.addEventListener('DOMContentLoaded', () => {
    // Theme logic
    const toggleBtn = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme') || 'light';
    
    if (currentTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        toggleBtn.textContent = '☀️ Light Mode';
    }
    
    toggleBtn.addEventListener('click', () => {
        if (document.body.getAttribute('data-theme') === 'dark') {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            toggleBtn.textContent = '🌙 Dark Mode';
        } else {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            toggleBtn.textContent = '☀️ Light Mode';
        }
    });

    const token = localStorage.getItem('auth_token');
    if (token) {
        showDashboard();
    }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    
    errorEl.textContent = '';
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await parseJsonSafe(response);
        
        if (response.ok && data?.success && data.token) {
            localStorage.setItem('auth_token', data.token);
            showDashboard();
        } else {
            errorEl.textContent = getErrorMessage(data, 'Login failed');
        }
    } catch (err) {
        errorEl.textContent = 'Server connection error';
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('auth_token');
    document.getElementById('dashboard-container').classList.add('hidden');
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('login-form').reset();
});

async function showDashboard() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    await fetchMessages();
}

async function fetchMessages() {
    const token = localStorage.getItem('auth_token');
    try {
        const response = await fetch(`${API_BASE}/api/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('auth_token');
            location.reload();
            return;
        }
        
        const data = await parseJsonSafe(response);
        
        if (response.ok && data?.success) {
            renderMessages(data.data || []);
        } else {
            renderTableStatus(getErrorMessage(data, 'Failed to fetch messages'), true);
        }
    } catch (err) {
        console.error('Failed to fetch messages');
        renderTableStatus('Failed to connect to backend server', true);
    }
}

function renderMessages(messages) {
    const tbody = document.getElementById('messages-body');
    tbody.innerHTML = '';
    
    if (messages.length === 0) {
        renderTableStatus('No messages found');
        return;
    }
    
    messages.forEach(msg => {
        const tr = document.createElement('tr');

        const checkboxTd = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'msg-checkbox';
        checkbox.value = String(msg.id);
        checkbox.addEventListener('change', updateBulkDeleteButton);
        checkboxTd.appendChild(checkbox);
        tr.appendChild(checkboxTd);

        appendTextCell(tr, formatMessageDate(msg.created_at));
        appendTextCell(tr, msg.name || '', true);
        appendTextCell(tr, msg.phone || '-');
        appendTextCell(tr, msg.email || '');
        appendTextCell(tr, msg.topic || '');
        appendTextCell(tr, msg.description || '');

        const actionTd = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-secondary delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete this message?')) return;
            await deleteMessage(msg.id);
        });
        actionTd.appendChild(deleteBtn);
        tr.appendChild(actionTd);

        tbody.appendChild(tr);
    });

    // Reset select all checkbox state
    document.getElementById('select-all').checked = false;
    updateBulkDeleteButton();
}

document.getElementById('select-all').addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.msg-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
    updateBulkDeleteButton();
});

function updateBulkDeleteButton() {
    const checkedCount = document.querySelectorAll('.msg-checkbox:checked').length;
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (checkedCount > 0) {
        bulkDeleteBtn.classList.remove('hidden');
        bulkDeleteBtn.textContent = `Delete Selected (${checkedCount})`;
    } else {
        bulkDeleteBtn.classList.add('hidden');
    }
}

document.getElementById('bulk-delete-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete all selected messages?')) return;
    const checkedBoxes = document.querySelectorAll('.msg-checkbox:checked');
    const ids = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
    
    const token = localStorage.getItem('auth_token');
    try {
        const response = await fetch(`${API_BASE}/api/messages/bulk`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids })
        });
        const data = await parseJsonSafe(response);
        if (response.ok && data?.success) {
            await fetchMessages();
        } else {
            alert(getErrorMessage(data, 'Failed to delete messages'));
        }
    } catch (err) {
        console.error('Failed to bulk delete messages', err);
    }
});

async function deleteMessage(id) {
    const token = localStorage.getItem('auth_token');
    try {
        const response = await fetch(`${API_BASE}/api/messages/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await parseJsonSafe(response);
        if (response.ok && data?.success) {
            await fetchMessages();
        } else {
            alert(getErrorMessage(data, 'Failed to delete message'));
        }
    } catch (err) {
        console.error('Failed to delete message', err);
    }
}
