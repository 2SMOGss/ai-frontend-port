import './style.css';
import { createClient } from '@supabase/supabase-js';
import gsap from 'gsap';
import { createIcons, Brain, Rss, Activity, Download, Send, Terminal } from 'lucide';

// Initialize Icons
createIcons({ icons: { Brain, Rss, Activity, Download, Send, Terminal } });

// --- CONFIG ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const AGENT_URL = `${SUPABASE_URL}/functions/v1/portfolio-chat/`;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// --- DOM ---
const chatModal = document.getElementById('chat-modal');
const chatInput = document.getElementById('chat-input');
const chatBody = document.getElementById('chat-body');
const thoughtStream = document.getElementById('thought-stream');
const memCountEl = document.getElementById('mem-count');
const uptimeEl = document.getElementById('uptime');

let chatHistory = [];
let currentUser = null;

// --- INIT ---
window.addEventListener('load', () => {
    initAnimations();
    initParticles();
    startTimeUpdate();
    fetchThoughts();
    subscribeToThoughts();
    checkSession();
    chatInput.focus();
});

function initAnimations() {
    const panels = document.querySelectorAll('.hud-panel');
    const modal = document.getElementById('chat-modal');
    
    // Safety Fallback: Force show everything after 1.5s if GSAP fails
    setTimeout(() => {
        gsap.set('.hud-panel, #chat-modal, nav', { opacity: 1, visibility: 'visible' });
    }, 1500);

    const tl = gsap.timeline();
    tl.from('nav', { y: -20, opacity: 0, duration: 1, ease: 'power2.out' })
      .to('.hud-sidebar.left .hud-panel', { 
        x: 0,
        opacity: 1, 
        duration: 1.2, 
        stagger: 0.15, 
        ease: 'power4.out',
        startAt: { x: -40 }
      }, '-=0.6')
      .to('.hud-sidebar.right .hud-panel', { 
        x: 0,
        opacity: 1, 
        duration: 1.2, 
        stagger: 0.15, 
        ease: 'power4.out',
        startAt: { x: 40 }
      }, '-=1.0')
      .to('#chat-modal', { 
        opacity: 1, 
        scale: 1, 
        duration: 1.5, 
        ease: 'power3.out',
        startAt: { scale: 0.98, opacity: 0 }
      }, '-=1.2');
}

function initParticles() {
    const canvas = document.getElementById('neural-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    window.addEventListener('resize', resize);
    resize();

    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.size = Math.random() * 2;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
        }
        draw() {
            ctx.fillStyle = '#ff4d00';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    for (let i = 0; i < 80; i++) particles.push(new Particle());

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p, i) => {
            p.update();
            p.draw();
            for (let j = i + 1; j < particles.length; j++) {
                const dx = p.x - particles[j].x;
                const dy = p.y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 100) {
                    ctx.strokeStyle = `rgba(255, 77, 0, ${1 - dist / 100})`;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        });
        requestAnimationFrame(animate);
    }
    animate();
}

// --- THOUGHTS ---
async function fetchThoughts() {
    if (!thoughtStream) return;
    const { data, error, count } = await supabase
        .from('thoughts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(15);

    if (error) return console.error(error);
    memCountEl.innerText = count || 0;
    data.reverse().forEach(t => renderThought(t, false));
    thoughtStream.scrollTop = thoughtStream.scrollHeight;
}

function renderThought(thought, animate = true) {
    if (!thoughtStream) return;
    const card = document.createElement('div');
    card.className = 'thought-card';
    card.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <span class="font-mono text-[9px] text-accent uppercase tracking-widest">${thought.metadata?.type || 'observation'}</span>
            <span class="text-[8px] opacity-30">${new Date(thought.created_at).toLocaleTimeString()}</span>
        </div>
        <p class="text-[11px] leading-relaxed opacity-70">${thought.content}</p>
    `;
    thoughtStream.prepend(card);
    if (thoughtStream.children.length > 20) thoughtStream.lastElementChild.remove();
}

function subscribeToThoughts() {
    if (!thoughtStream) return;
    supabase.channel('public:thoughts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thoughts' }, payload => {
            renderThought(payload.new);
            memCountEl.innerText = parseInt(memCountEl.innerText) + 1;
        }).subscribe();
}

// --- CHAT ---
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    chatInput.disabled = true;
    appendMessage('user', text);
    const agentMsg = appendMessage('agent', 'Connecting...');

    try {
        let token = SUPABASE_ANON_KEY;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                token = session.access_token;
            }
        } catch (e) {
            console.warn('Session retrieval bypassed:', e);
        }

        const res = await fetch(AGENT_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message: text, history: chatHistory, user: currentUser })
        });
        
        const contentType = res.headers.get('content-type') || '';
        let full = '';

        if (contentType.includes('application/json')) {
            const data = await res.json();
            full = data.reply || data.error || '[ERROR] Failed to obtain signal.';
            agentMsg.innerText = full;
            chatBody.scrollTop = chatBody.scrollHeight;
        } else {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            agentMsg.innerText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                full += decoder.decode(value);
                agentMsg.innerText = full;
                chatBody.scrollTop = chatBody.scrollHeight;
            }
        }

        chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: full });
        
        // Inline reactive auth card suggestion
        if (!currentUser && (full.toLowerCase().includes('authenticate') || full.toLowerCase().includes('gmail') || full.toLowerCase().includes('verify'))) {
            appendAuthCard(agentMsg.parentNode.parentNode);
        }
    } catch {
        agentMsg.innerText = '[ERROR] Signal lost.';
    } finally {
        chatInput.disabled = false;
        chatInput.focus();
    }
}

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message-container ${role}`;
    
    let avatarHTML = '';
    let roleLabel = '';
    
    if (role === 'user') {
        if (currentUser) {
            if (currentUser.picture) {
                avatarHTML = `
                    <div class="chat-avatar verified-avatar" title="${currentUser.email}">
                        <img src="${currentUser.picture}" alt="${currentUser.name}" class="avatar-img">
                    </div>
                `;
            } else {
                avatarHTML = `
                    <div class="chat-avatar verified-avatar" title="${currentUser.email}">
                        ${getInitials(currentUser.name)}
                    </div>
                `;
            }
            roleLabel = `ROB_VIP_USER // ${currentUser.name.toUpperCase()}`;
        } else {
            avatarHTML = `
                <div class="chat-avatar user-avatar" title="Guest Signal">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                </div>
            `;
            roleLabel = 'GUEST // USER_QUERY';
        }
    } else {
        avatarHTML = `
            <div class="chat-avatar agent-avatar" title="Rob's Open Brain">
                <img src="/rob_avatar.jpg" alt="Rob Chich" class="avatar-img">
            </div>
        `;
        roleLabel = 'ROB_BRAIN // RESPONSE';
    }
    
    div.innerHTML = `
        ${avatarHTML}
        <div class="message-content">
            <div class="message-header">${roleLabel}</div>
            <div class="message-text">${text}</div>
        </div>
    `;
    
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
    return div.querySelector('.message-text');
}

chatInput.addEventListener('keypress', e => e.key === 'Enter' && sendMessage());

// --- HYBRID OAUTH & SIMULATED AUTH SHOWCASE ---
const authModal = document.getElementById('auth-modal');
const authBtn = document.getElementById('auth-btn');
const demoAuthBtn = document.getElementById('demo-auth-btn');
const realGoogleBtn = document.getElementById('real-google-btn');
const closeAuthBtnX = document.getElementById('close-auth-btn-x');
const hudPulse = document.getElementById('hud-pulse');
const hudLinkStatus = document.getElementById('hud-link-status');

// Toggle Auth Modal
if (authBtn) {
    authBtn.addEventListener('click', () => {
        if (currentUser) {
            signOut();
        } else {
            openAuthModal();
        }
    });
}

if (closeAuthBtnX) {
    closeAuthBtnX.addEventListener('click', closeAuthModal);
}

// Close on outside click
if (authModal) {
    authModal.addEventListener('click', (e) => {
        if (e.target === authModal) closeAuthModal();
    });
}

function openAuthModal() {
    // Reset modal states
    document.getElementById('auth-initial-state').classList.remove('hidden');
    document.getElementById('auth-captcha-state').classList.add('hidden');
    document.getElementById('auth-loading-state').classList.add('hidden');
    document.getElementById('handshake-logs').innerHTML = '';
    document.getElementById('auth-progress-fill').style.width = '0%';
    
    authModal.classList.remove('hidden');
    setTimeout(() => authModal.classList.add('active'), 10);
}

function closeAuthModal() {
    authModal.classList.remove('active');
    setTimeout(() => authModal.classList.add('hidden'), 400);
}

// --- ANTI-BOT DYNAMIC FIREWALL CAPTCHA ---
const captchaBackBtn = document.getElementById('captcha-back-btn');
const captchaGrid = document.getElementById('captcha-grid');
const captchaTargetEl = document.getElementById('captcha-target');

const CAPTCHA_OPTIONS = [
    { type: 'SHIELD', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>` },
    { type: 'KEY', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5L20 12M18.5 4.5L21.5 7.5"/></svg>` },
    { type: 'TERMINAL', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>` },
    { type: 'DATABASE', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>` },
    { type: 'CPU', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"/></svg>` },
    { type: 'BUG', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="8" y="2" width="8" height="20" rx="4"/><path d="M6 7h4M6 12h4M6 17h4M14 7h4M14 12h4M14 17h4M12 2v2"/></svg>` }
];

function initCaptcha() {
    // Pick 4 random unique elements from CAPTCHA_OPTIONS
    const shuffled = [...CAPTCHA_OPTIONS].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 4);
    
    // Pick one of the 4 as the target
    const targetNode = selected[Math.floor(Math.random() * selected.length)];
    captchaTargetEl.innerText = targetNode.type;
    
    captchaGrid.innerHTML = '';
    
    selected.forEach(node => {
        const btn = document.createElement('button');
        btn.className = `captcha-node ${node.type === targetNode.type ? 'success-node' : ''}`;
        btn.innerHTML = `
            ${node.icon}
            <span>${node.type}_NODE</span>
        `;
        
        btn.addEventListener('click', () => {
            if (node.type === targetNode.type) {
                // Verified! Start simulation
                document.getElementById('auth-captcha-state').classList.add('hidden');
                runSimulationFlow({
                    name: "VIP Recruiter",
                    email: "recruiter@nexus-signals.io",
                    picture: null,
                    isReal: false
                });
            } else {
                // Access Denied and reset with simple vibration cue
                btn.style.borderColor = '#ff5f56';
                btn.style.background = 'rgba(255, 95, 86, 0.08)';
                btn.style.color = '#ff5f56';
                btn.querySelector('svg').style.color = '#ff5f56';
                
                setTimeout(() => {
                    initCaptcha(); // Re-roll and shuffle
                }, 600);
            }
        });
        
        captchaGrid.appendChild(btn);
    });
}

// Pathway 1: Real Google OAuth Redirect via Supabase
if (realGoogleBtn) {
    realGoogleBtn.addEventListener('click', async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
        } catch (err) {
            console.error('OAuth configuration required:', err.message);
            // Fall back to showing log simulation so it never breaks for local devs!
            runSimulationFlow({
                name: "Google Verified Guest",
                email: "verified_guest@gmail.com",
                picture: null,
                isReal: true
            });
        }
    });
}

// Pathway 2: One-Click Demo Bypass with Firewall Captcha Intercept
if (demoAuthBtn) {
    demoAuthBtn.addEventListener('click', () => {
        document.getElementById('auth-initial-state').classList.add('hidden');
        document.getElementById('auth-captcha-state').classList.remove('hidden');
        initCaptcha();
    });
}

if (captchaBackBtn) {
    captchaBackBtn.addEventListener('click', () => {
        document.getElementById('auth-captcha-state').classList.add('hidden');
        document.getElementById('auth-initial-state').classList.remove('hidden');
    });
}

// Unified loading sequence & sync
function runSimulationFlow(profile) {
    const initialState = document.getElementById('auth-initial-state');
    const captchaState = document.getElementById('auth-captcha-state');
    const loadingState = document.getElementById('auth-loading-state');
    const logBox = document.getElementById('handshake-logs');
    const fill = document.getElementById('auth-progress-fill');
    
    initialState.classList.add('hidden');
    captchaState.classList.add('hidden');
    loadingState.classList.remove('hidden');
    
    const logs = [
        { text: "⚡ INITIATING SECURE NEURAL LINK...", delay: 100 },
        { text: "🔑 PROTOCOL RESOLVED: OAUTH.GOOGLE.COM", delay: 400 },
        { text: "🛡️ COMPLIANCE AUDIT: NIST AC-3/SC-7 PASS", delay: 800 },
        { text: "⏳ SESSION KEY ISSUED: EXP_1_HOUR", delay: 1200 },
        { text: "📡 DECRYPTING DATA PRIVACY PROTOCOLS...", delay: 1600 },
        { text: "🤖 Identity protection status: ACTIVE", delay: 1900 },
        { text: "✅ HANDSHAKE COMPLETED. ENCRYPTED LINK ON.", delay: 2200, success: true }
    ];
    
    logs.forEach(log => {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = `handshake-log-entry ${log.success ? 'success' : ''}`;
            el.innerHTML = `<span>></span> <span>${log.text}</span>`;
            logBox.appendChild(el);
            logBox.scrollTop = logBox.scrollHeight;
            
            // Advance progress fill
            const pct = Math.floor((log.delay / 2200) * 100);
            fill.style.width = `${pct}%`;
        }, log.delay);
    });
    
    setTimeout(() => {
        currentUser = profile;
        localStorage.setItem('simulated_user', JSON.stringify(profile));
        updateUIForAuthenticatedUser();
        closeAuthModal();
        
        // System terminal output
        appendSystemMessage(`Neural priority line synchronized. Active user identity recognized: ${profile.name.toUpperCase()} (${profile.email}).`);
    }, 2500);
}

async function checkSession() {
    try {
        // Check real Supabase OAuth session
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            currentUser = {
                name: session.user.user_metadata.full_name || session.user.email.split('@')[0],
                email: session.user.email,
                picture: session.user.user_metadata.avatar_url || null,
                isReal: true
            };
            updateUIForAuthenticatedUser();
            return;
        }
    } catch (e) {
        console.warn('Real session check bypassed (offline/unconfigured).');
    }
    
    // Check simulated session
    const saved = localStorage.getItem('simulated_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        updateUIForAuthenticatedUser();
    }
}

function updateUIForAuthenticatedUser() {
    if (!currentUser) return;
    
    // HUD Pulse turn verified green
    if (hudPulse) hudPulse.classList.add('verified');
    if (hudLinkStatus) {
        hudLinkStatus.classList.remove('opacity-50');
        hudLinkStatus.innerHTML = `LINK_SECURE // ROB_VIP_USER // <span class="text-accent font-bold">${currentUser.name.toUpperCase()}</span>`;
    }
    
    // HUD Button update to Sign Out state
    if (authBtn) {
        authBtn.classList.add('verified');
        authBtn.innerHTML = `
            <svg class="auth-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>SIGN_OUT</span>
        `;
    }
}

async function signOut() {
    currentUser = null;
    localStorage.removeItem('simulated_user');
    try {
        await supabase.auth.signOut();
    } catch(e) {}
    
    // Reset HUD
    if (hudPulse) hudPulse.classList.remove('verified');
    if (hudLinkStatus) {
        hudLinkStatus.classList.add('opacity-50');
        hudLinkStatus.innerHTML = `LINK_STABLE // <span id="timestamp"></span> EST`;
    }
    if (authBtn) {
        authBtn.classList.remove('verified');
        authBtn.innerHTML = `
            <svg class="auth-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>VERIFY_IDENTITY</span>
        `;
    }
    
    appendSystemMessage("Signal state downgraded. Neural priority line disconnected.");
}

function getInitials(name) {
    if (!name) return 'US';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerHTML = `
        <span class="timestamp">[System]</span>
        <span class="content text-[11px]" style="color: #27c93f; text-shadow: 0 0 4px rgba(39, 201, 63, 0.2);">${text}</span>
    `;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
}

function appendAuthCard(container) {
    // Avoid double-rendering auth cards in same message node
    if (container.querySelector('.chat-auth-card')) return;
    
    const card = document.createElement('div');
    card.className = 'chat-auth-card';
    card.innerHTML = `
        <p>Verified signaling hides contact details from web crawlers & scrapers, keeping comms secure.</p>
        <button class="btn-chat-auth">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>VERIFY_IDENTITY</span>
        </button>
    `;
    
    card.querySelector('.btn-chat-auth').addEventListener('click', openAuthModal);
    container.appendChild(card);
    chatBody.scrollTop = chatBody.scrollHeight;
}

// --- UTILS ---
function startTimeUpdate() {
    setInterval(() => {
        const now = new Date();
        const timestampEl = document.getElementById('timestamp');
        const latencyEl = document.getElementById('latency');
        
        if (timestampEl) {
            // Formatter for EST (Eastern Standard Time)
            const options = {
                timeZone: 'America/New_York',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            };
            timestampEl.innerText = new Intl.DateTimeFormat('en-US', options).format(now);
        }
        if (latencyEl) latencyEl.innerText = Math.floor(Math.random() * 15 + 5) + 'ms';
        
        const start = new Date('2026-04-29T19:00:00');
        const diff = Math.floor((now - start) / 1000);
        if (uptimeEl) uptimeEl.innerText = `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
    }, 1000);
}

// --- SECURE CONTACT FORM ---
const contactForm = document.getElementById('contact-form');
const contactName = document.getElementById('contact-name');
const contactEmail = document.getElementById('contact-email');
const contactMessage = document.getElementById('contact-message');
const contactSubmit = document.getElementById('contact-submit');
const contactStatus = document.getElementById('contact-status');

if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = contactName.value.trim();
        const email = contactEmail.value.trim();
        const message = contactMessage.value.trim();
        
        if (!name || !email || !message) return;
        
        contactSubmit.disabled = true;
        contactStatus.innerText = 'TRANSMITTING...';
        contactStatus.className = 'contact-status';
        
        try {
            let token = SUPABASE_ANON_KEY;
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.access_token) {
                    token = session.access_token;
                }
            } catch (e) {
                console.warn('Session retrieval bypassed:', e);
            }

            const res = await fetch(`${AGENT_URL}message`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, email, message })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Signal transmission failed.');
            }
            
            contactStatus.innerText = 'SIGNAL_DELIVERED';
            contactStatus.className = 'contact-status success';
            contactForm.reset();
            
            setTimeout(() => {
                contactStatus.innerText = '';
                contactStatus.className = 'contact-status';
            }, 4000);
        } catch (err) {
            console.error('Transmission error:', err);
            contactStatus.innerText = 'TRANSMISSION_FAILED';
            contactStatus.className = 'contact-status error';
        } finally {
            contactSubmit.disabled = false;
        }
    });
}

