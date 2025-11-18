document.addEventListener('DOMContentLoaded', async () => {
    const conversationsListEl = document.getElementById('conversations-list');
    const messageListEl = document.getElementById('message-list');
    const messageViewHeaderEl = document.getElementById('message-view-header');
    const replyFormEl = document.getElementById('reply-form');
    let currentUserEmail = '';
    let currentUserId = '';
    let currentConvoId = null;

    try {
        // Get current user's email for message styling
        const statusRes = await fetch('/api/user/status');
        const statusData = await statusRes.json();
        if (statusData.loggedIn) {
            currentUserEmail = statusData.user.email;
            currentUserId = statusData.user._id;
        } else {
            // Not logged in, redirect or show message
            document.body.innerHTML = '<h1>You must be logged in to view your inbox.</h1>';
            return;
        }
    } catch (e) {
        console.error("Could not fetch user status");
        return;
    }

    // Load initial conversations
    await loadConversationList();
    setupWebSocket();

    async function loadConversationList() {
        try {
            const response = await fetch('/api/conversations');
            if (!response.ok) {
                conversationsListEl.innerHTML = `<p>You must be logged in to view your messages.</p>`;
                return;
            }
            const conversations = await response.json();
            if (conversations.length === 0) {
                conversationsListEl.innerHTML = `<p>You have no conversations yet.</p>`;
                messageListEl.innerHTML = '<p>Select a conversation to see messages.</p>';
                return;
            }
            conversationsListEl.innerHTML = '';
            conversations.forEach(convo => renderConversationSummary(convo));
        } catch (error) {
            console.error('Error fetching conversations:', error);
            conversationsListEl.innerHTML = `<p>Could not load conversations.</p>`;
        }
    }

    function renderConversationSummary(convo) {
        const otherParticipant = convo.participants.find(p => p.email !== currentUserEmail);
        const convoElement = document.createElement('div');
        convoElement.className = 'conversation-summary';
        convoElement.dataset.convoId = convo._id;
        convoElement.innerHTML = `
            <h4>${convo.product.name}</h4>
            <p>With: ${otherParticipant ? otherParticipant.email : 'a user'}</p>
            <p class="last-updated">Last Message: ${new Date(convo.lastUpdated).toLocaleString()}</p>
        `;
        convoElement.addEventListener('click', () => {
            document.querySelectorAll('.conversation-summary').forEach(el => el.classList.remove('active'));
            convoElement.classList.add('active');
            loadConversation(convo._id);
        });
        conversationsListEl.prepend(convoElement);
    }

    async function loadConversation(convoId) {
        currentConvoId = convoId;
        try {
            const res = await fetch(`/api/conversations/${convoId}`);
            const conversation = await res.json();

            // Populate header
            const otherParticipant = conversation.participants.find(p => p.email !== currentUserEmail);
            messageViewHeaderEl.innerHTML = `
                <h3>${conversation.product.name}</h3>
                <p>With: ${otherParticipant ? otherParticipant.email : 'a user'}</p>
            `;
            messageViewHeaderEl.style.display = 'block';

            messageListEl.innerHTML = ''; // Clear previous messages
            conversation.messages.forEach(renderMessage);
            messageListEl.scrollTop = messageListEl.scrollHeight;

            // Show and set up the reply form
            replyFormEl.style.display = 'flex';
            replyFormEl.querySelector('input[name="messageBody"]').value = ''; // Clear input
            replyFormEl.onsubmit = handleReply;

        } catch (error) {
            console.error('Error loading conversation:', error);
            messageListEl.innerHTML = '<p>Could not load messages.</p>';
        }
    }

    function renderMessage(msg) {
        const msgEl = document.createElement('div');
        msgEl.className = 'message';
        msgEl.classList.add(msg.sender.email === currentUserEmail ? 'sent' : 'received');
        msgEl.textContent = msg.body;
        messageListEl.appendChild(msgEl);
    }

    async function handleReply(e) {
        e.preventDefault();
        const messageBody = e.target.elements.messageBody.value;
        if (!messageBody || !currentConvoId) return;
        const replyRes = await fetch(`/api/conversations/${currentConvoId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageBody })
        });
        if (replyRes.ok) {
            e.target.elements.messageBody.value = '';
            renderMessage({ body: messageBody, sender: { email: currentUserEmail } });
            messageListEl.scrollTop = messageListEl.scrollHeight;
        } else {
            alert('Failed to send reply.');
        }
    }

    function setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${protocol}://${window.location.host}`);

        ws.onopen = () => {
            console.log('WebSocket connection established.');
            // Authenticate the WebSocket connection by sending the userId
            if (currentUserId) {
                ws.send(JSON.stringify({ type: 'auth', userId: currentUserId }));
            }
        };
        ws.onerror = (error) => console.error('WebSocket error:', error);
        ws.onmessage = (event) => {
            const { type, data } = JSON.parse(event.data);
            if (type === 'newMessage') {
                handleRealTimeMessage(data);
            }
        };
    }

    function handleRealTimeMessage({ conversationId, message }) {
        const convoSummaryEl = document.querySelector(`[data-convo-id="${conversationId}"]`);
        if (convoSummaryEl) {
            convoSummaryEl.querySelector('.last-updated').textContent = `Last Message: ${new Date().toLocaleString()}`;
            conversationsListEl.prepend(convoSummaryEl);
        }
        if (conversationId === currentConvoId) {
            renderMessage(message);
            messageListEl.scrollTop = messageListEl.scrollHeight;
        }
    }
});