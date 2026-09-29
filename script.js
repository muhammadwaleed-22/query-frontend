const API_BASE = 'http://127.0.0.1:5000'; // Change to actual backend URL in production

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
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('auth_token', data.token);
            showDashboard();
        } else {
            errorEl.textContent = data.message || 'Login failed';
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
        
        const data = await response.json();
        
        if (data.success) {
            renderMessages(data.data);
        }
    } catch (err) {
        console.error('Failed to fetch messages');
    }
}

function renderMessages(messages) {
    const tbody = document.getElementById('messages-body');
    tbody.innerHTML = '';
    
    if (messages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No messages found</td></tr>';
        document.getElementById('select-all').checked = false;
        updateBulkDeleteButton();
        return;
    }
    
    messages.forEach(msg => {
        const tr = document.createElement('tr');
        
        // Format date
        const date = new Date(msg.created_at).toLocaleString();
        
        tr.innerHTML = `
            <td><input type="checkbox" class="msg-checkbox" value="${msg.id}"></td>
            <td>${date}</td>
            <td><strong>${msg.name}</strong></td>
            <td>${msg.phone || '-'}</td>
            <td>${msg.email}</td>
            <td>${msg.topic}</td>
            <td>${msg.description}</td>
            <td><button class="btn btn-secondary delete-btn" data-id="${msg.id}">Delete</button></td>
        `;
        tbody.appendChild(tr);
    });

    // Add event listeners for individual checkboxes
    document.querySelectorAll('.msg-checkbox').forEach(cb => {
        cb.addEventListener('change', updateBulkDeleteButton);
    });

    // Add event listeners for individual delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!confirm('Are you sure you want to delete this message?')) return;
            const id = e.target.getAttribute('data-id');
            await deleteMessage(id);
        });
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
        const data = await response.json();
        if (data.success) {
            await fetchMessages();
        } else {
            alert(data.message || 'Failed to delete messages');
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
        const data = await response.json();
        if (data.success) {
            await fetchMessages();
        } else {
            alert(data.message || 'Failed to delete message');
        }
    } catch (err) {
        console.error('Failed to delete message', err);
    }
}
