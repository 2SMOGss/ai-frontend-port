import './style.css';
import { createClient } from '@supabase/supabase-js';
import gsap from 'gsap';
import { createIcons, Brain, Rss, Activity } from 'lucide';

// Initialize Icons
createIcons({ icons: { Brain, Rss, Activity } });

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

// --- INIT ---
window.addEventListener('load', () => {
    initAnimations();
    initParticles();
    startTimeUpdate();
    fetchThoughts();
    subscribeToThoughts();
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
        const res = await fetch(AGENT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, history: chatHistory })
        });
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        agentMsg.innerText = '';
        let full = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            full += decoder.decode(value);
            agentMsg.innerText = full;
            chatBody.scrollTop = chatBody.scrollHeight;
        }
        chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: full });
    } catch {
        agentMsg.innerText = '[ERROR] Signal lost.';
    } finally {
        chatInput.disabled = false;
        chatInput.focus();
    }
}

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="text-[9px] opacity-30 uppercase tracking-widest mb-1">${role === 'user' ? 'Local' : 'Remote'}</div>
        <div class="content">${text}</div>
    `;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
    return div.querySelector('.content');
}

chatInput.addEventListener('keypress', e => e.key === 'Enter' && sendMessage());

// --- UTILS ---
function startTimeUpdate() {
    setInterval(() => {
        const now = new Date();
        const timestampEl = document.getElementById('timestamp');
        const latencyEl = document.getElementById('latency');
        
        if (timestampEl) timestampEl.innerText = now.toISOString().split('T')[1].split('.')[0] + ' UTC';
        if (latencyEl) latencyEl.innerText = Math.floor(Math.random() * 15 + 5) + 'ms';
        
        const start = new Date('2026-04-29T19:00:00');
        const diff = Math.floor((now - start) / 1000);
        if (uptimeEl) uptimeEl.innerText = `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
    }, 1000);
}
