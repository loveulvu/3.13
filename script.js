// 粒子引擎配置 - 严禁修改
const CONFIG = {
    count: 320,
    magnetRadius: 320,
    ringRadius: 230,
    waveSpeed: 0.55,
    waveAmplitude: 14,
    particleSize: 26,
    lerpSpeed: 0.07,
    pulseSpeed: 3,
    fieldStrength: 10,
    idleAfterMs: 2200,
    idleAmpX: 140,
    idleAmpY: 95,
    breatheRadius: 260,
    renderRadius: 560,
    cursorSafeRadius: 140,
    zRange: 70
};

// 全局状态变量
let particles = [];
let renderQueue = [];
let mouse = { x: -9999, y: -9999 };
let lastMouseMoveTime = 0;
let lastRealMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let virtualMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let globalColor = { r: 255, g: 255, b: 255 };
let targetColor = { r: 255, g: 255, b: 255 };
let lastScrollY = window.scrollY;

// 性能优化：缓存 getBoundingClientRect 结果
let cachedGridRect = null;

// Canvas 初始化
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');

/**
 * 初始化粒子系统
 * 设置 Canvas 尺寸并创建粒子数组
 */
function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = [];
    
    for (let i = 0; i < CONFIG.count; i++) {
        const baseX = Math.random() * canvas.width;
        const baseY = Math.random() * canvas.height;
        particles.push({
            t: Math.random() * 100,
            speed: 0.01 + Math.random() / 200,
            baseX,
            baseY,
            cx: baseX,
            cy: baseY,
            cz: (Math.random() - 0.5) * CONFIG.zRange,
            randomRadiusOffset: (Math.random() - 0.5) * 2,
            size: CONFIG.particleSize
        });
    }
    renderQueue = [...particles];
    
    // 更新缓存的网格矩形
    updateGridRectCache();
}

/**
 * 更新项目网格的边界缓存
 * 在 scroll 和 resize 事件时调用，避免每帧计算
 */
function updateGridRectCache() {
    const projectGrid = document.querySelector('.project-grid');
    if (projectGrid) {
        const rect = projectGrid.getBoundingClientRect();
        const padding = 15;
        cachedGridRect = {
            left: rect.left - padding,
            right: rect.right + padding,
            top: rect.top - padding,
            bottom: rect.bottom + padding
        };
    } else {
        cachedGridRect = null;
    }
}

/**
 * 主渲染循环
 * 包含完整的粒子物理计算和渲染逻辑
 */
function animate() {
    const now = performance.now();
    const time = now / 1000;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 颜色平滑插值
    const lerpFactor = 0.05;
    globalColor.r += (targetColor.r - globalColor.r) * lerpFactor;
    globalColor.g += (targetColor.g - globalColor.g) * lerpFactor;
    globalColor.b += (targetColor.b - globalColor.b) * lerpFactor;

    // 2. 滚动差值计算
    const currentScrollY = window.scrollY;
    const deltaScroll = currentScrollY - lastScrollY;
    lastScrollY = currentScrollY;

    // 3. 计算虚拟鼠标目标位置
    let destX, destY;
    if (mouse.x === -9999) {
        destX = canvas.width / 2;
        destY = canvas.height / 2;
    } else if (now - lastMouseMoveTime > CONFIG.idleAfterMs) {
        destX = lastRealMouse.x + Math.sin(time * 0.55) * CONFIG.idleAmpX;
        destY = lastRealMouse.y + Math.cos(time * 0.85) * CONFIG.idleAmpY;
    } else {
        destX = mouse.x;
        destY = mouse.y;
    }

    // 4. 平滑插值更新虚拟鼠标位置
    const isMoving = (now - lastMouseMoveTime < 120) || Math.abs(deltaScroll) > 1;
    const smooth = isMoving ? 0.24 : 0.12;
    virtualMouse.x += (destX - virtualMouse.x) * smooth;
    virtualMouse.y += (destY - virtualMouse.y) * smooth;

    // 5. 深度排序（Z轴）
    renderQueue.sort((a, b) => a.cz - b.cz);

    // 6. 粒子渲染循环
    for (let i = 0; i < renderQueue.length; i++) {
        const p = renderQueue[i];

        // 滚动视差效果：将页面滚动作用于粒子物理坐标
        p.baseY -= deltaScroll * 0.8;
        p.cy -= deltaScroll * 0.8;

        // 边界循环处理，确保上下滚动无缝衔接
        if (p.baseY < 0) {
            p.baseY += canvas.height;
            p.cy += canvas.height;
        } else if (p.baseY > canvas.height) {
            p.baseY -= canvas.height;
            p.cy -= canvas.height;
        }

        p.t += p.speed / 2;

        // 计算与虚拟鼠标的距离
        const dx0 = p.baseX - virtualMouse.x;
        const dy0 = p.baseY - virtualMouse.y;
        const dist0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);

        let targetX = p.baseX;
        let targetY = p.baseY;
        let targetZ = p.cz;

        // 磁吸物理运动计算
        if (dist0 < CONFIG.magnetRadius) {
            const angle = Math.atan2(dy0, dx0);
            const k = Math.pow(Math.max(0, 1 - dist0 / CONFIG.magnetRadius), 1.6);
            const radialWave = Math.sin(p.t * CONFIG.waveSpeed + p.randomRadiusOffset) * (CONFIG.waveAmplitude * 0.9);
            const targetR = Math.max(CONFIG.cursorSafeRadius, dist0) + radialWave * k;
            const swirlK = Math.max(0, 1 - dist0 / (CONFIG.cursorSafeRadius + 140));
            const swirl = (Math.sin(time * 2.0 + p.t) * 10 + Math.cos(p.t * 1.3) * 6) * swirlK * k;

            const rx = Math.cos(angle);
            const ry = Math.sin(angle);
            targetX = virtualMouse.x + (rx * targetR - ry * swirl);
            targetY = virtualMouse.y + (ry * targetR + rx * swirl);
            targetZ = p.cz + Math.sin(p.t * 1.2) * (CONFIG.waveAmplitude * 0.22) * k;
        }

        // 位置插值
        p.cx += (targetX - p.cx) * CONFIG.lerpSpeed;
        p.cy += (targetY - p.cy) * CONFIG.lerpSpeed;
        p.cz += (targetZ - p.cz) * CONFIG.lerpSpeed;

        // 渲染半径判定
        if (dist0 > CONFIG.renderRadius) continue;

        const sx = p.cx;
        const sy = p.cy;

        // 作品区避让判定（使用缓存的矩形）
        if (cachedGridRect) {
            if (sx > cachedGridRect.left && sx < cachedGridRect.right &&
                sy > cachedGridRect.top && sy < cachedGridRect.bottom) {
                continue;
            }
        }

        // 光标安全区判定
        const distToCenter = Math.hypot(sx - virtualMouse.x, sy - virtualMouse.y);
        if (distToCenter < CONFIG.cursorSafeRadius) continue;

        // 渲染样式计算
        const zNorm = (p.cz + CONFIG.zRange / 2) / CONFIG.zRange;
        const breatheK = Math.max(0, 1 - dist0 / CONFIG.breatheRadius);
        const pulse = 0.9 + Math.sin(p.t * CONFIG.pulseSpeed) * (0.2 + 0.3 * breatheK);

        const influence = Math.max(0, 1 - dist0 / CONFIG.magnetRadius);
        const fade = Math.max(0, 1 - (dist0 - CONFIG.magnetRadius) / (CONFIG.renderRadius - CONFIG.magnetRadius));
        const radius = Math.max(2.2, p.size * (0.1 + 0.09 * (0.3 + 0.7 * influence)) * pulse * (0.65 + zNorm * 0.75));
        const alpha = Math.min(1, (0.18 + 0.52 * (0.3 + 0.7 * influence)) * fade * (0.55 + 0.6 * zNorm));

        // 绘制粒子
        ctx.fillStyle = `rgba(${Math.round(globalColor.r)}, ${Math.round(globalColor.g)}, ${Math.round(globalColor.b)}, ${alpha})`;
        ctx.shadowColor = `rgba(${Math.round(globalColor.r)}, ${Math.round(globalColor.g)}, ${Math.round(globalColor.b)}, 0.75)`;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Hello 标题距离感应效果
    const titleEl = document.querySelector('.card-title');
    if (titleEl) {
        const rect = titleEl.getBoundingClientRect();
        const textCX = rect.left + rect.width / 2;
        const textCY = rect.top + rect.height / 2;

        const distToText = Math.hypot(textCX - virtualMouse.x, textCY - virtualMouse.y);
        const maxTriggerDist = 450;

        let intensity = Math.max(0, 1 - distToText / maxTriggerDist);
        intensity = Math.pow(intensity, 1.5);

        const minOpacity = 0.15;
        titleEl.style.opacity = minOpacity + (1 - minOpacity) * intensity;
        titleEl.style.textShadow = `0 0 ${intensity * 40}px rgba(255, 255, 255, ${intensity * 0.6})`;
    }

    requestAnimationFrame(animate);
}

// 事件监听器设置
function setupEventListeners() {
    // 鼠标移动
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        lastMouseMoveTime = performance.now();
        lastRealMouse.x = e.clientX;
        lastRealMouse.y = e.clientY;
    });

    // 触摸事件（移动端）
    window.addEventListener('touchstart', (e) => {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
        lastMouseMoveTime = performance.now();
        lastRealMouse.x = mouse.x;
        lastRealMouse.y = mouse.y;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
        lastMouseMoveTime = performance.now();
        lastRealMouse.x = mouse.x;
        lastRealMouse.y = mouse.y;
    }, { passive: true });

    window.addEventListener('touchend', () => {
        mouse.x = -9999;
        mouse.y = -9999;
    });

    // 窗口大小变化
    window.addEventListener('resize', init);

    // 滚动事件 - 更新缓存的网格矩形
    window.addEventListener('scroll', updateGridRectCache, { passive: true });
}

// 项目卡片交互设置
function setupProjectCards() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.classList.add('show');
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.project-card, .primary-btn').forEach((el) => {
        observer.observe(el);
    });

    // 卡片悬停颜色联动
    document.querySelectorAll('.project-card').forEach((card) => {
        const video = card.querySelector('.card-video');

        card.addEventListener('mouseenter', function () {
            const themeColor = getComputedStyle(this).getPropertyValue('--theme');
            if (themeColor) {
                const hex = themeColor.trim();
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                targetColor = { r, g, b };
            }
            if (video) {
                video.currentTime = 0;
                video.play().catch(() => { });
            }
        });

        card.addEventListener('mouseleave', function () {
            targetColor = { r: 255, g: 255, b: 255 };
            if (video) {
                video.pause();
            }
        });
    });
}

// 初始化所有功能
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupProjectCards();
    init();
    animate();
});
